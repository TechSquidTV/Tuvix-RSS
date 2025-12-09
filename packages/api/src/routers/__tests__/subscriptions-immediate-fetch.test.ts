/**
 * Subscription Immediate Article Fetching Tests
 *
 * Tests that verify articles are fetched immediately when creating a subscription
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, cleanupTestDb, seedTestUser } from "@/test/setup";
import { subscriptionsRouter } from "../subscriptions";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Subscription Creation - Immediate Article Fetching", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    // Mock fetch globally
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.restoreAllMocks();
  });

  /**
   * Helper to create a complete mock Response with all required properties
   */
  function createMockResponse(
    url: string,
    xmlContent: string,
    status: number = 200
  ): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      url,
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-type" ? "application/xml" : null,
      } as any,
      text: async () => xmlContent,
    } as Response;
  }

  /**
   * Helper to create RSS feed with articles
   */
  function createRssWithArticles(
    title: string = "Test Feed",
    articleCount: number = 3
  ): string {
    const articles = Array.from({ length: articleCount }, (_, i) => {
      const num = i + 1;
      return `
    <item>
      <title>Article ${num}</title>
      <link>https://example.com/article-${num}</link>
      <description>Description for article ${num}</description>
      <guid>article-${num}</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>`;
    }).join("");

    return `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <link>https://example.com</link>
    <description>Test feed description</description>
    ${articles}
  </channel>
</rss>`;
  }

  /**
   * Helper to create tRPC caller
   */
  function createCaller() {
    return subscriptionsRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: { SKIP_RATE_LIMIT: "true" } as any,
      headers: {} as any,
      req: {} as any,
    });
  }

  it("should fetch and store articles immediately after creating subscription", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const feedXml = createRssWithArticles("Test Feed", 3);

    // Mock all fetch calls to return the feed with articles
    (global.fetch as any).mockResolvedValue(
      createMockResponse(feedUrl, feedXml)
    );

    const caller = createCaller();

    // Create subscription
    const subscription = await caller.create({
      url: feedUrl,
    });

    expect(subscription).toBeDefined();
    expect(subscription.source.url).toBe(feedUrl);

    // Verify articles were fetched and stored in the database
    const articles = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceId, subscription.source.id));

    expect(articles.length).toBeGreaterThan(0);
    expect(articles[0].title).toBe("Article 1");
    expect(articles[1].title).toBe("Article 2");
    expect(articles[2].title).toBe("Article 3");
  });

  it("should create subscription successfully even if article fetch fails", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const feedXml = createRssWithArticles("Test Feed", 0);

    // First call succeeds (validation), second call fails (article fetch)
    (global.fetch as any)
      .mockResolvedValueOnce(createMockResponse(feedUrl, feedXml))
      .mockRejectedValueOnce(new Error("Network timeout"));

    const caller = createCaller();

    // Create subscription - should succeed despite fetch failure
    const subscription = await caller.create({
      url: feedUrl,
    });

    expect(subscription).toBeDefined();
    expect(subscription.source.url).toBe(feedUrl);

    // Verify subscription exists in database
    const subscriptions = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, testUser.id));

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].sourceId).toBe(subscription.source.id);

    // Verify no articles were created (fetch failed)
    const articles = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceId, subscription.source.id));

    expect(articles).toHaveLength(0);
  });

  it("should update source lastFetched timestamp after fetching articles", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const feedXml = createRssWithArticles("Test Feed", 2);

    // Mock fetch to return feed with articles
    (global.fetch as any).mockResolvedValue(
      createMockResponse(feedUrl, feedXml)
    );

    const caller = createCaller();

    // Create subscription
    const subscription = await caller.create({
      url: feedUrl,
    });

    // Verify source lastFetched was updated
    const source = await db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, subscription.source.id))
      .limit(1);

    expect(source).toHaveLength(1);
    expect(source[0].lastFetched).toBeDefined();

    // Verify timestamp is recent (within last 5 seconds)
    const now = Date.now();
    const lastFetchedTime = source[0].lastFetched!.getTime();
    const timeDiff = now - lastFetchedTime;
    expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    expect(timeDiff).toBeGreaterThanOrEqual(0); // Not in the future
  });

  it("should handle large feeds with many articles", async () => {
    const feedUrl = "https://example.com/large-feed.xml";
    const feedXml = createRssWithArticles("Large Feed", 50);

    // Mock fetch to return large feed
    (global.fetch as any).mockResolvedValue(
      createMockResponse(feedUrl, feedXml)
    );

    const caller = createCaller();

    // Create subscription
    const subscription = await caller.create({
      url: feedUrl,
    });

    expect(subscription).toBeDefined();

    // Verify all 50 articles were fetched
    const articles = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceId, subscription.source.id));

    expect(articles).toHaveLength(50);
  });

  it("should not duplicate articles on subsequent fetches", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const feedXml = createRssWithArticles("Test Feed", 3);

    // Mock fetch to always return same feed
    (global.fetch as any).mockResolvedValue(
      createMockResponse(feedUrl, feedXml)
    );

    const caller = createCaller();

    // Create first subscription
    const subscription1 = await caller.create({
      url: feedUrl,
    });

    // Verify 3 articles exist
    let articles = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceId, subscription1.source.id));

    expect(articles).toHaveLength(3);

    // Delete the subscription (but keep source and articles)
    await db
      .delete(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscription1.id));

    // Create second subscription to same feed (should reuse existing source)
    const subscription2 = await caller.create({
      url: feedUrl,
    });

    // Verify still only 3 articles (no duplicates)
    articles = await db
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceId, subscription2.source.id));

    expect(articles).toHaveLength(3);

    // Both subscriptions should point to same source
    expect(subscription1.source.id).toBe(subscription2.source.id);
  });
});
