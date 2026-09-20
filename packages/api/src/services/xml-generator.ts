/**
 * RSS 2.0 XML Generator
 *
 * Uses feedsmith's native RSS generation.
 * For full type safety, import Rss types from "@api/types/feed" and use generateRssFeed directly.
 * https://feedsmith.dev/generating/
 */

import { generateRssFeed } from "feedsmith";

// Re-export feedsmith's generateRssFeed for direct use with full type support
export { generateRssFeed };

/**
 * Simplified input for RSS generation with string GUID
 * This is a convenience wrapper - for more control, use feedsmith's Rss.Feed type directly
 */
export interface RSSGeneratorInput {
  title: string;
  link: string;
  description: string | null;
  items: Array<{
    title: string;
    link: string | null;
    description: string | null;
    pubDate: Date | null;
    guid: string; // Simplified - will be converted to Rss.Guid
    author: string | null;
  }>;
  language?: string;
  generator?: string;
}

/**
 * Generate RSS 2.0 XML from simplified input
 *
 * @param input - Simplified RSS channel and items
 * @returns RSS 2.0 XML string
 *
 * @example
 * ```ts
 * const xml = generateRSS({
 *   title: "My Blog",
 *   link: "https://example.com",
 *   description: "Blog posts",
 *   items: [
 *     {
 *       title: "Post 1",
 *       link: "https://example.com/post-1",
 *       description: "First post",
 *       pubDate: new Date(),
 *       guid: "post-1",
 *       author: "[email protected]"
 *     }
 *   ]
 * });
 * ```
 */
export function generateRSS(input: RSSGeneratorInput): string {
  // Get most recent article date for channel pubDate
  const channelPubDate =
    input.items.length > 0 && input.items[0]?.pubDate
      ? input.items[0].pubDate
      : new Date();

  // Build feedsmith Rss.Feed structure
  // Note: generateRssFeed accepts DeepPartial<Rss.Feed>, so we don't need all required fields
  const feed = {
    title: input.title,
    link: input.link,
    description: input.description || input.title,
    language: input.language || "en-us",
    generator: input.generator || "TuvixRSS",
    pubDate: channelPubDate,
    items: input.items.map((item) => ({
      title: item.title,
      link: item.link || undefined,
      description: item.description || undefined,
      pubDate: item.pubDate || undefined,
      // Convert string GUID to feedsmith's Guid type
      guid: {
        value: item.guid,
        isPermaLink: false,
      },
      authors: item.author ? [{ name: item.author }] : undefined,
    })),
  };

  return generateRssFeed(feed);
}
