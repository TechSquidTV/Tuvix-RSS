/**
 * Text Sanitization Utilities
 *
 * SECURITY: Strips HTML and sanitizes text to prevent XSS attacks
 * and ensure consistent text-only content storage.
 */

/**
 * Strip all HTML tags from a string
 * Converts HTML entities to their text equivalents
 *
 * @param html - String potentially containing HTML
 * @returns Plain text with all HTML removed
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";

  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&cent;/g, "¢")
    .replace(/&pound;/g, "£")
    .replace(/&yen;/g, "¥")
    .replace(/&euro;/g, "€")
    .replace(/&copy;/g, "©")
    .replace(/&reg;/g, "®");

  // Decode numeric HTML entities
  text = text.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCharCode(parseInt(dec, 10))
  );
  text = text.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Remove excessive whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Truncate text to a maximum length
 * Ensures text doesn't exceed database/display limits
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated (default: "...")
 * @returns Truncated text
 */
export function truncateText(
  text: string | null | undefined,
  maxLength: number,
  suffix: string = "..."
): string {
  if (!text) return "";

  if (text.length <= maxLength) return text;

  // Truncate and add suffix
  const truncated = text.slice(0, maxLength - suffix.length);

  // Try to break at word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.8) {
    // Only break at word if it's not too far back
    return truncated.slice(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

/**
 * Extract plain text excerpt from HTML
 * Combines stripHtml and truncateText
 *
 * @param html - HTML content
 * @param maxLength - Maximum length for excerpt
 * @returns Plain text excerpt
 */
export function extractTextExcerpt(
  html: string | null | undefined,
  maxLength: number = 300
): string {
  const plainText = stripHtml(html);
  return truncateText(plainText, maxLength);
}

/**
 * Sanitize user input text
 * Removes control characters and normalizes whitespace
 *
 * @param text - User input text
 * @returns Sanitized text
 */
export function sanitizeUserInput(text: string | null | undefined): string {
  if (!text) return "";

  // Remove control characters (except newlines and tabs)
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  return sanitized;
}

/**
 * Validate and sanitize URL
 * Prevents javascript: and data: URLs
 *
 * @param url - URL to validate
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const trimmed = url.trim();

  // Block dangerous protocols
  const dangerousProtocols = ["javascript:", "data:", "vbscript:", "file:"];
  const lowerUrl = trimmed.toLowerCase();

  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return null;
    }
  }

  // Ensure valid HTTP(S) URL for external links
  if (!trimmed.match(/^https?:\/\//i) && !trimmed.startsWith("/")) {
    return null;
  }

  return trimmed;
}
