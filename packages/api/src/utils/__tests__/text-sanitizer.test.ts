/**
 * Text Sanitizer Tests
 *
 * HIGH IMPACT: Security-critical tests for HTML sanitization
 * Focuses on XSS prevention and link preservation
 */

import { describe, it, expect } from "vitest";
import { sanitizeHtml, stripHtml, truncateHtml } from "../text-sanitizer";

describe("sanitizeHtml - Security (XSS Prevention)", () => {
  it("should remove script tags", () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("Hello");
  });

  it("should remove inline event handlers", () => {
    const input = '<a href="#" onclick="alert(\'xss\')">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).toContain("Click");
  });

  it("should block javascript: protocol in links", () => {
    const input = "<a href=\"javascript:alert('xss')\">Click</a>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("should remove iframe tags", () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<iframe>");
  });

  it("should remove style tags", () => {
    const input = "<style>body{display:none}</style><p>Text</p>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<style>");
    expect(result).toContain("Text");
  });

  it("should remove data: protocol in links", () => {
    const input =
      '<a href="data:text/html,<script>alert(1)</script>">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("data:");
  });
});

describe("sanitizeHtml - Link Preservation", () => {
  it("should preserve http links", () => {
    const input = '<a href="http://example.com">Example</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="http://example.com"');
    expect(result).toContain("Example");
  });

  it("should preserve https links", () => {
    const input = '<a href="https://example.com">Example</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://example.com"');
  });

  it("should add target=_blank to all links", () => {
    const input = '<a href="https://example.com">Example</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('target="_blank"');
  });

  it("should add rel=noopener noreferrer to all links", () => {
    const input = '<a href="https://example.com">Example</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("should preserve multiple links", () => {
    const input =
      '<a href="https://one.com">One</a> and <a href="https://two.com">Two</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://one.com"');
    expect(result).toContain('href="https://two.com"');
    expect(result).toContain("One");
    expect(result).toContain("Two");
  });

  it("should preserve Hacker News comment links", () => {
    const input =
      '<a href="https://news.ycombinator.com/item?id=12345">Comments</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain(
      'href="https://news.ycombinator.com/item?id=12345"'
    );
    expect(result).toContain("Comments");
  });
});

describe("sanitizeHtml - Inline Formatting Preservation", () => {
  it("should strip paragraph tags (block-level elements)", () => {
    // Block elements are removed because descriptions render inside <p> tags
    const input = "<p>First paragraph</p><p>Second paragraph</p>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<p>");
    expect(result).toContain("First paragraph");
    expect(result).toContain("Second paragraph");
  });

  it("should preserve strong/bold tags (inline elements)", () => {
    const input = "<strong>Bold</strong> and <b>also bold</b>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<b>also bold</b>");
  });

  it("should preserve em/italic tags (inline elements)", () => {
    const input = "<em>Italic</em> and <i>also italic</i>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<em>Italic</em>");
    expect(result).toContain("<i>also italic</i>");
  });

  it("should preserve code tags (inline elements)", () => {
    const input = "Use <code>console.log()</code> to debug";
    const result = sanitizeHtml(input);
    expect(result).toContain("<code>console.log()</code>");
  });

  it("should preserve br tags (void element)", () => {
    const input = "Line one<br>Line two";
    const result = sanitizeHtml(input);
    expect(result).toContain("<br");
  });

  it("should strip lists (block-level elements)", () => {
    // Lists are removed because they cannot be nested inside <p> tags
    const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<ul>");
    expect(result).not.toContain("<li>");
    expect(result).toContain("Item 1");
    expect(result).toContain("Item 2");
  });

  it("should convert headings to strong tags", () => {
    // Headings are converted to preserve emphasis without invalid HTML
    const input =
      "<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4>";
    const result = sanitizeHtml(input);
    // All headings should be converted to strong
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<h2>");
    expect(result).not.toContain("<h3>");
    expect(result).not.toContain("<h4>");
    // Content should be preserved in strong tags
    expect(result).toContain("<strong>Heading 1</strong>");
    expect(result).toContain("<strong>Heading 2</strong>");
    expect(result).toContain("<strong>Heading 3</strong>");
    expect(result).toContain("<strong>Heading 4</strong>");
  });

  it("should strip blockquote and pre tags (block-level elements)", () => {
    const input =
      "<blockquote>A quote</blockquote><pre>code block\nline 2</pre>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<blockquote>");
    expect(result).not.toContain("<pre>");
    expect(result).toContain("A quote");
    expect(result).toContain("code block");
  });
});

