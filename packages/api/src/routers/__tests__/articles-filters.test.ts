/**
 * Articles Router Filter Tests
 *
 * Tests for subscription filter functionality in article listing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
} from "@/test/setup";
import * as schema from "@/db/schema";
import { articlesRouter } from "../articles";
import { eq } from "drizzle-orm";

describe("Articles Router - Subscription Filters", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };
  let testSource1: { id: number };
  let testSource2: { id: number };
  let testSubscription1: { id: number };
  let testSubscription2: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    // Create two test sources
    testSource1 = await seedTestSource(db, {
      url: "https://example.com/feed1.xml",
      title: "Tech Feed",
    });
    testSource2 = await seedTestSource(db, {
      url: "https://example.com/feed2.xml",
      title: "Security Feed",
    });

    // Create subscriptions
    testSubscription1 = await seedTestSubscription(
      db,
      testUser.id,
      testSource1.id,
      {
        filterEnabled: false, // No filtering initially
      }
    );
    testSubscription2 = await seedTestSubscription(
      db,
      testUser.id,
      testSource2.id,
      {
        filterEnabled: true,
        filterMode: "include",
      }
    );
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  /**
   * Helper to create test articles
   */
  async function createArticle(
    sourceId: number,
    overrides?: {
      title?: string;
      description?: string;
      content?: string;
      author?: string;
    }
  ) {
    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        guid: `guid-${Date.now()}-${Math.random()}`,
        title: overrides?.title || "Test Article",
        description: overrides?.description || "Test description",
        content: overrides?.content || "Test content",
        author: overrides?.author || "Test Author",
        publishedAt: new Date(),
      })
      .returning();
    return article;
  }

  /**
   * Helper to create tRPC caller
   */
  function createCaller() {
    return articlesRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  }

  describe("Filter Disabled", () => {
    it("should return all articles when filterEnabled is false", async () => {
      // Disable filtering on subscription2 for this test
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription2.id));

      // Create articles for both sources
      await createArticle(testSource1.id, { title: "Article 1" });
      await createArticle(testSource2.id, { title: "Article 2" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((a) => a.title)).toContain("Article 1");
      expect(result.items.map((a) => a.title)).toContain("Article 2");
    });
  });

  describe("Include Mode Filters", () => {
    it("should include articles matching at least one filter", async () => {
      // Create filters for subscription 2 (include mode)
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "contains",
          pattern: "widevine",
          caseSensitive: false,
        },
        {
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "contains",
          pattern: "playready",
          caseSensitive: false,
        },
      ]);

      // Create articles - some matching, some not
      await createArticle(testSource2.id, {
        title: "CVE-2025-12345 - Widevine Vulnerability",
      });
      await createArticle(testSource2.id, {
        title: "CVE-2025-12346 - PlayReady Issue",
      });
      await createArticle(testSource2.id, {
        title: "CVE-2025-12347 - Generic Security Bug",
      });
      await createArticle(testSource1.id, { title: "Tech Article" }); // Different source

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      // Should include both matching articles from source2, plus article from source1 (no filters)
      const titles = result.items.map((a) => a.title);
      expect(titles).toContain("CVE-2025-12345 - Widevine Vulnerability");
      expect(titles).toContain("CVE-2025-12346 - PlayReady Issue");
      expect(titles).toContain("Tech Article");
      expect(titles).not.toContain("CVE-2025-12347 - Generic Security Bug");
    });

    it("should exclude all articles when no filters match in include mode", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "nonexistent",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, { title: "Some Article" });
      await createArticle(testSource1.id, { title: "Other Article" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      // Should only include article from source1 (no filters)
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Other Article");
    });

    it("should exclude all articles when filterEnabled=true but no filters exist", async () => {
      // Subscription2 has filterEnabled=true but no filters
      await createArticle(testSource2.id, { title: "Some Article" });
      await createArticle(testSource1.id, { title: "Other Article" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      // Should exclude articles from source2 (filterEnabled but no filters)
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Other Article");
    });
  });

  describe("Exclude Mode Filters", () => {
    beforeEach(async () => {
      // Update subscription2 to exclude mode
      await db
        .update(schema.subscriptions)
        .set({ filterMode: "exclude" })
        .where(eq(schema.subscriptions.id, testSubscription2.id));
    });

    it("should exclude articles matching any filter", async () => {
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "contains",
          pattern: "spam",
          caseSensitive: false,
        },
        {
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "contains",
          pattern: "advertisement",
          caseSensitive: false,
        },
      ]);

      await createArticle(testSource2.id, { title: "Interesting Article" });
      await createArticle(testSource2.id, { title: "Spam Article" });
      await createArticle(testSource2.id, { title: "Advertisement Post" });
      await createArticle(testSource1.id, { title: "Tech Article" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      const titles = result.items.map((a) => a.title);
      expect(titles).toContain("Interesting Article");
      expect(titles).toContain("Tech Article");
      expect(titles).not.toContain("Spam Article");
      expect(titles).not.toContain("Advertisement Post");
    });

    it("should include all articles when no filters match in exclude mode", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "nonexistent",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, { title: "Some Article" });
      await createArticle(testSource1.id, { title: "Other Article" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(2);
    });
  });

  describe("Match Types", () => {
    describe("contains", () => {
      it("should match partial strings", async () => {
        await db.insert(schema.subscriptionFilters).values({
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "contains",
          pattern: "vulnerability",
          caseSensitive: false,
        });

        await createArticle(testSource2.id, {
          title: "CVE-2025-12345 - Critical Vulnerability Found",
        });
        await createArticle(testSource2.id, { title: "Regular Article" });

        const caller = createCaller();
        const result = await caller.list({ limit: 20, offset: 0 });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toContain("Vulnerability");
      });
    });

    describe("exact", () => {
      it("should match exact strings", async () => {
        await db.insert(schema.subscriptionFilters).values({
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "exact",
          pattern: "Exact Match",
          caseSensitive: false,
        });

        await createArticle(testSource2.id, { title: "Exact Match" });
        await createArticle(testSource2.id, { title: "Exact Match Extra" });

        const caller = createCaller();
        const result = await caller.list({ limit: 20, offset: 0 });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].title).toBe("Exact Match");
      });
    });

    describe("regex", () => {
      it("should match regex patterns", async () => {
        await db.insert(schema.subscriptionFilters).values({
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "regex",
          pattern: "CVE-2025-\\d{5}",
          caseSensitive: false,
        });

        await createArticle(testSource2.id, {
          title: "CVE-2025-12345 - Issue",
        });
        await createArticle(testSource2.id, {
          title: "CVE-2024-12345 - Old Issue",
        });
        await createArticle(testSource2.id, { title: "Regular Article" });

        const caller = createCaller();
        const result = await caller.list({ limit: 20, offset: 0 });

        const titles = result.items.map((a) => a.title);
        expect(titles).toContain("CVE-2025-12345 - Issue");
        expect(titles).not.toContain("CVE-2024-12345 - Old Issue");
        expect(titles).not.toContain("Regular Article");
      });

      it("should handle invalid regex gracefully", async () => {
        await db.insert(schema.subscriptionFilters).values({
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "regex",
          pattern: "[invalid regex",
          caseSensitive: false,
        });

        await createArticle(testSource2.id, { title: "Some Article" });

        const caller = createCaller();
        const result = await caller.list({ limit: 20, offset: 0 });

        // Invalid regex should not match anything
        expect(result.items).toHaveLength(0);
      });
    });
  });

  describe("Field Types", () => {
    it("should filter by title field", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "security",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, {
        title: "Security Update",
        description: "Not security",
      });
      await createArticle(testSource2.id, {
        title: "Regular Update",
        description: "Security related",
      });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Security Update");
    });

    it("should filter by description field", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "description",
        matchType: "contains",
        pattern: "critical",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, {
        title: "Article 1",
        description: "This is a critical update",
      });
      await createArticle(testSource2.id, {
        title: "Article 2",
        description: "Regular update",
      });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Article 1");
    });

    it("should filter by content field", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "content",
        matchType: "contains",
        pattern: "vulnerability",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, {
        title: "Article 1",
        content: "This article discusses a vulnerability",
      });
      await createArticle(testSource2.id, {
        title: "Article 2",
        content: "Regular content",
      });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Article 1");
    });

    it("should filter by author field", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "author",
        matchType: "contains",
        pattern: "john",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, {
        title: "Article 1",
        author: "John Doe",
      });
      await createArticle(testSource2.id, {
        title: "Article 2",
        author: "Jane Smith",
      });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Article 1");
    });

    it("should filter by any field (searches all fields)", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "any",
        matchType: "contains",
        pattern: "security",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, {
        title: "Article 1",
        description: "Security update",
      });
      await createArticle(testSource2.id, {
        title: "Article 2",
        author: "Security Team",
      });
      await createArticle(testSource2.id, {
        title: "Article 3",
        content: "Security vulnerability found",
      });
      await createArticle(testSource2.id, {
        title: "Article 4",
        description: "Regular update",
      });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(3);
      const titles = result.items.map((a) => a.title);
      expect(titles).toContain("Article 1");
      expect(titles).toContain("Article 2");
      expect(titles).toContain("Article 3");
      expect(titles).not.toContain("Article 4");
    });
  });

  describe("Case Sensitivity", () => {
    it("should be case-insensitive by default", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "security",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, { title: "SECURITY Update" });
      await createArticle(testSource2.id, { title: "Security Update" });
      await createArticle(testSource2.id, { title: "SeCuRiTy Update" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(3);
    });

    it("should be case-sensitive when specified", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "Security",
        caseSensitive: true,
      });

      await createArticle(testSource2.id, { title: "Security Update" });
      await createArticle(testSource2.id, { title: "SECURITY Update" });
      await createArticle(testSource2.id, { title: "security update" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Security Update");
    });
  });

  describe("Multiple Subscriptions", () => {
    it("should apply filters independently per subscription", async () => {
      // Enable filtering on subscription1
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: true, filterMode: "include" })
        .where(eq(schema.subscriptions.id, testSubscription1.id));

      // Add filters to both subscriptions
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: testSubscription1.id,
          field: "title",
          matchType: "contains",
          pattern: "tech",
          caseSensitive: false,
        },
        {
          subscriptionId: testSubscription2.id,
          field: "title",
          matchType: "contains",
          pattern: "security",
          caseSensitive: false,
        },
      ]);

      await createArticle(testSource1.id, { title: "Tech Article" });
      await createArticle(testSource1.id, { title: "Other Article" });
      await createArticle(testSource2.id, { title: "Security Article" });
      await createArticle(testSource2.id, { title: "Other Article 2" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      const titles = result.items.map((a) => a.title);
      expect(titles).toContain("Tech Article");
      expect(titles).toContain("Security Article");
      expect(titles).not.toContain("Other Article");
      expect(titles).not.toContain("Other Article 2");
    });
  });

  describe("Pagination", () => {
    it("should paginate filtered results correctly", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "match",
        caseSensitive: false,
      });

      // Create multiple articles, some matching
      for (let i = 0; i < 10; i++) {
        await createArticle(testSource2.id, {
          title: i % 2 === 0 ? `Match ${i}` : `No Match ${i}`,
        });
      }

      const caller = createCaller();

      // First page
      const page1 = await caller.list({ limit: 3, offset: 0 });
      expect(page1.items).toHaveLength(3);
      expect(page1.items.every((a) => a.title.includes("Match"))).toBe(true);
      expect(page1.hasMore).toBe(true);

      // Second page
      const page2 = await caller.list({ limit: 3, offset: 3 });
      expect(page2.items).toHaveLength(3);
      expect(page2.items.every((a) => a.title.includes("Match"))).toBe(true);
    });
  });

  describe("Category Filtering", () => {
    it("should only return articles from subscriptions with the specified category", async () => {
      // Disable filtering on subscription2 for this test
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription2.id));

      // Create categories
      const [techCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "tech",
          color: "#10B981",
        })
        .returning();

      const [drmCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "drm",
          color: "#e6a37a",
        })
        .returning();

      // Assign categories to subscriptions
      await db.insert(schema.subscriptionCategories).values([
        {
          subscriptionId: testSubscription1.id,
          categoryId: techCategory.id,
        },
        {
          subscriptionId: testSubscription2.id,
          categoryId: drmCategory.id,
        },
      ]);

      // Create articles for both sources
      await createArticle(testSource1.id, { title: "Tech Article" });
      await createArticle(testSource2.id, { title: "DRM Article" });

      const caller = createCaller();

      // Filter by tech category - should only get tech articles
      const techResult = await caller.list({
        limit: 20,
        offset: 0,
        categoryId: techCategory.id,
      });
      expect(techResult.items).toHaveLength(1);
      expect(techResult.items[0].title).toBe("Tech Article");

      // Filter by drm category - should only get drm articles
      const drmResult = await caller.list({
        limit: 20,
        offset: 0,
        categoryId: drmCategory.id,
      });
      expect(drmResult.items).toHaveLength(1);
      expect(drmResult.items[0].title).toBe("DRM Article");
    });

    it("should not return articles from subscriptions without the category", async () => {
      // Disable filtering on both subscriptions for this test
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription1.id));
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription2.id));

      // Create category
      const [techCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "tech",
          color: "#10B981",
        })
        .returning();

      const [drmCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "drm",
          color: "#e6a37a",
        })
        .returning();

      // Only assign tech category to subscription1
      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: testSubscription1.id,
        categoryId: techCategory.id,
      });

      // Create articles
      await createArticle(testSource1.id, { title: "Tech Article" });
      await createArticle(testSource2.id, { title: "DRM Article" });

      const caller = createCaller();

      // Filter by drm category - should return nothing (subscription2 has no categories)
      const drmResult = await caller.list({
        limit: 20,
        offset: 0,
        categoryId: drmCategory.id,
      });
      expect(drmResult.items).toHaveLength(0);
    });

    it("should filter by both categoryId and subscriptionId together", async () => {
      // Disable filtering on both subscriptions for this test
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription1.id));
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription2.id));

      // Create categories
      const [techCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "tech",
          color: "#10B981",
        })
        .returning();

      const [drmCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "drm",
          color: "#e6a37a",
        })
        .returning();

      // Assign tech category to subscription1
      // Assign drm category to subscription2
      await db.insert(schema.subscriptionCategories).values([
        {
          subscriptionId: testSubscription1.id,
          categoryId: techCategory.id,
        },
        {
          subscriptionId: testSubscription2.id,
          categoryId: drmCategory.id,
        },
      ]);

      // Create articles for both sources
      await createArticle(testSource1.id, { title: "Tech Article 1" });
      await createArticle(testSource1.id, { title: "Tech Article 2" });
      await createArticle(testSource2.id, { title: "DRM Article" });

      const caller = createCaller();

      // Filter by tech category + subscription1 - should only get articles from subscription1
      const combinedResult = await caller.list({
        limit: 20,
        offset: 0,
        categoryId: techCategory.id,
        subscriptionId: testSubscription1.id,
      });
      expect(combinedResult.items).toHaveLength(2);
      expect(
        combinedResult.items.every((a) => a.title.startsWith("Tech"))
      ).toBe(true);

      // Filter by tech category + subscription2 - should return nothing
      // (subscription2 has drm category, not tech)
      const noMatchResult = await caller.list({
        limit: 20,
        offset: 0,
        categoryId: techCategory.id,
        subscriptionId: testSubscription2.id,
      });
      expect(noMatchResult.items).toHaveLength(0);

      // Filter by drm category + subscription2 - should get DRM article
      const drmCombinedResult = await caller.list({
        limit: 20,
        offset: 0,
        categoryId: drmCategory.id,
        subscriptionId: testSubscription2.id,
      });
      expect(drmCombinedResult.items).toHaveLength(1);
      expect(drmCombinedResult.items[0].title).toBe("DRM Article");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null/empty field values", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "description",
        matchType: "contains",
        pattern: "test",
        caseSensitive: false,
      });

      // Create article with null description (should not match)
      await db
        .insert(schema.articles)
        .values({
          sourceId: testSource2.id,
          guid: "guid-null-desc",
          title: "Article",
          description: null,
          publishedAt: new Date(),
        })
        .returning();

      await createArticle(testSource2.id, {
        title: "Article 2",
        description: "test description",
      });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Article 2");
    });

    it("should handle empty pattern gracefully", async () => {
      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription2.id,
        field: "title",
        matchType: "contains",
        pattern: "",
        caseSensitive: false,
      });

      await createArticle(testSource2.id, { title: "Any Article" });

      const caller = createCaller();
      const result = await caller.list({ limit: 20, offset: 0 });

      // Empty pattern should match everything in contains mode
      expect(result.items).toHaveLength(1);
    });
  });
});
