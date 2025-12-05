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
import { eq, inArray, or, isNull, lt } from "drizzle-orm";
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
import { chunkArray, D1_MAX_PARAMETERS, supportsBatch } from "@/db/utils";
import { emitCounter, emitGauge, withTiming } from "@/utils/metrics";
import { extractItunesImage } from "@/utils/feed-utils";
import { extractCommentLink } from "./comment-link-extraction";

// =============================================================================
// Constants
// =============================================================================

/** HTTP configuration for feed fetching */
const FETCH_CONFIG = {
  userAgent: "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
  accept:
    "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  timeoutMs: 30000, // 30 seconds
} as const;

/** Delays between feed processing to prevent rate limiting */
const PROCESSING_DELAYS = {
  betweenFeeds: 500, // 500ms between successful fetches
  afterError: 1000, // 1s after errors to back off
} as const;

/** Limits for content processing and batching */
const LIMITS = {
  batchInsertChunkSize: 50, // Articles per batch insert
  contentMaxBytes: 500000, // 500KB max for article content
  descriptionMaxChars: 5000, // Max chars for article description
} as const;

/** Default configuration for staleness-based filtering */
const STALENESS_DEFAULTS = {
  thresholdMinutes: 30, // Process feeds older than 30 minutes
  batchSize: 20, // Feeds per batch (optimized for D1 query limits)
} as const;

// =============================================================================
// Types
// =============================================================================

/**
 * Result from fetchAllFeeds batch operation
 */
export interface FetchResult {
  /** Number of feeds successfully fetched and processed */
  successCount: number;
  /** Number of feeds that failed to fetch or process */
  errorCount: number;
  /** Total number of feeds processed in this batch (successCount + errorCount) */
  processedCount: number;
  /** Detailed error information for failed feeds */
  errors: Array<{ sourceId: number; url: string; error: string }>;
}

/**
 * Result from fetchSingleFeed operation
 */
export interface FetchSingleResult {
  /** Number of new articles added to database */
  articlesAdded: number;
  /** Number of articles skipped (already exist or invalid) */
  articlesSkipped: number;
  /** Whether source metadata was updated */
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
// Query Helpers
// =============================================================================

/**
 * Build WHERE clause for staleness filtering
 */
function buildStalenessWhereClause(staleThreshold: Date) {
  return or(
    isNull(schema.sources.lastFetched), // Never fetched
    lt(schema.sources.lastFetched, staleThreshold) // Older than threshold
  );
}

/**
 * Get stale sources that need fetching
 */
async function getStaleSources(
  db: Database,
  staleThreshold: Date,
  limit: number
) {
  return await db
    .select()
    .from(schema.sources)
    .where(buildStalenessWhereClause(staleThreshold))
    .orderBy(schema.sources.lastFetched)
    .limit(limit);
}

/**
 * Get total count of all sources using SQL COUNT aggregation
 */
async function getTotalSourcesCount(db: Database): Promise<number> {
  return await db.$count(schema.sources);
}

/**
 * Get count of stale sources using SQL COUNT aggregation
 */
async function getStaleSourcesCount(
  db: Database,
  staleThreshold: Date
): Promise<number> {
  return await db.$count(
    schema.sources,
    buildStalenessWhereClause(staleThreshold)
  );
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Fetch all feeds from the database and update articles
 *
 * Implements batching to process a limited number of feeds per execution
 * to stay within Cloudflare Workers' CPU time and API request limits.
 */
export async function fetchAllFeeds(
  db: Database,
  options?: {
    maxFeedsPerBatch?: number;
    stalenessThresholdMinutes?: number;
  }
): Promise<FetchResult> {
  return await withTiming(
    "rss.fetch_all_duration",
    async () => {
      // Default to 20 feeds per batch to stay under D1 query limits per invocation
      // With 1-minute cron frequency, this processes 1,200 feeds/hour
      // Lower batch size prevents "Too many API requests by single worker invocation" errors
      const maxFeedsPerBatch =
        options?.maxFeedsPerBatch ?? STALENESS_DEFAULTS.batchSize;

      // Default to 30-minute staleness threshold (Phase 2: Staleness-based filtering)
      // Only process feeds that haven't been fetched in the last N minutes
      // This prevents wasting resources on recently-fetched feeds
      const stalenessThresholdMinutes =
        options?.stalenessThresholdMinutes ??
        STALENESS_DEFAULTS.thresholdMinutes;
      const staleThreshold = new Date(
        Date.now() - stalenessThresholdMinutes * 60 * 1000
      );

      // Get sources that are "stale" (not fetched recently)
      // Ordered by lastFetched (oldest first, null first)
      // This ensures we rotate through all feeds over time
      // IMPORTANT: Use .limit() server-side to avoid loading all feeds into memory
      const sources = await getStaleSources(
        db,
        staleThreshold,
        maxFeedsPerBatch
      );

      // Get metrics for monitoring
      const totalSources = await getTotalSourcesCount(db);
      const totalStaleFeeds = await getStaleSourcesCount(db, staleThreshold);

      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{ sourceId: number; url: string; error: string }> =
        [];

      console.log(
        `Starting fetch for ${sources.length} sources (${totalStaleFeeds} stale feeds, ${totalSources} total, batch size: ${maxFeedsPerBatch}, staleness threshold: ${stalenessThresholdMinutes}min)`
      );

      // Emit gauge for total sources
      emitGauge("rss.sources_total", totalSources);
      emitGauge("rss.sources_stale", totalStaleFeeds);
      emitGauge("rss.sources_in_batch", sources.length);

      // Fetch blocked domains once per batch (not per feed)
      // This reduces 20 redundant queries per batch to just 1
      const blockedDomainsList = await getBlockedDomains(db);

      for (const source of sources) {
        try {
          const result = await fetchSingleFeed(
            source.id,
            source.url,
            db,
            blockedDomainsList
          );
          console.log(
            `✓ Fetched ${source.url}: ${result.articlesAdded} new, ${result.articlesSkipped} skipped`
          );
          successCount++;

          // Add small delay between feeds to avoid rate limiting
          // This helps prevent HTTP 429 errors from external APIs
          if (sources.length > 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, PROCESSING_DELAYS.betweenFeeds)
            );
          }
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

          // Add longer delay after errors to back off from rate limits
          if (sources.length > 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, PROCESSING_DELAYS.afterError)
            );
          }
        }
      }