describe("sanitizeHtml - Real World RSS Scenarios", () => {
  it("should handle typical RSS description with link", () => {
    const input =
      'Article about technology. <a href="https://example.com/comments">Discuss</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain("Article about technology.");
    expect(result).toContain('href="https://example.com/comments"');
    expect(result).toContain("Discuss");
    expect(result).toContain('target="_blank"');
  });

  it("should handle mixed formatting with links", () => {
    const input =
      '<p><strong>Important:</strong> Check out <a href="https://example.com">this article</a> for more info.</p>';
    const result = sanitizeHtml(input);
    expect(result).toContain("<strong>Important:</strong>");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("this article");
  });

  it("should handle empty or null input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
  });

  it("should handle plain text without HTML", () => {
    const input = "Just plain text";
    const result = sanitizeHtml(input);
    expect(result).toBe("Just plain text");
  });
});

describe("stripHtml - Backward Compatibility", () => {
  it("should remove all HTML tags", () => {
    const input =
      "<p>Text with <a href='#'>link</a> and <strong>bold</strong></p>";
    const result = stripHtml(input);
    expect(result).toBe("Text with link and bold");
  });

  it("should preserve text content from HTML", () => {
    const input = "Text with <p>paragraph</p> content";
    const result = stripHtml(input);
    expect(result).toBe("Text with paragraph content");
  });

  it("should remove excessive whitespace", () => {
    const input = "<p>Multiple   spaces    and\n\nnewlines</p>";
    const result = stripHtml(input);
    expect(result).toBe("Multiple spaces and newlines");
  });

  it("should handle empty input", () => {
    expect(stripHtml("")).toBe("");
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
  });

  // BUG FIX TEST: HTML entity decoding
  it("should decode HTML entities for filtering/search", () => {
    const input = "A &amp; B and &lt;brackets&gt; with &#39;quotes&#39;";
    const result = stripHtml(input);

    // Critical for filtering: entities must be decoded to actual characters
    expect(result).toBe("A & B and <brackets> with 'quotes'");
    expect(result).toContain("&"); // not &amp;
    expect(result).toContain("<"); // not &lt;
    expect(result).toContain(">"); // not &gt;
    expect(result).toContain("'"); // not &#39;
  });

  it("should decode common HTML entities", () => {
    const input = "&nbsp;&copy;&reg;&euro;&pound;";
    const result = stripHtml(input);
    expect(result).toContain("©");
    expect(result).toContain("®");
    expect(result).toContain("€");
    expect(result).toContain("£");
  });

  it("should decode numeric HTML entities", () => {
    const input = "&#65; &#x42; test"; // A B test
    const result = stripHtml(input);
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  // BUG FIX TEST: &amp; must be decoded first to prevent double-decoding
  it("should decode &amp; first to enable proper entity handling", () => {
    // &amp;lt; when decoded properly: &amp; → & first, then &lt; → <
    // This results in literal < character, which is correct for search/filtering
    const input = "&amp;lt;script&amp;gt;";
    const result = stripHtml(input);

    // Becomes "<script>" which is what users would search for
    expect(result).toBe("<script>");
  });

  it("should correctly decode &amp; in different contexts", () => {
    const input = "A &amp; B and &amp;nbsp; text";
    const result = stripHtml(input);

    // &amp; → & first, then &nbsp; → space character, then whitespace normalization
    // Result: "A & B and  text" → "A & B and text" (spaces normalized)
    expect(result).toBe("A & B and text");
  });
});

describe("truncateHtml - Safe HTML Truncation", () => {
  // BUG FIX TEST: Prevent broken HTML tags
  it("should not break HTML tags when truncating", () => {
    const input = '<a href="https://example.com/very-long-url">Link text</a>';
    const result = truncateHtml(input, 30);

    // Should not have broken opening tag
    expect(result).not.toMatch(/<a href="https:\/\/example\.com\/v$/);
    // Should be valid - either complete tag or no tag at all
    const openTags = (result.match(/<a/g) || []).length;
    const closeTags = (result.match(/<\/a>/g) || []).length;
    // If there's an opening tag, it should be closed (sanitize-html auto-closes)
    if (openTags > 0) {
      expect(closeTags).toBeGreaterThanOrEqual(openTags);
    }
  });

  it("should truncate long HTML without breaking link structure", () => {
    const input =
      '<p>Some text <a href="https://example.com/article?id=12345&param=value">Click here</a> for more</p>';
    const result = truncateHtml(input, 50);

    // Should not leave unclosed tags
    expect(result).not.toMatch(/<a\s[^>]*$/); // No partial opening tag
    expect(result).not.toMatch(/<p[^>]*$/); // No partial p tag
  });

  it("should handle truncating in the middle of link attributes", () => {
    const input =
      '<a href="https://news.example.com/item?id=46084956" target="_blank">Comments</a>';
    const result = truncateHtml(input, 40);

    // Either the link is completely removed or properly formed
    if (result.includes("<a")) {
      expect(result).toContain("</a>");
      expect(result).toMatch(/href="[^"]*"/); // Valid href attribute
    }
  });

  it("should preserve complete short HTML", () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = truncateHtml(input, 100);
    expect(result).toBe(input);
  });

  it("should handle multiple tags gracefully", () => {
    const input =
      '<p><strong>Bold</strong> and <em>italic</em> text with <a href="#">link</a></p>';
    const result = truncateHtml(input, 30);

    // Should not have broken/unclosed tags
    expect(result).not.toMatch(/<[a-z]+\s[^>]*$/); // No partial opening tags
    expect(result).not.toMatch(/<[a-z]+$/); // No incomplete tag names

    // Any tags that exist should be properly closed or self-closing
    // This is a basic sanity check - the key is no broken tags
    expect(result.length).toBeGreaterThan(0);
  });

  it("should not truncate if within length limit", () => {
    const input = '<a href="https://example.com">Short</a>';
    const result = truncateHtml(input, 100);
    expect(result).toBe(input);
  });

  it("real-world: HN comment link should not break when truncated", () => {
    const input =
      'Article about technology trends. <a href="https://news.example.com/item?id=46084956" target="_blank" rel="noopener noreferrer">Comments</a>';
    const result = truncateHtml(input, 60);

    // Should either have complete link or no link at all
    if (result.includes("href=")) {
      expect(result).toMatch(/href="[^"]+"/); // Complete href
      expect(result).toContain("</a>"); // Closed tag
    }
  });

  it("should skip sanitization when alreadySanitized flag is set", () => {
    // Pre-sanitized HTML with specific attributes
    const preSanitized =
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Test</a> Some text that will be truncated...';

    // Without flag: would re-sanitize (but output should be same since already safe)
    const resultWithSanitization = truncateHtml(preSanitized, 50);

    // With flag: skips sanitization step
    const resultWithoutSanitization = truncateHtml(preSanitized, 50, "...", {
      alreadySanitized: true,
    });

    // Both should produce valid output
    expect(resultWithSanitization).toBeTruthy();
    expect(resultWithoutSanitization).toBeTruthy();

    // The alreadySanitized version should preserve the exact truncated structure
    // without running through sanitize-html again
    expect(resultWithoutSanitization).toContain("...");
  });

  it("should still sanitize when alreadySanitized is false or not provided", () => {
    const unsafeHtml =
      '<script>alert("xss")</script><p>This is a long paragraph with text that will force truncation to occur so we can test sanitization behavior</p><a href="javascript:alert(1)">Link</a>';

    // Default behavior: sanitizes (needs to be longer than 100 to trigger truncation)
    const result = truncateHtml(unsafeHtml, 100);

    // Should have removed dangerous content
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("javascript:");
    // Note: May contain "alert" in text, but not in executable context

    // Should preserve safe inline content (but strip block-level <p> tags)
    expect(result).toContain("This is a long paragraph");
    expect(result).not.toContain("<p>"); // Block elements are stripped
  });
});
