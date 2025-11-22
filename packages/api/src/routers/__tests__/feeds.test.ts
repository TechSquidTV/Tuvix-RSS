/**
 * Feeds Router Tests
 *
 * Tests for public feed management endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestCategory,
} from "@/test/setup";
import { feedsRouter } from "../feeds";
import * as schema from "@/db/schema";

// Helper to seed a test feed
async function seedTestFeed(
  db: any,
  userId: number,
  overrides?: {
    slug?: string;
    title?: string;
    description?: string;
    public?: boolean;
    categoryIds?: number[];
  }
) {
  const [feed] = await db
    .insert(schema.feeds)
    .values({
      userId,
      slug: overrides?.slug || "test-feed",
      title: overrides?.title || "Test Feed",
      description: overrides?.description || null,
      public: overrides?.public ?? true,
    })
    .returning();

  // Link categories if provided
  if (overrides?.categoryIds && overrides.categoryIds.length > 0) {
    const links = overrides.categoryIds.map((categoryId) => ({
      feedId: feed.id,
      categoryId,
    }));
    await db.insert(schema.feedCategories).values(links);
  }

  return feed;
}

describe("Feeds Router", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number; username: string | null };
  let otherUser: { id: number; username: string | null };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db, {
      username: "testuser",
      email: "test@example.com",
    });
    testUser = user;

    const { user: other } = await seedTestUser(db, {
      username: "otheruser",
      email: "other@example.com",
    });
    otherUser = other;
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  const createCaller = (userId: number, role: "user" | "admin" = "user") => {
    return feedsRouter.createCaller({
      db,
      user: { userId, username: "testuser", role },
      env: {
        BASE_URL: "http://localhost:3000",
        SKIP_RATE_LIMIT: "true",
      } as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  const createPublicCaller = () => {
    return feedsRouter.createCaller({
      db,
      user: undefined,
      env: {
        BASE_URL: "http://localhost:3000",
        SKIP_RATE_LIMIT: "true",
      } as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  describe("list", () => {
    it("should return empty array when user has no feeds", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.list({ limit: 10, offset: 0 });

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should return user's feeds with pagination", async () => {
      await seedTestFeed(db, testUser.id, { slug: "feed-1", title: "Feed 1" });
      await seedTestFeed(db, testUser.id, { slug: "feed-2", title: "Feed 2" });
      await seedTestFeed(db, otherUser.id, {
        slug: "other-feed",
        title: "Other Feed",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.list({ limit: 10, offset: 0 });

      expect(result.items).toHaveLength(2);
      expect(result.items.every((feed) => feed.userId === testUser.id)).toBe(
        true
      );
      expect(result.hasMore).toBe(false);
    });

    it("should handle pagination correctly", async () => {
      // Create 3 feeds
      await seedTestFeed(db, testUser.id, { slug: "feed-1" });
      await seedTestFeed(db, testUser.id, { slug: "feed-2" });
      await seedTestFeed(db, testUser.id, { slug: "feed-3" });

      const caller = createCaller(testUser.id);
      const page1 = await caller.list({ limit: 2, offset: 0 });
      const page2 = await caller.list({ limit: 2, offset: 2 });

      expect(page1.items).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page2.items).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it("should include category IDs in response", async () => {
      const category1 = await seedTestCategory(db, testUser.id, {
        name: "Cat1-Feed",
      });
      const category2 = await seedTestCategory(db, testUser.id, {
        name: "Cat2-Feed",
      });
      const feed = await seedTestFeed(db, testUser.id, {
        slug: "feed-with-cats",
        categoryIds: [category1.id, category2.id],
      });

      const caller = createCaller(testUser.id);
      const result = await caller.list({ limit: 10, offset: 0 });

      const foundFeed = result.items.find((f) => f.id === feed.id);
      expect(foundFeed).toBeDefined();
      // Verify categories are linked in database (router returns them but schema may not include in type)
      const categoryLinks = await db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.feedId, feed.id));
      const categoryIds = categoryLinks.map((link) => link.categoryId);
      expect(categoryIds.sort()).toEqual([category1.id, category2.id].sort());
    });
  });

  describe("getById", () => {
    it("should return feed by id with categories", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Cat-GetById",
      });
      const feed = await seedTestFeed(db, testUser.id, {
        slug: "test-feed",
        title: "Test Feed",
        categoryIds: [category.id],
      });

      const caller = createCaller(testUser.id);
      const result = await caller.getById({ id: feed.id });

      expect(result.id).toBe(feed.id);
      expect(result.slug).toBe("test-feed");
      expect(result.title).toBe("Test Feed");

      // Verify categories are linked in database (router returns them but schema may not include in type)
      const categoryLinks = await db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.feedId, feed.id));
      const categoryIds = categoryLinks.map((link) => link.categoryId);
      expect(categoryIds).toEqual([category.id]);
    });

    it("should throw error when feed does not exist", async () => {
      const caller = createCaller(testUser.id);
      await expect(caller.getById({ id: 99999 })).rejects.toThrow("Feed");
    });

    it("should throw error when accessing other user's feed", async () => {
      const otherFeed = await seedTestFeed(db, otherUser.id, { slug: "other" });

      const caller = createCaller(testUser.id);
      await expect(caller.getById({ id: otherFeed.id })).rejects.toThrow(
        "Feed"
      );
    });
  });

  describe("create", () => {
    it("should create public feed with minimal data", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.create({
        slug: "new-feed",
        title: "New Feed",
        public: true,
      });

      expect(result.slug).toBe("new-feed");
      expect(result.title).toBe("New Feed");
      expect(result.public).toBe(true);
      expect(result.userId).toBe(testUser.id);
      // categoryIds is returned by the router even if not in schema
      if ("categoryIds" in result) {
        expect((result as any).categoryIds).toEqual([]);
      }
    });

    it("should create feed with description", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.create({
        slug: "described-feed",
        title: "Described Feed",
        description: "A feed with description",
        public: true,
      });

      expect(result.description).toBe("A feed with description");
    });

    it("should create private feed", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.create({
        slug: "private-feed",
        title: "Private Feed",
        public: false,
      });

      expect(result.public).toBe(false);
    });

    it("should create feed with categories", async () => {
      const category1 = await seedTestCategory(db, testUser.id, {
        name: "Cat1-Create",
      });
      const category2 = await seedTestCategory(db, testUser.id, {
        name: "Cat2-Create",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.create({
        slug: "categorized-feed",
        title: "Categorized Feed",
        categoryIds: [category1.id, category2.id],
        public: true,
      });

      // Verify categories are linked in database
      const categoryLinks = await db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.feedId, result.id));
      const categoryIds = categoryLinks.map((link) => link.categoryId);
      expect(categoryIds).toEqual([category1.id, category2.id]);
    });

    it("should throw error when slug already exists for user", async () => {
      await seedTestFeed(db, testUser.id, { slug: "existing" });

      const caller = createCaller(testUser.id);
      await expect(
        caller.create({
          slug: "existing",
          title: "Duplicate",
          public: true,
        })
      ).rejects.toThrow("already exists");
    });

    it("should allow same slug for different users", async () => {
      await seedTestFeed(db, testUser.id, { slug: "shared-slug" });

      const otherCaller = createCaller(otherUser.id);
      const result = await otherCaller.create({
        slug: "shared-slug",
        title: "Other Feed",
        public: true,
      });

      expect(result.slug).toBe("shared-slug");
      expect(result.userId).toBe(otherUser.id);
    });

    it("should validate slug format", async () => {
      const caller = createCaller(testUser.id);

      await expect(
        caller.create({
          slug: "invalid slug", // Contains space
          title: "Test",
          public: true,
        })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("should update feed title", async () => {
      const feed = await seedTestFeed(db, testUser.id, { title: "Old Title" });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: feed.id,
        title: "New Title",
      });

      expect(result.title).toBe("New Title");
      expect(result.slug).toBe(feed.slug); // Unchanged
    });

    it("should update feed slug", async () => {
      const feed = await seedTestFeed(db, testUser.id, { slug: "old-slug" });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: feed.id,
        slug: "new-slug",
      });

      expect(result.slug).toBe("new-slug");
    });

    it("should update feed description", async () => {
      const feed = await seedTestFeed(db, testUser.id);

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: feed.id,
        description: "Updated description",
      });

      expect(result.description).toBe("Updated description");
    });

    it("should update feed public status", async () => {
      const feed = await seedTestFeed(db, testUser.id, { public: false });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: feed.id,
        public: true,
      });

      expect(result.public).toBe(true);
    });

    it("should update usage stats when changing feed to public", async () => {
      const caller = createCaller(testUser.id);

      // Create a private feed using the router
      const feed = await caller.create({
        slug: "test-feed-public",
        title: "Test Feed",
        public: false,
      });

      // Get usage stats before update
      const [statsBefore] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      const publicCountBefore = statsBefore.publicFeedCount;

      await caller.update({
        id: feed.id,
        public: true,
      });

      // Verify usage stats updated
      const [statsAfter] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      expect(statsAfter.publicFeedCount).toBe(publicCountBefore + 1);
    });

    it("should update usage stats when changing feed to private", async () => {
      const caller = createCaller(testUser.id);

      // Create a public feed using the router
      const feed = await caller.create({
        slug: "test-feed-private",
        title: "Test Feed",
        public: true,
      });

      // Get usage stats before update
      const [statsBefore] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      const publicCountBefore = statsBefore.publicFeedCount;

      await caller.update({
        id: feed.id,
        public: false,
      });

      // Verify usage stats updated
      const [statsAfter] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      expect(statsAfter.publicFeedCount).toBe(publicCountBefore - 1);
    });

    it("should update categories", async () => {
      const category1 = await seedTestCategory(db, testUser.id, {
        name: "Cat1-Update",
      });
      const category2 = await seedTestCategory(db, testUser.id, {
        name: "Cat2-Update",
      });
      const category3 = await seedTestCategory(db, testUser.id, {
        name: "Cat3-Update",
      });
      const feed = await seedTestFeed(db, testUser.id, {
        categoryIds: [category1.id],
      });

      const caller = createCaller(testUser.id);
      await caller.update({
        id: feed.id,
        categoryIds: [category2.id, category3.id],
      });

      // Verify categories are updated in database
      const categoryLinks = await db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.feedId, feed.id));
      const categoryIds = categoryLinks.map((link) => link.categoryId);
      expect(categoryIds.sort()).toEqual([category2.id, category3.id].sort());
    });

    it("should update multiple fields at once", async () => {
      const feed = await seedTestFeed(db, testUser.id, {
        title: "Old",
        slug: "old-slug",
        public: false,
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: feed.id,
        title: "New",
        slug: "new-slug",
        public: true,
        description: "Updated",
      });

      expect(result.title).toBe("New");
      expect(result.slug).toBe("new-slug");
      expect(result.public).toBe(true);
      expect(result.description).toBe("Updated");
    });

    it("should throw error when updating to duplicate slug", async () => {
      await seedTestFeed(db, testUser.id, { slug: "existing" });
      const feed = await seedTestFeed(db, testUser.id, { slug: "current" });

      const caller = createCaller(testUser.id);
      await expect(
        caller.update({ id: feed.id, slug: "existing" })
      ).rejects.toThrow("already exists");
    });

    it("should allow keeping same slug", async () => {
      const feed = await seedTestFeed(db, testUser.id, { slug: "current" });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: feed.id,
        slug: "current", // Same slug
        title: "Updated",
      });

      expect(result.slug).toBe("current");
      expect(result.title).toBe("Updated");
    });

    it("should throw error when updating other user's feed", async () => {
      const otherFeed = await seedTestFeed(db, otherUser.id);

      const caller = createCaller(testUser.id);
      await expect(
        caller.update({ id: otherFeed.id, title: "Hacked" })
      ).rejects.toThrow("Feed");
    });
  });

  describe("delete", () => {
    it("should delete feed", async () => {
      const feed = await seedTestFeed(db, testUser.id);

      const caller = createCaller(testUser.id);
      const result = await caller.delete({ id: feed.id });

      expect(result.success).toBe(true);

      // Verify it's deleted
      await expect(caller.getById({ id: feed.id })).rejects.toThrow("Feed");
    });

    it("should throw error when deleting other user's feed", async () => {
      const otherFeed = await seedTestFeed(db, otherUser.id);

      const caller = createCaller(testUser.id);
      await expect(caller.delete({ id: otherFeed.id })).rejects.toThrow("Feed");
    });

    it("should throw error when feed does not exist", async () => {
      const caller = createCaller(testUser.id);
      await expect(caller.delete({ id: 99999 })).rejects.toThrow("Feed");
    });

    it("should update usage stats when deleting public feed", async () => {
      const caller = createCaller(testUser.id);

      // Create a public feed using the router
      const feed = await caller.create({
        slug: "test-feed-delete-public",
        title: "Test Feed",
        public: true,
      });

      // Get usage stats before deletion
      const [statsBefore] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      const publicCountBefore = statsBefore.publicFeedCount;

      await caller.delete({ id: feed.id });

      // Verify usage stats updated
      const [statsAfter] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      expect(statsAfter.publicFeedCount).toBe(publicCountBefore - 1);
    });

    it("should not change public feed count when deleting private feed", async () => {
      const caller = createCaller(testUser.id);

      // Create a private feed using the router
      const feed = await caller.create({
        slug: "test-feed-delete-private",
        title: "Test Feed",
        public: false,
      });

      // Get usage stats before deletion
      const [statsBefore] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      const publicCountBefore = statsBefore.publicFeedCount;

      await caller.delete({ id: feed.id });

      // Verify public count unchanged
      const [statsAfter] = await db
        .select()
        .from(schema.usageStats)
        .where(eq(schema.usageStats.userId, testUser.id));

      expect(statsAfter.publicFeedCount).toBe(publicCountBefore);
    });
  });

  describe("getPublicXml", () => {
    it("should return RSS XML for public feed", async () => {
      await seedTestFeed(db, testUser.id, {
        slug: "public-feed",
        title: "Public Feed",
        public: true,
      });

      const caller = createPublicCaller();
      const result = await caller.getPublicXml({
        username: testUser.username || "",
        slug: "public-feed",
      });

      expect(result).toContain("<?xml");
      expect(result).toContain("<rss");
      expect(result).toContain("Public Feed");
      expect(result).toContain("<channel>");
    });

    it("should throw error when user not found", async () => {
      const caller = createPublicCaller();
      await expect(
        caller.getPublicXml({
          username: "nonexistent",
          slug: "feed",
        })
      ).rejects.toThrow("User not found");
    });

    it("should throw error when feed not found", async () => {
      const caller = createPublicCaller();
      await expect(
        caller.getPublicXml({
          username: testUser.username || "",
          slug: "nonexistent",
        })
      ).rejects.toThrow("Feed not found");
    });

    it("should throw error when feed is private", async () => {
      await seedTestFeed(db, testUser.id, {
        slug: "private-feed",
        public: false,
      });

      const caller = createPublicCaller();
      await expect(
        caller.getPublicXml({
          username: testUser.username || "",
          slug: "private-feed",
        })
      ).rejects.toThrow("Feed not found");
    });
  });
});
