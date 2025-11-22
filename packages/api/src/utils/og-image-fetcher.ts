/**
 * OpenGraph Image Fetcher
 *
 * Extracts og:image meta tags from article URLs using streaming HTTP requests.
 * Only reads the HTML <head> section for efficiency.
 */

interface OgImageOptions {
  maxBufferSize?: number;
  timeout?: number;
  userAgent?: string;
}

/**
 * Extract OpenGraph image URL from an article URL
 * Uses streaming to read only the HTML head section
 */
export async function extractOgImage(
  url: string,
  options: OgImageOptions = {}
): Promise<string | null> {
  const {
    maxBufferSize = 50 * 1024, // 50KB
    timeout = 5000, // 5 second timeout
    userAgent = "TuvixRSS/1.0 (RSS Reader)",
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": userAgent },
    });

    if (!response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let headContent = "";

    while (true) {
      const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
      if (result.done) break;

      const chunk = result.value;
      if (chunk) {
        headContent += decoder.decode(chunk, { stream: true });
      }

      // Check for </head> tag
      const headEndIndex = headContent.indexOf("</head>");
      if (headEndIndex !== -1) {
        controller.abort();
        headContent = headContent.substring(0, headEndIndex);
        break;
      }

      // Safety limit
      if (headContent.length > maxBufferSize) {
        controller.abort();
        break;
      }
    }

    // Extract og:image from meta tags
    const ogImageRegex =
      /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']\s*\/?>/i;
    const match = headContent.match(ogImageRegex);

    return match?.[1] || null;
  } catch (error) {
    // Silently fail - this is a best-effort fallback
    if ((error as Error).name !== "AbortError") {
      console.warn(
        `OG image fetch failed for ${url}:`,
        (error as Error).message
      );
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
