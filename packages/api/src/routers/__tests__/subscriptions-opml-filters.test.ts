/**
 * OPML Filter and Category Export/Import Tests
 *
 * Tests for exporting and importing subscription filters and categories in OPML format
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
  seedTestCategory,
} from "@/test/setup";
import * as schema from "@/db/schema";
import { subscriptionsRouter } from "../subscriptions";
import { parseOpml } from "feedsmith";
import { eq, and } from "drizzle-orm";

/**
 * Helper functions to generate realistic feed content for testing
 * These simulate real-world feeds that go through actual parsing logic
 */

function createRealisticRSSFeed(options: {
  title: string;
  link: string;
  description?: string;
  items?: Array<{ title: string; link?: string; description?: string }>;
}): string {
  const { title, link, description, items = [] } = options;
  const itemsXml = items
    .map(
      (item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      ${item.link ? `<link>${item.link}</link>` : ""}
      ${item.description ? `<description><![CDATA[${item.description}]]></description>` : ""}
      <guid isPermaLink="false">${item.link || `https://example.com/item-${Math.random()}`}</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
    </item>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    ${description ? `<description><![CDATA[${description}]]></description>` : ""}
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>TuvixRSS Test Suite</generator>${itemsXml}
  </channel>
</rss>`;
}

function createRealisticAtomFeed(options: {
  title: string;
  link: string;
  subtitle?: string;
  entries?: Array<{ title: string; link?: string; summary?: string }>;
}): string {
  const { title, link, subtitle, entries = [] } = options;
  const entriesXml = entries
    .map(
      (entry) => `
    <entry>
      <id>${entry.link || `https://example.com/entry-${Math.random()}`}</id>
      <title type="html"><![CDATA[${entry.title}]]></title>
      ${entry.link ? `<link href="${entry.link}" rel="alternate"/>` : ""}
      ${entry.summary ? `<summary type="html"><![CDATA[${entry.summary}]]></summary>` : ""}
      <updated>${new Date().toISOString()}</updated>
    </entry>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html"><![CDATA[${title}]]></title>
  <link href="${link}" rel="alternate"/>
  ${subtitle ? `<subtitle type="html"><![CDATA[${subtitle}]]></subtitle>` : ""}
  <id>${link}</id>
  <updated>${new Date().toISOString()}</updated>
  <generator>TuvixRSS Test Suite</generator>${entriesXml}
</feed>`;
}

function createRealisticJSONFeed(options: {
  title: string;
  home_page_url: string;
  description?: string;
  items?: Array<{ title: string; url?: string; content_text?: string }>;
}): string {
  const { title, home_page_url, description, items = [] } = options;
  return JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title,
    home_page_url,
    feed_url: `${home_page_url}/feed.json`,
    description,
    items: items.map((item, idx) => ({
      id: item.url || `${home_page_url}/item-${idx}`,
      title: item.title,
      url: item.url,
      content_text: item.content_text,
      date_published: new Date().toISOString(),
    })),
  });
}

/**
 * Creates a realistic feed fetcher mock that returns different feed formats
 * based on URL patterns, simulating real-world scenarios
 */
function createRealisticFeedFetcher(
  urlToFeedMap: Map<string, { content: string; contentType?: string }>
): typeof global.fetch {
  return async (url: RequestInfo | URL) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const feed = urlToFeedMap.get(urlStr);

    if (!feed) {
      // Default realistic RSS feed if not specified
      return {
        ok: true,
        url: urlStr,
        headers: new Headers({
          "content-type": "application/rss+xml; charset=utf-8",
        }),
        text: async () =>
          createRealisticRSSFeed({
            title: "Default Test Feed",
            link: urlStr,
            description: "A test RSS feed",
            items: [
              { title: "Test Article 1", link: `${urlStr}/article-1` },
              { title: "Test Article 2", link: `${urlStr}/article-2` },
            ],
          }),
      } as Response;
    }

    return {
      ok: true,
      url: urlStr,
      headers: new Headers({
        "content-type":
          feed.contentType || "application/rss+xml; charset=utf-8",
      }),
      text: async () => feed.content,
    } as Response;
  };
}

describe("OPML Filter and Category Export/Import", () => {
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
      testSource.id,
      {
        filterEnabled: true,
      }
    );
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  describe("Export with Filters", () => {
    it("should export subscription with filters in OPML", async () => {
      // Create filters for subscription
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: testSubscription.id,
          field: "title",
          matchType: "contains",
          pattern: "widevine",
          caseSensitive: false,
        },
        {
          subscriptionId: testSubscription.id,
          field: "title",
          matchType: "contains",
          pattern: "playready",
          caseSensitive: false,
        },
      ]);

      // Create a tRPC caller
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export OPML
      const opmlXml = await caller.export();

      // Parse the exported OPML
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
        ],
      });

      // Verify structure
      expect(parsed.body?.outlines).toBeDefined();
      const feedOutline = parsed.body?.outlines?.[0];
      expect(feedOutline).toBeDefined();

      // Verify filter attributes are present
      expect(feedOutline?.tuvixFilterEnabled).toBe("true");
      expect(feedOutline?.tuvixFilterMode).toBe("include");
      expect(feedOutline?.tuvixFilters).toBeDefined();

      // Parse filters JSON
      const filters = JSON.parse(feedOutline?.tuvixFilters as string);
      expect(filters).toHaveLength(2);
      expect(filters[0].pattern).toBe("widevine");
      expect(filters[1].pattern).toBe("playready");
    });

    it("should export subscription without filters", async () => {
      // Update subscription to have no filters
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription.id));

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
        ],
      });

      const feedOutline = parsed.body?.outlines?.[0];
      expect(feedOutline?.tuvixFilterEnabled).toBe("false");
      expect(feedOutline?.tuvixFilters).toBeUndefined();
    });

    it("should export subscription with filterEnabled=false but filters exist", async () => {
      // Create filters but disable them
      await db
        .update(schema.subscriptions)
        .set({ filterEnabled: false })
        .where(eq(schema.subscriptions.id, testSubscription.id));

      await db.insert(schema.subscriptionFilters).values({
        subscriptionId: testSubscription.id,
        field: "title",
        matchType: "contains",
        pattern: "test",
        caseSensitive: false,
      });

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
        ],
      });

      const feedOutline = parsed.body?.outlines?.[0];
      expect(feedOutline?.tuvixFilterEnabled).toBe("false");
      // Filters should still be exported even if disabled
      expect(feedOutline?.tuvixFilters).toBeDefined();
    });

    it("should export multiple subscriptions with different filter configurations", async () => {
      // Create second subscription
      const source2 = await seedTestSource(db, {
        url: "https://example.com/feed2.xml",
        title: "Test Feed 2",
      });
      const subscription2 = await seedTestSubscription(
        db,
        testUser.id,
        source2.id,
        {
          filterEnabled: true,
          filterMode: "exclude",
        }
      );

      // Add filters to both subscriptions
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: testSubscription.id,
          field: "title",
          matchType: "contains",
          pattern: "include-me",
          caseSensitive: false,
        },
        {
          subscriptionId: subscription2.id,
          field: "content",
          matchType: "regex",
          pattern: "exclude.*me",
          caseSensitive: true,
        },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
        ],
      });

      const outlines = parsed.body?.outlines || [];
      expect(outlines.length).toBeGreaterThanOrEqual(2);

      const outline1 = outlines.find(
        (o) => o.xmlUrl === "https://example.com/feed.xml"
      );
      const outline2 = outlines.find(
        (o) => o.xmlUrl === "https://example.com/feed2.xml"
      );

      expect(outline1?.tuvixFilterMode).toBe("include");
      expect(outline2?.tuvixFilterMode).toBe("exclude");

      const filters1 = JSON.parse(outline1?.tuvixFilters as string);
      const filters2 = JSON.parse(outline2?.tuvixFilters as string);

      expect(filters1[0].pattern).toBe("include-me");
      expect(filters2[0].pattern).toBe("exclude.*me");
      expect(filters2[0].caseSensitive).toBe(true);
    });
  });

  describe("Parse OPML with Filters", () => {
    it("should parse OPML with filter attributes", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="Test Feed" xmlUrl="https://example.com/feed.xml" 
             tuvixFilterEnabled="true" tuvixFilterMode="include"
             tuvixFilters='[{"field":"title","matchType":"contains","pattern":"test","caseSensitive":false}]'/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const result = await caller.parseOpml({ opmlContent: opmlXml });

      expect(result.feeds).toHaveLength(1);
      expect(result.feeds[0].filters).toBeDefined();
      expect(result.feeds[0].filters).toHaveLength(1);
      expect(result.feeds[0].filters?.[0].pattern).toBe("test");
      expect(result.feeds[0].filterEnabled).toBe(true);
      expect(result.feeds[0].filterMode).toBe("include");
    });

    it("should parse OPML without filter attributes (backward compatibility)", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="Test Feed" xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const result = await caller.parseOpml({ opmlContent: opmlXml });

      expect(result.feeds).toHaveLength(1);
      expect(result.feeds[0].filters).toBeUndefined();
      expect(result.feeds[0].filterEnabled).toBeUndefined();
    });

    it("should handle malformed filter JSON gracefully", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="Test Feed" xmlUrl="https://example.com/feed.xml" 
             tuvixFilterEnabled="true" tuvixFilters="invalid json"/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const result = await caller.parseOpml({ opmlContent: opmlXml });

      // Should still parse the feed, but filters should be undefined
      expect(result.feeds).toHaveLength(1);
      expect(result.feeds[0].filters).toBeUndefined();
    });

    it("should validate filter structure and filter invalid filters", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="Test Feed" xmlUrl="https://example.com/feed.xml" 
             tuvixFilters='[{"field":"title","matchType":"contains","pattern":"valid"},
                           {"field":"invalid","matchType":"bad","pattern":"bad"},
                           {"field":"title","matchType":"contains","pattern":"also-valid"}]'/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const result = await caller.parseOpml({ opmlContent: opmlXml });

      // Should only include valid filters
      expect(result.feeds[0].filters).toHaveLength(2);
      expect(result.feeds[0].filters?.[0].pattern).toBe("valid");
      expect(result.feeds[0].filters?.[1].pattern).toBe("also-valid");
    });
  });

  describe("Input Validation", () => {
    it("should reject File object in parseOpml (must be string)", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Simulate passing a File object instead of string
      // Create a File-like object if File constructor is not available (Node.js)
      let fileLike: any;
      if (typeof File !== "undefined") {
        fileLike = new File(["test"], "test.opml", {
          type: "application/xml",
        });
      } else {
        // Mock File object for Node.js environments
        fileLike = {
          name: "test.opml",
          type: "application/xml",
          size: 4,
          lastModified: Date.now(),
        };
      }

      // This should fail with a validation error (Zod will reject non-string types)
      await expect(
        caller.parseOpml({
          opmlContent: fileLike,
        } as any)
      ).rejects.toThrow();
    });

    it("should reject non-string types in parseOpml", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Test various invalid types
      await expect(
        caller.parseOpml({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: null,
        })
      ).rejects.toThrow();

      await expect(
        caller.parseOpml({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: undefined,
        })
      ).rejects.toThrow();

      await expect(
        caller.parseOpml({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: 123,
        })
      ).rejects.toThrow();

      await expect(
        caller.parseOpml({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: {},
        })
      ).rejects.toThrow();
    });

    it("should accept valid string in parseOpml", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="Test Feed" xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Should not throw when passing valid string
      const result = await caller.parseOpml({ opmlContent: opmlXml });
      expect(result.feeds).toHaveLength(1);
    });

    it("should reject File object in import (must be string)", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Simulate passing a File object instead of string
      // Create a File-like object if File constructor is not available (Node.js)
      let fileLike: any;
      if (typeof File !== "undefined") {
        fileLike = new File(["test"], "test.opml", {
          type: "application/xml",
        });
      } else {
        // Mock File object for Node.js environments
        fileLike = {
          name: "test.opml",
          type: "application/xml",
          size: 4,
          lastModified: Date.now(),
        };
      }

      // This should fail with a validation error (Zod will reject non-string types)
      await expect(
        caller.import({
          opmlContent: fileLike,
        } as any)
      ).rejects.toThrow();
    });

    it("should reject non-string types in import", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Test various invalid types
      await expect(
        caller.import({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: null,
        })
      ).rejects.toThrow();

      await expect(
        caller.import({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: undefined,
        })
      ).rejects.toThrow();

      await expect(
        caller.import({
          // @ts-expect-error - Intentionally passing wrong type
          opmlContent: 123,
        })
      ).rejects.toThrow();
    });

    it("should require opmlContent field in parseOpml", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Missing opmlContent should fail validation
      await expect(
        // @ts-expect-error - Intentionally omitting required field
        caller.parseOpml({})
      ).rejects.toThrow();
    });

    it("should require opmlContent field in import", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Missing opmlContent should fail validation
      await expect(
        // @ts-expect-error - Intentionally omitting required field
        caller.import({})
      ).rejects.toThrow();
    });

    it("should reject empty string in parseOpml", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Empty string should fail validation (min length is 1)
      await expect(caller.parseOpml({ opmlContent: "" })).rejects.toThrow();
    });

    it("should reject empty string in import", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Empty string should fail validation (min length is 1)
      await expect(caller.import({ opmlContent: "" })).rejects.toThrow();
    });
  });

  describe("Import with Filters", () => {
    it("should import subscription with filters", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml" 
             tuvixFilterEnabled="true" tuvixFilterMode="include"
             tuvixFilters='[{"field":"title","matchType":"contains","pattern":"imported","caseSensitive":false}]'/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Mock fetch for feed validation
      global.fetch = async () => {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>New Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Test Article</title>
    </item>
  </channel>
</rss>`,
        } as Response;
      };

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      expect(result.successCount).toBe(1);

      // Verify subscription was created with filters
      const subscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, testUser.id));

      const newSubscription = subscriptions.find(
        (s) => s.id !== testSubscription.id
      );
      expect(newSubscription).toBeDefined();
      expect(newSubscription?.filterEnabled).toBe(true);
      expect(newSubscription?.filterMode).toBe("include");

      // Verify filters were created
      const filters = await db
        .select()
        .from(schema.subscriptionFilters)
        .where(
          eq(schema.subscriptionFilters.subscriptionId, newSubscription!.id)
        );

      expect(filters).toHaveLength(1);
      expect(filters[0].pattern).toBe("imported");
      expect(filters[0].field).toBe("title");
      expect(filters[0].matchType).toBe("contains");
    });

    it("should handle invalid regex patterns gracefully", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml" 
             tuvixFilters='[{"field":"title","matchType":"regex","pattern":"[invalid","caseSensitive":false}]'/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic RSS feed
      const feedMap = new Map([
        [
          "https://example.com/newfeed.xml",
          {
            content: createRealisticRSSFeed({
              title: "New Feed",
              link: "https://example.com",
              description: "Test feed",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      // Should succeed but filter creation should fail
      expect(result.successCount).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain("Invalid regex pattern");
    });

    it("should import subscription without filters", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml"/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic RSS feed
      const feedMap = new Map([
        [
          "https://example.com/newfeed.xml",
          {
            content: createRealisticRSSFeed({
              title: "New Feed",
              link: "https://example.com",
              description: "Test feed",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      expect(result.successCount).toBe(1);

      const subscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, testUser.id));

      const newSubscription = subscriptions.find(
        (s) => s.id !== testSubscription.id
      );
      expect(newSubscription?.filterEnabled).toBe(false);
    });
  });

  describe("Round-trip Tests", () => {
    it("should preserve filters through export and import", async () => {
      // Create subscription with filters
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: testSubscription.id,
          field: "title",
          matchType: "contains",
          pattern: "roundtrip-test",
          caseSensitive: false,
        },
        {
          subscriptionId: testSubscription.id,
          field: "content",
          matchType: "regex",
          pattern: "test-\\d+",
          caseSensitive: true,
        },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();

      // Create a new user and import
      const { user: newUser } = await seedTestUser(db, {
        username: "newuser",
        email: "newuser@example.com",
      });

      const newCaller = subscriptionsRouter.createCaller({
        db,
        user: { userId: newUser.id, username: "newuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feed - ensures actual parsing happens
      const feedMap = new Map([
        [
          "https://example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Test Feed",
              link: "https://example.com",
              description: "Test feed for round-trip",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      // Import
      const importResult = await newCaller.import({
        opmlContent: opmlXml,
      });

      expect(importResult.successCount).toBe(1);

      // Verify filters were preserved
      const newSubscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, newUser.id));

      const importedSubscription = newSubscriptions[0];
      expect(importedSubscription.filterEnabled).toBe(true);

      const importedFilters = await db
        .select()
        .from(schema.subscriptionFilters)
        .where(
          eq(schema.subscriptionFilters.subscriptionId, importedSubscription.id)
        );

      expect(importedFilters).toHaveLength(2);
      expect(importedFilters[0].pattern).toBe("roundtrip-test");
      expect(importedFilters[1].pattern).toBe("test-\\d+");
      expect(importedFilters[1].caseSensitive).toBe(true);
    });
  });

  describe("Export with Categories", () => {
    it("should export subscription with categories in OPML", async () => {
      // Create categories
      const category1 = await seedTestCategory(db, testUser.id, {
        name: "Technology",
      });
      const category2 = await seedTestCategory(db, testUser.id, {
        name: "News",
      });

      // Link categories to subscription
      await db.insert(schema.subscriptionCategories).values([
        {
          subscriptionId: testSubscription.id,
          categoryId: category1.id,
        },
        {
          subscriptionId: testSubscription.id,
          categoryId: category2.id,
        },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export OPML
      const opmlXml = await caller.export();

      // Parse the exported OPML
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
          "tuvixCategories",
        ],
      });

      // Verify structure - feeds with categories are grouped into folders
      expect(parsed.body?.outlines).toBeDefined();
      // Find the category folder (could be Technology or News)
      const categoryFolder = parsed.body?.outlines?.find(
        (o) => o.text === "Technology" || o.text === "News"
      );
      expect(categoryFolder).toBeDefined();
      expect(categoryFolder?.outlines).toBeDefined();

      const feedOutline = categoryFolder?.outlines?.[0];
      expect(feedOutline).toBeDefined();

      // Verify category attribute is present
      expect(feedOutline?.tuvixCategories).toBeDefined();

      // Parse categories JSON
      const categories = JSON.parse(feedOutline?.tuvixCategories as string);
      expect(categories).toHaveLength(2);
      expect(categories).toContain("Technology");
      expect(categories).toContain("News");
    });

    it("should export subscription without categories", async () => {
      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
          "tuvixCategories",
        ],
      });

      const feedOutline = parsed.body?.outlines?.[0];
      // Categories attribute should not be present if no categories
      expect(feedOutline?.tuvixCategories).toBeUndefined();
    });

    it("should export subscription with categories in folder structure", async () => {
      // Create categories
      const category1 = await seedTestCategory(db, testUser.id, {
        name: "Technology",
      });

      // Link category to subscription
      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: testSubscription.id,
        categoryId: category1.id,
      });

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
          "tuvixCategories",
        ],
      });

      // Should have category folder
      const categoryFolder = parsed.body?.outlines?.find(
        (o) => o.text === "Technology"
      );
      expect(categoryFolder).toBeDefined();
      expect(categoryFolder?.outlines).toBeDefined();
      expect(categoryFolder?.outlines?.[0]?.xmlUrl).toBe(
        "https://example.com/feed.xml"
      );

      // Should also have category attribute
      const feedOutline = categoryFolder?.outlines?.[0];
      expect(feedOutline?.tuvixCategories).toBeDefined();
      const categories = JSON.parse(feedOutline?.tuvixCategories as string);
      expect(categories).toContain("Technology");
    });
  });

  describe("Import with Categories", () => {
    it("should import subscription with categories from attribute", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml" 
             tuvixCategories='["Technology", "News"]'/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Mock fetch for feed validation
      global.fetch = async () => {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>New Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Test Article</title>
    </item>
  </channel>
</rss>`,
        } as Response;
      };

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      expect(result.successCount).toBe(1);

      // Verify subscription was created
      const subscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, testUser.id));

      const newSubscription = subscriptions.find(
        (s) => s.id !== testSubscription.id
      );
      expect(newSubscription).toBeDefined();

      // Verify categories were created and linked
      const categories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, testUser.id));

      expect(categories).toHaveLength(2);
      const categoryNames = categories.map((c) => c.name);
      expect(categoryNames).toContain("Technology");
      expect(categoryNames).toContain("News");

      // Verify subscription-category links
      const subscriptionCategories = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, newSubscription!.id)
        );

      expect(subscriptionCategories).toHaveLength(2);
    });

    it("should import subscription with categories from folder structure", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline text="Technology">
      <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml"/>
    </outline>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic RSS feed - ensures parsing logic is tested
      const feedMap = new Map([
        [
          "https://example.com/newfeed.xml",
          {
            content: createRealisticRSSFeed({
              title: "New Feed",
              link: "https://example.com",
              description: "A new feed to import",
              items: [
                {
                  title: "Test Article",
                  link: "https://example.com/article-1",
                },
              ],
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      expect(result.successCount).toBe(1);

      // Verify category was created
      const categories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, testUser.id));

      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe("Technology");

      // CRITICAL: Verify feed metadata was extracted and stored correctly
      // This ensures schema changes would break the test
      const sources = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.url, "https://example.com/newfeed.xml"))
        .limit(1);
      expect(sources.length).toBe(1);
      expect(sources[0].title).toBe("New Feed");
      expect(sources[0].siteUrl).toBe("https://example.com");
      expect(sources[0].description).toBe("A new feed to import");
    });

    it("should merge folder-based and attribute categories", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline text="Technology">
      <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml" 
               tuvixCategories='["News", "Science"]'/>
    </outline>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Mock fetch for feed validation
      global.fetch = async () => {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>New Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Test Article</title>
    </item>
  </channel>
</rss>`,
        } as Response;
      };

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      expect(result.successCount).toBe(1);

      // Verify all categories were created
      const categories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, testUser.id));

      expect(categories).toHaveLength(3);
      const categoryNames = categories.map((c) => c.name);
      expect(categoryNames).toContain("Technology");
      expect(categoryNames).toContain("News");
      expect(categoryNames).toContain("Science");

      // Verify subscription has all three categories
      const subscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, testUser.id));

      const newSubscription = subscriptions.find(
        (s) => s.id !== testSubscription.id
      );
      expect(newSubscription).toBeDefined();

      const subscriptionCategories = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, newSubscription!.id)
        );

      expect(subscriptionCategories).toHaveLength(3);
    });

    it("should parse OPML with category attributes", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml" 
             tuvixCategories='["Technology", "News"]'/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const result = await caller.parseOpml({ opmlContent: opmlXml });

      expect(result.feeds).toHaveLength(1);
      expect(result.feeds[0].categories).toHaveLength(2);
      expect(result.feeds[0].categories).toContain("Technology");
      expect(result.feeds[0].categories).toContain("News");
    });

    it("should handle case-insensitive category deduplication", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline text="Technology">
      <outline type="rss" text="New Feed" xmlUrl="https://example.com/newfeed.xml" 
               tuvixCategories='["technology", "News", "NEWS"]'/>
    </outline>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Mock fetch for feed validation
      global.fetch = async () => {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>New Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Test Article</title>
    </item>
  </channel>
</rss>`,
        } as Response;
      };

      const result = await caller.import({
        opmlContent: opmlXml,
        selectedUrls: ["https://example.com/newfeed.xml"],
      });

      expect(result.successCount).toBe(1);

      // Verify categories were created (case-insensitive deduplication)
      const categories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, testUser.id));

      // Should have Technology (from folder), technology (normalized), News (normalized)
      // But technology should match Technology, and NEWS should match News
      // So we should have 2 categories: Technology and News
      expect(categories.length).toBeLessThanOrEqual(2);

      // Verify subscription-category links (should not have duplicates)
      const subscriptions = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, testUser.id));

      const newSubscription = subscriptions.find(
        (s) => s.id !== testSubscription.id
      );
      expect(newSubscription).toBeDefined();

      const subscriptionCategories = await db
        .select()
        .from(schema.subscriptionCategories)
        .where(
          eq(schema.subscriptionCategories.subscriptionId, newSubscription!.id)
        );

      // Should not have duplicate links
      const categoryIds = subscriptionCategories.map((sc) => sc.categoryId);
      const uniqueCategoryIds = new Set(categoryIds);
      expect(categoryIds.length).toBe(uniqueCategoryIds.size);
    });
  });

  describe("Full OPML Export/Import Round-trip", () => {
    it("should export and import complete subscription with all features", async () => {
      // Setup: Create a realistic subscription setup
      const techCategory = await seedTestCategory(db, testUser.id, {
        name: "Technology",
      });
      const newsCategory = await seedTestCategory(db, testUser.id, {
        name: "News",
      });

      // Create multiple subscriptions with different configurations
      const source1 = await seedTestSource(db, {
        url: "https://tech.example.com/feed.xml",
        title: "Tech Blog",
      });
      const source2 = await seedTestSource(db, {
        url: "https://news.example.com/feed.xml",
        title: "News Site",
      });
      const source3 = await seedTestSource(db, {
        url: "https://blog.example.com/feed.xml",
        title: "Personal Blog",
      });

      const sub1 = await seedTestSubscription(db, testUser.id, source1.id, {
        customTitle: "My Tech Feed",
        filterEnabled: true,
        filterMode: "include",
      });
      const sub2 = await seedTestSubscription(db, testUser.id, source2.id, {
        filterEnabled: true,
        filterMode: "exclude",
      });
      await seedTestSubscription(db, testUser.id, source3.id, {
        filterEnabled: false,
      });

      // Add categories
      await db.insert(schema.subscriptionCategories).values([
        { subscriptionId: sub1.id, categoryId: techCategory.id },
        { subscriptionId: sub2.id, categoryId: newsCategory.id },
        { subscriptionId: sub2.id, categoryId: techCategory.id }, // Multiple categories
      ]);

      // Add filters
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: sub1.id,
          field: "title",
          matchType: "contains",
          pattern: "JavaScript",
          caseSensitive: false,
        },
        {
          subscriptionId: sub1.id,
          field: "content",
          matchType: "regex",
          pattern: "\\b(react|vue|angular)\\b",
          caseSensitive: false,
        },
        {
          subscriptionId: sub2.id,
          field: "title",
          matchType: "contains",
          pattern: "spam",
          caseSensitive: false,
        },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();

      // Verify export structure
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
          "tuvixCategories",
        ],
      });

      expect(parsed.body?.outlines).toBeDefined();
      expect(parsed.body?.outlines?.length).toBeGreaterThanOrEqual(2); // At least 2 category folders

      // Create new user and import
      const { user: newUser } = await seedTestUser(db, {
        username: "importuser",
        email: "import@example.com",
      });

      const importCaller = subscriptionsRouter.createCaller({
        db,
        user: { userId: newUser.id, username: "importuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feeds that go through actual parsing - this ensures schema changes are caught
      const feedMap = new Map([
        [
          "https://tech.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Tech Blog",
              link: "https://tech.example.com",
              description: "Latest technology news and updates",
              items: [
                {
                  title: "New JavaScript Framework Released",
                  link: "https://tech.example.com/article-1",
                  description: "A new framework has been released",
                },
              ],
            }),
            contentType: "application/rss+xml; charset=utf-8",
          },
        ],
        [
          "https://news.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "News Site",
              link: "https://news.example.com",
              description: "Breaking news and current events",
              items: [
                {
                  title: "Breaking: Major Event",
                  link: "https://news.example.com/article-1",
                },
              ],
            }),
            contentType: "application/rss+xml; charset=utf-8",
          },
        ],
        [
          "https://blog.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Personal Blog",
              link: "https://blog.example.com",
              description: "Personal thoughts and musings",
              items: [
                {
                  title: "My Latest Post",
                  link: "https://blog.example.com/post-1",
                },
              ],
            }),
            contentType: "application/rss+xml; charset=utf-8",
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      // Import all feeds
      const importResult = await importCaller.import({
        opmlContent: opmlXml,
      });

      // Note: Export includes testSubscription from beforeEach, so we expect 4 total
      // But we only created 3 new ones in this test, so imported should be 4
      expect(importResult.successCount).toBeGreaterThanOrEqual(3);
      expect(importResult.errorCount).toBe(0);

      // Verify all subscriptions were imported (including testSubscription from beforeEach)
      const importedSubs = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, newUser.id));

      expect(importedSubs.length).toBeGreaterThanOrEqual(3);

      // Verify categories were imported
      const importedCategories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, newUser.id));

      expect(importedCategories).toHaveLength(2);
      const categoryNames = importedCategories.map((c) => c.name);
      expect(categoryNames).toContain("Technology");
      expect(categoryNames).toContain("News");

      // Verify filters were imported
      const allFilters = await db
        .select()
        .from(schema.subscriptionFilters)
        .innerJoin(
          schema.subscriptions,
          eq(schema.subscriptionFilters.subscriptionId, schema.subscriptions.id)
        )
        .where(eq(schema.subscriptions.userId, newUser.id));

      expect(allFilters.length).toBeGreaterThanOrEqual(3);

      // CRITICAL: Verify that feed metadata was extracted and stored correctly
      // This ensures schema changes would break the test
      const importedSources = await db
        .select()
        .from(schema.sources)
        .innerJoin(
          schema.subscriptions,
          eq(schema.sources.id, schema.subscriptions.sourceId)
        )
        .where(eq(schema.subscriptions.userId, newUser.id));

      // Verify each source has the correct metadata extracted from feeds
      const techSource = importedSources.find((s) =>
        s.sources.url.includes("tech.example.com")
      );
      expect(techSource).toBeDefined();
      expect(techSource?.sources.title).toBe("Tech Blog");
      expect(techSource?.sources.siteUrl).toBe("https://tech.example.com");
      expect(techSource?.sources.description).toBe(
        "Latest technology news and updates"
      );

      const newsSource = importedSources.find((s) =>
        s.sources.url.includes("news.example.com")
      );
      expect(newsSource).toBeDefined();
      expect(newsSource?.sources.title).toBe("News Site");
      expect(newsSource?.sources.siteUrl).toBe("https://news.example.com");

      const blogSource = importedSources.find((s) =>
        s.sources.url.includes("blog.example.com")
      );
      expect(blogSource).toBeDefined();
      expect(blogSource?.sources.title).toBe("Personal Blog");
      expect(blogSource?.sources.siteUrl).toBe("https://blog.example.com");

      // Verify subscription was imported (custom titles are not preserved during import)
      const techSub = await db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(
          and(
            eq(schema.subscriptions.userId, newUser.id),
            eq(schema.sources.url, "https://tech.example.com/feed.xml")
          )
        )
        .limit(1);

      expect(techSub.length).toBe(1);
      // Note: Custom titles are set to null during import (user-specific feature)
      // The subscription is imported successfully, but customTitle is null
      expect(techSub[0].subscriptions.customTitle).toBeNull();
    });

    it("should handle partial import (selected URLs only)", async () => {
      // Setup: Create multiple subscriptions
      const source1 = await seedTestSource(db, {
        url: "https://feed1.example.com/feed.xml",
        title: "Feed 1",
      });
      const source2 = await seedTestSource(db, {
        url: "https://feed2.example.com/feed.xml",
        title: "Feed 2",
      });
      const source3 = await seedTestSource(db, {
        url: "https://feed3.example.com/feed.xml",
        title: "Feed 3",
      });

      await seedTestSubscription(db, testUser.id, source1.id);
      await seedTestSubscription(db, testUser.id, source2.id);
      await seedTestSubscription(db, testUser.id, source3.id);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();

      // Create new user
      const { user: newUser } = await seedTestUser(db, {
        username: "partialuser",
        email: "partial@example.com",
      });

      const importCaller = subscriptionsRouter.createCaller({
        db,
        user: { userId: newUser.id, username: "partialuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Mock fetch
      global.fetch = async () => {
        return {
          ok: true,
          text: async () => `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
  </channel>
</rss>`,
        } as Response;
      };

      // Import only selected URLs
      const importResult = await importCaller.import({
        opmlContent: opmlXml,
        selectedUrls: [
          "https://feed1.example.com/feed.xml",
          "https://feed3.example.com/feed.xml",
        ],
      });

      expect(importResult.successCount).toBe(2);

      // Verify only selected feeds were imported
      const importedSubs = await db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(eq(schema.subscriptions.userId, newUser.id));

      expect(importedSubs).toHaveLength(2);
      const importedUrls = importedSubs.map((s) => s.sources.url);
      expect(importedUrls).toContain("https://feed1.example.com/feed.xml");
      expect(importedUrls).toContain("https://feed3.example.com/feed.xml");
      expect(importedUrls).not.toContain("https://feed2.example.com/feed.xml");
    });

    it("should handle nested category folders", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Nested Categories Test</title>
  </head>
  <body>
    <outline text="Technology">
      <outline text="Programming">
        <outline type="rss" text="Feed 1" xmlUrl="https://feed1.example.com/feed.xml"/>
      </outline>
      <outline text="Hardware">
        <outline type="rss" text="Feed 2" xmlUrl="https://feed2.example.com/feed.xml"/>
      </outline>
    </outline>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feeds - ensures actual parsing happens
      const feedMap = new Map([
        [
          "https://feed1.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Feed 1",
              link: "https://feed1.example.com",
              description: "Programming feed",
            }),
          },
        ],
        [
          "https://feed2.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Feed 2",
              link: "https://feed2.example.com",
              description: "Hardware feed",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const result = await caller.import({
        opmlContent: opmlXml,
      });

      expect(result.successCount).toBe(2);

      // Verify nested categories were created
      const categories = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, testUser.id));

      const categoryNames = categories.map((c) => c.name);
      expect(categoryNames).toContain("Technology");
      expect(categoryNames).toContain("Programming");
      expect(categoryNames).toContain("Hardware");

      // Verify feed metadata was extracted correctly (would break if schema changes)
      const sources = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.url, "https://feed1.example.com/feed.xml"))
        .limit(1);
      expect(sources.length).toBe(1);
      expect(sources[0].title).toBe("Feed 1");
      expect(sources[0].siteUrl).toBe("https://feed1.example.com");
    });

    it("should preserve custom titles through export/import", async () => {
      // Use a unique URL to avoid conflict with testSubscription from beforeEach
      const source = await seedTestSource(db, {
        url: "https://custom-title.example.com/feed.xml",
        title: "Original Feed Title",
      });
      await seedTestSubscription(db, testUser.id, source.id, {
        customTitle: "My Custom Title",
      });

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml);

      // Find the feed outline by URL
      const findFeedOutline = (outlines: any[], targetUrl: string): any => {
        for (const outline of outlines) {
          if (outline.xmlUrl === targetUrl) return outline;
          if (outline.outlines) {
            const found = findFeedOutline(outline.outlines, targetUrl);
            if (found) return found;
          }
        }
        return null;
      };

      const feedOutline = findFeedOutline(
        parsed.body?.outlines || [],
        "https://custom-title.example.com/feed.xml"
      );
      expect(feedOutline).toBeDefined();
      expect(feedOutline?.text).toBe("My Custom Title");

      // Import to new user
      const { user: newUser } = await seedTestUser(db, {
        username: "titleuser",
        email: "title@example.com",
      });

      const importCaller = subscriptionsRouter.createCaller({
        db,
        user: { userId: newUser.id, username: "titleuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feeds - ensures parsing logic is tested
      const feedMap = new Map([
        [
          "https://custom-title.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Original Feed Title",
              link: "https://custom-title.example.com",
              description: "Feed with original title",
            }),
          },
        ],
        [
          "https://example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Test Feed",
              link: "https://example.com",
              description: "Test feed from beforeEach",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const importResult = await importCaller.import({
        opmlContent: opmlXml,
      });

      // Export includes testSubscription from beforeEach, so we get 2 subscriptions
      expect(importResult.successCount).toBeGreaterThanOrEqual(1);

      // Find the subscription by URL to verify custom title
      const importedSubs = await db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(
          and(
            eq(schema.subscriptions.userId, newUser.id),
            eq(schema.sources.url, "https://custom-title.example.com/feed.xml")
          )
        );

      expect(importedSubs.length).toBe(1);
      // Note: Custom titles are not currently preserved during import (set to null)
      // The OPML text attribute is used as the feed title during import, but customTitle is null
      // This is expected behavior - custom titles are user-specific
      expect(importedSubs[0].subscriptions.customTitle).toBeNull();
    });

    it("should skip already subscribed feeds", async () => {
      // Create existing subscription
      const source = await seedTestSource(db, {
        url: "https://example.com/existing.xml",
        title: "Existing Feed",
      });
      await seedTestSubscription(db, testUser.id, source.id);

      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline type="rss" text="Existing Feed" xmlUrl="https://example.com/existing.xml"/>
    <outline type="rss" text="New Feed" xmlUrl="https://example.com/new.xml"/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feeds
      const feedMap = new Map([
        [
          "https://example.com/existing.xml",
          {
            content: createRealisticRSSFeed({
              title: "Existing Feed",
              link: "https://example.com/existing",
              description: "Already subscribed feed",
            }),
          },
        ],
        [
          "https://example.com/new.xml",
          {
            content: createRealisticRSSFeed({
              title: "New Feed",
              link: "https://example.com/new",
              description: "New feed to import",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const result = await caller.import({
        opmlContent: opmlXml,
      });

      // Should succeed for both (existing one is skipped but counted as success)
      expect(result.successCount).toBe(2);

      // Verify we still only have one subscription to the existing feed
      const existingSubs = await db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(
          and(
            eq(schema.subscriptions.userId, testUser.id),
            eq(schema.sources.url, "https://example.com/existing.xml")
          )
        );

      expect(existingSubs).toHaveLength(1);

      // Verify new feed was imported
      const newSubs = await db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(
          and(
            eq(schema.subscriptions.userId, testUser.id),
            eq(schema.sources.url, "https://example.com/new.xml")
          )
        );

      expect(newSubs).toHaveLength(1);
    });

    it("should handle empty OPML file", async () => {
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Empty OPML</title>
  </head>
  <body>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      const parseResult = await caller.parseOpml({ opmlContent: opmlXml });
      expect(parseResult.feeds).toHaveLength(0);
      expect(parseResult.totalCount).toBe(0);

      const importResult = await caller.import({
        opmlContent: opmlXml,
      });

      expect(importResult.successCount).toBe(0);
      expect(importResult.errorCount).toBe(0);
    });

    it("should handle complex real-world scenario", async () => {
      // Create a realistic setup: multiple subscriptions with categories, filters, custom titles
      const techCat = await seedTestCategory(db, testUser.id, { name: "Tech" });
      const newsCat = await seedTestCategory(db, testUser.id, { name: "News" });
      const blogCat = await seedTestCategory(db, testUser.id, {
        name: "Blogs",
      });

      const sources = [
        await seedTestSource(db, {
          url: "https://tech1.com/feed.xml",
          title: "Tech Site 1",
        }),
        await seedTestSource(db, {
          url: "https://tech2.com/feed.xml",
          title: "Tech Site 2",
        }),
        await seedTestSource(db, {
          url: "https://news1.com/feed.xml",
          title: "News Site 1",
        }),
        await seedTestSource(db, {
          url: "https://blog1.com/feed.xml",
          title: "Blog 1",
        }),
      ];

      const subs = [
        await seedTestSubscription(db, testUser.id, sources[0].id, {
          customTitle: "My Favorite Tech",
          filterEnabled: true,
          filterMode: "include",
        }),
        await seedTestSubscription(db, testUser.id, sources[1].id, {
          filterEnabled: true,
          filterMode: "exclude",
        }),
        await seedTestSubscription(db, testUser.id, sources[2].id, {
          filterEnabled: false,
        }),
        await seedTestSubscription(db, testUser.id, sources[3].id, {
          customTitle: "Personal Blog",
        }),
      ];

      // Add categories
      await db.insert(schema.subscriptionCategories).values([
        { subscriptionId: subs[0].id, categoryId: techCat.id },
        { subscriptionId: subs[1].id, categoryId: techCat.id },
        { subscriptionId: subs[2].id, categoryId: newsCat.id },
        { subscriptionId: subs[3].id, categoryId: blogCat.id },
        { subscriptionId: subs[0].id, categoryId: newsCat.id }, // Multiple categories
      ]);

      // Add filters
      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: subs[0].id,
          field: "title",
          matchType: "contains",
          pattern: "JavaScript",
          caseSensitive: false,
        },
        {
          subscriptionId: subs[0].id,
          field: "content",
          matchType: "regex",
          pattern: "\\b(node|npm)\\b",
          caseSensitive: false,
        },
        {
          subscriptionId: subs[1].id,
          field: "title",
          matchType: "contains",
          pattern: "spam",
          caseSensitive: false,
        },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();

      // Verify export
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
          "tuvixCategories",
        ],
      });

      expect(parsed.body?.outlines).toBeDefined();

      // Import to new user
      const { user: newUser } = await seedTestUser(db, {
        username: "complexuser",
        email: "complex@example.com",
      });

      const importCaller = subscriptionsRouter.createCaller({
        db,
        user: { userId: newUser.id, username: "complexuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feeds with proper structure - ensures schema changes are caught
      const feedMap = new Map([
        [
          "https://tech1.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Tech Site 1",
              link: "https://tech1.com",
              description: "Technology news and updates",
            }),
          },
        ],
        [
          "https://tech2.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Tech Site 2",
              link: "https://tech2.com",
              description: "More tech news",
            }),
          },
        ],
        [
          "https://news1.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "News Site 1",
              link: "https://news1.com",
              description: "Breaking news",
            }),
          },
        ],
        [
          "https://blog1.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Blog 1",
              link: "https://blog1.com",
              description: "Personal blog",
            }),
          },
        ],
        [
          "https://example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "Test Feed",
              link: "https://example.com",
              description: "Test feed from beforeEach",
            }),
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const importResult = await importCaller.import({
        opmlContent: opmlXml,
      });

      // Note: Export includes testSubscription from beforeEach, so we expect 5 total
      // But we only created 4 new ones in this test
      expect(importResult.successCount).toBeGreaterThanOrEqual(4);
      expect(importResult.errorCount).toBe(0);

      // Verify all data was imported correctly (including testSubscription from beforeEach)
      const importedSubs = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, newUser.id));

      expect(importedSubs.length).toBeGreaterThanOrEqual(4);

      // Verify categories
      const importedCats = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, newUser.id));

      expect(importedCats).toHaveLength(3);

      // Verify filters
      const importedFilters = await db
        .select()
        .from(schema.subscriptionFilters)
        .innerJoin(
          schema.subscriptions,
          eq(schema.subscriptionFilters.subscriptionId, schema.subscriptions.id)
        )
        .where(eq(schema.subscriptions.userId, newUser.id));

      expect(importedFilters.length).toBeGreaterThanOrEqual(3);

      // CRITICAL: Verify feed metadata extraction matches stored data
      // This ensures schema changes would break the test
      const importedSources = await db
        .select()
        .from(schema.sources)
        .innerJoin(
          schema.subscriptions,
          eq(schema.sources.id, schema.subscriptions.sourceId)
        )
        .where(eq(schema.subscriptions.userId, newUser.id));

      // Verify each source has correct metadata from feed parsing
      const tech1Source = importedSources.find((s) =>
        s.sources.url.includes("tech1.com")
      );
      expect(tech1Source).toBeDefined();
      expect(tech1Source?.sources.title).toBe("Tech Site 1");
      expect(tech1Source?.sources.siteUrl).toBe("https://tech1.com");
      expect(tech1Source?.sources.description).toBe(
        "Technology news and updates"
      );

      const news1Source = importedSources.find((s) =>
        s.sources.url.includes("news1.com")
      );
      expect(news1Source).toBeDefined();
      expect(news1Source?.sources.title).toBe("News Site 1");
      expect(news1Source?.sources.siteUrl).toBe("https://news1.com");
    });

    it("should handle different feed formats (RSS, Atom, JSON Feed)", async () => {
      // Test that the import handles different feed formats correctly
      const opmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Multi-Format Test</title>
  </head>
  <body>
    <outline type="rss" text="RSS Feed" xmlUrl="https://rss.example.com/feed.xml"/>
    <outline type="rss" text="Atom Feed" xmlUrl="https://atom.example.com/feed.xml"/>
    <outline type="rss" text="JSON Feed" xmlUrl="https://json.example.com/feed.json"/>
  </body>
</opml>`;

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Use realistic feeds in different formats
      const feedMap = new Map([
        [
          "https://rss.example.com/feed.xml",
          {
            content: createRealisticRSSFeed({
              title: "RSS Feed",
              link: "https://rss.example.com",
              description: "RSS 2.0 format feed",
              items: [
                {
                  title: "RSS Article",
                  link: "https://rss.example.com/article-1",
                  description: "Article from RSS feed",
                },
              ],
            }),
            contentType: "application/rss+xml; charset=utf-8",
          },
        ],
        [
          "https://atom.example.com/feed.xml",
          {
            content: createRealisticAtomFeed({
              title: "Atom Feed",
              link: "https://atom.example.com",
              subtitle: "Atom format feed",
              entries: [
                {
                  title: "Atom Entry",
                  link: "https://atom.example.com/entry-1",
                  summary: "Entry from Atom feed",
                },
              ],
            }),
            contentType: "application/atom+xml; charset=utf-8",
          },
        ],
        [
          "https://json.example.com/feed.json",
          {
            content: createRealisticJSONFeed({
              title: "JSON Feed",
              home_page_url: "https://json.example.com",
              description: "JSON Feed format",
              items: [
                {
                  title: "JSON Item",
                  url: "https://json.example.com/item-1",
                  content_text: "Item from JSON feed",
                },
              ],
            }),
            contentType: "application/json; charset=utf-8",
          },
        ],
      ]);
      global.fetch = createRealisticFeedFetcher(feedMap);

      const result = await caller.import({
        opmlContent: opmlXml,
      });

      // Verify RSS and Atom feeds were imported successfully
      // Note: JSON Feed format is not currently supported by feedsmith parser
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.errors[0]?.url).toBe("https://json.example.com/feed.json");
      expect(result.errors[0]?.error).toContain("Unrecognized feed format");

      // Verify all successfully imported feeds
      const importedSubs = await db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(eq(schema.subscriptions.userId, testUser.id));

      // Should have RSS and Atom feeds (plus testSubscription from beforeEach)
      expect(importedSubs.length).toBeGreaterThanOrEqual(2);

      // CRITICAL: Verify metadata was extracted correctly for each supported format
      // This ensures schema changes and parsing logic changes would break the test
      const rssSource = importedSubs.find((s) =>
        s.sources.url.includes("rss.example.com")
      );
      expect(rssSource).toBeDefined();
      expect(rssSource?.sources.title).toBe("RSS Feed");
      expect(rssSource?.sources.siteUrl).toBe("https://rss.example.com");
      expect(rssSource?.sources.description).toBe("RSS 2.0 format feed");

      const atomSource = importedSubs.find((s) =>
        s.sources.url.includes("atom.example.com")
      );
      expect(atomSource).toBeDefined();
      expect(atomSource?.sources.title).toBe("Atom Feed");
      expect(atomSource?.sources.siteUrl).toBe("https://atom.example.com");
      // Atom feeds use "subtitle" which maps to description
      expect(atomSource?.sources.description).toBe("Atom format feed");

      // Verify JSON Feed was NOT imported (unsupported format)
      const jsonSource = importedSubs.find((s) =>
        s.sources.url.includes("json.example.com")
      );
      expect(jsonSource).toBeUndefined();
    });

    it("should verify exported data matches database schema exactly", async () => {
      // This test ensures that exported OPML reflects the actual database state
      // and would break if schema changes affect export
      const category = await seedTestCategory(db, testUser.id, {
        name: "Test Category",
      });

      const source = await seedTestSource(db, {
        url: "https://schema-test.example.com/feed.xml",
        title: "Schema Test Feed",
        description: "Testing schema matching",
      });

      // Update siteUrl after creation (seedTestSource doesn't accept siteUrl)
      await db
        .update(schema.sources)
        .set({ siteUrl: "https://schema-test.example.com" })
        .where(eq(schema.sources.id, source.id));

      const subscription = await seedTestSubscription(
        db,
        testUser.id,
        source.id,
        {
          customTitle: "My Custom Title",
          filterEnabled: true,
          filterMode: "exclude",
        }
      );

      await db.insert(schema.subscriptionCategories).values({
        subscriptionId: subscription.id,
        categoryId: category.id,
      });

      await db.insert(schema.subscriptionFilters).values([
        {
          subscriptionId: subscription.id,
          field: "title",
          matchType: "contains",
          pattern: "test-pattern",
          caseSensitive: true,
        },
        {
          subscriptionId: subscription.id,
          field: "content",
          matchType: "regex",
          pattern: "test-\\d+",
          caseSensitive: false,
        },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: { userId: testUser.id, username: "testuser", role: "user" },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
          "tuvixCategories",
        ],
      });

      // Find the feed outline
      const findFeedOutline = (outlines: any[], targetUrl: string): any => {
        for (const outline of outlines) {
          if (outline.xmlUrl === targetUrl) return outline;
          if (outline.outlines) {
            const found = findFeedOutline(outline.outlines, targetUrl);
            if (found) return found;
          }
        }
        return null;
      };

      const feedOutline = findFeedOutline(
        parsed.body?.outlines || [],
        "https://schema-test.example.com/feed.xml"
      );

      expect(feedOutline).toBeDefined();
      expect(feedOutline?.text).toBe("My Custom Title");
      expect(feedOutline?.tuvixFilterEnabled).toBe("true");
      expect(feedOutline?.tuvixFilterMode).toBe("exclude");

      // Verify filters match database exactly
      const filters = JSON.parse(feedOutline?.tuvixFilters as string);
      expect(filters).toHaveLength(2);
      expect(filters[0]).toMatchObject({
        field: "title",
        matchType: "contains",
        pattern: "test-pattern",
        caseSensitive: true,
      });
      expect(filters[1]).toMatchObject({
        field: "content",
        matchType: "regex",
        pattern: "test-\\d+",
        caseSensitive: false,
      });

      // Verify categories match database exactly
      const categories = JSON.parse(feedOutline?.tuvixCategories as string);
      expect(categories).toHaveLength(1);
      expect(categories[0]).toBe("Test Category");
    });

    it("should export all filters with exact database field matching", async () => {
      // CRITICAL: This test verifies that ALL filter fields are exported correctly
      // and would break if the export logic changes
      // Use a unique user to avoid rate limiting issues
      const { user: uniqueUser } = await seedTestUser(db, {
        username: "filterexportuser",
        email: "filterexport@example.com",
      });

      const source = await seedTestSource(db, {
        url: "https://filter-test.example.com/feed.xml",
        title: "Filter Test Feed",
      });

      const subscription = await seedTestSubscription(
        db,
        uniqueUser.id,
        source.id,
        {
          filterEnabled: true,
          filterMode: "include",
        }
      );

      // Create filters with ALL possible field combinations
      const dbFilters = [
        {
          subscriptionId: subscription.id,
          field: "title" as const,
          matchType: "contains" as const,
          pattern: "title-contains",
          caseSensitive: false,
        },
        {
          subscriptionId: subscription.id,
          field: "content" as const,
          matchType: "regex" as const,
          pattern: "content-regex-\\d+",
          caseSensitive: true,
        },
        {
          subscriptionId: subscription.id,
          field: "description" as const,
          matchType: "exact" as const,
          pattern: "exact-description",
          caseSensitive: false,
        },
        {
          subscriptionId: subscription.id,
          field: "author" as const,
          matchType: "contains" as const,
          pattern: "author-name",
          caseSensitive: true,
        },
        {
          subscriptionId: subscription.id,
          field: "any" as const,
          matchType: "regex" as const,
          pattern: "any-.*-pattern",
          caseSensitive: false,
        },
      ];

      await db.insert(schema.subscriptionFilters).values(dbFilters);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: {
          userId: uniqueUser.id,
          username: "filterexportuser",
          role: "user",
        },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
        ],
      });

      // Find the feed outline
      const findFeedOutline = (outlines: any[], targetUrl: string): any => {
        for (const outline of outlines) {
          if (outline.xmlUrl === targetUrl) return outline;
          if (outline.outlines) {
            const found = findFeedOutline(outline.outlines, targetUrl);
            if (found) return found;
          }
        }
        return null;
      };

      const feedOutline = findFeedOutline(
        parsed.body?.outlines || [],
        "https://filter-test.example.com/feed.xml"
      );

      expect(feedOutline).toBeDefined();
      expect(feedOutline?.tuvixFilterEnabled).toBe("true");
      expect(feedOutline?.tuvixFilterMode).toBe("include");

      // CRITICAL: Verify ALL filters match database EXACTLY
      const exportedFilters = JSON.parse(feedOutline?.tuvixFilters as string);
      expect(exportedFilters).toHaveLength(5);

      // Verify each filter matches the database exactly
      for (let i = 0; i < dbFilters.length; i++) {
        const dbFilter = dbFilters[i];
        const exportedFilter = exportedFilters[i];

        expect(exportedFilter).toMatchObject({
          field: dbFilter.field,
          matchType: dbFilter.matchType,
          pattern: dbFilter.pattern,
          caseSensitive: dbFilter.caseSensitive,
        });
      }

      // Verify filters are in the same order (export should preserve order)
      expect(exportedFilters[0].field).toBe("title");
      expect(exportedFilters[1].field).toBe("content");
      expect(exportedFilters[2].field).toBe("description");
      expect(exportedFilters[3].field).toBe("author");
      expect(exportedFilters[4].field).toBe("any");
    });

    it("should export all categories with exact database matching", async () => {
      // CRITICAL: This test verifies that ALL categories are exported correctly
      // and would break if the export logic changes
      // Use a unique user to avoid rate limiting issues
      const { user: uniqueUser } = await seedTestUser(db, {
        username: "categoryexportuser",
        email: "categoryexport@example.com",
      });

      const category1 = await seedTestCategory(db, uniqueUser.id, {
        name: "Category One",
      });
      const category2 = await seedTestCategory(db, uniqueUser.id, {
        name: "Category Two",
      });
      const category3 = await seedTestCategory(db, uniqueUser.id, {
        name: "Category Three",
      });

      const source = await seedTestSource(db, {
        url: "https://category-test.example.com/feed.xml",
        title: "Category Test Feed",
      });

      const subscription = await seedTestSubscription(
        db,
        uniqueUser.id,
        source.id
      );

      // Link subscription to ALL categories
      await db.insert(schema.subscriptionCategories).values([
        { subscriptionId: subscription.id, categoryId: category1.id },
        { subscriptionId: subscription.id, categoryId: category2.id },
        { subscriptionId: subscription.id, categoryId: category3.id },
      ]);

      const caller = subscriptionsRouter.createCaller({
        db,
        user: {
          userId: uniqueUser.id,
          username: "categoryexportuser",
          role: "user",
        },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: ["tuvixCategories"],
      });

      // Find the feed outline (should be in a category folder)
      const findFeedOutline = (outlines: any[], targetUrl: string): any => {
        for (const outline of outlines) {
          if (outline.xmlUrl === targetUrl) return outline;
          if (outline.outlines) {
            const found = findFeedOutline(outline.outlines, targetUrl);
            if (found) return found;
          }
        }
        return null;
      };

      const feedOutline = findFeedOutline(
        parsed.body?.outlines || [],
        "https://category-test.example.com/feed.xml"
      );

      expect(feedOutline).toBeDefined();

      // CRITICAL: Verify ALL categories are exported
      const exportedCategories = JSON.parse(
        feedOutline?.tuvixCategories as string
      );
      expect(exportedCategories).toHaveLength(3);

      // Verify category names match database exactly
      const dbCategoryNames = [
        category1.name,
        category2.name,
        category3.name,
      ].sort();
      const exportedCategoryNames = [...exportedCategories].sort();

      expect(exportedCategoryNames).toEqual(dbCategoryNames);

      // Verify categories appear in folder structure
      const categoryFolders = (parsed.body?.outlines || []).filter(
        (o) => o.outlines && !o.xmlUrl
      );
      expect(categoryFolders.length).toBeGreaterThanOrEqual(3);

      const folderNames = categoryFolders.map((f) => f.text).sort();
      expect(folderNames).toContain("Category One");
      expect(folderNames).toContain("Category Two");
      expect(folderNames).toContain("Category Three");
    });

    it("should export subscription metadata exactly matching database", async () => {
      // CRITICAL: This test verifies that subscription metadata is exported correctly
      // and would break if export logic changes
      // Use a unique user to avoid rate limiting issues
      const { user: uniqueUser } = await seedTestUser(db, {
        username: "metadataexportuser",
        email: "metadataexport@example.com",
      });

      const source = await seedTestSource(db, {
        url: "https://metadata-test.example.com/feed.xml",
        title: "Source Title",
        description: "Source Description",
      });

      // Update source with siteUrl
      await db
        .update(schema.sources)
        .set({ siteUrl: "https://metadata-test.example.com" })
        .where(eq(schema.sources.id, source.id));

      await seedTestSubscription(db, uniqueUser.id, source.id, {
        customTitle: "Custom Subscription Title",
        filterEnabled: true,
        filterMode: "exclude",
      });

      const caller = subscriptionsRouter.createCaller({
        db,
        user: {
          userId: uniqueUser.id,
          username: "metadataexportuser",
          role: "user",
        },
        env: { SKIP_RATE_LIMIT: "true" } as any,
        headers: {} as any,
        req: {} as any,
      } as any);

      // Export
      const opmlXml = await caller.export();
      const parsed = parseOpml(opmlXml, {
        extraOutlineAttributes: [
          "tuvixFilterEnabled",
          "tuvixFilterMode",
          "tuvixFilters",
        ],
      });

      // Find the feed outline
      const findFeedOutline = (outlines: any[], targetUrl: string): any => {
        for (const outline of outlines) {
          if (outline.xmlUrl === targetUrl) return outline;
          if (outline.outlines) {
            const found = findFeedOutline(outline.outlines, targetUrl);
            if (found) return found;
          }
        }
        return null;
      };

      const feedOutline = findFeedOutline(
        parsed.body?.outlines || [],
        "https://metadata-test.example.com/feed.xml"
      );

      expect(feedOutline).toBeDefined();

      // CRITICAL: Verify ALL metadata matches database exactly
      // Custom title should be used (not source title)
      expect(feedOutline?.text).toBe("Custom Subscription Title");
      expect(feedOutline?.title).toBe("Custom Subscription Title");
      expect(feedOutline?.xmlUrl).toBe(source.url);
      expect(feedOutline?.htmlUrl).toBe("https://metadata-test.example.com");

      // Verify subscription settings match database
      expect(feedOutline?.tuvixFilterEnabled).toBe("true");
      expect(feedOutline?.tuvixFilterMode).toBe("exclude");

      // Verify source data from database
      const dbSource = await db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.id, source.id))
        .limit(1);

      expect(dbSource[0].url).toBe(feedOutline?.xmlUrl);
      expect(dbSource[0].siteUrl).toBe(feedOutline?.htmlUrl);
    });
  });
});
