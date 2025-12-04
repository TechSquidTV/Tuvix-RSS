/**
 * RSS Fetcher Service
 *
 * Fetches RSS/Atom/RDF/JSON feeds using feedsmith and stores articles in the database.
 * Supports automatic format detection and handles multiple feed formats.
 */

import * as Sentry from "@/utils/sentry";
import { parseFeed } from "feedsmith";
import type { Rss, Atom, Rdf, Json } from "@/types/feed";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { extractOgImage } from "@/utils/og-image-fetcher";
import {
  sanitizeHtml,
  stripHtml,
  truncateText,
  truncateHtml,
} from "@/utils/text-sanitizer";
import {
  extractDomain,
  isDomainBlocked,
  getBlockedDomains,
} from "@/utils/domain-checker";
import { chunkArray, D1_MAX_PARAMETERS } from "@/db/utils";
import { emitCounter, emitGauge, withTiming } from "@/utils/metrics";
import { extractItunesImage } from "@/utils/feed-utils";
import { extractCommentLink } from "./comment-link-extraction";

// =============================================================================
// Types
// =============================================================================

export interface FetchResult {
  successCount: number;
  errorCount: number;
  total: number;
  errors: Array<{ sourceId: number; url: string; error: string }>;
}

export interface FetchSingleResult {
  articlesAdded: number;
  articlesSkipped: number;
  sourceUpdated: boolean;
}

// Union types for feeds and items (feedsmith returns dates as strings, not Date objects)
type AnyFeed =
  | Rss.Feed<string>
  | Atom.Feed<string>
  | Rdf.Feed<string>
  | Json.Feed<string>;
type AnyItem =
  | Rss.Item<string>
  | Atom.Entry<string>
  | Rdf.Item<string>
  | Json.Item<string>;

// =============================================================================
// Public API
// =============================================================================

/**
 * Fetch all feeds from the database and update articles
 */
export async function fetchAllFeeds(db: Database): Promise<FetchResult> {
  return await withTiming(
    "rss.fetch_all_duration",
    async () => {
      const sources = await db.select().from(schema.sources);

      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{ sourceId: number; url: string; error: string }> =
        [];

      console.log(`Starting fetch for ${sources.length} sources`);

      // Emit gauge for total sources
      emitGauge("rss.sources_total", sources.length);

      for (const source of sources) {
        try {
          const result = await fetchSingleFeed(source.id, source.url, db);
          console.log(
            `✓ Fetched ${source.url}: ${result.articlesAdded} new, ${result.articlesSkipped} skipped`
          );
          successCount++;
        } catch (error) {
          errorCount++;
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          errors.push({
            sourceId: source.id,
            url: source.url,
            error: errorMessage,
          });
          console.error(`✗ Failed to fetch ${source.url}:`, errorMessage);
        }
      }

      console.log(
        `Fetch complete: ${successCount} succeeded, ${errorCount} failed out of ${sources.length}`
      );

      // Emit aggregate metrics
      emitCounter("rss.batch_completed", 1, {
        success_count: successCount.toString(),
        error_count: errorCount.toString(),
      });

      return {
        successCount,
        errorCount,
        total: sources.length,
        errors,
      };
    },
    { operation: "fetch_all_feeds" }
  );
}

/**
 * Fetch a single feed and store new articles
 */
