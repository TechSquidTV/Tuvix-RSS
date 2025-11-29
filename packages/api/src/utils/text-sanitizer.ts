/**
 * Text Sanitization Utilities
 *
 * SECURITY: Sanitizes HTML to allow safe tags (links, formatting) while preventing XSS attacks
 * by removing dangerous tags and attributes.
 */

import sanitizeHtmlLib from "sanitize-html";

/**
 * Sanitize HTML to allow safe tags while removing dangerous content
 * Allows links, basic formatting, and safe structural elements
 *
 * @param html - String potentially containing HTML
 * @returns Sanitized HTML with only safe tags and attributes
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";

  return sanitizeHtmlLib(html, {
    allowedTags: [
      "a",
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
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
  let text = sanitizeHtmlLib(html, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // Decode HTML entities (sanitize-html preserves them)
  // CRITICAL: Decode &amp; FIRST to avoid double-decoding
  // e.g., "&amp;lt;" should become "&lt;" not "<"
  text = text.replace(/&amp;/g, "&");

  // Then decode other common named entities
  text = text
    .replace(/&nbsp;/g, " ")
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
  return text.replace(/\s+/g, " ").trim();
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
 * @param options.alreadySanitized - Set to true if input is already sanitized (avoids double-sanitization)
 * @returns Truncated and sanitized HTML
 */
export function truncateHtml(
  html: string | null | undefined,
  maxLength: number,
  suffix: string = "...",
  options: { alreadySanitized?: boolean } = {}
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
