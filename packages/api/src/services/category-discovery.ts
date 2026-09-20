import { countFeedCategories } from "@api/utils/feed-utils";
/**
 * Category Discovery Service
 *
 * Discover and suggest categories from RSS/Atom feeds.
 * Analyzes feed metadata and entry tags to suggest relevant categories.
 */

import { fetchAndParseFeed } from "@api/services/rss-fetcher";
import type { ParsedFeed } from "@api/types/feed";

export interface CategorySuggestion {
  name: string;
  confidence: number;
}

/**
 * Discover categories from parsed feed data
 *
 * Analyzes feed-level and entry-level categories to suggest
 * relevant categories with confidence scores.
 *
 * @param feedData Parsed feed data (from rss-parser or gofeed)
 * @param maxEntries Maximum number of entries to analyze (default: 10)
 * @returns Array of category suggestions sorted by confidence
 */
export function discoverCategoriesFromFeed(
  feedData: ParsedFeed,
  maxEntries: number = 10
): CategorySuggestion[] {
  const categoryMap = countFeedCategories(feedData, maxEntries);

  // Convert to suggestions with confidence scores
  const totalMentions = Array.from(categoryMap.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  const suggestions: CategorySuggestion[] = Array.from(categoryMap.entries())
    .map(([name, count]) => ({
      name,
      confidence: totalMentions > 0 ? count / totalMentions : 0,
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * Fetch feed and discover categories
 *
 * Convenience function that fetches a feed URL and discovers categories.
 *
 * @param feedUrl URL of the RSS/Atom feed
 * @param maxEntries Maximum number of entries to analyze
 * @returns Array of category suggestions
 * @throws Error if feed cannot be fetched or parsed
 */
export async function fetchAndDiscoverCategories(
  feedUrl: string,
  maxEntries: number = 10
): Promise<CategorySuggestion[]> {
  const feedData = await fetchAndParseFeed(feedUrl);
  return discoverCategoriesFromFeed(feedData, maxEntries);
}