export async function fetchSingleFeed(
  sourceId: number,
  feedUrl: string,
  db: Database
): Promise<FetchSingleResult> {
  return await Sentry.startSpan(
    {
      op: "feed.fetch",
      name: "Fetch RSS Feed",
      attributes: {
        feed_url: feedUrl,
        source_id: sourceId,
        feed_domain: extractDomain(feedUrl) || "unknown",
      },
    },
    async (span) => {
      try {
        // 0. Check if domain is blocked (before fetching)
        const domain = extractDomain(feedUrl);
        if (domain) {
          try {
            // Get all users subscribed to this source
            const subscriptions = await db
              .select()
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.sourceId, sourceId));

            if (subscriptions.length > 0) {
              // Get their plans (check if any are enterprise)
              const userIds = subscriptions.map((s) => s.userId);
              // Chunk userIds for Cloudflare D1 parameter limit
              const chunks = chunkArray(userIds, D1_MAX_PARAMETERS - 1);

              let hasEnterpriseUser = false;
              for (const chunk of chunks) {
                const users = await db
                  .select()
                  .from(schema.user)
                  .where(inArray(schema.user.id, chunk));

                if (users.some((u) => u.plan === "enterprise")) {
                  hasEnterpriseUser = true;
                  break;
                }
              }

              // If no enterprise users, check if domain is blocked
              if (!hasEnterpriseUser) {
                const blockedDomainsList = await getBlockedDomains(db);
                const blockedDomains = blockedDomainsList.map((b) => b.domain);

                if (isDomainBlocked(domain, blockedDomains)) {
                  console.log(`Skipping blocked domain: ${domain}`);
                  span.setAttribute("domain_blocked", true);
                  span.setStatus({ code: 1, message: "Domain blocked" });
                  return {
                    articlesAdded: 0,
                    articlesSkipped: 0,
                    sourceUpdated: false,
                  };
                }
              }
            }
          } catch (error) {
            // Safe migration: If table doesn't exist yet, continue with fetch
            // This allows code to deploy before migrations without errors
            if (
              error instanceof Error &&
              (error.message.includes("no such table") ||
                error.message.includes("does not exist"))
            ) {
              console.warn(
                "blocked_domains table not found - continuing with fetch (migrations may not have run yet)"
              );
            } else {
              // Log other errors but continue (fail open for safety)
              console.error("Error checking blocked domains:", error);
            }
          }
        }

        await Sentry.addBreadcrumb({
          category: "feed.fetch",
          message: `Fetching feed from ${feedUrl}`,
          level: "info",
          data: { feed_url: feedUrl, source_id: sourceId },
        });

        // 1. Fetch feed with timeout
        const response = await fetch(feedUrl, {
          headers: {
            "User-Agent":
              "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
            Accept:
              "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(30000), // 30s timeout
        });

        span.setAttribute("http_status", response.status);
        span.setAttribute(
          "content_type",
          response.headers.get("content-type") || "unknown"
        );

        if (!response.ok) {
          span.setStatus({ code: 2, message: `HTTP ${response.status}` });
          const error = new Error(
            `HTTP ${response.status}: ${response.statusText}`
          );
          await Sentry.captureException(error, {
            level: "error",
            tags: {
              feed_domain: domain || "unknown",
              operation: "feed_fetch",
              http_status: response.status.toString(),
            },
            extra: {
              feed_url: feedUrl,
              source_id: sourceId,
              status_text: response.statusText,
            },
          });
          throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (
          !contentType.includes("xml") &&
          !contentType.includes("rss") &&
          !contentType.includes("atom") &&
          !contentType.includes("json")
        ) {
          console.warn(
            `Unexpected content-type: ${contentType} for ${feedUrl}`
          );
          span.setAttribute("unexpected_content_type", true);
        }

        const feedContent = await response.text();
        span.setAttribute("feed_content_size", feedContent.length);

        // 2. Parse feed using feedsmith (auto-detects format)
        let feed: AnyFeed;
        let feedFormat: string;
        try {
          const result = parseFeed(feedContent);
          feed = result.feed as AnyFeed;
          feedFormat = result.format;
          span.setAttribute("feed_format", feedFormat);
          console.log(`Parsed ${feedUrl} as ${feedFormat}`);

          await Sentry.addBreadcrumb({
            category: "feed.fetch",
            message: `Parsed feed as ${feedFormat}`,
            level: "info",
            data: { feed_format: feedFormat, source_id: sourceId },
          });
        } catch (error) {
          span.setStatus({ code: 2, message: "Parse failed" });
          const parseError = new Error(
            `Failed to parse feed: ${error instanceof Error ? error.message : "Unknown"}`
          );
          await Sentry.captureException(parseError, {
            level: "error",
            tags: {
              feed_domain: domain || "unknown",
              operation: "feed_parse",
            },
            extra: {
              feed_url: feedUrl,
              source_id: sourceId,
              content_type: contentType,
              content_sample: feedContent.substring(0, 500),
            },
          });
          throw parseError;
        }

        // 3. Update source metadata
        const sourceUpdated = await updateSourceMetadata(sourceId, feed, db);
        span.setAttribute("source_updated", sourceUpdated);

        // 4. Extract and store articles
        const { articlesAdded, articlesSkipped } = await storeArticles(
          sourceId,
          feed,
          db
        );

        span.setAttribute("articles_added", articlesAdded);
        span.setAttribute("articles_skipped", articlesSkipped);
        span.setStatus({ code: 1, message: "ok" });

        // Emit Sentry Metrics for aggregation
        emitCounter("rss.feed_fetched", 1, {
          status: "success",
          domain: extractDomain(feedUrl) || "unknown",
        });

        emitCounter("rss.articles_discovered", articlesAdded, {
          source_id: sourceId.toString(),
        });

        if (articlesSkipped > 0) {
          emitCounter("rss.articles_skipped", articlesSkipped, {
            source_id: sourceId.toString(),
          });
        }

        return {
          articlesAdded,
          articlesSkipped,
          sourceUpdated,
        };
      } catch (error) {
        span.setStatus({ code: 2, message: "Fetch failed" });

        // Emit error metric
        emitCounter("rss.feed_fetched", 1, {
          status: "error",
          domain: extractDomain(feedUrl) || "unknown",
        });

        // Error already captured in specific places, re-throw
        throw error;
      }
    }
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Update source metadata from feed
 */
async function updateSourceMetadata(
  sourceId: number,
  feed: AnyFeed,
  db: Database
): Promise<boolean> {
  const updates: Partial<typeof schema.sources.$inferInsert> = {
    lastFetched: new Date(),
  };

  // Extract metadata (handle different feed formats)
  if ("title" in feed && feed.title) {
    updates.title = typeof feed.title === "string" ? feed.title : feed.title;
  }

  if ("description" in feed && feed.description) {
    updates.description = stripHtml(feed.description);
  } else if ("subtitle" in feed && feed.subtitle) {
    // Atom uses subtitle instead of description
    updates.description = stripHtml(feed.subtitle);
  }

  if ("link" in feed && feed.link) {
    updates.siteUrl = feed.link;
  } else if (
    "links" in feed &&
    Array.isArray(feed.links) &&
    feed.links[0]?.href
  ) {
    // Atom uses links array
    updates.siteUrl = feed.links[0].href;
  }

  // Extract icon URL from feed (for podcasts with iTunes image)
  // Priority: itunes:image > image.url > icon
  const itunesImage = extractItunesImage(feed);
  const feedIconUrl =
    itunesImage ||
    ("image" in feed &&
    typeof feed.image === "object" &&
    feed.image !== null &&
    "url" in feed.image &&
    typeof feed.image.url === "string"
      ? feed.image.url
      : "icon" in feed && typeof feed.icon === "string"
        ? feed.icon
        : undefined);

  // Get current source to check iconType
  const currentSource = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1)
    .then((rows) => rows[0]);

  // Only update icon if:
  // 1. iconType is 'auto' (not custom or none)
  // 2. We found a new icon URL
  // 3. Icon is missing OR different from current icon
  if (
    currentSource &&
    (!currentSource.iconType || currentSource.iconType === "auto") &&
    feedIconUrl &&
    currentSource.iconUrl !== feedIconUrl
  ) {
    updates.iconUrl = feedIconUrl;
    updates.iconUpdatedAt = new Date();
  }

  // Only update if we have something to update (beyond lastFetched)
  if (Object.keys(updates).length > 1) {
    await db
      .update(schema.sources)
      .set(updates)
      .where(eq(schema.sources.id, sourceId));
    return true;
  }

  // Just update lastFetched
  await db
    .update(schema.sources)
    .set({ lastFetched: new Date() })
    .where(eq(schema.sources.id, sourceId));
  return false;
}

/**
 * Store articles from feed
 */
async function storeArticles(
  sourceId: number,
  feed: AnyFeed,
  db: Database
): Promise<{ articlesAdded: number; articlesSkipped: number }> {
  return await Sentry.startSpan(
    {
      op: "feed.store_articles",
      name: "Store Articles",
      attributes: {
        source_id: sourceId,
      },
    },
    async (span) => {
      // Extract items/entries from feed
      const items = extractFeedItems(feed);

      if (!items || items.length === 0) {
        console.warn(`No items found in feed for source ${sourceId}`);
        span.setAttribute("items_found", 0);
        span.setStatus({ code: 1, message: "No items" });
        return { articlesAdded: 0, articlesSkipped: 0 };
      }

      span.setAttribute("items_found", items.length);

      let articlesAdded = 0;
      let articlesSkipped = 0;
      const sampleGuids: string[] = [];

      for (const item of items) {
        try {
          // Generate GUID (required for deduplication)
          const guid = extractGuid(item, sourceId);

          if (!guid) {
            console.warn(
              "Skipping item without guid:",
              item.title || "Untitled"
            );
            articlesSkipped++;
            continue;
          }

          // Log first 5 GUIDs as breadcrumbs
          if (sampleGuids.length < 5) {
            sampleGuids.push(guid);
          }

          // Check if article already exists
          const existing = await db
            .select()
            .from(schema.articles)
            .where(eq(schema.articles.guid, guid))
            .limit(1)
            .then((rows) => rows[0]);

          if (existing) {
            articlesSkipped++;
            continue;
          }

          // Extract article data
          const articleData = await extractArticleData(item, sourceId, guid);

          // Insert article
          await db.insert(schema.articles).values(articleData);
          articlesAdded++;
        } catch (error) {
          console.error("Failed to store article:", error);
          await Sentry.captureException(error, {
            level: "warning",
            tags: {
              operation: "store_article",
              source_id: sourceId.toString(),
            },
            extra: {
              item_title: "title" in item ? item.title : "Unknown",
            },
          });
          // Continue with next article
        }
      }

      if (sampleGuids.length > 0) {
        await Sentry.addBreadcrumb({
          category: "feed.store",
          message: `Processed ${items.length} items from feed`,
          level: "info",
          data: {
            source_id: sourceId,
            articles_added: articlesAdded,
            articles_skipped: articlesSkipped,
            sample_guids: sampleGuids,
          },
        });
      }

      span.setAttribute("articles_added", articlesAdded);
      span.setAttribute("articles_skipped", articlesSkipped);
      span.setStatus({ code: 1, message: "ok" });

      return { articlesAdded, articlesSkipped };
    }
  );
}

/**
 * Extract items/entries from feed (handles different formats)
 */
function extractFeedItems(feed: AnyFeed): AnyItem[] {
  // RSS/RDF use 'items'
  if ("items" in feed && Array.isArray(feed.items)) {
    return feed.items;
  }

  // Atom uses 'entries'
  if ("entries" in feed && Array.isArray(feed.entries)) {
    return feed.entries;
  }

  return [];
}

/**
 * Extract GUID from feed item
 */
function extractGuid(item: AnyItem, sourceId: number): string | null {
  // RSS guid
  if ("guid" in item && item.guid) {
    return typeof item.guid === "string" ? item.guid : item.guid.value || null;
  }

  // Atom id
  if ("id" in item && item.id) {
    return item.id;
  }

  // Fallback to link
  if ("link" in item && item.link) {
    return item.link;
  }

  // For Atom entries with links array
  if ("links" in item && Array.isArray(item.links) && item.links[0]?.href) {
    return item.links[0].href;
  }

  // Last resort: generate from title + date
  if ("title" in item && item.title) {
    const pubDate = extractPublishedDate(item);
    if (pubDate) {
      return `${sourceId}-${item.title}-${pubDate.getTime()}`;
    }
    // Without date, use title alone (not ideal but better than nothing)
    return `${sourceId}-${item.title}`;
  }

  return null;
}

/**
 * Extract published date from feed item
 * Note: feedsmith returns dates as strings, not Date objects
 */
function extractPublishedDate(item: AnyItem): Date | null {
  // Try different date fields (all are strings from feedsmith parser)
  const dateFields = [
    "pubDate",
    "published",
    "updated",
    "date_published",
    "date_modified",
  ] as const;

  for (const field of dateFields) {
    if (field in item) {
      const value = (item as Record<string, unknown>)[field];
      if (typeof value === "string") {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          // Invalid date, try next field
        }
      }
    }
  }

  return null;
}

