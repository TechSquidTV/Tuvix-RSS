import type * as schema from "@api/db/schema";

type FilterableArticle = Pick<
  typeof schema.articles.$inferSelect,
  "title" | "description" | "content" | "author"
>;

/**
 * Check if an article matches a single filter
 */
function matchesFilter(
  article: FilterableArticle,
  filter: typeof schema.subscriptionFilters.$inferSelect
): boolean {
  const fieldValue = (() => {
    switch (filter.field) {
      case "title":
        return article.title ?? "";
      case "description":
        return article.description ?? "";
      case "content":
        return article.content ?? "";
      case "author":
        return article.author ?? "";
      case "any":
        return [
          article.title ?? "",
          article.description ?? "",
          article.content ?? "",
          article.author ?? "",
        ].join(" ");
      default:
        return "";
    }
  })();

  // If field value is empty/null and pattern is not empty, no match
  if (!fieldValue && filter.pattern) {
    return false;
  }

  const searchText = filter.caseSensitive
    ? fieldValue
    : fieldValue.toLowerCase();
  const pattern = filter.caseSensitive
    ? filter.pattern
    : filter.pattern.toLowerCase();

  switch (filter.matchType) {
    case "contains":
      return searchText.includes(pattern);
    case "exact":
      return searchText === pattern;
    case "regex": {
      try {
        const regex = new RegExp(
          filter.pattern,
          filter.caseSensitive ? "" : "i"
        );
        return regex.test(fieldValue);
      } catch {
        // Invalid regex - skip this filter
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Check if an article matches subscription filters
 */
export function matchesSubscriptionFilters(
  article: FilterableArticle,
  filters: (typeof schema.subscriptionFilters.$inferSelect)[],
  filterMode: "include" | "exclude"
): boolean {
  // If no filters exist but filtering is enabled, exclude the article
  // (This matches the Go implementation behavior)
  if (filters.length === 0) {
    return false;
  }

  const hasMatch = filters.some((filter) => matchesFilter(article, filter));

  if (filterMode === "include") {
    // Include mode: article must match at least one filter
    return hasMatch;
  } else {
    // Exclude mode: article must not match any filter
    return !hasMatch;
  }
}
