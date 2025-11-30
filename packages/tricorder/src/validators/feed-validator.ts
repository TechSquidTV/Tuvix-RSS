/**
 * Feed Validator Utility
 *
 * Shared feed validation logic for discovery services.
 * Handles fetching, parsing, deduplication, and metadata extraction.
 */

import { parseFeed } from "feedsmith";
import { normalizeFeedUrl } from "../utils/url-normalize";
import { stripHtml } from "../utils/text-sanitizer";
import type { DiscoveredFeed } from "../core/types";

/**
 * Create a feed validator function bound to deduplication sets.
 *
 * @param seenUrls - Set of normalized URLs already discovered
 * @param seenFeedIds - Set of Atom feed IDs already discovered
 * @returns Feed validation function
 */
export function createFeedValidator(
  seenUrls: Set<string>,
  seenFeedIds: Set<string>
): (feedUrl: string) => Promise<DiscoveredFeed | null> {
  return async (feedUrl: string): Promise<DiscoveredFeed | null> => {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          "User-Agent": "TuvixRSS/1.0",
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      // Get final URL after redirects and normalize it for deduplication
      const finalUrl = response.url;
      const normalizedUrl = normalizeFeedUrl(finalUrl);

      // Check if we've already seen this normalized final URL
      if (seenUrls.has(normalizedUrl)) return null;

      // Mark URL as seen immediately to prevent race conditions with parallel checks
      seenUrls.add(normalizedUrl);

      const feedContent = await response.text();
      const result = parseFeed(feedContent);
      const feed = result.feed;

      // Extract feed identifier for content-based deduplication
      // Only Atom feeds have a reliable unique 'id' field
      // RSS feeds don't have a unique identifier, so we only deduplicate by URL
      let feedId: string | null = null;
      if (result.format === "atom" && "id" in feed && feed.id) {
        feedId = String(feed.id);
      }

      // Check if we've already seen a feed with the same content identifier
      // (Only applies to Atom feeds with id field)
      if (feedId && seenFeedIds.has(feedId)) {
        return null;
      }

      // Mark feed ID as seen
      if (feedId) {
        seenFeedIds.add(feedId);
      }

      // Determine feed type
      const type: DiscoveredFeed["type"] =
        result.format === "atom"
          ? "atom"
          : result.format === "rdf"
            ? "rdf"
            : result.format === "json"
              ? "json"
              : "rss";

      const title =
        "title" in feed && feed.title ? String(feed.title) : "Untitled Feed";
      const description =
        "description" in feed && feed.description
          ? stripHtml(String(feed.description))
          : "subtitle" in feed && feed.subtitle
            ? stripHtml(String(feed.subtitle))
            : undefined;

      // Return discovered feed (use original feedUrl, not final redirected URL)
      return {
        url: feedUrl,
        title,
        type,
        description,
      };
    } catch {
      return null;
    }
  };
}
