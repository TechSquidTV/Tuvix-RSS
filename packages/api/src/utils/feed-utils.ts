/**
 * Utility functions for RSS/Atom/JSON feed processing
 */

/**
 * Extract iTunes image URL from feed metadata
 *
 * Tries multiple methods to extract itunes:image href:
 * 1. Direct namespace access (itunes:image)
 * 2. Nested itunes property (feed.itunes.image)
 * 3. Parse raw XML if feedContent provided (for cases where parser doesn't expose namespace)
 *
 * @param feedData - Parsed feed object from feedsmith
 * @param feedContent - Optional raw XML/RSS content for XML parsing fallback
 * @returns iTunes image URL or undefined
 */
export function extractItunesImage(
  feedData: unknown,
  feedContent?: string
): string | undefined {
  const feed = feedData as Record<string, unknown>;

  // Method 1: Direct namespace access (itunes:image)
  if ("itunes:image" in feed) {
    const itunesImage = feed["itunes:image"];
    if (typeof itunesImage === "string") {
      return itunesImage;
    }
    if (
      itunesImage &&
      typeof itunesImage === "object" &&
      "href" in itunesImage &&
      typeof itunesImage.href === "string"
    ) {
      return itunesImage.href;
    }
  }

  // Method 2: Nested itunes property (feed.itunes.image)
  if ("itunes" in feed && feed.itunes) {
    const itunes = feed.itunes as Record<string, unknown>;
    if ("image" in itunes) {
      const image = itunes.image;
      if (typeof image === "string") {
        return image;
      }
      if (
        image &&
        typeof image === "object" &&
        "href" in image &&
        typeof image.href === "string"
      ) {
        return image.href;
      }
    }
  }

  // Method 3: Parse raw XML if available (fallback when parser doesn't expose namespace)
  if (feedContent) {
    try {
      // Match <itunes:image href="..."/>
      const itunesImageMatch = feedContent.match(
        /<itunes:image[^>]*href=["']([^"']+)["'][^>]*>/i
      );
      if (itunesImageMatch && itunesImageMatch[1]) {
        return itunesImageMatch[1];
      }
    } catch (error) {
      console.error("[extractItunesImage] XML parsing failed:", error);
    }
  }

  return undefined;
}