/**
 * Extract article data from feed item
 */
async function extractArticleData(
  item: AnyItem,
  sourceId: number,
  guid: string
): Promise<typeof schema.articles.$inferInsert> {
  // Title
  const title = ("title" in item && item.title) || "Untitled";

  // Link - handle both RSS/JSON Feed (string) and Atom (links array)
  let link = "";
  if ("link" in item && typeof item.link === "string") {
    link = item.link;
  } else if ("url" in item && typeof item.url === "string") {
    // JSON Feed uses 'url'
    link = item.url;
  } else if (
    "links" in item &&
    Array.isArray(item.links) &&
    item.links[0]?.href
  ) {
    // Atom uses links array
    link = item.links[0].href;
  }

  // Content (try different fields)
  // SECURITY: Strip HTML to prevent XSS and store only plain text
  let rawContent = "";

  // JSON Feed
  if ("content_html" in item && typeof item.content_html === "string") {
    rawContent = item.content_html;
  } else if ("content_text" in item && typeof item.content_text === "string") {
    rawContent = item.content_text;
  }
  // RSS/Atom content
  else if ("content" in item) {
    const itemContent = item.content;
    if (typeof itemContent === "string") {
      rawContent = itemContent;
    } else if (
      itemContent &&
      typeof itemContent === "object" &&
      "value" in itemContent
    ) {
      // Atom content object
      rawContent = String(itemContent.value || "");
    }
  }
  // Content namespace (RSS)
  else if ("content:encoded" in item) {
    const encoded = (item as Record<string, unknown>)["content:encoded"];
    if (typeof encoded === "string") {
      rawContent = encoded;
    }
  }

  // Strip HTML from content and truncate to prevent bloat
  const content = truncateText(stripHtml(rawContent), 500000); // 500KB max

  // Description (separate from content)
  // SECURITY: Sanitize HTML to allow safe tags (links, formatting) while preventing XSS
  let rawDescription = "";
  if ("description" in item && typeof item.description === "string") {
    rawDescription = item.description;
  } else if ("summary" in item && typeof item.summary === "string") {
    rawDescription = item.summary;
  } else if ("contentSnippet" in item) {
    const snippet = (item as Record<string, unknown>).contentSnippet;
    if (typeof snippet === "string") {
      rawDescription = snippet;
    }
  } else if (rawContent) {
    // Generate description from content
    rawDescription = rawContent;
  }

  // Sanitize HTML first (allow safe tags like links), then truncate safely
  // Pass alreadySanitized flag to avoid double-sanitization
  let sanitizedDescription = sanitizeHtml(rawDescription);

  // Clean up feed-specific patterns
  // Remove empty <a> tags (Reddit thumbnail wrappers, etc.)
  sanitizedDescription = sanitizedDescription.replace(
    /<a[^>]*>\s*<\/a>\s*/gi,
    ""
  );

  // Remove "submitted by /u/username" text and links (Reddit)
  // Handle both with and without spaces around username
  sanitizedDescription = sanitizedDescription.replace(
    /submitted by\s*<a[^>]*>\s*\/u\/[^<]+\s*<\/a>\s*/gi,
    ""
  );
  sanitizedDescription = sanitizedDescription.replace(
    /submitted by\s*\/u\/\S+\s*/gi,
    ""
  );

  // Remove "to r/subreddit" links (Reddit)
  sanitizedDescription = sanitizedDescription.replace(
    /to\s*<a[^>]*>\s*r\/[^<]+\s*<\/a>\s*/gi,
    ""
  );

  // Remove [link] and [comments] links (Reddit - we have proper buttons)
  sanitizedDescription = sanitizedDescription.replace(
    /<a[^>]*>\[link\]<\/a>\s*/gi,
    ""
  );
  sanitizedDescription = sanitizedDescription.replace(
    /<a[^>]*>\[comments\]<\/a>\s*/gi,
    ""
  );

  // Remove standalone "Comments" link (Hacker News)
  // Note: Anchors (^ and $) are intentional - only remove when entire description
  // is just a "Comments" link. Preserve "Comments" within actual content.
  sanitizedDescription = sanitizedDescription.replace(
    /^<a[^>]*>Comments<\/a>$/gi,
    ""
  );

  // Clean up extra whitespace and line breaks
  // Note: Intentionally collapses multiple breaks to improve readability.
  // Reddit/HN feeds often have excessive spacing that clutters the UI.
  sanitizedDescription = sanitizedDescription
    .replace(/(<br\s*\/?\s*>\s*){2,}/gi, "<br>") // Collapse multiple <br> tags
    .replace(/<br\s*\/?\s*>\s*$/gi, "") // Remove trailing <br>
    .replace(/^\s*<br\s*\/?\s*>/gi, "") // Remove leading <br>
    .trim();

  // If description is only whitespace/breaks after cleanup, return empty
  const contentWithoutBr = sanitizedDescription
    .replace(/<br\s*\/?\s*>/gi, "")
    .trim();
  if (contentWithoutBr.length === 0 || contentWithoutBr === "/>") {
    sanitizedDescription = "";
  }

  const description = truncateHtml(sanitizedDescription, 5000, "...", {
    alreadySanitized: true,
  });

  // Author
  let author: string | undefined = undefined;

  // RSS string author or Atom/JSON Feed author object
  if ("authors" in item && Array.isArray(item.authors) && item.authors[0]) {
    const firstAuthor = item.authors[0];
    author =
      typeof firstAuthor === "string"
        ? firstAuthor
        : firstAuthor.name || undefined;
  } else if ("author" in item) {
    const itemAuthor = (item as Record<string, unknown>).author;
    author =
      typeof itemAuthor === "string"
        ? itemAuthor
        : (itemAuthor as { name?: string })?.name || undefined;
  } else if ("creator" in item) {
    const creator = (item as Record<string, unknown>).creator;
    if (typeof creator === "string") {
      author = creator;
    }
  }
  // Dublin Core creator
  else if ("dc" in item) {
    const dc = (item as Record<string, unknown>).dc as
      | { creator?: string | string[] }
      | undefined;
    if (dc?.creator) {
      author = Array.isArray(dc.creator) ? dc.creator[0] : dc.creator;
    }
  }

  // Image URL
  let imageUrl: string | undefined = undefined;

  // Priority 1: iTunes image (podcasts)
  const itunesImageUrl = extractItunesImage(item);
  if (itunesImageUrl) {
    imageUrl = itunesImageUrl;
  }

  // Priority 2: JSON Feed image
  if (!imageUrl && "image" in item && typeof item.image === "string") {
    imageUrl = item.image;
  }

  // Priority 3: RSS image enclosure
  if (!imageUrl && "enclosures" in item && Array.isArray(item.enclosures)) {
    const imageEnclosure = item.enclosures.find((enc) =>
      enc.type?.startsWith("image/")
    );
    if (imageEnclosure?.url) {
      imageUrl = imageEnclosure.url;
    }
  }

  // Priority 4: Media RSS namespace
  if (!imageUrl && "media" in item) {
    const media = (item as Record<string, unknown>).media as
      | {
          thumbnail?: { url?: string };
          content?: Array<{ type?: string; url?: string }>;
        }
      | undefined;

    if (media?.thumbnail?.url) {
      imageUrl = media.thumbnail.url;
    } else if (Array.isArray(media?.content)) {
      const imageContent = media.content.find((c) =>
        c.type?.startsWith("image/")
      );
      if (imageContent?.url) {
        imageUrl = imageContent.url;
      }
    }
  }

  // Final fallback: OpenGraph image from article URL
  if (!imageUrl && link) {
    await Sentry.startSpan(
      {
        op: "http.client",
        name: "Fetch OpenGraph Image",
        attributes: {
          "http.url": link,
          "og.domain": extractDomain(link),
        },
      },
      async (span) => {
        try {
          const ogImage = await extractOgImage(link);
          if (ogImage) {
            imageUrl = ogImage;
            span.setAttribute("og.found", true);
            span.setStatus({ code: 1, message: "ok" });
          } else {
            span.setAttribute("og.found", false);
            span.setStatus({ code: 1, message: "no image found" });
          }
        } catch (error) {
          // Track OG fetch failures for pattern analysis
          span.setAttribute(
            "og.error",
            error instanceof Error ? error.message : String(error)
          );
          span.setStatus({ code: 2, message: "fetch failed" });

          // Don't spam Sentry with every OG failure, but track metrics
          emitCounter("og_image.fetch_error", 1, {
            domain: extractDomain(link),
            error_type: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    );
  }

  // Audio URL from enclosures (for podcasts)
  let audioUrl: string | undefined = undefined;
  if ("enclosures" in item && Array.isArray(item.enclosures)) {
    const audioEnclosure = item.enclosures.find((enc) =>
      enc.type?.startsWith("audio/")
    );
    if (audioEnclosure?.url) {
      audioUrl = audioEnclosure.url;
    }
  }

  // Published date
  const publishedAt = extractPublishedDate(item);

  // Comment link
  const commentLink = extractCommentLink(item);

  return {
    sourceId,
    guid,
    title: String(title),
    link,
    content,
    description,
    author,
    imageUrl,
    audioUrl,
    commentLink,
    publishedAt,
  };
}

/**
 * Fetch and parse a feed without storing (for preview/discovery)
 */
export async function fetchAndParseFeed(feedUrl: string): Promise<AnyFeed> {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent":
        "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const feedContent = await response.text();
  const { feed } = parseFeed(feedContent);

  return feed as AnyFeed;
}
