/**
 * Comment Link Extraction Integration Tests
 *
 * Tests the complete extraction flow using fake data based on
 * actual Hacker News and Reddit RSS feed schemas.
 */

import { describe, it, expect } from "vitest";
import { extractCommentLink } from "./index";
import type { ParsedFeedItem } from "./types";

describe("Comment Link Extraction Integration", () => {
  describe("Hacker News RSS feeds", () => {
    it("should extract comment link from typical HN item", () => {
      // Based on actual HN RSS structure from https://news.ycombinator.com/rss
      const item: Partial<ParsedFeedItem> = {
        title: "Show HN: I built a new CLI tool",
        link: "https://github.com/user/project",
        comments: "https://news.ycombinator.com/item?id=38471822",
        description:
          "A powerful CLI tool that helps developers be more productive.",
        pubDate: "Mon, 04 Dec 2023 15:30:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://news.ycombinator.com/item?id=38471822");
    });

    it("should extract comment link from HN Ask item", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Ask HN: What are you working on?",
        link: "https://news.ycombinator.com/item?id=38471900",
        comments: "https://news.ycombinator.com/item?id=38471900",
        description: "Share what you're currently building or learning.",
        pubDate: "Mon, 04 Dec 2023 16:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://news.ycombinator.com/item?id=38471900");
    });

    it("should extract from HN item without description", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Minimalist News Article",
        link: "https://example.com/article",
        comments: "https://news.ycombinator.com/item?id=38472000",
        pubDate: "Mon, 04 Dec 2023 17:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://news.ycombinator.com/item?id=38472000");
    });
  });

  describe("Reddit RSS feeds", () => {
    it("should extract comment link from typical Reddit post", () => {
      // Based on actual Reddit RSS structure from https://www.reddit.com/r/news/.rss
      const item: Partial<ParsedFeedItem> = {
        title: "Breaking: Major Tech Company Announces New Product",
        link: "https://www.reddit.com/r/news/comments/18b9xyz/breaking_major_tech_company/",
        description: `
          <table>
            <tr>
              <td>
                <a href="https://example.com/article">
                  <img src="https://preview.redd.it/thumbnail.jpg" alt="thumbnail" />
                </a>
              </td>
              <td>
                submitted by <a href="https://www.reddit.com/user/testuser">testuser</a>
                to <a href="https://www.reddit.com/r/news/">r/news</a>
                <br/>
                <a href="https://www.reddit.com/r/news/comments/18b9xyz/breaking_major_tech_company/">[comments]</a>
              </td>
            </tr>
          </table>
        `,
        pubDate: "Mon, 04 Dec 2023 18:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe(
        "https://www.reddit.com/r/news/comments/18b9xyz/breaking_major_tech_company/"
      );
    });

    it("should extract from Reddit self-post", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "AMA: I'm a software developer",
        link: "https://www.reddit.com/r/IAmA/comments/18c5abc/ama_im_a_software_developer/",
        description: `
          <table>
            <tr>
              <td>
                submitted by <a href="https://www.reddit.com/user/dev123">dev123</a>
                to <a href="https://www.reddit.com/r/IAmA/">r/IAmA</a>
                <br/>
                <span>5 points</span>
                <a href="https://www.reddit.com/r/IAmA/comments/18c5abc/ama_im_a_software_developer/">[comments]</a>
              </td>
            </tr>
          </table>
        `,
        pubDate: "Mon, 04 Dec 2023 19:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe(
        "https://www.reddit.com/r/IAmA/comments/18c5abc/ama_im_a_software_developer/"
      );
    });

    it("should extract from Reddit post with image", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Check out this cool photo",
        link: "https://www.reddit.com/r/pics/comments/18d7def/check_out_this_cool_photo/",
        description: `
          <table>
            <tr>
              <td>
                <a href="https://i.redd.it/image123.jpg">
                  <img src="https://preview.redd.it/image123.jpg" alt="Cool photo" />
                </a>
              </td>
              <td>
                submitted by <a href="https://www.reddit.com/user/photographer">photographer</a>
                <br/>
                <a href="https://www.reddit.com/r/pics/comments/18d7def/check_out_this_cool_photo/">[comments]</a>
              </td>
            </tr>
          </table>
        `,
        pubDate: "Mon, 04 Dec 2023 20:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe(
        "https://www.reddit.com/r/pics/comments/18d7def/check_out_this_cool_photo/"
      );
    });
  });

  describe("Atom feeds with comment links", () => {
    it("should extract from Atom feed with replies link", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Blog Post About Web Development",
        links: [
          {
            href: "https://blog.example.com/posts/web-dev-2023",
            rel: "alternate",
          },
          {
            href: "https://blog.example.com/posts/web-dev-2023#comments",
            rel: "replies",
          },
        ],
        summary: "<p>An interesting post about modern web development.</p>",
        published: "2023-12-04T21:00:00Z",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe(
        "https://blog.example.com/posts/web-dev-2023#comments"
      );
    });

    it("should extract from Atom feed with comments link", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Technical Article",
        links: [
          { href: "https://tech.example.com/article", rel: "alternate" },
          { href: "https://tech.example.com/article/discuss", rel: "comments" },
        ],
        content: "<p>Deep dive into technical concepts.</p>",
        published: "2023-12-04T22:00:00Z",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://tech.example.com/article/discuss");
    });
  });

  describe("WordPress RSS feeds", () => {
    it("should extract from WordPress post with comments element", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "WordPress Blog Post",
        link: "https://myblog.com/2023/12/04/new-post/",
        comments: "https://myblog.com/2023/12/04/new-post/#comments",
        description: "<p>This is a blog post with an open comment section.</p>",
        pubDate: "Mon, 04 Dec 2023 23:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://myblog.com/2023/12/04/new-post/#comments");
    });

    it("should extract from WordPress with comment count in description", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Popular Blog Post",
        link: "https://blog.example.com/popular-post/",
        comments: "https://blog.example.com/popular-post/#respond",
        description:
          '<p>Great article! <a href="https://blog.example.com/popular-post/#comments">42 Comments</a></p>',
        pubDate: "Tue, 05 Dec 2023 00:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      // Should use RSS comments element (priority 10) not HTML pattern (priority 30)
      expect(result).toBe("https://blog.example.com/popular-post/#respond");
    });
  });

  describe("Priority order", () => {
    it("should prefer RSS comments element over Atom links", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Item with multiple comment indicators",
        comments: "https://example.com/rss-comments",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/atom-comments", rel: "replies" },
        ],
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      // RSS element (priority 10) beats Atom link (priority 20)
      expect(result).toBe("https://example.com/rss-comments");
    });

    it("should prefer RSS comments element over HTML patterns", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Item with RSS and HTML comment links",
        comments: "https://example.com/rss-comments",
        description:
          '<p>Check out <a href="https://example.com/html-comments">[comments]</a></p>',
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      // RSS element (priority 10) beats HTML pattern (priority 30)
      expect(result).toBe("https://example.com/rss-comments");
    });

    it("should prefer Atom links over HTML patterns", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Item with Atom and HTML comment links",
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/atom-comments", rel: "replies" },
        ],
        description:
          '<p>Discussion at <a href="https://example.com/html-comments">Comments</a></p>',
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      // Atom link (priority 20) beats HTML pattern (priority 30)
      expect(result).toBe("https://example.com/atom-comments");
    });

    it("should fall back to Atom when RSS comments is empty", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Fallback test",
        comments: "", // Empty RSS comments
        links: [
          { href: "https://example.com/article", rel: "alternate" },
          { href: "https://example.com/atom-fallback", rel: "replies" },
        ],
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://example.com/atom-fallback");
    });

    it("should fall back to HTML pattern when structured data unavailable", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "HTML pattern fallback",
        description:
          '<p>Read the <a href="https://example.com/html-only">discussion</a></p>',
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://example.com/html-only");
    });
  });

  describe("Edge cases", () => {
    it("should return null for item with no comment indicators", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Regular Article",
        link: "https://example.com/article",
        description: "<p>Just a regular article with no comments.</p>",
        pubDate: "Tue, 05 Dec 2023 01:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should handle minimal feed item", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Minimal Item",
        link: "https://example.com/minimal",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should handle feed item with only title", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Title Only",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBeNull();
    });

    it("should handle empty object", () => {
      const item = {} as any as ParsedFeedItem;

      const result = extractCommentLink(item);

      expect(result).toBeNull();
    });

    it("should handle complex Reddit post with multiple patterns", () => {
      // Real-world scenario with nested HTML and multiple potential matches
      const item: Partial<ParsedFeedItem> = {
        title: "TIL: Interesting Fact",
        link: "https://www.reddit.com/r/todayilearned/comments/abc123/",
        description: `
          <table border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <a href="https://en.wikipedia.org/wiki/Topic">
                  <img src="https://preview.redd.it/thumb.jpg" width="108" height="81" alt="Article thumbnail" />
                </a>
              </td>
              <td>
                submitted by <a href="https://www.reddit.com/user/username"> username </a> to
                <a href="https://www.reddit.com/r/todayilearned/"> r/todayilearned </a>
                <br/>
                <span><a href="https://www.reddit.com/r/todayilearned/comments/abc123/">[link]</a></span>
                <span><a href="https://www.reddit.com/r/todayilearned/comments/abc123/">[comments]</a></span>
              </td>
            </tr>
          </table>
        `,
        pubDate: "Tue, 05 Dec 2023 02:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe(
        "https://www.reddit.com/r/todayilearned/comments/abc123/"
      );
    });

    it("should handle HN item with HTML entities in description", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Article About C++ &amp; Rust",
        link: "https://example.com/cpp-rust",
        comments: "https://news.ycombinator.com/item?id=99999",
        description:
          "Comparing C++ &amp; Rust performance in &lt;real-world&gt; scenarios.",
        pubDate: "Tue, 05 Dec 2023 03:00:00 GMT",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://news.ycombinator.com/item?id=99999");
    });
  });

  describe("Real-world mixed scenarios", () => {
    it("should handle hybrid feed with mixed standards", () => {
      // Some feeds mix RSS and Atom elements
      const item: Partial<ParsedFeedItem> = {
        title: "Hybrid Feed Item",
        link: "https://hybrid.example.com/post",
        comments: "https://hybrid.example.com/post#comments", // RSS style
        links: [
          // Atom style
          { href: "https://hybrid.example.com/post", rel: "alternate" },
        ],
        description:
          '<a href="https://hybrid.example.com/post#discuss">Discuss</a>', // HTML pattern
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      // RSS element should win
      expect(result).toBe("https://hybrid.example.com/post#comments");
    });

    it("should handle feed with multiple comment link formats in description", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Multiple Comment Links",
        description: `
          <div>
            <a href="https://example.com/discuss">Discuss on Forum</a>
            <a href="https://example.com/comments">[comments]</a>
            <a href="https://example.com/feedback">Leave feedback</a>
          </div>
        `,
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      // Should find first matching pattern ([comments])
      expect(result).toBe("https://example.com/comments");
    });

    it("should handle international URLs", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "International Article",
        comments: "https://新闻.example.com/评论/123",
        description: "Article with international domain.",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe("https://新闻.example.com/评论/123");
    });

    it("should handle fragment identifiers and query parameters", () => {
      const item: Partial<ParsedFeedItem> = {
        title: "Complex URL",
        comments: "https://example.com/article?id=123&sort=new#comment-section",
        description: "Article with complex comment URL.",
      };

      const result = extractCommentLink(item as any as ParsedFeedItem);

      expect(result).toBe(
        "https://example.com/article?id=123&sort=new#comment-section"
      );
    });
  });
});
