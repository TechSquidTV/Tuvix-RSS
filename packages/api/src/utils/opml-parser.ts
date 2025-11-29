/**
 * OPML Parsing Utilities
 *
 * Shared functions for parsing OPML custom attributes like filters and categories.
 */

/**
 * Type for subscription filter data
 */
export interface FilterData {
  field: "title" | "content" | "description" | "author" | "any";
  matchType: "contains" | "regex" | "exact";
  pattern: string;
  caseSensitive: boolean;
}

/**
 * Parse filters JSON from OPML attribute
 *
 * @param jsonString - JSON string of filters array
 * @returns Parsed and validated filters array, or null if invalid
 */
export function parseFiltersJson(
  jsonString: string | undefined
): FilterData[] | null {
  if (!jsonString) return null;
  try {
    const parsed = JSON.parse(jsonString) as unknown;
    if (!Array.isArray(parsed)) return null;
    // Validate structure and normalize filters (caseSensitive defaults to false)
    return parsed
      .filter(
        (
          f
        ): f is {
          field: "title" | "content" | "description" | "author" | "any";
          matchType: "contains" | "regex" | "exact";
          pattern: string;
          caseSensitive?: boolean;
        } => {
          if (typeof f !== "object" || f === null) return false;
          if (!("field" in f) || !("matchType" in f) || !("pattern" in f))
            return false;
          const field = (f as { field: unknown }).field;
          const matchType = (f as { matchType: unknown }).matchType;
          const pattern = (f as { pattern: unknown }).pattern;
          return (
            typeof field === "string" &&
            typeof matchType === "string" &&
            typeof pattern === "string" &&
            ["title", "content", "description", "author", "any"].includes(
              field
            ) &&
            ["contains", "regex", "exact"].includes(matchType)
          );
        }
      )
      .map((f) => ({
        field: f.field,
        matchType: f.matchType,
        pattern: f.pattern,
        caseSensitive:
          typeof f.caseSensitive === "boolean" ? f.caseSensitive : false,
      }));
  } catch {
    return null;
  }
}

/**
 * Parse categories JSON from OPML attribute
 *
 * @param jsonString - JSON string of categories array
 * @returns Parsed and validated categories array, or null if invalid
 */
export function parseCategoriesJson(
  jsonString: string | undefined
): string[] | null {
  if (!jsonString) return null;
  try {
    const parsed = JSON.parse(jsonString) as unknown;
    if (!Array.isArray(parsed)) return null;
    // Validate that all items are strings
    return parsed.filter(
      (cat): cat is string => typeof cat === "string" && cat.trim().length > 0
    );
  } catch {
    return null;
  }
}

/**
 * Parse boolean value from OPML attribute
 *
 * @param value - String or boolean value
 * @returns Boolean value
 */
export function parseBoolean(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}
