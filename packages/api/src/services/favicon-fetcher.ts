import { safeFetch } from "@api/utils/safe-fetch";
/**
 * Favicon Fetcher Service
 *
 * Discovers and fetches favicons from multiple sources with fallback strategies.
 */

import { emitCounter, withTiming } from "@api/utils/metrics";
import { extractDomain } from "@api/utils/domain-checker";

// Maximum icon size: 2MB
const MAX_ICON_SIZE = 2 * 1024 * 1024;

// Request timeout: 5 seconds
const FETCH_TIMEOUT = 5000;

/**
 * Discover and fetch favicon for a website
 *
 * Tries strategies in order:
 * 1. DuckDuckGo favicon API (most reliable)
 * 2. Feed metadata icon (if provided)
 * 3. /favicon.ico on root domain
 *
 * @param feedUrl - The feed URL or website URL
 * @param feedIconUrl - Optional icon URL from feed metadata (if already parsed)
 * @returns Object with iconUrl and optional iconData (as Buffer or Uint8Array)
 */
export async function discoverFavicon(
  feedUrl: string,
  feedIconUrl?: string
): Promise<{
  iconUrl: string | null;
  iconData: Uint8Array | null;
}> {
  return await withTiming(
    "favicon.discovery_duration",
    async () => {
      try {
        // Parse URL to get domain
        const parsedUrl = new URL(feedUrl);
        const domain = parsedUrl.hostname;
        const rootUrl = `${parsedUrl.protocol}//${domain}`;

        console.log("[discoverFavicon] Feed URL:", feedUrl);
        console.log("[discoverFavicon] Feed icon URL (provided):", feedIconUrl);
        console.log("[discoverFavicon] Domain:", domain);

        // Build candidate list - prioritize feedIconUrl if provided
        const candidates = feedIconUrl
          ? [
              { url: feedIconUrl, strategy: "feed_metadata" }, // Prioritize feed-provided icon (e.g., iTunes image, Reddit icon)
              {
                url: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
                strategy: "duckduckgo",
              },
              { url: `${rootUrl}/favicon.ico`, strategy: "root_favicon" },
            ]
          : [
              {
                url: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
                strategy: "duckduckgo",
              },
              { url: `${rootUrl}/favicon.ico`, strategy: "root_favicon" },
            ];

        console.log("[discoverFavicon] Candidates:", candidates);

        // Try each candidate
        for (const { url, strategy } of candidates) {
          console.log("[discoverFavicon] Checking candidate:", url);
          const isValid = await isValidIcon(url);
          console.log(
            "[discoverFavicon] Candidate valid:",
            isValid,
            "for URL:",
            url
          );
          if (isValid) {
            console.log("[discoverFavicon] Selected icon URL:", url);

            // Emit success metric with strategy
            emitCounter("favicon.discovered", 1, {
              status: "success",
              strategy,
              domain: extractDomain(feedUrl) || "unknown",
            });

            return {
              iconUrl: url,
              iconData: null, // Don't download until needed
            };
          }
        }

        console.log("[discoverFavicon] No valid icon found");

        // Emit failure metric
        emitCounter("favicon.discovered", 1, {
          status: "not_found",
          strategy: "all_failed",
          domain: extractDomain(feedUrl) || "unknown",
        });

        return {
          iconUrl: null,
          iconData: null,
        };
      } catch (error) {
        console.error("[discoverFavicon] Failed to discover favicon:", error);

        // Emit error metric
        emitCounter("favicon.discovered", 1, {
          status: "error",
          strategy: "exception",
          domain: extractDomain(feedUrl) || "unknown",
        });

        return {
          iconUrl: null,
          iconData: null,
        };
      }
    },
    { operation: "favicon_discovery" }
  );
}

/**
 * Check if a URL returns a valid icon (HEAD request)
 */
async function isValidIcon(iconUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await safeFetch(iconUrl, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
      },
    });

    if (!response.ok) {
      return false;
    }

    // Check Content-Type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return false;
    }

    // Check Content-Length
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_ICON_SIZE) {
      return false;
    }

    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
