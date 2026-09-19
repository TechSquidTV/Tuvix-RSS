import { expect, it } from "vitest";
import { parseFeed } from "feedsmith";
import { extractFeedMetadata } from "@tuvixrss/tricorder";

it("preserves the JSON Feed home page and sanitizes its description", () => {
  const { feed } = parseFeed(
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "News",
      home_page_url: "https://example.com",
      description: "<b>Latest</b> news",
      items: [],
    })
  );
  expect(extractFeedMetadata(feed)).toEqual({
    title: "News",
    siteUrl: "https://example.com",
    description: "Latest news",
  });
});

it("uses an Atom alternate link instead of its self link", () => {
  const { feed } = parseFeed(
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><link rel="self" href="https://example.com/feed"/><link rel="alternate" href="https://example.com"/></feed>'
  );
  expect(extractFeedMetadata(feed).siteUrl).toBe("https://example.com");
});

it("extracts Atom text constructs without stringifying objects", () => {
  const { feed } = parseFeed(
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom News</title><subtitle type="html">&lt;b&gt;Latest&lt;/b&gt; stories</subtitle></feed>'
  );
  expect(extractFeedMetadata(feed)).toMatchObject({
    title: "Atom News",
    description: "Latest stories",
  });
});

it.each([
  [
    '<rss version="2.0"><channel><title>News</title><category>Tech</category><item><title>Story</title><category>Tech</category></item></channel></rss>',
    2,
  ],
  [
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><category term="Tech"/><entry><title>Story</title><category term="Tech"/></entry></feed>',
    2,
  ],
  [
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "News",
      items: [{ id: "1", tags: ["Tech"], content_text: "Story" }],
    }),
    1,
  ],
])(
  "counts feed and entry categories across feed formats",
  async (content, count) => {
    const { countFeedCategories } = await import("../feed-utils");
    expect(countFeedCategories(parseFeed(content).feed)).toEqual(
      new Map([["Tech", count]])
    );
  }
);
