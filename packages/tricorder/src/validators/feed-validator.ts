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
  // Track in-flight requests to prevent concurrent validation of the same URL
  const inFlightRequests = new Map<string, Promise<DiscoveredFeed | null>>();

  return async (feedUrl: string): Promise<DiscoveredFeed | null> => {
    try {
      // Normalize input URL for deduplication check
      const normalizedInputUrl = normalizeFeedUrl(feedUrl);

      // Check if we've already seen this URL
      if (seenUrls.has(normalizedInputUrl)) return null;

      // Check if this URL is currently being validated
      const inFlightRequest = inFlightRequests.get(normalizedInputUrl);
      if (inFlightRequest) {
        // Another request is already validating this normalized URL
        // Return null to deduplicate (the first request will handle it)
        return null;
      }

      // Note: We don't add normalizedInputUrl to seenUrls yet because we need to
      // determine the final URL first (after redirects). If we added it now,
      // and another concurrent request tries the redirect target directly,
      // it might complete first and cause this request to be deduplicated incorrectly.

      // Create validation promise
      const validationPromise = (async () => {
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
          const normalizedFinalUrl = normalizeFeedUrl(finalUrl);

          // Check if the final URL (after following any redirects) has already been seen
          if (seenUrls.has(normalizedFinalUrl)) {
            return null; // This feed was already discovered via another path
          }

          // Mark both the input URL and final URL as seen
          // This prevents future requests to either URL from fetching again
          seenUrls.add(normalizedInputUrl);
          if (normalizedFinalUrl !== normalizedInputUrl) {
            seenUrls.add(normalizedFinalUrl);
          }

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
            "title" in feed && feed.title
              ? String(feed.title)
              : "Untitled Feed";
          const description =
            "description" in feed && feed.description
              ? stripHtml(String(feed.description))
              : "subtitle" in feed && feed.subtitle
                ? stripHtml(String(feed.subtitle))
                : undefined;

          // Return discovered feed (preserve original URL for better UX)
          // We use the original feedUrl instead of finalUrl so users see clean URLs
          // The deduplication still works via normalizedFinalUrl tracking above
          return {
            url: feedUrl,
            title,
            type,
            description,
          };
        } catch {
          return null;
        }
      })();

      // Store the in-flight request
      inFlightRequests.set(normalizedInputUrl, validationPromise);

      try {
        // Wait for validation to complete
        return await validationPromise;
      } finally {
        // Clean up the in-flight request
        inFlightRequests.delete(normalizedInputUrl);
      }
    } catch {
      return null;
    }
  };
}
