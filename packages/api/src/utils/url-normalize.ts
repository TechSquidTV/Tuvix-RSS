/**
 * URL Normalization Utility
 *
 * Normalizes URLs for feed deduplication by:
 * - Converting hostname to lowercase
 * - Removing trailing slashes (except root path)
 * - Removing tracking query parameters
 * - Sorting remaining query parameters
 */

/**
 * Tracking query parameters that should be removed for deduplication
 */
const TRACKING_PARAMS = new Set([
  // UTM parameters
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  // Social media tracking
  "ref",
  "source",
  "fbclid",
  "gclid",
  "gclsrc",
  // Google Analytics
  "_ga",
  "_gid",
]);

/**
 * Normalizes a feed URL for deduplication purposes.
 *
 * Normalization steps:
 * 1. Parse URL using URL constructor
 * 2. Convert hostname to lowercase
 * 3. Remove trailing slash from pathname (unless pathname is just "/")
 * 4. Remove tracking query parameters
 * 5. Sort remaining query parameters alphabetically
 * 6. Reconstruct URL string
 *
 * @param url - The URL to normalize
 * @returns Normalized URL string, or original URL if parsing fails
 *
 * @example
 * normalizeFeedUrl("https://Example.com/feed/?utm_source=twitter")
 * // Returns: "https://example.com/feed"
 *
 * @example
 * normalizeFeedUrl("https://example.com/feed?category=tech&utm_source=fb")
 * // Returns: "https://example.com/feed?category=tech"
 */
export function normalizeFeedUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Normalize hostname to lowercase
    urlObj.hostname = urlObj.hostname.toLowerCase();

    // Remove trailing slash from pathname (unless it's just "/")
    if (urlObj.pathname !== "/" && urlObj.pathname.endsWith("/")) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }

    // Process query parameters
    const params = new URLSearchParams(urlObj.search);
    const filteredParams: [string, string][] = [];

    // Filter out tracking parameters and collect remaining ones
    for (const [key, value] of params.entries()) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        filteredParams.push([key, value]);
      }
    }

    // Sort parameters alphabetically by key
    filteredParams.sort((a, b) => a[0].localeCompare(b[0]));

    // Reconstruct query string manually to preserve encoding (%20 vs +)
    // URLSearchParams.toString() uses + for spaces, but we want to preserve %20
    if (filteredParams.length > 0) {
      const queryString = filteredParams
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join("&");
      urlObj.search = queryString;
    } else {
      urlObj.search = "";
    }

    return urlObj.toString();
  } catch {
    // If URL parsing fails, return original URL
    return url;
  }
}
