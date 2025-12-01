/**
 * OpenGraph Image Fetcher
 *
 * Extracts og:image meta tags from article URLs using streaming HTTP requests.
 * Only reads the HTML <head> section for efficiency.
 */

import { emitCounter, withTiming } from "./metrics";
import { extractDomain } from "./domain-checker";

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
  return await withTiming(
    "og_image.extraction_duration",
    async () => {
      const {
        maxBufferSize = 50 * 1024, // 50KB
        timeout = 5000, // 5 second timeout
        userAgent = "TuvixRSS/1.0 (RSS Reader)",
      } = options;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const domain = extractDomain(url) || "unknown";

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": userAgent },
        });

        if (!response.body) {
          emitCounter("og_image.extracted", 1, {
            status: "no_body",
            domain,
          });
          return null;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let headContent = "";

        try {
          while (true) {
            const result: ReadableStreamReadResult<Uint8Array> =
              await reader.read();
            if (result.done) break;

            const chunk = result.value;
            if (chunk) {
              headContent += decoder.decode(chunk, { stream: true });
            }

            // Check for </head> tag
            const headEndIndex = headContent.indexOf("</head>");
            if (headEndIndex !== -1) {
              headContent = headContent.substring(0, headEndIndex);
              break;
            }

            // Safety limit
            if (headContent.length > maxBufferSize) {
              break;
            }
          }
        } finally {
          // Clear timeout to prevent unnecessary timer leaks
          clearTimeout(timeoutId);
          // Always cancel the reader to prevent stalled HTTP responses
          // This releases the connection even if we didn't read the full response
          reader.cancel().catch(() => {
            // Ignore cancellation errors
          });
          controller.abort();
        }

        // Extract og:image from meta tags
        const ogImageRegex =
          /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']\s*\/?>/i;
        const match = headContent.match(ogImageRegex);

        if (match?.[1]) {
          emitCounter("og_image.extracted", 1, {
            status: "success",
            domain,
          });
          return match[1];
        } else {
          emitCounter("og_image.extracted", 1, {
            status: "not_found",
            domain,
          });
          return null;
        }
      } catch (error) {
        const errorName = (error as Error).name;

        // Emit metric based on error type
        if (errorName === "AbortError") {
          emitCounter("og_image.extracted", 1, {
            status: "timeout",
            domain,
          });
        } else {
          emitCounter("og_image.extracted", 1, {
            status: "error",
            error_type: errorName,
            domain,
          });

          console.warn(
            `OG image fetch failed for ${url}:`,
            (error as Error).message
          );
        }

        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    { operation: "og_image_extraction" }
  );
}
