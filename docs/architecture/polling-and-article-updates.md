# Polling and Article Update System

## Overview

TuvixRSS uses a **scheduled polling system** to automatically fetch RSS/Atom feeds at configurable intervals. The system is designed to work seamlessly across two deployment models:

- **Node.js (Docker)**: Uses `node-cron` for scheduling
- **Cloudflare Workers**: Uses Workers scheduled events

This document provides a comprehensive guide to understanding and working with the polling and article update system.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Polling Configuration](#polling-configuration)
- [Feed Fetching Process](#feed-fetching-process)
- [Article Parsing and Storage](#article-parsing-and-storage)
- [Blocked Domains](#blocked-domains)
- [Deduplication Strategy](#deduplication-strategy)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Article Pruning](#article-pruning)
- [Performance Characteristics](#performance-characteristics)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

### Scheduling System

The polling system uses different schedulers depending on the deployment environment:

#### Node.js/Docker Deployment

**File**: `packages/api/src/cron/scheduler.ts:44-85`

- Uses `node-cron` package (v4.2.1)
- Initialized on server startup via `initCronJobs(env)`
- Creates two scheduled jobs:
  - **RSS Fetch**: Dynamic interval based on `globalSettings.fetchIntervalMinutes`
  - **Article Prune**: Daily at 2:00 AM

```typescript
export async function initCronJobs(env: Env) {
  const settings = await getGlobalSettings(env.DB);

  // RSS fetch job
  const fetchCron = intervalMinutesToCron(settings.fetchIntervalMinutes);
  cron.schedule(fetchCron, () => handleRSSFetch(env));

  // Prune job (daily at 2:00 AM)
  cron.schedule("0 2 * * *", () => handleArticlePrune(env));
}
```

#### Cloudflare Workers Deployment

**File**: `packages/api/src/adapters/cloudflare.ts:286-364`

- Uses Workers `scheduled()` event handler
- Triggered by cron triggers defined in `wrangler.toml`
- Checks timestamps to determine if jobs should run:
  - **RSS fetch**: Runs if `lastRssFetchAt` is older than `fetchIntervalMinutes`
  - **Article prune**: Runs if `lastPruneAt` is older than 24 hours

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const settings = await getGlobalSettings(env.DB);
    const now = Date.now();

    // Check if RSS fetch is due
    const fetchInterval = settings.fetchIntervalMinutes * 60 * 1000;
    if (now - settings.lastRssFetchAt > fetchInterval) {
      ctx.waitUntil(handleRSSFetch(env));
    }

    // Check if prune is due
    const pruneInterval = 24 * 60 * 60 * 1000; // 24 hours
    if (now - settings.lastPruneAt > pruneInterval) {
      ctx.waitUntil(handleArticlePrune(env));
    }
  },
};
```

### Cron Expression Generation

**File**: `packages/api/src/cron/scheduler.ts:20-39`

The system converts minute intervals to cron expressions:

```typescript
export function intervalMinutesToCron(minutes: number): string {
  if (minutes <= 60) {
    return `*/${minutes} * * * *`; // Every N minutes
  }

  const hours = Math.floor(minutes / 60);
  if (minutes === 1440) {
    // 24 hours
    return "0 0 * * *"; // Daily at midnight
  }

  return `0 */${hours} * * *`; // Every N hours
}
```

**Examples**:

- 15 minutes → `*/15 * * * *`
- 60 minutes → `*/60 * * * *`
- 120 minutes → `0 */2 * * *`
- 1440 minutes → `0 0 * * *`

## Polling Configuration

### Global Settings

**Database Table**: `global_settings` (singleton, id=1)
**Schema File**: `packages/api/src/db/schema.ts:405-453`

```typescript
export const globalSettings = sqliteTable("global_settings", {
  id: integer("id").primaryKey().default(1),
  fetchIntervalMinutes: integer("fetch_interval_minutes").notNull().default(60), // Poll every 60 minutes
  pruneDays: integer("prune_days").notNull().default(30), // Keep articles for 30 days
  lastRssFetchAt: integer("last_rss_fetch_at", { mode: "timestamp" }),
  lastPruneAt: integer("last_prune_at", { mode: "timestamp" }),
});
```

### Configuration Options

| Setting                | Default | Min | Max  | Description                                              |
| ---------------------- | ------- | --- | ---- | -------------------------------------------------------- |
| `fetchIntervalMinutes` | 60      | 5   | 1440 | How often to poll all feeds (minutes)                    |
| `pruneDays`            | 30      | 0   | 365  | Age threshold for automatic article deletion             |
| `lastRssFetchAt`       | null    | -   | -    | Timestamp of last successful RSS fetch (Cloudflare only) |
| `lastPruneAt`          | null    | -   | -    | Timestamp of last prune operation (Cloudflare only)      |

### Updating Configuration

**Via Admin API**:

```typescript
// Change poll interval to 30 minutes
await trpc.admin.updateGlobalSettings.mutate({
  fetchIntervalMinutes: 30,
});

// Change retention to 90 days
await trpc.admin.updateGlobalSettings.mutate({
  pruneDays: 90,
});
```

**Via Admin UI**: Navigate to `/app/admin/settings`

## Feed Fetching Process

### Entry Points

There are two ways feed fetching can be triggered:

#### 1. Scheduled Fetch (Automatic)

**File**: `packages/api/src/cron/handlers.ts:22-38`

```typescript
export async function handleRSSFetch(env: Env) {
  console.log("Starting scheduled RSS fetch");

  const result = await fetchAllFeeds(env.DB);

  console.log(
    `RSS fetch complete: ${result.successCount} succeeded, ${result.errorCount} failed`
  );

  // Update last fetch timestamp (Cloudflare only)
  if (env.ENVIRONMENT === "cloudflare") {
    await updateLastRssFetchAt(env.DB, Date.now());
  }
}
```

**Triggered By**:

- Node.js: `node-cron` schedule
- Cloudflare: Workers `scheduled()` event

#### 2. Manual Refresh (User-Triggered)

**File**: `packages/api/src/routers/articles.ts:707-733`

```typescript
refresh: rateLimitedProcedure.mutation(async ({ ctx }) => {
  // Run in background (non-blocking)
  void fetchAllFeeds(ctx.env.DB).then((result) => {
    console.log(`Manual refresh: ${result.successCount} succeeded`);
  });

  return { success: true };
});
```

**Triggered By**: User clicking "Refresh" button in UI
**Rate Limited**: Yes (per user plan)
**Blocking**: No (fire-and-forget)

### Core Fetch Logic

#### fetchAllFeeds() - Overview

**File**: `packages/api/src/services/rss-fetcher.ts:157-274`

Fetches RSS sources using **staleness-based filtering** to avoid unnecessary work.

```typescript
export async function fetchAllFeeds(
  db: Database,
  options?: {
    stalenessThresholdMinutes?: number;
    maxFeedsPerBatch?: number;
  }
): Promise<FetchResult> {
  const stalenessThresholdMinutes =
    options?.stalenessThresholdMinutes ?? STALENESS_DEFAULTS.thresholdMinutes;
  const maxFeedsPerBatch =
    options?.maxFeedsPerBatch ?? STALENESS_DEFAULTS.batchSize;

  // Calculate staleness threshold (only fetch feeds older than this)
  const staleThreshold = new Date(
    Date.now() - stalenessThresholdMinutes * 60 * 1000
  );

  // Get stale sources (null lastFetched OR lastFetched < threshold)
  const sources = await getStaleSources(db, staleThreshold, maxFeedsPerBatch);

  // Get counts for logging
  const totalSources = await getTotalSourcesCount(db);
  const totalStaleFeeds = await getStaleSourcesCount(db, staleThreshold);

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ sourceId: number; url: string; error: string }> = [];

  for (const source of sources) {
    try {
      await fetchSingleFeed(source.id, source.url, db);
      successCount++;

      // Delay between feeds to avoid rate limits
      if (sources.length > 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, PROCESSING_DELAYS.betweenFeeds)
        );
      }
    } catch (error) {
      errorCount++;
      errors.push({
        sourceId: source.id,
        url: source.url,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Longer delay after errors
      if (sources.length > 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, PROCESSING_DELAYS.afterError)
        );
      }
    }
  }

  return { successCount, errorCount, processedCount: sources.length, errors };
}
```

**Return Type**:

```typescript
/**
 * Result of fetching multiple RSS feeds
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
```

**Staleness Filtering**:

The system only fetches feeds that are "stale" (haven't been updated recently):

- **Never fetched**: Feeds with `lastFetched = null` are always fetched
- **Stale feeds**: Feeds where `lastFetched < (now - stalenessThresholdMinutes)`
- **Fresh feeds**: Feeds recently updated are skipped until they become stale

**Default Configuration**:

```typescript
const STALENESS_DEFAULTS = {
  thresholdMinutes: 30, // Only fetch feeds older than 30 minutes
  batchSize: 20, // Process up to 20 stale feeds per cron run
};
```

**Query Helpers**:

```typescript
// Build WHERE clause for stale feeds
function buildStalenessWhereClause(staleThreshold: Date) {
  return or(
    isNull(schema.sources.lastFetched),
    lt(schema.sources.lastFetched, staleThreshold)
  );
}

// Get stale sources ordered by lastFetched (oldest first)
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
```

**Characteristics**:

- ✅ **Staleness filtering**: Only fetches feeds that need updating (massive efficiency gain)
- ✅ **Batch limiting**: Processes fixed number of feeds per run (predictable execution time)
- ✅ **Sequential processing**: One feed at a time (resource-friendly)
- ✅ **Error isolation**: Failure doesn't stop other feeds
- ✅ **Rate limit protection**: 500ms delay between feeds, 1000ms after errors
- ✅ **Oldest-first priority**: Ensures all feeds eventually get updated
- ❌ **No parallelization**: Could be slow for very large batches
- ❌ **No retry logic**: Waits for next scheduled poll

**Scalability**:

With staleness filtering, the system can efficiently handle large feed counts:

- **100 feeds**: ~5 minute rotation with 20/batch, 1-minute cron
- **1,000 feeds**: ~50 minute rotation with 20/batch, 1-minute cron
- **5,000 feeds**: ~4 hour rotation with 20/batch, 1-minute cron

Each feed is guaranteed to be checked within the rotation period, with fresh feeds skipped to save resources.

#### fetchSingleFeed() - Detailed Flow

**File**: `packages/api/src/services/rss-fetcher.ts:279-510`

Fetches and processes a single RSS/Atom feed with full Sentry tracing.

```typescript
export async function fetchSingleFeed(
  sourceId: number,
  feedUrl: string,
  db: Database
): Promise<SingleFeedResult> {
  return await Sentry.startSpan(
    {
      op: "rss.fetch_single_feed",
      name: `Fetch feed ${sourceId}`,
      attributes: {
        source_id: sourceId,
        feed_url: feedUrl,
      },
    },
    async (span) => {
      try {
        // Step 1: HTTP Fetch with timeout
        const response = await fetch(feedUrl, {
          signal: AbortSignal.timeout(FETCH_CONFIG.timeoutMs),
          headers: {
            "User-Agent": FETCH_CONFIG.userAgent,
            Accept: FETCH_CONFIG.accept,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const content = await response.text();

        // Step 2: Parse Feed
        const { feed } = await parseFeed(content);

        // Step 3: Update Source Metadata
        const sourceUpdated = await updateSourceMetadata(sourceId, feed, db);

        // Step 4: Store Articles
        const { articlesAdded, articlesSkipped } = await storeArticles(
          sourceId,
          feed,
          db
        );

        span.setStatus({ code: 1, message: "ok" });
        return { articlesAdded, articlesSkipped, sourceUpdated };
      } catch (error) {
        span.setStatus({ code: 2, message: "Fetch failed" });
        throw error;
      }
    }
  );
}
```

**Configuration Constants**:

```typescript
const FETCH_CONFIG = {
  userAgent: "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
  accept:
    "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  timeoutMs: 30000,
} as const;

const PROCESSING_DELAYS = {
  betweenFeeds: 500, // 500ms between successful fetches
  afterError: 1000, // 1000ms after errors (backoff)
} as const;

const LIMITS = {
  batchInsertChunkSize: 50, // Max articles per batch insert
  contentMaxBytes: 500000, // 500 KB max content size
  descriptionMaxChars: 5000, // 5 KB max description
} as const;
```

**Process Steps**:

1. **HTTP Fetch**
   - 30-second timeout via `AbortSignal.timeout(30000)`
   - Custom User-Agent: `TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)`
   - Accepts RSS, Atom, XML, and wildcard MIME types
   - Throws on HTTP errors (404, 500, timeouts, etc.)

2. **Parse Feed**
   - Uses `feedsmith` library
   - Auto-detects format: RSS 2.0, RSS 1.0, Atom, JSON Feed
   - Throws on parse errors (malformed XML/JSON)

3. **Update Source Metadata**
   - Updates feed metadata (title, description, siteUrl)
   - Updates `lastFetched` timestamp to current time
   - Returns `true` if updates were applied

4. **Store Articles**
   - Extracts article data using focused helper functions
   - Performs batch duplicate checking (via SQL IN clause)
   - Inserts new articles in chunks of 50 (batch API or sequential)
   - Skips articles that already exist (by GUID)

**Return Type**:

```typescript
/**
 * Result of fetching a single RSS feed
 */
export interface SingleFeedResult {
  /** Number of new articles added to the database */
  articlesAdded: number;
  /** Number of articles skipped (already exist) */
  articlesSkipped: number;
  /** Whether source metadata was updated */
  sourceUpdated: boolean;
}
```

**Observability**:

All operations are wrapped in Sentry spans for performance tracking:

- HTTP fetch timing
- Parse duration
- Database operations
- Article extraction time
- Error capture with full context

### HTTP Request Details

**Headers Sent**:

```http
User-Agent: TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)
Accept: application/rss+xml, application/atom+xml, application/xml, text/xml, */*
```

**Timeout**: 30 seconds (30000ms)

**Rate Limiting**:

- 500ms delay between successful feed fetches
- 1000ms delay after errors (exponential backoff)

**Error Handling**:

- Network timeouts (30s limit)
- HTTP error status codes (404, 500, etc.)
- Connection failures (DNS, SSL/TLS)
- Malformed feed content
- All errors captured in Sentry with full context

## Article Parsing and Storage

### Feed Parsing

**File**: `packages/api/src/services/rss-fetcher.ts:273-290`

```typescript
async function parseFeed(content: string): Promise<ParsedFeed> {
  const { feed, format } = await feedsmith.parse(content);
  return { feed, format };
}
```

**Supported Formats**:

- RSS 2.0
- RSS 1.0 (RDF)
- Atom 1.0
- JSON Feed 1.0/1.1

### Article Extraction

**File**: `packages/api/src/services/rss-fetcher.ts:583-796`

The `storeArticles` function uses **batch duplicate checking** for efficiency, processing all feed items in 4 steps:

```typescript
async function storeArticles(
  sourceId: number,
  feed: AnyFeed,
  db: Database
): Promise<{ articlesAdded: number; articlesSkipped: number }> {
  // Step 1: Extract items and GUIDs
  const items = extractFeedItems(feed);
  const guidSamplesForLogging: string[] = [];
  const validItems: Array<{ item: AnyItem; guid: string }> = [];

  for (const item of items) {
    const guid = extractGuid(item, sourceId);
    validItems.push({ item, guid });

    if (guidSamplesForLogging.length < 3) {
      guidSamplesForLogging.push(guid);
    }
  }

  // Step 2: Batch check for existing articles (single query)
  const allGuids = validItems.map((v) => v.guid);
  const existingArticles = await db
    .select({ guid: schema.articles.guid })
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.sourceId, sourceId),
        inArray(schema.articles.guid, allGuids)
      )
    );

  const existingGuids = new Set(existingArticles.map((a) => a.guid));

  // Step 3: Extract data for new articles only
  const newArticles: Array<typeof schema.articles.$inferInsert> = [];

  for (const { item, guid } of validItems) {
    if (existingGuids.has(guid)) {
      articlesSkipped++;
      continue;
    }

    try {
      const articleData = await extractArticleData(item, sourceId, guid, true);
      newArticles.push(articleData);
    } catch (error) {
      // Log and skip failed articles
      articlesSkipped++;
    }
  }

  // Step 4: Batch insert (chunks of 50)
  const insertChunks = chunkArray(newArticles, LIMITS.batchInsertChunkSize);

  for (const chunk of insertChunks) {
    if (supportsBatch(db)) {
      // Cloudflare D1: use batch API
      await db.batch(
        chunk.map((data) => db.insert(schema.articles).values(data))
      );
    } else {
      // Better-sqlite3: insert sequentially
      for (const data of chunk) {
        await db.insert(schema.articles).values(data);
      }
    }
    articlesAdded += chunk.length;
  }

  return { articlesAdded, articlesSkipped };
}
```

**Key Optimizations**:

1. **Batch Duplicate Checking**: Single SQL query with `IN` clause instead of per-article queries
2. **Chunked Inserts**: Inserts up to 50 articles at once (D1 batch API or sequential fallback)
3. **Focused Helper Functions**: Extraction logic split into specialized functions
4. **Error Isolation**: Individual article failures don't stop batch processing

### Article Data Extraction

**File**: `packages/api/src/services/rss-fetcher.ts:852-1209`

Article extraction is decomposed into **focused helper functions** for maintainability:

```typescript
// Main extraction orchestrator (52 lines, down from 293)
async function extractArticleData(
  item: AnyItem,
  sourceId: number,
  guid: string,
  skipOgImageFetch = false
): Promise<typeof schema.articles.$inferInsert> {
  const title = ("title" in item && item.title) || "Untitled";
  const link = extractArticleLink(item);

  // Delegate to focused helpers
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

// Helper functions (each 10-91 lines):
function extractArticleContent(item: AnyItem): string {
  /* ... */
}
function extractArticleDescription(item: AnyItem, rawContent: string): string {
  /* ... */
}
function extractArticleAuthor(item: AnyItem): string | undefined {
  /* ... */
}
async function extractArticleImage(
  item: AnyItem,
  link: string,
  skipOgImageFetch: boolean
): Promise<string | undefined> {
  /* ... */
}
function extractArticleAudio(item: AnyItem): string | undefined {
  /* ... */
}
```

This refactored architecture improves:

- **Readability**: Each function has a single, clear purpose
- **Testability**: Can test extraction logic in isolation
- **Maintainability**: Easy to modify specific extraction without affecting others

#### Extracted Fields

| Field           | Sources                                                      | Processing           | Max Size |
| --------------- | ------------------------------------------------------------ | -------------------- | -------- |
| **title**       | `title`                                                      | Plain text           | -        |
| **link**        | `link`, `url`, `links[0].href`                               | URL validation       | -        |
| **content**     | `content_html`, `content_text`, `content`, `content:encoded` | HTML stripped        | 500 KB   |
| **description** | `description`, `summary`, `contentSnippet`                   | HTML stripped        | 5 KB     |
| **author**      | `authors[0]`, `author`, `creator`, `dc:creator`              | Plain text           | -        |
| **imageUrl**    | `image`, `enclosures`, `media:thumbnail`, OG image           | URL validation       | -        |
| **publishedAt** | `pubDate`, `published`, `updated`, `date_published`          | ISO 8601 → timestamp | -        |
| **guid**        | See [Deduplication](#deduplication-strategy)                 | Unique identifier    | -        |

#### Content Processing

**HTML Stripping** (Security):

```typescript
import { stripHtml } from "../utils/html";

