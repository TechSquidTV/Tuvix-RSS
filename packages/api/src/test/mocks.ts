/**
 * Test Mocks
 *
 * Mock implementations for external services and APIs
 */

import { vi } from "vitest";

/**
 * Mock RSS feed XML
 */
export const MOCK_RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test RSS Feed</title>
    <link>https://example.com</link>
    <description>A test RSS feed</description>
    <lastBuildDate>Mon, 01 Jan 2024 00:00:00 GMT</lastBuildDate>
    <item>
      <title>Test Article 1</title>
      <link>https://example.com/article1</link>
      <description>This is a test article</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/article1</guid>
    </item>
    <item>
      <title>Test Article 2</title>
      <link>https://example.com/article2</link>
      <description>Another test article</description>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <guid>https://example.com/article2</guid>
    </item>
  </channel>
</rss>`;

/**
 * Mock Atom feed XML
 */
export const MOCK_ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <link href="https://example.com"/>
  <updated>2024-01-01T00:00:00Z</updated>
  <id>https://example.com</id>
  <entry>
    <title>Test Entry 1</title>
    <link href="https://example.com/entry1"/>
    <id>https://example.com/entry1</id>
    <updated>2024-01-01T00:00:00Z</updated>
    <summary>This is a test entry</summary>
  </entry>
</feed>`;

/**
 * Mock JSON feed
 */
export const MOCK_JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Test JSON Feed",
  home_page_url: "https://example.com",
  feed_url: "https://example.com/feed.json",
  items: [
    {
      id: "1",
      url: "https://example.com/item1",
      title: "Test Item 1",
      content_html: "<p>This is a test item</p>",
      date_published: "2024-01-01T00:00:00Z",
    },
  ],
});

/**
 * Mock fetch function for RSS feeds
 */
export function mockFetchRssFeed(feedXml: string = MOCK_RSS_FEED) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(feedXml, {
        status: 200,
        headers: {
          "Content-Type": "application/rss+xml",
        },
      })
    )
  );
}

/**
 * Mock fetch function for Atom feeds
 */
export function mockFetchAtomFeed(feedXml: string = MOCK_ATOM_FEED) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(feedXml, {
        status: 200,
        headers: {
          "Content-Type": "application/atom+xml",
        },
      })
    )
  );
}

/**
 * Mock fetch function for JSON feeds
 */
export function mockFetchJsonFeed(feedJson: string = MOCK_JSON_FEED) {
  return vi.fn().mockResolvedValue(
    new Response(feedJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  );
}

/**
 * Mock fetch function that throws an error
 */
export function mockFetchError(error: Error = new Error("Network error")) {
  return vi.fn().mockRejectedValue(error);
}

/**
 * Mock fetch function that returns 404
 */
export function mockFetch404() {
  return vi.fn().mockResolvedValue(
    new Response("Not Found", {
      status: 404,
      statusText: "Not Found",
    })
  );
}

/**
 * Mock fetch function that times out
 */
export function mockFetchTimeout() {
  return vi.fn().mockImplementation(
    () =>
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), 100);
      })
  );
}

/**
 * Create a mock HTML page with Open Graph tags
 */
export function createMockHtmlWithOgImage(imageUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:title" content="Test Page" />
</head>
<body>
  <h1>Test Page</h1>
</body>
</html>`;
}

/**
 * Mock cron job for testing
 */
export function mockCronJob() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    schedule: vi.fn(),
  };
}

/**
 * Mock Better Auth secret for testing
 */
export const MOCK_BETTER_AUTH_SECRET =
  "test-better-auth-secret-key-for-testing-only-do-not-use-in-production";

/**
 * Mock user data
 */
export const MOCK_USER = {
  userId: 1,
  username: "testuser",
  email: "test@example.com",
  role: "user" as const,
  plan: "free",
};

/**
 * Mock admin user data
 */
export const MOCK_ADMIN = {
  userId: 2,
  username: "admin",
  email: "admin@example.com",
  role: "admin" as const,
  plan: "free",
};
