/**
 * Database Helper Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  requireOwnership,
  slugExists,
  categoryNameExists,
  updateManyToMany,
} from "../helpers";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
  seedTestCategory,
} from "@/test/setup";
import * as schema from "../schema";
import { eq } from "drizzle-orm";

describe("Database Helpers", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  describe("requireOwnership", () => {
    it("should return resource when user owns it", async () => {
      const { user } = await seedTestUser(db);
      const category = await seedTestCategory(db, user.id, { name: "Test" });

      const result = await requireOwnership<
        typeof schema.categories.$inferSelect
      >(db, schema.categories, category.id, user.id, "Category");

      expect(result).toBeDefined();
      expect(result.id).toBe(category.id);
      expect(result.userId).toBe(user.id);
    });

    it("should throw NOT_FOUND when resource does not exist", async () => {
      const { user } = await seedTestUser(db);

      await expect(
        requireOwnership(
          db,
          schema.categories,
          9999, // Non-existent ID
          user.id,
          "Category"
        )
      ).rejects.toThrow(TRPCError);

      try {
        await requireOwnership(
          db,
          schema.categories,
          9999,
          user.id,
          "Category"
        );
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        if (error instanceof TRPCError) {
          expect(error.code).toBe("NOT_FOUND");
          expect(error.message).toContain("Category");
        }
      }
    });

    it("should throw NOT_FOUND when resource belongs to different user", async () => {
      const { user: user1 } = await seedTestUser(db, {
        username: "user1",
        email: "user1@example.com",
      });
      const { user: user2 } = await seedTestUser(db, {
        username: "user2",
        email: "user2@example.com",
      });

      const category = await seedTestCategory(db, user1.id, { name: "Test" });

      await expect(
        requireOwnership(
          db,
          schema.categories,
          category.id,
          user2.id, // Different user
          "Category"
        )
      ).rejects.toThrow(TRPCError);
    });

    it("should work with different table types", async () => {
      const { user } = await seedTestUser(db);
      const source = await seedTestSource(db);
      const subscription = await seedTestSubscription(db, user.id, source.id);

      const result = await requireOwnership<
        typeof schema.subscriptions.$inferSelect
      >(db, schema.subscriptions, subscription.id, user.id, "Subscription");

      expect(result).toBeDefined();
      expect(result.id).toBe(subscription.id);
    });
  });

  describe("slugExists", () => {
    it("should return false when slug does not exist", async () => {
      const { user } = await seedTestUser(db);

      const exists = await slugExists(
        db,
        schema.feeds,
        user.id,
        "nonexistent-slug"
      );

      expect(exists).toBe(false);
    });

    it("should return true when slug exists for user", async () => {
      const { user } = await seedTestUser(db);

      // Create a feed with a slug
      await db
        .insert(schema.feeds)
        .values({
          userId: user.id,
          slug: "test-slug",
          title: "Test Feed",
          description: "Test",
        })
        .returning();

      const exists = await slugExists(db, schema.feeds, user.id, "test-slug");

      expect(exists).toBe(true);
    });

    it("should return false when slug exists for different user", async () => {
      const { user: user1 } = await seedTestUser(db, {
        username: "user1",
        email: "user1@example.com",
      });
      const { user: user2 } = await seedTestUser(db, {
        username: "user2",
        email: "user2@example.com",
      });

      // Create feed for user1
      await db.insert(schema.feeds).values({
        userId: user1.id,
        slug: "test-slug",
        title: "Test Feed",
        description: "Test",
      });

      // Check if slug exists for user2
      const exists = await slugExists(db, schema.feeds, user2.id, "test-slug");

      expect(exists).toBe(false);
    });

    it("should exclude specified ID when checking", async () => {
      const { user } = await seedTestUser(db);

      const [feed] = await db
        .insert(schema.feeds)
        .values({
          userId: user.id,
          slug: "test-slug",
          title: "Test Feed",
          description: "Test",
        })
        .returning();

      // Should return false when excluding the feed's own ID
      const exists = await slugExists(
        db,
        schema.feeds,
        user.id,
        "test-slug",
        feed.id
      );

      expect(exists).toBe(false);
    });

    it("should return true when slug exists but not for excluded ID", async () => {
      const { user } = await seedTestUser(db);

      await db
        .insert(schema.feeds)
        .values({
          userId: user.id,
          slug: "test-slug",
          title: "Test Feed 1",
          description: "Test",
        })
        .returning();

      const [feed2] = await db
        .insert(schema.feeds)
        .values({
          userId: user.id,
          slug: "test-slug-2",
          title: "Test Feed 2",
          description: "Test",
        })
        .returning();

      // Should return true because feed1 has the slug (and we're excluding feed2)
      const exists = await slugExists(
        db,
        schema.feeds,
        user.id,
        "test-slug",
        feed2.id
      );

      expect(exists).toBe(true);
    });
  });

  describe("categoryNameExists", () => {
    it("should return false when name does not exist", async () => {
      const { user } = await seedTestUser(db);

      const exists = await categoryNameExists(
        db,
        schema.categories,
        user.id,
        "Nonexistent"
      );

      expect(exists).toBe(false);
    });

    it("should return true when name exists (case insensitive)", async () => {
      const { user } = await seedTestUser(db);
      await seedTestCategory(db, user.id, { name: "Technology" });

      const exists = await categoryNameExists(
        db,
        schema.categories,
        user.id,
        "technology"
      );

      expect(exists).toBe(true);
    });

    it("should be case insensitive for upper case", async () => {
      const { user } = await seedTestUser(db);
      await seedTestCategory(db, user.id, { name: "Technology" });

      const exists = await categoryNameExists(
        db,
        schema.categories,
        user.id,
        "TECHNOLOGY"
      );

      expect(exists).toBe(true);
    });

    it("should be case insensitive for mixed case", async () => {
      const { user } = await seedTestUser(db);
      await seedTestCategory(db, user.id, { name: "Technology" });

      const exists = await categoryNameExists(
        db,
        schema.categories,
        user.id,
        "TeCHNoLoGy"
      );

      expect(exists).toBe(true);
    });

    it("should return false for different user", async () => {
      const { user: user1 } = await seedTestUser(db, {
        username: "user1",
        email: "user1@example.com",
      });
      const { user: user2 } = await seedTestUser(db, {
        username: "user2",
        email: "user2@example.com",
      });

      await seedTestCategory(db, user1.id, { name: "Technology" });

      const exists = await categoryNameExists(
        db,
        schema.categories,
        user2.id,
        "Technology"
      );

      expect(exists).toBe(false);
    });

    it("should exclude specified ID", async () => {
      const { user } = await seedTestUser(db);
      const category = await seedTestCategory(db, user.id, {
        name: "Technology",
      });

      const exists = await categoryNameExists(
        db,
        schema.categories,
        user.id,
        "Technology",
        category.id
      );

      expect(exists).toBe(false);
    });
  });

  describe("updateManyToMany", () => {
    it("should create new relationships", async () => {
      const { user } = await seedTestUser(db);
      const source = await seedTestSource(db);
      const subscription = await seedTestSubscription(db, user.id, source.id);

      const category1 = await seedTestCategory(db, user.id, { name: "Cat1" });
      const category2 = await seedTestCategory(db, user.id, { name: "Cat2" });

      // Build links with proper column names
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription.id,
        schema.subscriptionCategories.categoryId,
        [category1.id, category2.id]
      );

      const links = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, subscription.id)
        );

      expect(links).toHaveLength(2);
      expect(
        links.map((l: { categoryId: number }) => l.categoryId).sort()
      ).toEqual([category1.id, category2.id].sort());
    });

    it("should replace existing relationships", async () => {
      const { user } = await seedTestUser(db);
      const source = await seedTestSource(db);
      const subscription = await seedTestSubscription(db, user.id, source.id);

      const category1 = await seedTestCategory(db, user.id, { name: "Cat1" });
      const category2 = await seedTestCategory(db, user.id, { name: "Cat2" });
      const category3 = await seedTestCategory(db, user.id, { name: "Cat3" });

      // Create initial relationships
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription.id,
        schema.subscriptionCategories.categoryId,
        [category1.id, category2.id]
      );

      // Replace with new relationships
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription.id,
        schema.subscriptionCategories.categoryId,
        [category3.id]
      );

      const links = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, subscription.id)
        );

      expect(links).toHaveLength(1);
      expect(links[0].categoryId).toBe(category3.id);
    });

    it("should handle empty array (remove all relationships)", async () => {
      const { user } = await seedTestUser(db);
      const source = await seedTestSource(db);
      const subscription = await seedTestSubscription(db, user.id, source.id);

      const category1 = await seedTestCategory(db, user.id, { name: "Cat1" });

      // Create relationship
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription.id,
        schema.subscriptionCategories.categoryId,
        [category1.id]
      );

      // Remove all relationships
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription.id,
        schema.subscriptionCategories.categoryId,
        []
      );

      const links = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, subscription.id)
        );

      expect(links).toHaveLength(0);
    });

    it("should not affect other parent relationships", async () => {
      const { user } = await seedTestUser(db);
      const source = await seedTestSource(db);

      const subscription1 = await seedTestSubscription(db, user.id, source.id);
      const subscription2 = await seedTestSubscription(db, user.id, source.id);

      const category1 = await seedTestCategory(db, user.id, { name: "Cat1" });
      const category2 = await seedTestCategory(db, user.id, { name: "Cat2" });

      // Create relationships for both subscriptions
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription1.id,
        schema.subscriptionCategories.categoryId,
        [category1.id]
      );

      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription2.id,
        schema.subscriptionCategories.categoryId,
        [category2.id]
      );

      // Update subscription1 relationships
      await updateManyToMany(
        db,
        schema.subscriptionCategories,
        schema.subscriptionCategories.subscriptionId,
        subscription1.id,
        schema.subscriptionCategories.categoryId,
        [category2.id]
      );

      // Check subscription2 relationships are unchanged
      const links2 = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, subscription2.id)
        );

      expect(links2).toHaveLength(1);
      expect(links2[0].categoryId).toBe(category2.id);
    });
  });
});