// Strip all HTML tags to prevent XSS
const content = stripHtml(item.content_html || item.content_text);
const description = stripHtml(item.description || item.summary);
```

**Truncation** (Performance):

- Content: 500 KB maximum
- Description: 5 KB maximum

#### Image Extraction

**Priority Order**:

1. JSON Feed `image` field
2. RSS `enclosure` tags (first image)
3. Media RSS `media:thumbnail`
4. OpenGraph image from article URL (fallback)

**OpenGraph Fallback**:

```typescript
async function extractOgImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const html = await response.text();

    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
```

## Blocked Domains

### Overview

TuvixRSS supports blocking feeds from specific domains (e.g., spam, malware, illegal content). Domain blocking happens at **fetch-time** to avoid wasting HTTP requests and storage on unwanted content.

**File**: `packages/api/src/utils/domain-checker.ts`

### Architecture

#### Fetch-Time Blocking

**Where**: `packages/api/src/services/rss-fetcher.ts:325-366`

Domain blocking is enforced during feed fetching, before making HTTP requests:

```typescript
// Check if domain is blocked (before fetching)
const domain = extractDomain(feedUrl);
if (domain) {
  const blockedDomains = blockedDomainsList.map((b) => b.domain);
  if (isDomainBlocked(domain, blockedDomains)) {
    console.log(`Skipping blocked domain: ${domain}`);
    return {
      articlesAdded: 0,
      articlesSkipped: 0,
      sourceUpdated: false,
    };
  }
}
```

**Benefits**:

- Saves bandwidth (no HTTP request to blocked sites)
- Prevents storage of unwanted content
- Reduces D1 query usage

**Trade-offs**:

- Affects all users equally (no per-user bypass at fetch level)
- Blocked feeds won't appear in any user's feed, regardless of plan

### Domain Matching

**Supports**:

1. **Exact domain match**: `example.com` blocks `example.com`
2. **Subdomain matching**: `example.com` blocks `sub.example.com`, `www.example.com`
3. **Wildcard patterns**: `*.example.com` blocks any subdomain
4. **Case-insensitive**: `Example.COM` == `example.com`
5. **www normalization**: `www.example.com` → `example.com`

**File**: `packages/api/src/utils/domain-checker.ts:56-93`

```typescript
export function isDomainBlocked(
  domain: string,
  blockedDomains: string[]
): boolean {
  const normalizedDomain = normalizeDomain(domain);

  for (const blockedPattern of blockedDomains) {
    const normalizedPattern = normalizeDomain(blockedPattern);

    // Wildcard pattern: *.example.com
    if (normalizedPattern.startsWith("*.")) {
      const suffix = normalizedPattern.slice(2);
      if (
        normalizedDomain.endsWith(`.${suffix}`) ||
        normalizedDomain === suffix
      ) {
        return true;
      }
    } else {
      // Exact match or subdomain match
      if (
        normalizedDomain === normalizedPattern ||
        normalizedDomain.endsWith(`.${normalizedPattern}`)
      ) {
        return true;
      }
    }
  }

  return false;
}
```

### Database Schema

**Table**: `blocked_domains`
**File**: `packages/api/src/db/schema.ts:641-673`

```sql
CREATE TABLE blocked_domains (
  id INTEGER PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,  -- e.g., "spam.com" or "*.malware.org"
  reason TEXT,                   -- enum: illegal_content, spam, malware, etc.
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_blocked_domains_domain ON blocked_domains(domain);
```

### Performance Optimization

**Caching**: `packages/api/src/services/rss-fetcher.ts:218-237`

Blocked domains are fetched once per batch (not per feed):

```typescript
// Fetch blocked domains once per batch (not per feed)
let blockedDomainsList = [];
try {
  blockedDomainsList = await getBlockedDomains(db);
} catch (error) {
  // Safe migration: continue with empty list if table doesn't exist
  console.warn("blocked_domains table not found");
}

// Pass cached list to each feed
for (const source of sources) {
  await fetchSingleFeed(source.id, source.url, db, blockedDomainsList);
}
```

**Query Savings**:

- Before optimization: 20 queries per batch (once per feed)
- After optimization: 1 query per batch
- **Savings**: 95% reduction (19 queries saved per batch)

### Enterprise User Bypass (Future)

Currently, all users are affected equally by blocked domains at fetch-time. Enterprise bypass is planned for implementation at the **delivery-time** (query filtering) level:

**Planned Approach**:

- Fetch all feeds (including blocked domains)
- Store blocked status with articles
- Filter at query time based on user plan
- Enterprise users can opt-in to see blocked content

**Trade-offs**:

- Pro: Enterprise flexibility
- Con: Wastes resources fetching blocked content
- Con: Requires additional storage and query filtering

This feature is documented as TODO in `packages/api/src/utils/domain-checker.ts:17-20`.

## Deduplication Strategy

### GUID Generation

**File**: `packages/api/src/services/rss-fetcher.ts:293-325`

Articles are deduplicated using a GUID (Globally Unique Identifier) generated from feed data.

**Priority Order**:

1. RSS `<guid>` tag
2. Atom `<id>` tag
3. Feed item `<link>` (direct link)
4. Atom `links[0].href`
5. Fallback: `{sourceId}-{title}-{timestamp}`
6. Last resort: `{sourceId}-{title}`

```typescript
function extractGuid(item: FeedItem, sourceId: number): string {
  // 1. RSS guid
  if (item.guid) return item.guid;

  // 2. Atom id
  if (item.id) return item.id;

  // 3. Link
  if (item.link) return item.link;

  // 4. Atom links
  if (item.links?.[0]?.href) return item.links[0].href;

  // 5. Fallback: sourceId-title-timestamp
  const timestamp = item.pubDate || item.published || Date.now();
  return `${sourceId}-${item.title}-${timestamp}`;

  // 6. Last resort: sourceId-title
  return `${sourceId}-${item.title}`;
}
```

### Database Constraint

**Table**: `articles`
**Schema**: `packages/api/src/db/schema.ts:152-177`

```typescript
export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id").notNull(),
    guid: text("guid").notNull(),
    // ... other fields
  },
  (table) => ({
    // Unique constraint prevents duplicate articles
    uniqueSourceGuid: unique().on(table.sourceId, table.guid),
  })
);
```

**Behavior**:

- Duplicate GUIDs from the same source are rejected by database
- Different sources can have articles with same GUID
- Prevents re-adding articles on subsequent polls

## Error Handling

### Error Types

The system handles three categories of errors:

#### 1. HTTP Errors

**Location**: `packages/api/src/services/rss-fetcher.ts:112-114`

**Handled Errors**:

- Network timeouts (30s limit)
- HTTP status codes (404, 500, etc.)
- Connection failures (DNS, SSL/TLS)
- Redirect loops

**Behavior**:

```typescript
if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
```

Error is caught by `fetchAllFeeds()`, logged, and included in error array. Processing continues with next feed.

#### 2. Parse Errors

**Location**: `packages/api/src/services/rss-fetcher.ts:131-140`

**Handled Cases**:

- Malformed XML/JSON
- Invalid feed structure
- Unknown feed format
- Encoding issues

**Behavior**:

```typescript
try {
  const { feed, format } = await parseFeed(content);
} catch (error) {
  throw new Error(`Failed to parse feed: ${error.message}`);
}
```

Error is caught by `fetchAllFeeds()` and included in results.

#### 3. Storage Errors

**Location**: `packages/api/src/services/rss-fetcher.ts:234-267`

**Handled Cases**:

- Database constraint violations
- Invalid article data
- Disk space issues

**Behavior**:

```typescript
for (const item of items) {
  try {
    await storeArticle(item);
  } catch (error) {
    console.error(`Failed to store article:`, error);
    // Continue with next article
  }
}
```

Per-article error handling: failures don't stop processing remaining articles.

### Retry Logic

**Important**: The system does **NOT** implement automatic retries.

**Rationale**:

- Simplicity and predictability
- Avoids cascading failures
- Relies on next scheduled poll

**Mitigation**:

- Short poll intervals (e.g., 15-30 minutes)
- Failed feeds retried on next poll
- Errors logged for monitoring

### Error Logging

**Console Output**:

```
Starting scheduled RSS fetch
Error fetching feed 123 (https://example.com/feed): HTTP 500: Internal Server Error
RSS fetch complete: 45 succeeded, 5 failed
```

**Error Array** (returned from `fetchAllFeeds()`):

```typescript
{
  successCount: 45,
  errorCount: 5,
  processedCount: 50,  // Renamed from 'total' for clarity
  errors: [
    {
      sourceId: 123,
      url: "https://example.com/feed",
      error: "HTTP 500: Internal Server Error"
    },
    // ... more errors
  ]
}
```

## Rate Limiting

### Feed Fetching Rate Limits

**Automated Polling**: Built-in rate limiting via delays

- **500ms delay** between successful feed fetches
- **1000ms delay** after errors (exponential backoff)
- Prevents overwhelming feed servers
- Avoids triggering rate limits on external feeds

**Manual Refresh**: Rate limited per user plan

**File**: `packages/api/src/routers/articles.ts:707-733`

```typescript
refresh: rateLimitedProcedure.mutation(async ({ ctx }) => {
  // Rate limit enforced by middleware
  void fetchAllFeeds(ctx.env.DB);
  return { success: true };
});
```

### Rate Limiter Service

**File**: `packages/api/src/services/rate-limiter.ts`

**Strategy**: Cloudflare Workers rate limit bindings

**Features**:

- Per-minute windows
- Distributed edge-based tracking
- Automatic reset every minute

**Storage**:

- **Cloudflare Workers**: Rate limit bindings (`API_RATE_LIMIT`, `FEED_RATE_LIMIT`)
- **Node.js**: Rate limiting disabled

**Types**:

| Type                   | Window   | Limit (Free) | Limit (Pro)   |
| ---------------------- | -------- | ------------ | ------------- |
| **API Calls**          | 1 minute | 60 requests  | 300 requests  |
| **Public Feed Access** | 1 minute | ~17 requests | ~167 requests |

**Note**: See [`docs/guides/features/rate-limiting.md`](../../guides/features/rate-limiting.md) for complete rate limiting documentation.

### Rate Limiter Implementation

The rate limiter uses Cloudflare Workers rate limit bindings. See `packages/api/src/services/rate-limiter.ts` for implementation details.

```typescript
// Simplified example - see actual implementation for full details
export async function checkApiRateLimit(
  env: Env,
  userId: number,
  limitPerMinute: number
): Promise<RateLimitResult> {
  return checkRateLimit(env, userId, limitPerMinute, 60 * 1000, "api");
}
```

## Article Pruning

### Overview

Automatically deletes old articles based on configured retention period.

**Schedule**:

- **Node.js**: Daily at 2:00 AM
- **Cloudflare Workers**: Checked on each cron trigger (runs if >24h since last prune)

### Prune Handler

**File**: `packages/api/src/cron/handlers.ts:50-114`

```typescript
export async function handleArticlePrune(env: Env) {
  console.log("Starting article prune");

  const settings = await getGlobalSettings(env.DB);
  const pruneDays = settings.pruneDays;

  if (pruneDays === 0) {
    console.log("Prune disabled (pruneDays=0)");
    return;
  }

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - pruneDays);
  const cutoffTimestamp = cutoffDate.getTime();

  // Find articles to delete
  const articlesToDelete = await env.DB.query.articles.findMany({
    where: or(
      // Use publishedAt if available
      and(
        isNotNull(schema.articles.publishedAt),
        lt(schema.articles.publishedAt, cutoffTimestamp)
      ),
      // Fallback to createdAt if publishedAt is null
      and(
        isNull(schema.articles.publishedAt),
        lt(schema.articles.createdAt, cutoffTimestamp)
      )
    ),
    columns: { id: true },
  });

  // Batch delete (999 per batch for SQLite parameter limit)
  const batchSize = 999;
  let deletedCount = 0;

  for (let i = 0; i < articlesToDelete.length; i += batchSize) {
    const batch = articlesToDelete.slice(i, i + batchSize);
    const ids = batch.map((a) => a.id);

    await env.DB.delete(schema.articles).where(
      inArray(schema.articles.id, ids)
    );

    deletedCount += batch.length;
  }

  console.log(`Pruned ${deletedCount} articles older than ${pruneDays} days`);

  // Update last prune timestamp (Cloudflare only)
  if (env.ENVIRONMENT === "cloudflare") {
    await updateLastPruneAt(env.DB, Date.now());
  }
}
```

### Prune Logic

**Date Priority**:

1. Use `publishedAt` if available (feed-provided date)
2. Fallback to `createdAt` if `publishedAt` is null (insertion date)

**Batching**:

- Deletes in batches of 999 articles
- Prevents hitting SQLite's 999 parameter limit
- More efficient for large datasets

**Cascade Deletes**:

- Foreign key constraints automatically delete related `user_article_states`
- No orphaned read/starred/archived states

### Configuration

```typescript
// Disable pruning
admin.updateGlobalSettings({ pruneDays: 0 });

