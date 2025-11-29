/**
 * Text Sanitization Utilities
 *
 * SECURITY: Sanitizes HTML to allow safe tags (links, formatting) while preventing XSS attacks
 * by removing dangerous tags and attributes.
 */

import sanitizeHtmlLib from "sanitize-html";

// =============================================================================
// Constants
// =============================================================================

/**
 * Map of HTML entity names to their decoded characters
 * Used for decoding HTML entities in text content
 */
const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&cent;": "¢",
  "&pound;": "£",
  "&yen;": "¥",
  "&euro;": "€",
  "&copy;": "©",
  "&reg;": "®",
};

/**
 * List of heading tags that should be converted to strong tags
 * Prevents invalid HTML when rendering inside paragraph elements
 */
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Options for truncateHtml function
 */
export interface TruncateHtmlOptions {
  /**
   * Set to true if input is already sanitized
   * Skips sanitization step for performance optimization
   * @default false
   */
  alreadySanitized?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Decode HTML entities in text
 * Converts named entities (&nbsp;, &lt;, etc.) and numeric entities (&#39;, &#x27;)
 *
 * IMPORTANT: Decodes &amp; first to prevent double-decoding issues
 * Example: "&amp;lt;" should become "&lt;" not "<"
 *
 * @param text - Text containing HTML entities
 * @returns Text with decoded entities
 */
function decodeHtmlEntities(text: string): string {
  // CRITICAL: Decode &amp; FIRST to avoid double-decoding
  let result = text.replace(/&amp;/g, "&");

  // Decode named entities
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replace(new RegExp(entity, "g"), char);
  }

  // Decode numeric HTML entities (decimal)
  result = result.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCharCode(parseInt(dec, 10))
  );

  // Decode numeric HTML entities (hexadecimal)
  result = result.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  return result;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Sanitize HTML to allow safe tags while removing dangerous content
 * Allows inline formatting suitable for rendering inside paragraph elements
 *
 * IMPORTANT: Only inline elements are allowed because descriptions are rendered
 * inside <p> tags in the frontend (see ItemDescription component). Block-level
 * elements like headings, paragraphs, lists, etc. would create invalid HTML.
 *
 * @param html - String potentially containing HTML
 * @returns Sanitized HTML with only safe inline tags and attributes
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";

  return sanitizeHtmlLib(html, {
    allowedTags: [
      // Links
      "a",
      // Inline formatting
      "strong",
      "b",
      "em",
      "i",
      "u",
      "code",
      // Line breaks (void element, safe in <p>)
      "br",
      // Note: Block-level elements (h1-h6, p, blockquote, ul, ol, li, pre)
      // are intentionally excluded as they cannot be nested inside <p> tags
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Force all links to open in new tab with security attributes
    transformTags: {
      a: (_tagName, attribs) => {
        return {
          tagName: "a",
          attribs: {
            ...attribs,
            target: "_blank",
            rel: "noopener noreferrer",
          },
        };
      },
      // Convert headings to strong for semantic preservation without invalid HTML
      ...Object.fromEntries(HEADING_TAGS.map((tag) => [tag, "strong"])),
    },
  });
}

/**
 * Strip all HTML tags from a string (legacy function for backward compatibility)
 * Converts HTML to plain text and decodes HTML entities
 *
 * @param html - String potentially containing HTML
 * @returns Plain text with all HTML removed and entities decoded
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";

  // Use sanitize-html to strip all tags (this preserves entities)
  const text = sanitizeHtmlLib(html, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // Decode HTML entities and remove excessive whitespace
  const decoded = decodeHtmlEntities(text);
  return decoded.replace(/\s+/g, " ").trim();
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
 * Truncate HTML content safely without breaking tag structure
 * First truncates to approximate length, then optionally sanitizes to fix any broken tags
 *
 * @param html - HTML content to truncate
 * @param maxLength - Maximum length (approximate, final may be shorter due to tag closure)
 * @param suffix - Suffix to add if truncated (default: "...")
 * @param options - Optional configuration
 * @returns Truncated and sanitized HTML
 */
export function truncateHtml(
  html: string | null | undefined,
  maxLength: number,
  suffix: string = "...",
  options: TruncateHtmlOptions = {}
): string {
  if (!html) return "";

  if (html.length <= maxLength) return html;

  // First, truncate to approximate length
  let truncated = html.slice(0, maxLength - suffix.length);

  // Try to break at a tag boundary to avoid cutting through tags
  const lastTagClose = truncated.lastIndexOf(">");
  const lastTagOpen = truncated.lastIndexOf("<");

  // If we're in the middle of a tag, cut before it
  if (lastTagOpen > lastTagClose) {
    truncated = truncated.slice(0, lastTagOpen);
  }

  // Try to break at word boundary (but only in text content, not in tags)
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.8 && lastSpace > lastTagClose) {
    truncated = truncated.slice(0, lastSpace);
  }

  // Add suffix
  truncated = truncated + suffix;

  // Sanitize to close any unclosed tags and ensure valid HTML
  // Skip if input was already sanitized to avoid unnecessary double-sanitization
  // This uses sanitize-html which will auto-close any open tags
  return options.alreadySanitized ? truncated : sanitizeHtml(truncated);
}
