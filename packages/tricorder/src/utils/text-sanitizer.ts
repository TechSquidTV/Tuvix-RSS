/**
 * Text Sanitization Utilities
 *
 * SECURITY: Sanitizes HTML to allow safe tags (links, formatting) while preventing XSS attacks
 * by removing dangerous tags and attributes.
 *
 * Note: For tricorder, we only include stripHtml since that's what's needed for feed descriptions.
 * Full sanitizeHtml is left in the API package for frontend use.
 */

import sanitizeHtmlLib from "sanitize-html";

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
 * Decode HTML entities in text
 * Converts named entities (&nbsp;, &lt;, etc.) and numeric entities (&#39;, &#x27;)
 *
 * CRITICAL ORDER DEPENDENCY FOR SECURITY:
 * We decode &amp; FIRST, then other named entities, then numeric entities.
 * This ensures proper handling of edge cases and prevents double-decoding attacks:
 *
 * Examples with correct decoding order:
 * - "&amp;amp;" → "&amp;" (not "&")
 * - "&amp;lt;" → "&lt;" (not "<")
 * - "&amp;#39;" → "&#39;" (not "'")
 *
 * If we decoded other entities first, an attacker could bypass sanitization
 * by double-encoding malicious content (e.g., "&amp;lt;script&amp;gt;").
 *
 * @param text - Text containing HTML entities
 * @returns Text with decoded entities
 */
function decodeHtmlEntities(text: string): string {
  // Step 1: Decode &amp; FIRST to establish baseline
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

/**
 * Strip all HTML tags from a string
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