// Keep articles for 90 days
admin.updateGlobalSettings({ pruneDays: 90 });

// Keep articles for 1 year
admin.updateGlobalSettings({ pruneDays: 365 });
```

## Performance Characteristics

### Staleness-Based Filtering

**Current Approach**: Only fetch feeds that are stale (haven't been updated recently).

**How It Works**:

```typescript
// Only process feeds where:
// 1. lastFetched IS NULL (never fetched), OR
// 2. lastFetched < (now - 30 minutes)

const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);
const sources = await db
  .select()
  .from(schema.sources)
  .where(or(isNull(lastFetched), lt(lastFetched, staleThreshold)))
  .orderBy(lastFetched) // Oldest first
  .limit(20); // Process 20 per cron run
```

**Benefits**:

- **Massive efficiency gain**: Only processes feeds that need updating
- **Predictable execution time**: Fixed batch size (20 feeds) = consistent ~10-15s runtime
- **Scales to thousands of feeds**: 5,000 feeds rotate over 4 hours with no performance degradation
- **Fair distribution**: Oldest feeds processed first, ensuring even rotation

**Scalability Examples**:

| Total Feeds | Batch Size | Cron Interval | Full Rotation Time |
| ----------- | ---------- | ------------- | ------------------ |
| 100         | 20         | 1 minute      | ~5 minutes         |
| 1,000       | 20         | 1 minute      | ~50 minutes        |
| 5,000       | 20         | 1 minute      | ~4 hours           |
| 10,000      | 20         | 1 minute      | ~8 hours           |

**Note**: Each feed is guaranteed to be checked within the rotation period. Fresh feeds (recently updated) are skipped until stale.

### Sequential Processing with Rate Limiting

**Current Approach**: Feeds are fetched one at a time with delays between fetches.

**Pros**:

- Simple and predictable
- Low memory footprint (~100 MB peak)
- Resource-friendly for Cloudflare Workers (CPU time limits)
- No concurrency issues
- Built-in rate limit protection (500ms/1000ms delays)

**Cons**:

- No parallelization within a batch
- Could benefit from parallel fetching if batch size increases significantly

**Potential Future Optimization**: Parallel batching with configurable concurrency.

### Deduplication Efficiency

**Current Method**: **Batch duplicate checking** with single SQL query.

```sql
-- OLD: Per-article queries (N queries for N articles)
SELECT * FROM articles WHERE source_id = ? AND guid = ?  -- For each article

