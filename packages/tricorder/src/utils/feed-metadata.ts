import type { AnyFeed, AtomFeed } from "feedsmith";
import { stripHtml } from "./text-sanitizer.js";

/** Normalize Atom text constructs and plain RSS/JSON text. */
export function feedText(
  value: string | AtomFeed.Text | undefined
): string | undefined {
  return typeof value === "string" ? value : value?.value;
}

/** Shared metadata mapping for discovery and subscription storage. */
export function extractFeedMetadata(feed: AnyFeed["feed"]) {
  const description =
    "description" in feed
      ? feed.description
      : "subtitle" in feed
        ? feedText(feed.subtitle)
        : undefined;
  const siteUrl =
    "home_page_url" in feed && feed.home_page_url
      ? feed.home_page_url
      : "link" in feed && feed.link
        ? feed.link
        : "links" in feed
          ? feed.links?.find((link) => !link.rel || link.rel === "alternate")
              ?.href
          : undefined;
  return {
    title: feedText(feed.title) || undefined,
    description: description ? stripHtml(description) : undefined,
    siteUrl,
  };
}
