/**
 * Text Sanitization Utilities
 *
 * SECURITY: Strips HTML and sanitizes text to prevent XSS attacks
 * and ensure consistent text-only content storage.
 */

// HTML entity lookup map for single-pass decoding (performance optimization)
const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  cent: "¢",
  pound: "£",
  yen: "¥",
  euro: "€",
  copy: "©",
  reg: "®",
};

// Pre-compiled regex patterns (avoids repeated regex compilation)
const HTML_TAG_REGEX = /<[^>]*>/g;
const HTML_ENTITY_REGEX = /&([a-zA-Z]+|#\d+|#x[0-9A-Fa-f]+);/g;
const WHITESPACE_REGEX = /\s+/g;

// Maximum iterations for HTML tag removal to prevent infinite loops
const MAX_STRIP_ITERATIONS = 10;

/**
 * Strip all HTML tags from a string
 * Converts HTML entities to their text equivalents
 *
 * Uses single-pass entity decoding with a lookup map for better performance
 * when processing large amounts of HTML content (e.g., RSS feed articles).
 *
 * SECURITY: Repeatedly strips HTML tags to handle nested/malformed tags
 * like "<scr<script>ipt>" which could bypass single-pass sanitization.
 *
 * @param html - String potentially containing HTML
 * @returns Plain text with all HTML removed
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";

  // Remove HTML tags - repeat until no more tags found to handle nested tags
  // This handles cases like "<scr<script>ipt>" where a single pass would leave "<script>"
  let text = html;
  let previousText = "";
  let iterations = 0;

  while (text !== previousText && iterations < MAX_STRIP_ITERATIONS) {
    previousText = text;
    text = text.replace(HTML_TAG_REGEX, "");
    iterations++;
  }

  // Decode HTML entities in a single pass using lookup map
  text = text.replace(HTML_ENTITY_REGEX, (match, entity: string) => {
    // Check named entity in lookup map
    if (HTML_ENTITY_MAP[entity]) {
      return HTML_ENTITY_MAP[entity];
    }

    // Handle numeric entities (decimal: &#123; or hex: &#x7B;)
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = parseInt(entity.slice(2), 16);
      if (!isNaN(codePoint)) {
        return String.fromCharCode(codePoint);
      }
    } else if (entity.startsWith("#")) {
      const codePoint = parseInt(entity.slice(1), 10);
      if (!isNaN(codePoint)) {
        return String.fromCharCode(codePoint);
      }
    }

    // Return original match if entity not recognized
    return match;
  });

  // Remove excessive whitespace
  text = text.replace(WHITESPACE_REGEX, " ").trim();

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