      console.log(
        `Fetch complete: ${successCount} succeeded, ${errorCount} failed out of ${sources.length} (batch ${sources.length}/${totalSources})`
      );

      // Emit aggregate metrics
      emitCounter("rss.batch_completed", 1, {
        success_count: successCount.toString(),
        error_count: errorCount.toString(),
        batch_size: sources.length.toString(),
        total_sources: totalSources.toString(),
      });

      return {
        successCount,
        errorCount,
        processedCount: sources.length,
        errors,
      };
    },
    { operation: "fetch_all_feeds" }
  );
}

/**
 * Fetch a single feed and store new articles
 *
 * @param blockedDomainsList - Optional pre-fetched list of blocked domains (avoids redundant queries in batch processing)
 */
export async function fetchSingleFeed(
  sourceId: number,
  feedUrl: string,
  db: Database,
  blockedDomainsList?: Awaited<ReturnType<typeof getBlockedDomains>>
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
        // Note: This check happens at fetch-time to avoid wasting HTTP requests
        // on blocked domains. Enterprise user bypass is handled at article
        // delivery time (query filtering), not here.
        const domain = extractDomain(feedUrl);
        if (domain) {
          // Use cached list if provided (batch processing), otherwise fetch
          const domainsToCheck =
            blockedDomainsList ?? (await getBlockedDomains(db));

          const blockedDomains = domainsToCheck.map((b) => b.domain);
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

        await Sentry.addBreadcrumb({
          category: "feed.fetch",
          message: `Fetching feed from ${feedUrl}`,
          level: "info",
          data: { feed_url: feedUrl, source_id: sourceId },
        });

        // 1. Fetch feed with timeout
        const response = await fetch(feedUrl, {
          headers: {
            "User-Agent": FETCH_CONFIG.userAgent,
            Accept: FETCH_CONFIG.accept,
          },
          signal: AbortSignal.timeout(FETCH_CONFIG.timeoutMs),
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
    updates.title = feed.title;
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

      let articlesSkipped = 0;
      const guidSamplesForLogging: string[] = [];

      // Step 1: Extract GUIDs from all items
      const validItems: Array<{ item: AnyItem; guid: string }> = [];

      for (const item of items) {
        const guid = extractGuid(item, sourceId);

        if (!guid) {
          console.warn("Skipping item without guid:", item.title || "Untitled");
          articlesSkipped++;
          continue;
        }

        // Log first 5 GUIDs as breadcrumbs
        if (guidSamplesForLogging.length < 5) {
          guidSamplesForLogging.push(guid);
        }

        validItems.push({ item, guid });
      }

      if (validItems.length === 0) {
        span.setAttribute("articles_added", 0);
        span.setAttribute("articles_skipped", articlesSkipped);
        span.setStatus({ code: 1, message: "No valid items" });
        return { articlesAdded: 0, articlesSkipped };
      }

      // Step 2: Batch check which articles already exist
      // Split into chunks to respect D1 parameter limits
      const allGuids = validItems.map((x) => x.guid);
      const guidChunks = chunkArray(allGuids, D1_MAX_PARAMETERS - 1);
      const existingGuids = new Set<string>();

      for (const chunk of guidChunks) {
        const existingArticles = await db
          .select()
          .from(schema.articles)
          .where(inArray(schema.articles.guid, chunk));

        for (const article of existingArticles) {
          existingGuids.add(article.guid);
        }
      }

      // Step 3: Filter out existing articles and extract data for new ones
      const newArticles: Array<typeof schema.articles.$inferInsert> = [];

      for (const { item, guid } of validItems) {
        if (existingGuids.has(guid)) {
          articlesSkipped++;
          continue;
        }

        try {
          // Extract article data (skip OG image fetching during cron to save HTTP requests)
          const articleData = await extractArticleData(
            item,
            sourceId,
            guid,
            true
          );
          newArticles.push(articleData);
        } catch (error) {
          console.error("Failed to extract article data:", error);
          await Sentry.captureException(error, {
            level: "warning",
            tags: {
              operation: "extract_article_data",
              source_id: sourceId.toString(),
            },
            extra: {
              item_title: "title" in item ? item.title : "Unknown",
            },
          });
          articlesSkipped++;
          // Continue with next article
        }
      }

      // Step 4: Batch insert all new articles
      let articlesAdded = 0;

      if (newArticles.length > 0) {
        // Split into chunks for batch insert (D1 batch API supports multiple statements)
        const insertChunks = chunkArray(
          newArticles,
          LIMITS.batchInsertChunkSize
        );

        for (const chunk of insertChunks) {
          try {
            // Use batch API if available (Cloudflare D1), otherwise insert sequentially
            if (supportsBatch(db)) {
              const statements = chunk.map((data) =>
                db.insert(schema.articles).values(data)
              );
              // Type assertion needed: Drizzle's insert() returns PgInsertBase which doesn't match DatabaseWithBatch's expected type
              // This is safe because D1's batch() accepts Drizzle insert statements
              await db.batch(
                statements as Array<{ execute: () => Promise<unknown> }>
              );
              articlesAdded += chunk.length;
            } else {
              // Fallback for better-sqlite3 (local dev)
              for (const data of chunk) {
                await db.insert(schema.articles).values(data);
                articlesAdded++;
              }
            }
          } catch (error) {
            console.error("Failed to batch insert articles:", error);
            await Sentry.captureException(error, {
              level: "warning",
              tags: {
                operation: "batch_insert_articles",
                source_id: sourceId.toString(),
              },
              extra: {
                chunk_size: chunk.length,
              },
            });
            // Try inserting one by one as fallback
            for (const data of chunk) {
              try {
                await db.insert(schema.articles).values(data);
                articlesAdded++;
              } catch (insertError) {
                console.error(
                  "Failed to insert individual article:",
                  insertError
                );
                articlesSkipped++;
              }
            }
          }
        }
      }

      if (guidSamplesForLogging.length > 0) {
        await Sentry.addBreadcrumb({
          category: "feed.store",
          message: `Processed ${items.length} items from feed`,
          level: "info",
          data: {
            source_id: sourceId,
            articles_added: articlesAdded,
            articles_skipped: articlesSkipped,
            sample_guids: guidSamplesForLogging,
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
 * Extract article content from feed item
 */
function extractArticleContent(item: AnyItem): string {
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
  return truncateText(stripHtml(rawContent), LIMITS.contentMaxBytes);
}

/**
 * Extract article description from feed item
 */
function extractArticleDescription(item: AnyItem, rawContent: string): string {
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
  let sanitizedDescription = sanitizeHtml(rawDescription);

  // Clean up feed-specific patterns
  // Remove empty <a> tags (Reddit thumbnail wrappers, etc.)
  sanitizedDescription = sanitizedDescription.replace(
    /<a[^>]*>\s*<\/a>\s*/gi,
    ""
  );

  // Remove "submitted by /u/username" text and links (Reddit)
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

  // Remove [link] and [comments] links (Reddit)
  sanitizedDescription = sanitizedDescription.replace(
    /<a[^>]*>\[link\]<\/a>\s*/gi,
    ""
  );
  sanitizedDescription = sanitizedDescription.replace(
    /<a[^>]*>\[comments\]<\/a>\s*/gi,
    ""
  );

  // Remove standalone "Comments" link (Hacker News)
  sanitizedDescription = sanitizedDescription.replace(
    /^<a[^>]*>Comments<\/a>$/gi,
    ""
  );

  // Clean up extra whitespace and line breaks
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

  return truncateHtml(sanitizedDescription, LIMITS.descriptionMaxChars, "...", {
    alreadySanitized: true,
  });
}

/**
 * Extract article author from feed item
 */
function extractArticleAuthor(item: AnyItem): string | undefined {
  // RSS string author or Atom/JSON Feed author object
  if ("authors" in item && Array.isArray(item.authors) && item.authors[0]) {
    const firstAuthor = item.authors[0];
    return typeof firstAuthor === "string"
      ? firstAuthor
      : firstAuthor.name || undefined;
  } else if ("author" in item) {
    const itemAuthor = (item as Record<string, unknown>).author;
    return typeof itemAuthor === "string"
      ? itemAuthor
      : (itemAuthor as { name?: string })?.name || undefined;
  } else if ("creator" in item) {
    const creator = (item as Record<string, unknown>).creator;
    if (typeof creator === "string") {
      return creator;
    }
  }
  // Dublin Core creator
  else if ("dc" in item) {
    const dc = (item as Record<string, unknown>).dc as
      | { creator?: string | string[] }
      | undefined;
    if (dc?.creator) {
      return Array.isArray(dc.creator) ? dc.creator[0] : dc.creator;
    }
  }

  return undefined;
}

/**
 * Extract article image URL from feed item
 */
async function extractArticleImage(
  item: AnyItem,
  link: string,
  skipOgImageFetch: boolean
): Promise<string | undefined> {
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
  // Skip during cron job to reduce HTTP requests
  if (!imageUrl && link && !skipOgImageFetch) {
    await Sentry.startSpan(
      {
        op: "http.client",
        name: "Fetch OpenGraph Image",
        attributes: {
          "http.url": link,
          "og.domain": extractDomain(link) ?? "unknown",
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
            domain: extractDomain(link) ?? "unknown",
            error_type: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    );
  }

  return imageUrl;
}

/**
 * Extract audio URL from feed item (for podcasts)
 */
function extractArticleAudio(item: AnyItem): string | undefined {
  if ("enclosures" in item && Array.isArray(item.enclosures)) {
    const audioEnclosure = item.enclosures.find((enc) =>
      enc.type?.startsWith("audio/")
    );
    if (audioEnclosure?.url) {
      return audioEnclosure.url;
    }
  }
  return undefined;
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
 *
 * Orchestrates extraction of all article fields by delegating to focused helper functions.
 */
async function extractArticleData(
  item: AnyItem,
  sourceId: number,
  guid: string,
  skipOgImageFetch = false
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

  // Extract article fields using focused helpers
  const content = extractArticleContent(item);
  const description = extractArticleDescription(item, content);
  const author = extractArticleAuthor(item);
  const imageUrl = await extractArticleImage(item, link, skipOgImageFetch);
  const audioUrl = extractArticleAudio(item);
  const publishedAt = extractPublishedDate(item);
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
      "User-Agent": FETCH_CONFIG.userAgent,
      Accept: FETCH_CONFIG.accept,
    },
    signal: AbortSignal.timeout(FETCH_CONFIG.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const feedContent = await response.text();
  const { feed } = parseFeed(feedContent);

  return feed as AnyFeed;
}
