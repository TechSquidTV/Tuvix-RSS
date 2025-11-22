/**
 * Category Discovery Service
 *
 * Discover and suggest categories from RSS/Atom feeds.
 * Analyzes feed metadata and entry tags to suggest relevant categories.
 */

import { fetchAndParseFeed } from "@/services/rss-fetcher";
import type { Rss, Atom, Rdf, Json } from "@/types/feed";

// Union type for feeds (feedsmith returns dates as strings)
type AnyFeed =
  | Rss.Feed<string>
  | Atom.Feed<string>
  | Rdf.Feed<string>
  | Json.Feed<string>;

export interface CategorySuggestion {
  name: string;
  confidence: number;
}

/**
 * Extract category name from various feed category formats
 *
 * Handles different feed formats:
 * - String: "Technology"
 * - Object with term: { term: "Technology" }
 * - Object with label: { label: "Technology" }
 * - Object with name: { name: "Technology" }
 *
 * @param cat Category in unknown format
 * @returns Category name string or null if unable to extract
 */
function extractCategoryName(cat: unknown): string | null {
  if (typeof cat === "string") {
    return cat;
  }

  if (typeof cat === "object" && cat !== null) {
    const obj = cat as Record<string, unknown>;
    return (
      (obj.term as string) ||
      (obj.label as string) ||
      (obj.name as string) ||
      null
    );
  }

  return null;
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
  feedData: AnyFeed,
  maxEntries: number = 10
): CategorySuggestion[] {
  const categoryMap = new Map<string, number>();

  // Extract feed-level categories
  if ("categories" in feedData && Array.isArray(feedData.categories)) {
    for (const cat of feedData.categories) {
      const catName = extractCategoryName(cat);
      if (catName) {
        categoryMap.set(catName, (categoryMap.get(catName) || 0) + 1);
      }
    }
  }

  // Extract entry-level categories
  if ("items" in feedData && Array.isArray(feedData.items)) {
    const entries = feedData.items.slice(0, maxEntries);
    for (const entry of entries) {
      if (
        "categories" in entry &&
        entry.categories &&
        Array.isArray(entry.categories)
      ) {
        for (const cat of entry.categories) {
          const catName = extractCategoryName(cat);
          if (catName) {
            categoryMap.set(catName, (categoryMap.get(catName) || 0) + 1);
          }
        }
      }
    }
  }

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