-- NEW: Single batch query with IN clause (1 query for N articles)
SELECT guid FROM articles
WHERE source_id = ?
AND guid IN (?, ?, ?, ..., ?)  -- All GUIDs at once
```

**Performance Impact**:

- **Before**: 100 articles = 100 SELECT queries
- **After**: 100 articles = 1 SELECT query
- **Speedup**: ~100x for duplicate checking phase

**Additional Optimizations**:

- Batch inserts (50 articles per chunk)
- Cloudflare D1: Uses batch API for parallel inserts
- Better-sqlite3: Sequential inserts (still fast locally)

### Memory Usage

**Low Memory Footprint**:

- Processes feeds sequentially (one at a time)
- No large in-memory queues
- Articles inserted individually (no bulk buffering)

**Typical Memory Profile**:

- Base: ~50 MB (API server)
- During fetch: +10-20 MB per feed (parsed content)
- Peak: ~100 MB (when processing largest feed)

### Database Performance

**Indexes**:

- `articles(sourceId, guid)`: Fast duplicate checking
- `articles(publishedAt)`: Fast date range queries for pruning
- `articles(sourceId, publishedAt)`: Fast article list queries

**Query Optimization**:

- Prune uses batching to avoid large IN clauses
- Article list queries use cursor-based pagination

## API Reference

### Cron Handlers

#### handleRSSFetch(env: Env): Promise<void>

**File**: `packages/api/src/cron/handlers.ts:22-38`

Fetches all RSS feeds and updates articles.

```typescript
export async function handleRSSFetch(env: Env): Promise<void>;
```

**Parameters**:

- `env`: Environment containing database connection

**Side Effects**:

- Updates `sources` table (lastFetched timestamps)
- Inserts new articles into `articles` table
- Updates `lastRssFetchAt` in global settings (Cloudflare only)

**Called By**:

- Node.js: `node-cron` scheduler
- Cloudflare: Workers `scheduled()` event

#### handleArticlePrune(env: Env): Promise<void>

**File**: `packages/api/src/cron/handlers.ts:50-114`

Deletes articles older than configured retention period.

```typescript
export async function handleArticlePrune(env: Env): Promise<void>;
```

**Parameters**:

- `env`: Environment containing database connection

**Side Effects**:

- Deletes old articles from `articles` table
- Cascades to delete related `user_article_states`
- Updates `lastPruneAt` in global settings (Cloudflare only)

**Called By**:

- Node.js: `node-cron` scheduler (daily at 2:00 AM)
- Cloudflare: Workers `scheduled()` event (when >24h elapsed)

### RSS Fetcher Service

#### fetchAllFeeds(db: Database, options?): Promise<FetchResult>

**File**: `packages/api/src/services/rss-fetcher.ts:157-274`

Fetches stale RSS sources using staleness-based filtering.

```typescript
export async function fetchAllFeeds(
  db: Database,
  options?: {
    stalenessThresholdMinutes?: number; // Default: 30
    maxFeedsPerBatch?: number; // Default: 20
  }
): Promise<FetchResult>;
```

**Parameters**:

- `db`: Database connection
- `options.stalenessThresholdMinutes`: Only fetch feeds older than this (default: 30 minutes)
- `options.maxFeedsPerBatch`: Maximum feeds to process per invocation (default: 20)

**Returns**:

```typescript
/**
 * Result of fetching multiple RSS feeds
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
```

**Example**:

```typescript
// Use default settings (30-minute staleness, 20 feeds max)
const result = await fetchAllFeeds(db);
console.log(
  `${result.successCount}/${result.processedCount} feeds fetched successfully`
);

// Custom settings (15-minute staleness, 50 feeds max)
const result2 = await fetchAllFeeds(db, {
  stalenessThresholdMinutes: 15,
  maxFeedsPerBatch: 50,
});

if (result.errorCount > 0) {
  console.error("Failed feeds:", result.errors);
}
```

#### fetchSingleFeed(sourceId: number, feedUrl: string, db: Database): Promise<SingleFeedResult>

**File**: `packages/api/src/services/rss-fetcher.ts:279-510`

Fetches and processes a single RSS/Atom feed with Sentry tracing.

```typescript
export async function fetchSingleFeed(
  sourceId: number,
  feedUrl: string,
  db: Database
): Promise<SingleFeedResult>;
```

**Returns**:

```typescript
/**
 * Result of fetching a single RSS feed
 */
