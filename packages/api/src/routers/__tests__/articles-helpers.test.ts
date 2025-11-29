/**
 * Articles Router Helpers Tests
 *
 * Tests for helper functions used in articles router
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
import {
  buildArticlesBaseQuery,
  applyCategoryFilter,
  buildBooleanFieldCondition,
  buildArticlesWhereConditions,
} from "../articles-helpers";
import { eq } from "drizzle-orm";

describe("Articles Router Helpers", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };
  let testSource: { id: number };
  let testSubscription: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    testSource = await seedTestSource(db, {
      url: "https://example.com/feed.xml",
      title: "Test Feed",
    });

    testSubscription = await seedTestSubscription(
      db,
      testUser.id,
      testSource.id
    );
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  describe("buildArticlesBaseQuery", () => {
    it("should build query with all necessary joins", async () => {
      // Create test article
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId: testSource.id,
          guid: "test-guid",
          title: "Test Article",
          link: "https://example.com/article",
          publishedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      // Build and execute query
      const query = buildArticlesBaseQuery(db, testUser.id);
      const results = await query;

      // Should return article with all joined tables
      expect(results).toHaveLength(1);
      expect(results[0].articles.id).toBe(article.id);
      expect(results[0].sources.id).toBe(testSource.id);
      expect(results[0].subscriptions.id).toBe(testSubscription.id);
    });

    it("should only return articles for subscribed sources", async () => {
      // Create article for subscribed source
      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "subscribed-article",
        title: "Subscribed Article",
        link: "https://example.com/subscribed",
        publishedAt: new Date(),
        createdAt: new Date(),
      });

      // Create another source and article (not subscribed)
      const [otherSource] = await db
        .insert(schema.sources)
        .values({
          url: "https://other.com/feed.xml",
          title: "Other Feed",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await db.insert(schema.articles).values({
        sourceId: otherSource.id,
        guid: "unsubscribed-article",
        title: "Unsubscribed Article",
        link: "https://other.com/article",
        publishedAt: new Date(),
        createdAt: new Date(),
      });

      // Query should only return subscribed articles
      const query = buildArticlesBaseQuery(db, testUser.id);
      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].articles.title).toBe("Subscribed Article");
    });

    it("should include userArticleStates via left join", async () => {
      // Create article
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId: testSource.id,
          guid: "test-guid",
          title: "Test Article",
          link: "https://example.com/article",
          publishedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      // Mark as read
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: article.id,
        read: true,
        saved: false,
        updatedAt: new Date(),
      });

      // Query should include user article state
      const query = buildArticlesBaseQuery(db, testUser.id);
      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].user_article_states?.read).toBe(true);
    });

    it("should handle articles without userArticleStates", async () => {
      // Create article without user state
      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "unread-article",
        title: "Unread Article",
        link: "https://example.com/unread",
        publishedAt: new Date(),
        createdAt: new Date(),
      });

      // Query should include article with null user state
      const query = buildArticlesBaseQuery(db, testUser.id);
      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].user_article_states).toBeNull();
    });

    it("should return dynamic query builder", async () => {
      const query = buildArticlesBaseQuery(db, testUser.id);

      // Should be able to chain additional methods
      expect(query.where).toBeDefined();
      expect(query.orderBy).toBeDefined();
      expect(query.limit).toBeDefined();
    });
  });

  describe("applyCategoryFilter", () => {
    it("should filter articles by category", async () => {
      // Create category
      const [category] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "Tech",
          color: "#FF0000",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Associate subscription with category
      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: testSubscription.id,
        categoryId: category.id,
      });

      // Create article
      await db.insert(schema.articles).values({
        sourceId: testSource.id,
        guid: "categorized-article",
        title: "Tech Article",
        link: "https://example.com/tech",
        publishedAt: new Date(),
        createdAt: new Date(),
      });

      // Apply category filter
      const baseQuery = buildArticlesBaseQuery(db, testUser.id);
      const filteredQuery = applyCategoryFilter(baseQuery, category.id);
      const results = await filteredQuery;

      expect(results).toHaveLength(1);
      expect(results[0].articles.title).toBe("Tech Article");
    });

    it("should exclude articles not in category", async () => {
      // Create two categories
      const [techCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "Tech",
          color: "#FF0000",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const [newsCategory] = await db
        .insert(schema.categories)
        .values({
          userId: testUser.id,
          name: "News",
          color: "#00FF00",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create second subscription in news category
      const [newsSource] = await db
        .insert(schema.sources)
        .values({
          url: "https://news.com/feed.xml",
          title: "News Feed",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const [newsSubscription] = await db
        .insert(schema.subscriptions)
        .values({
          userId: testUser.id,
          sourceId: newsSource.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: testSubscription.id,
        categoryId: techCategory.id,
      });

      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: newsSubscription.id,
        categoryId: newsCategory.id,
      });

      // Create articles in both sources
      await db.insert(schema.articles).values([
        {
          sourceId: testSource.id,
          guid: "tech-article",
          title: "Tech Article",
          link: "https://example.com/tech",
          publishedAt: new Date(),
          createdAt: new Date(),
        },
        {
          sourceId: newsSource.id,
          guid: "news-article",
          title: "News Article",
          link: "https://news.com/article",
          publishedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      // Filter by tech category only
      const baseQuery = buildArticlesBaseQuery(db, testUser.id);
      const filteredQuery = applyCategoryFilter(baseQuery, techCategory.id);
      const results = await filteredQuery;

      expect(results).toHaveLength(1);
      expect(results[0].articles.title).toBe("Tech Article");
    });
  });

  describe("buildBooleanFieldCondition", () => {
    it("should build condition for true value", async () => {
      // Create read article
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId: testSource.id,
          guid: "read-article",
          title: "Read Article",
          link: "https://example.com/read",
          publishedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: article.id,
        read: true,
        saved: false,
        updatedAt: new Date(),
      });

      // Build query with read=true condition
      const condition = buildBooleanFieldCondition(
        schema.userArticleStates.read,
        true
      );

      const query = buildArticlesBaseQuery(db, testUser.id).where(condition);
      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].user_article_states?.read).toBe(true);
    });

    it("should build condition for false value (includes null)", async () => {
      // Create unread articles (one explicit false, one null)
      const [article1] = await db
        .insert(schema.articles)
        .values({
          sourceId: testSource.id,
          guid: "unread-article-1",
          title: "Unread Article 1",
          link: "https://example.com/unread1",
          publishedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      await db
        .insert(schema.articles)
        .values({
          sourceId: testSource.id,
          guid: "unread-article-2",
          title: "Unread Article 2",
          link: "https://example.com/unread2",
          publishedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      // One explicit false
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: article1.id,
        read: false,
        saved: false,
        updatedAt: new Date(),
      });

      // Article2 has no state (null)

      // Build query with read=false condition (should include both null and false)
      const condition = buildBooleanFieldCondition(
        schema.userArticleStates.read,
        false
      );

      const query = buildArticlesBaseQuery(db, testUser.id).where(condition);
      const results = await query;

      expect(results).toHaveLength(2);
      expect(
        results.every(
          (r) =>
            r.user_article_states?.read === false ||
            r.user_article_states === null
        )
      ).toBe(true);
    });

    it("should work with saved field", async () => {
      // Create saved article
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId: testSource.id,
          guid: "saved-article",
          title: "Saved Article",
          link: "https://example.com/saved",
          publishedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: article.id,
        read: false,
        saved: true,
        updatedAt: new Date(),
      });

      // Build query with saved=true condition
      const condition = buildBooleanFieldCondition(
        schema.userArticleStates.saved,
        true
      );

      const query = buildArticlesBaseQuery(db, testUser.id).where(condition);
      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].user_article_states?.saved).toBe(true);
    });
  });

  describe("buildArticlesWhereConditions", () => {
    it("should build subscription filter condition", () => {
      const conditions = buildArticlesWhereConditions({
        subscriptionId: testSubscription.id,
      });

      expect(conditions).toHaveLength(1);
      // Condition should be an SQL object
      expect(conditions[0]).toBeDefined();
    });

    it("should build read filter condition", () => {
      const conditions = buildArticlesWhereConditions({
        read: true,
      });

      expect(conditions).toHaveLength(1);
    });

    it("should build saved filter condition", () => {
      const conditions = buildArticlesWhereConditions({
        saved: true,
      });

      expect(conditions).toHaveLength(1);
    });

    it("should build multiple conditions", () => {
      const conditions = buildArticlesWhereConditions({
        subscriptionId: testSubscription.id,
        read: true,
        saved: false,
      });

      expect(conditions).toHaveLength(3);
    });

    it("should return empty array when no filters provided", () => {
      const conditions = buildArticlesWhereConditions({});

      expect(conditions).toHaveLength(0);
    });

    it("should handle undefined values correctly", () => {
      const conditions = buildArticlesWhereConditions({
        subscriptionId: 123,
        read: undefined,
        saved: undefined,
      });

      // Only subscriptionId should create a condition
      expect(conditions).toHaveLength(1);
    });

    it("should work with actual query execution", async () => {
      // Create articles in different subscriptions
      const [otherSource] = await db
        .insert(schema.sources)
        .values({
          url: "https://other.com/feed.xml",
          title: "Other Feed",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await db
        .insert(schema.subscriptions)
        .values({
          userId: testUser.id,
          sourceId: otherSource.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await db.insert(schema.articles).values([
        {
          sourceId: testSource.id,
          guid: "article-1",
          title: "Article 1",
          link: "https://example.com/1",
          publishedAt: new Date(),
          createdAt: new Date(),
        },
        {
          sourceId: otherSource.id,
          guid: "article-2",
          title: "Article 2",
          link: "https://other.com/2",
          publishedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      // Build query with subscription filter
      const query = buildArticlesBaseQuery(db, testUser.id).where(
        eq(schema.subscriptions.id, testSubscription.id)
      );
      const results = await query;

      // Should only return article from filtered subscription
      expect(results).toHaveLength(1);
      expect(results[0].articles.title).toBe("Article 1");
    });
  });
});
