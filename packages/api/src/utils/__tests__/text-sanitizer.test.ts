/**
 * Text Sanitizer Tests
 *
 * Tests for HTML stripping and text sanitization utilities.
 */

import { describe, it, expect } from "vitest";
import {
  stripHtml,
  truncateText,
  extractTextExcerpt,
  sanitizeUserInput,
  sanitizeUrl,
} from "../text-sanitizer";

describe("Text Sanitizer", () => {
  describe("stripHtml", () => {
    it("should return empty string for null input", () => {
      expect(stripHtml(null)).toBe("");
    });

    it("should return empty string for undefined input", () => {
      expect(stripHtml(undefined)).toBe("");
    });

    it("should return empty string for empty string input", () => {
      expect(stripHtml("")).toBe("");
    });

    it("should remove HTML tags", () => {
      expect(stripHtml("<p>Hello</p>")).toBe("Hello");
      expect(stripHtml("<div><p>Hello</p></div>")).toBe("Hello");
      expect(stripHtml("<a href='link'>Click here</a>")).toBe("Click here");
    });

    it("should handle malformed HTML gracefully", () => {
      // These test cases ensure malformed HTML is handled without errors
      // Note: The output is plain text and should never be inserted as HTML
      expect(stripHtml("<script>alert('xss')</script>")).toBe("alert('xss')");
      expect(stripHtml("<>empty<>")).toBe("empty");
      // Angle brackets with text between them are treated as tags and removed
      expect(stripHtml("text < text > text")).toBe("text text");
    });

    it("should decode common HTML entities", () => {
      expect(stripHtml("Hello&nbsp;World")).toBe("Hello World");
      expect(stripHtml("&amp;")).toBe("&");
      expect(stripHtml("&lt;")).toBe("<");
      expect(stripHtml("&gt;")).toBe(">");
      expect(stripHtml("&quot;")).toBe('"');
      expect(stripHtml("&#39;")).toBe("'");
      expect(stripHtml("&apos;")).toBe("'");
    });

    it("should decode currency and symbol entities", () => {
      expect(stripHtml("&cent;")).toBe("¢");
      expect(stripHtml("&pound;")).toBe("£");
      expect(stripHtml("&yen;")).toBe("¥");
      expect(stripHtml("&euro;")).toBe("€");
      expect(stripHtml("&copy;")).toBe("©");
      expect(stripHtml("&reg;")).toBe("®");
    });

    it("should decode numeric HTML entities (decimal)", () => {
      expect(stripHtml("&#60;")).toBe("<"); // < in decimal
      expect(stripHtml("&#62;")).toBe(">"); // > in decimal
      expect(stripHtml("&#38;")).toBe("&"); // & in decimal
    });

    it("should decode numeric HTML entities (hex)", () => {
      expect(stripHtml("&#x3C;")).toBe("<"); // < in hex
      expect(stripHtml("&#x3E;")).toBe(">"); // > in hex
      expect(stripHtml("&#x26;")).toBe("&"); // & in hex
    });

    it("should normalize whitespace", () => {
      expect(stripHtml("Hello    World")).toBe("Hello World");
      expect(stripHtml("Hello\n\nWorld")).toBe("Hello World");
      expect(stripHtml("  Hello World  ")).toBe("Hello World");
    });

    it("should handle complex HTML content", () => {
      const html = `
        <div class="container">
          <h1>Title</h1>
          <p>This is a <strong>paragraph</strong> with &amp; entities.</p>
        </div>
      `;
      expect(stripHtml(html)).toBe("Title This is a paragraph with & entities.");
    });

    it("should handle unrecognized entities by preserving them", () => {
      expect(stripHtml("&unknownentity;")).toBe("&unknownentity;");
    });
  });

  describe("truncateText", () => {
    it("should return empty string for null input", () => {
      expect(truncateText(null, 10)).toBe("");
    });

    it("should return empty string for undefined input", () => {
      expect(truncateText(undefined, 10)).toBe("");
    });

    it("should not truncate text shorter than max length", () => {
      expect(truncateText("Hello", 10)).toBe("Hello");
    });

    it("should truncate text longer than max length", () => {
      expect(truncateText("Hello World", 8)).toBe("Hello...");
    });

    it("should use custom suffix", () => {
      expect(truncateText("Hello World", 8, "…")).toBe("Hello W…");
    });

    it("should break at word boundary when possible", () => {
      // The text has 30 chars ("Hello World and more text here")
      // For maxLength=28 and suffix="..." (3 chars), we truncate to 25 chars first
      // "Hello World and more text " -> has space at 25, 25/28 = 89% > 80%
      // So it should break at word boundary
      const result = truncateText("Hello World and more text here", 28);
      expect(result).toBe("Hello World and more text...");
    });
  });

  describe("extractTextExcerpt", () => {
    it("should strip HTML and truncate", () => {
      const html = "<p>This is a long paragraph with <strong>HTML</strong> tags.</p>";
      const result = extractTextExcerpt(html, 30);
      expect(result).not.toContain("<p>");
      expect(result).not.toContain("<strong>");
      expect(result.length).toBeLessThanOrEqual(30);
    });
  });

  describe("sanitizeUserInput", () => {
    it("should return empty string for null input", () => {
      expect(sanitizeUserInput(null)).toBe("");
    });

    it("should remove control characters", () => {
      // Control characters are removed but not replaced with space
      expect(sanitizeUserInput("Hello\x00World")).toBe("HelloWorld");
    });

    it("should normalize whitespace", () => {
      expect(sanitizeUserInput("Hello   World")).toBe("Hello World");
    });
  });

  describe("sanitizeUrl", () => {
    it("should return null for null input", () => {
      expect(sanitizeUrl(null)).toBe(null);
    });

    it("should return null for undefined input", () => {
      expect(sanitizeUrl(undefined)).toBe(null);
    });

    it("should return valid HTTP URLs", () => {
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    });

    it("should return valid relative URLs", () => {
      expect(sanitizeUrl("/path/to/page")).toBe("/path/to/page");
    });

    it("should block javascript: URLs", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBe(null);
      expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe(null);
    });

    it("should block data: URLs", () => {
      expect(sanitizeUrl("data:text/html,<script>")).toBe(null);
    });

    it("should block vbscript: URLs", () => {
      expect(sanitizeUrl("vbscript:alert(1)")).toBe(null);
    });

    it("should block file: URLs", () => {
      expect(sanitizeUrl("file:///etc/passwd")).toBe(null);
    });

    it("should trim whitespace", () => {
      expect(sanitizeUrl("  https://example.com  ")).toBe("https://example.com");
    });

    it("should return null for invalid URLs", () => {
      expect(sanitizeUrl("not-a-valid-url")).toBe(null);
    });
  });
});