export interface SingleFeedResult {
  /** Number of new articles added to the database */
  articlesAdded: number;
  /** Number of articles skipped (already exist) */
  articlesSkipped: number;
  /** Whether source metadata was updated */
  sourceUpdated: boolean;
}
```

**Throws**:

- HTTP errors (timeouts, 404, 500, etc.)
- Parse errors (malformed XML/JSON)

**Example**:

```typescript
try {
  const result = await fetchSingleFeed(123, "https://example.com/feed", db);
  console.log(`Added ${result.articlesAdded} new articles`);
} catch (error) {
  console.error(`Failed to fetch feed:`, error);
}
```

### Global Settings Service

#### getGlobalSettings(db: Database): Promise<GlobalSettings>

**File**: `packages/api/src/services/global-settings.ts`

Retrieves global configuration settings.

```typescript
export async function getGlobalSettings(db: Database): Promise<GlobalSettings>;
```

**Returns**:

```typescript
interface GlobalSettings {
  id: number;
  fetchIntervalMinutes: number;
  pruneDays: number;
  lastRssFetchAt: Date | null;
  lastPruneAt: Date | null;
}
```

#### updateGlobalSettings(db: Database, settings: Partial<GlobalSettings>): Promise<void>

Updates global configuration settings.

```typescript
export async function updateGlobalSettings(
  db: Database,
  settings: Partial<GlobalSettings>
): Promise<void>;
```

**Example**:

```typescript
await updateGlobalSettings(db, {
  fetchIntervalMinutes: 30,
  pruneDays: 90,
});
```

### Scheduler Utilities

#### intervalMinutesToCron(minutes: number): string

**File**: `packages/api/src/cron/scheduler.ts:20-39`

Converts minute intervals to cron expressions.

```typescript
export function intervalMinutesToCron(minutes: number): string;
```

**Examples**:

```typescript
intervalMinutesToCron(15); // "*/15 * * * *"
intervalMinutesToCron(60); // "*/60 * * * *"
intervalMinutesToCron(120); // "0 */2 * * *"
intervalMinutesToCron(1440); // "0 0 * * *"
```

## Troubleshooting

### Feeds Not Updating

**Symptoms**:

- No new articles appear
- `lastFetched` timestamp not updating

**Diagnosis**:

1. **Check if cron is running**:

   ```bash
   # Check logs for "Starting scheduled RSS fetch"
   docker logs tuvix-api | grep "RSS fetch"
   ```

2. **Check fetch interval**:

   ```sql
   SELECT fetch_interval_minutes FROM global_settings WHERE id = 1;
   ```

3. **Check for errors**:

   ```sql
   -- Check lastFetched timestamps
   SELECT id, title, feed_url, last_fetched
   FROM sources
   ORDER BY last_fetched DESC;
   ```

4. **Manual trigger** (verify cron is the issue):
   ```typescript
   await trpc.articles.refresh.mutate();
   ```

**Common Causes**:

- Cron scheduler not initialized
- Fetch interval too long (increase frequency)
- All feeds failing (network/DNS issues)
- Database connection issues

### High Error Rate

**Symptoms**:

- Many feeds failing in error array
- Console shows multiple error messages

**Diagnosis**:

1. **Check error types**:

   ```typescript
   const result = await fetchAllFeeds(db);
   console.log(result.errors);
   // Look for patterns: HTTP 404, timeout, parse errors
   ```

2. **Test individual feed**:

   ```bash
   curl -I https://example.com/feed
   # Check HTTP status, redirects, timeouts
   ```

3. **Check feed format**:
   ```bash
   curl https://example.com/feed | head -n 50
   # Verify XML/JSON structure
   ```

**Common Causes**:

- Dead feeds (404, 410 Gone)
- Feeds moved (301/302 redirects not followed)
- Malformed feed XML/JSON
- Feeds requiring authentication
- IP rate limiting from feed servers

**Solutions**:

- Remove dead feeds
- Update feed URLs after redirects
- Contact feed owner about formatting issues
- Add authentication support (if needed)
- Add delay between fetches to avoid rate limits

### Slow Polling

**Symptoms**:

- Fetch cycle takes very long
- New articles delayed significantly

**Diagnosis**:

1. **Check feed count**:

   ```sql
   SELECT COUNT(*) FROM sources;
   ```

2. **Estimate time**:

   ```
   Total time ≈ feed_count × 2s (avg)
   Example: 1000 feeds × 2s = ~33 minutes
   ```

3. **Profile individual feeds**:
   ```typescript
   const start = Date.now();
   await fetchSingleFeed(sourceId, feedUrl, db);
   const duration = Date.now() - start;
   console.log(`Feed ${sourceId} took ${duration}ms`);
   ```

**Solutions**:

- Reduce feed count (remove inactive feeds)
- Increase poll interval (less frequent but more manageable)
- Implement parallel fetching (code modification required)
- Upgrade server resources (faster network, more CPU)

### Duplicate Articles

**Symptoms**:

- Same article appears multiple times
- Database unique constraint violations in logs

**Diagnosis**:

1. **Check for duplicates**:

   ```sql
   SELECT guid, COUNT(*) as count
   FROM articles
   WHERE source_id = ?
   GROUP BY guid
   HAVING count > 1;
   ```

2. **Check GUID generation**:
   ```typescript
   // Add logging to extractGuid()
   const guid = extractGuid(item, sourceId);
   console.log(`Article: ${item.title}, GUID: ${guid}`);
   ```

**Common Causes**:

- Feed doesn't provide stable GUIDs
- Feed changes article URLs on updates
- Feed uses timestamps in GUIDs

**Solutions**:

- Use title-based fallback GUID
- Manually assign stable GUIDs
- Contact feed owner about GUID stability

### Memory Issues

**Symptoms**:

- API server crashes during fetch
- Out of memory errors

**Diagnosis**:

1. **Monitor memory usage**:

   ```bash
   docker stats tuvix-api
   ```

2. **Check feed sizes**:
   ```bash
   curl https://example.com/feed | wc -c
   # Large feeds (>10 MB) can cause issues
   ```

**Solutions**:

- Increase server memory
- Implement streaming feed parser (code modification)
- Fetch large feeds less frequently
- Remove exceptionally large feeds

### Rate Limit Errors

**Symptoms**:

- Manual refresh blocked
- "Rate limit exceeded" errors

**Diagnosis**:

1. **Check rate limit settings**:

   ```typescript
   const user = await db.query.users.findFirst({
     where: eq(schema.users.id, userId),
   });
   console.log(user.plan); // "free" or "pro"
   ```

2. **Check recent requests**:
   ```typescript
   // Rate limiter stores timestamps
   // Check KV store or in-memory map
   ```

**Solutions**:

- Wait for rate limit window to expire
- Upgrade to Pro plan (higher limits)
- Rely on automatic polling instead of manual refresh

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    POLLING TRIGGER                          │
├─────────────────────────────────────────────────────────────┤
│  • Node.js: node-cron (every N minutes)                    │
│  • Cloudflare: scheduled() + timestamp check               │
│  • Manual: articles.refresh API endpoint                   │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              handleRSSFetch(env)                            │
│  cron/handlers.ts:22-38                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│           fetchAllFeeds(db)                                 │
│  rss-fetcher.ts:52-91                                       │
│  • Query all sources from database                          │
│  • Process sequentially (no parallelization)                │
│  • Collect success/error statistics                         │
└────────────────────┬────────────────────────────────────────┘
                     ↓
         ┌───────────┴────────────┐
         │  For each source       │
         └───────────┬────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│      fetchSingleFeed(sourceId, url, db)                     │
│  rss-fetcher.ts:96-157                                      │
├─────────────────────────────────────────────────────────────┤
│  1. HTTP FETCH                                              │
│     • fetch(url) with 30s timeout                           │
│     • User-Agent: TuvixRSS/1.0                              │
│     • Accept: RSS/Atom/XML/JSON                             │
│     • Error: throw HTTP error → caught by fetchAllFeeds()   │
│                                                             │
│  2. PARSE FEED                                              │
│     • parseFeed(content) via feedsmith                      │
│     • Auto-detect: RSS 2.0/1.0, Atom, JSON Feed            │
│     • Error: throw parse error → caught by fetchAllFeeds()  │
│                                                             │
│  3. UPDATE SOURCE                                           │
│     • updateSourceMetadata(sourceId, feed, db)              │
│     • Update: title, description, siteUrl, lastFetched      │
│                                                             │
│  4. STORE ARTICLES                                          │
│     • storeArticles(sourceId, feed, db) →                  │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│         storeArticles(sourceId, feed, db)                   │
│  rss-fetcher.ts:218-271                                     │
├─────────────────────────────────────────────────────────────┤
│  For each item in feed.items/entries:                       │
│                                                             │
│    1. extractGuid(item, sourceId)                           │
│       Priority: guid → id → link → fallback                 │
│                                                             │
│    2. Check existing: SELECT * WHERE guid = ?               │
│       If exists: articlesSkipped++, continue                │
│                                                             │
│    3. extractArticleData(item, sourceId, guid)              │
│       ├─ Extract: title, link, content, description        │
│       ├─ Extract: author, imageUrl, publishedAt            │
│       ├─ Strip HTML (XSS prevention)                       │
│       ├─ Truncate: content (500KB), description (5KB)      │
│       └─ Fallback: OpenGraph image if no image             │
│                                                             │
│    4. INSERT INTO articles (...)                            │
│       Unique constraint: (sourceId, guid)                   │
│       articlesAdded++                                       │
│                                                             │
│  Return: { articlesAdded, articlesSkipped }                 │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

### For Administrators

1. **Set Appropriate Poll Interval**:
   - Small instance (1-100 feeds): 15-30 minutes
   - Medium instance (100-500 feeds): 30-60 minutes
   - Large instance (500+ feeds): 60-120 minutes

2. **Monitor Error Rates**:
   - Check logs regularly for failed feeds
   - Remove consistently failing feeds
   - Update redirected feed URLs

3. **Configure Retention Period**:
   - Balance storage vs. article history
   - Typical: 30-90 days
   - Archive important articles before pruning

4. **Plan for Growth**:
   - Sequential processing limits scalability
   - Consider parallel fetching for >1000 feeds
   - Monitor fetch cycle duration

### For Developers

1. **Error Handling**:
   - Always wrap fetch operations in try-catch
   - Log errors with context (sourceId, URL)
   - Don't let one failure stop entire batch

2. **Security**:
   - Strip all HTML from user-facing content
   - Validate URLs before fetching
   - Set reasonable timeouts
   - Truncate large content

3. **Performance**:
   - Use database indexes for queries
   - Batch operations where possible
   - Consider caching parsed feeds (short TTL)

4. **Testing**:
   - Test with various feed formats
   - Test error scenarios (timeouts, 404s, malformed feeds)
   - Test deduplication logic

---

For additional support, refer to the [RSS Fetcher Service Tests](../packages/api/src/services/__tests__/rss-fetcher.test.ts) for usage examples.
