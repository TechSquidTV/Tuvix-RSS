/**
 * Favicon Fetcher Service
 *
 * Discovers and fetches favicons from multiple sources with fallback strategies.
 */

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
  try {
    // Parse URL to get domain
    const parsedUrl = new URL(feedUrl);
    const domain = parsedUrl.hostname;
    const rootUrl = `${parsedUrl.protocol}//${domain}`;

    // Build candidate list
    const candidates = [
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      feedIconUrl,
      `${rootUrl}/favicon.ico`,
    ].filter((url): url is string => Boolean(url));

    // Try each candidate
    for (const url of candidates) {
      if (await isValidIcon(url)) {
        return {
          iconUrl: url,
          iconData: null, // Don't download until needed
        };
      }
    }

    return {
      iconUrl: null,
      iconData: null,
    };
  } catch (error) {
    console.error("Failed to discover favicon:", error);
    return {
      iconUrl: null,
      iconData: null,
    };
  }
}

/**
 * Fetch icon data from URL
 */
export async function fetchIconData(iconUrl: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(iconUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Validate Content-Type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    // Validate Content-Length
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_ICON_SIZE) {
      throw new Error(`Icon too large: ${contentLength} bytes`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if a URL returns a valid icon (HEAD request)
 */
async function isValidIcon(iconUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(iconUrl, {
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
