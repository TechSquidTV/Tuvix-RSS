# Queue-Based Feed Fetching Implementation Plan

## Executive Summary

This document outlines the implementation plan for migrating TuvixRSS from a cron-based feed fetching system to a queue-based architecture using Cloudflare Queues. The design must support **both Cloudflare Workers and Docker Compose deployments** through runtime abstraction.

**Key Goals:**
- Scale from 2,000 to 50,000+ feeds
- Maintain <5-minute update frequency
- Support both Cloudflare and Docker environments
- Minimize infrastructure changes
- Graceful degradation when queues unavailable

---

## Current Architecture Analysis

### Existing System (Phase 1 - Optimized Cron)

**Cloudflare Workers:**
```
Cron Trigger (*/1 * * * *)
    ↓
handleRSSFetch()
    ↓
fetchAllFeeds(db, { maxFeedsPerBatch: 100 })
    ↓
Sequential processing (500ms delay between feeds)
    ↓
Update articles in batches
```

**Docker/Node.js:**
```
node-cron (based on global_settings.fetchIntervalMinutes)
    ↓
handleRSSFetch()
    ↓
[Same as above]
```

**Limitations:**
- Sequential processing (can't parallelize beyond batch size)
- Cron frequency caps throughput (100 feeds/min max)
- No retry logic for individual feed failures
- All-or-nothing execution model

---

## Target Architecture (Phase 3 - Queue-Based)

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCHEDULER (Cron Worker)                        │
│  - Runs every 5 minutes                                           │
│  - Queries stale feeds (lastFetched > 30 min OR null)            │
│  - Enqueues feeds to queue abstraction                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    QUEUE ABSTRACTION LAYER                        │
│                                                                   │
│  Cloudflare:                  Docker:                             │
│  - Cloudflare Queues         - BullMQ (Redis)                     │
│  - 5,000 msg/sec             - In-memory fallback (Node.js)       │
│  - Native integration        - Compatible API                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CONSUMER (Queue Worker)                        │
│  - Processes batches of 100 feeds in parallel                    │
│  - Reuses existing fetchSingleFeed() logic                        │
│  - Updates DB on success, retries on failure                     │
│  - Emits metrics to Sentry                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: ✅ **Optimized Cron (COMPLETED)**

**Status**: Current implementation
**Capacity**: 2,000-5,000 feeds
**Update frequency**: 10-20 minutes

**Changes Made:**
- Increased batch size from 20 → 100 feeds
- Changed cron from 5 minutes → 1 minute (Cloudflare)
- Docker uses `global_settings.fetchIntervalMinutes` (configurable)

**Result**: 6,000 feeds/hour throughput

---

### Phase 2: **Smart Scheduler with Staleness-Based Fetching**

**Target**: 5,000-10,000 feeds
**Estimated effort**: 2-3 hours
**Prerequisites**: None (works on free tier)

#### Changes Required

**1. Add staleness filter to feed query:**

```typescript
// packages/api/src/services/rss-fetcher.ts
export async function fetchAllFeeds(
  db: Database,
  options?: {
    maxFeedsPerBatch?: number;
    stalenessThresholdMinutes?: number; // NEW
  }
): Promise<FetchResult> {
  const maxFeedsPerBatch = options?.maxFeedsPerBatch ?? 100;
  const stalenessThresholdMinutes = options?.stalenessThresholdMinutes ?? 30;

  const staleThreshold = new Date(
    Date.now() - stalenessThresholdMinutes * 60 * 1000
  );

  // Get only stale sources
  const allSources = await db
    .select()
    .from(schema.sources)
    .where(
      or(
        isNull(schema.sources.lastFetched),
        lt(schema.sources.lastFetched, staleThreshold)
      )
    )
    .orderBy(asc(schema.sources.lastFetched))
    .limit(maxFeedsPerBatch);

  // [Rest of function unchanged]
}
```

**2. Update cron handler:**

```typescript
// packages/api/src/cron/handlers.ts
async function _handleRSSFetch(env: Env): Promise<void> {
  console.log("🔄 Starting scheduled RSS fetch...");

  const db = createDatabase(env);

  try {
    const result = await fetchAllFeeds(db, {
      maxFeedsPerBatch: 100,
      stalenessThresholdMinutes: 30, // Only fetch feeds older than 30 min
    });

    console.log(`✅ RSS fetch completed:`, {
      total: result.total,
      success: result.successCount,
      errors: result.errorCount,
      staleFeedsProcessed: result.total, // All processed were stale
    });
  } catch (error) {
    console.error("❌ RSS fetch failed:", error);
    throw error;
  }
}
```

**3. Add priority scoring (optional enhancement):**

```typescript
// packages/api/src/services/feed-priority.ts
export function calculateFeedPriority(feed: {
  lastFetched: Date | null;
  subscriptionCount?: number;
  avgUpdateFrequency?: number; // Articles/day
}): number {
  // Base priority: hours since last fetch
  const hoursSinceLastFetch = feed.lastFetched
    ? (Date.now() - feed.lastFetched.getTime()) / (60 * 60 * 1000)
    : 999; // Never fetched = max priority

  // Boost for active subscriptions
  const subscriptionBoost = (feed.subscriptionCount || 0) * 10;

  // Boost for frequently updated feeds
  const frequencyBoost = (feed.avgUpdateFrequency || 1) * 2;

  return hoursSinceLastFetch + subscriptionBoost + frequencyBoost;
}

// In fetchAllFeeds():
const allSources = await db
  .select({
    id: schema.sources.id,
    url: schema.sources.url,
    lastFetched: schema.sources.lastFetched,
    subscriptionCount: sql`(SELECT COUNT(*) FROM ${schema.subscriptions} WHERE source_id = ${schema.sources.id})`,
  })
  .from(schema.sources)
  .where(/* staleness filter */)
  .orderBy(desc(sql`${calculateFeedPriority}(...)`)) // Highest priority first
  .limit(maxFeedsPerBatch);
```

**Benefits:**
- Self-regulating: only fetches stale feeds
- Scales to 10,000 feeds without infrastructure changes
- Prioritizes active/frequently-updated feeds

**Drawbacks:**
- Still sequential processing (500ms delay between feeds)
- Limited to cron frequency * batch size throughput

---

### Phase 3: **Queue-Based Architecture**

**Target**: 10,000-100,000 feeds
**Estimated effort**: 1-2 weeks
**Prerequisites**: Cloudflare Paid plan ($5/month) OR Redis (Docker)

#### Architecture Components

##### 1. Queue Abstraction Layer

**Goal**: Support both Cloudflare Queues and BullMQ (Redis) with the same interface

```typescript
// packages/api/src/queue/types.ts
export interface QueueMessage<T = unknown> {
  id: string;
  body: T;
  timestamp: number;
  attempts: number;
}

export interface QueueBatch<T = unknown> {
  messages: Array<QueueMessage<T> & {
    ack: () => void;
    retry: (options?: { delaySeconds?: number }) => void;
  }>;
}

export interface QueueAdapter {
  /**
   * Send a single message to the queue
   */
  send<T>(message: T): Promise<void>;

  /**
   * Send multiple messages to the queue
   */
  sendBatch<T>(messages: T[]): Promise<void>;

  /**
   * Process a batch of messages (consumer)
   */
  processBatch<T>(
    handler: (batch: QueueBatch<T>) => Promise<void>
  ): Promise<void>;
}
```

**Implementation for Cloudflare:**

```typescript
// packages/api/src/queue/adapters/cloudflare.ts
import type { Queue } from "@cloudflare/workers-types";
import type { QueueAdapter, QueueMessage, QueueBatch } from "../types";

export class CloudflareQueueAdapter implements QueueAdapter {
  constructor(private queue: Queue) {}

  async send<T>(message: T): Promise<void> {
    await this.queue.send(message);
  }

  async sendBatch<T>(messages: T[]): Promise<void> {
    // Cloudflare Queues limit: 100 messages per batch
    const chunks = chunkArray(messages, 100);

    for (const chunk of chunks) {
      await this.queue.sendBatch(
        chunk.map(body => ({ body }))
      );
    }
  }

  async processBatch<T>(
    handler: (batch: QueueBatch<T>) => Promise<void>
  ): Promise<void> {
    // This is called by Cloudflare Workers queue consumer
    // Handler receives native MessageBatch from Cloudflare
    // (Implementation happens in queue consumer entry point)
  }
}
```

**Implementation for Docker/BullMQ:**

```typescript
// packages/api/src/queue/adapters/bullmq.ts
import { Queue, Worker } from "bullmq";
import type { QueueAdapter, QueueBatch } from "../types";

export class BullMQAdapter implements QueueAdapter {
  private queue: Queue;
  private worker?: Worker;

  constructor(
    queueName: string,
    redisConnection: { host: string; port: number }
  ) {
    this.queue = new Queue(queueName, {
      connection: redisConnection,
    });
  }

  async send<T>(message: T): Promise<void> {
    await this.queue.add("feed-fetch", message);
  }

  async sendBatch<T>(messages: T[]): Promise<void> {
    const jobs = messages.map(body => ({
      name: "feed-fetch",
      data: body,
    }));

    await this.queue.addBulk(jobs);
  }

  async processBatch<T>(
    handler: (batch: QueueBatch<T>) => Promise<void>
  ): Promise<void> {
    // BullMQ processes one message at a time, but we can buffer
    // them into batches for efficiency
    const batchSize = 100;
    const batchBuffer: Array<QueueMessage<T>> = [];

    this.worker = new Worker(
      this.queue.name,
      async (job) => {
        batchBuffer.push({
          id: job.id!,
          body: job.data as T,
          timestamp: job.timestamp,
          attempts: job.attemptsMade,
        });

        // Process when batch is full or timeout reached
        if (batchBuffer.length >= batchSize) {
          await this.flushBatch(handler, batchBuffer);
        }
      },
      {
        connection: this.queue.opts.connection,
        concurrency: 10, // Process 10 jobs concurrently
      }
    );

    // Flush remaining messages periodically
    setInterval(() => {
      if (batchBuffer.length > 0) {
        this.flushBatch(handler, batchBuffer);
      }
    }, 5000); // Flush every 5 seconds
  }

  private async flushBatch<T>(
    handler: (batch: QueueBatch<T>) => Promise<void>,
    buffer: Array<QueueMessage<T>>
  ): Promise<void> {
    const batch: QueueBatch<T> = {
      messages: buffer.splice(0).map(msg => ({
        ...msg,
        ack: () => {
          // BullMQ auto-acks on successful completion
        },
        retry: (options) => {
          // BullMQ handles retries automatically
        },
      })),
    };

    await handler(batch);
  }
}
```

**Fallback In-Memory Queue (Docker without Redis):**

```typescript
// packages/api/src/queue/adapters/in-memory.ts
import type { QueueAdapter, QueueBatch, QueueMessage } from "../types";

/**
 * Simple in-memory queue for development/testing
 * NOT SUITABLE FOR PRODUCTION (no persistence, single-process only)
 */
export class InMemoryQueueAdapter implements QueueAdapter {
  private messages: Array<QueueMessage<unknown>> = [];
  private processing = false;

  async send<T>(message: T): Promise<void> {
    this.messages.push({
      id: `${Date.now()}-${Math.random()}`,
      body: message,
      timestamp: Date.now(),
      attempts: 0,
    });
  }

  async sendBatch<T>(messages: T[]): Promise<void> {
    for (const message of messages) {
      await this.send(message);
    }
  }

  async processBatch<T>(
    handler: (batch: QueueBatch<T>) => Promise<void>
  ): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    // Process in batches of 100
    while (this.messages.length > 0) {
      const batchMessages = this.messages.splice(0, 100);

      const batch: QueueBatch<T> = {
        messages: batchMessages.map(msg => ({
          ...msg,
          body: msg.body as T,
          ack: () => {
            // Remove from queue (already spliced)
          },
          retry: (options) => {
            // Re-add to queue with incremented attempts
            this.messages.push({
              ...msg,
              attempts: msg.attempts + 1,
            });
          },
        })),
      };

      try {
        await handler(batch);
      } catch (error) {
        console.error("Batch processing error:", error);
        // Re-add failed messages to queue
        this.messages.push(...batchMessages);
      }
    }

    this.processing = false;
  }
}
```

##### 2. Queue Factory (Runtime Detection)

```typescript
// packages/api/src/queue/factory.ts
import type { QueueAdapter } from "./types";
import { CloudflareQueueAdapter } from "./adapters/cloudflare";
import { BullMQAdapter } from "./adapters/bullmq";
import { InMemoryQueueAdapter } from "./adapters/in-memory";
import type { Env } from "@/types";

export function createQueueAdapter(env: Env): QueueAdapter {
  // Cloudflare Workers
  if (env.RUNTIME === "cloudflare" && env.FEED_QUEUE) {
    console.log("📦 Using Cloudflare Queues");
    return new CloudflareQueueAdapter(env.FEED_QUEUE);
  }

  // Docker with Redis
  if (env.REDIS_HOST && env.REDIS_PORT) {
    console.log("📦 Using BullMQ (Redis)");
    return new BullMQAdapter("feed-fetcher", {
      host: env.REDIS_HOST,
      port: parseInt(env.REDIS_PORT, 10),
    });
  }

  // Fallback: In-memory (development only)
  console.warn("⚠️ Using in-memory queue (NOT for production)");
  return new InMemoryQueueAdapter();
}
```

##### 3. Scheduler (Cron → Queue)

```typescript
// packages/api/src/cron/handlers.ts (updated)
import { createQueueAdapter } from "@/queue/factory";

async function _handleRSSFetch(env: Env): Promise<void> {
  console.log("🔄 Starting scheduled RSS fetch...");

  const db = createDatabase(env);
  const queue = createQueueAdapter(env);

  try {
    // Get stale feeds (older than 30 minutes)
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);

    const staleFeeds = await db
      .select()
      .from(schema.sources)
      .where(
        or(
          isNull(schema.sources.lastFetched),
          lt(schema.sources.lastFetched, staleThreshold)
        )
      )
      .orderBy(asc(schema.sources.lastFetched))
      .limit(1000); // Process up to 1,000 feeds per cron run

    if (staleFeeds.length === 0) {
      console.log("✅ All feeds are fresh (no stale feeds found)");
      emitCounter("rss.scheduler_run", 1, { stale_feeds: "0" });
      return;
    }

    // Enqueue feeds for processing
    await queue.sendBatch(
      staleFeeds.map(feed => ({
        sourceId: feed.id,
        url: feed.url,
        priority: calculatePriority(feed),
      }))
    );

    console.log(`📤 Enqueued ${staleFeeds.length} stale feeds for processing`);

    emitCounter("rss.feeds_enqueued", staleFeeds.length);
    emitCounter("rss.scheduler_run", 1, {
      stale_feeds: staleFeeds.length.toString(),
    });
  } catch (error) {
    console.error("❌ RSS fetch scheduling failed:", error);
    emitCounter("rss.scheduler_run", 1, { status: "error" });
    throw error;
  }
}

function calculatePriority(feed: {
  id: number;
  lastFetched: Date | null;
}): number {
  // Simple priority: hours since last fetch (or 999 for never fetched)
  const hoursSinceLastFetch = feed.lastFetched
    ? (Date.now() - feed.lastFetched.getTime()) / (60 * 60 * 1000)
    : 999;

  return Math.floor(hoursSinceLastFetch);
}
```

##### 4. Consumer (Queue → Fetch)

**Cloudflare Worker Consumer:**

```typescript
// packages/api/src/queue/consumers/feed-consumer.ts
import { createDatabase } from "@/db/client";
import { fetchSingleFeed } from "@/services/rss-fetcher";
import { emitCounter } from "@/utils/metrics";
import type { Env } from "@/types";

export interface FeedMessage {
  sourceId: number;
  url: string;
  priority: number;
}

export default {
  async queue(
    batch: MessageBatch<FeedMessage>,
    env: Env
  ): Promise<void> {
    console.log(`🔄 Processing ${batch.messages.length} feeds from queue...`);

    const db = createDatabase(env);

    // Process all feeds in parallel
    const results = await Promise.allSettled(
      batch.messages.map(async (message) => {
        const { sourceId, url } = message.body;

        try {
          const result = await fetchSingleFeed(sourceId, url, db);

          // Acknowledge successful processing
          message.ack();

          emitCounter("queue.feed_processed", 1, {
            status: "success",
            source_id: sourceId.toString(),
          });

          return result;
        } catch (error) {
          console.error(`Failed to process feed ${sourceId} (${url}):`, error);

          // Calculate exponential backoff delay
          const delaySeconds = 60 * Math.min(message.attempts, 10); // Max 10 minutes

          // Retry message (Cloudflare Queues will retry up to 100 times)
          message.retry({ delaySeconds });

          emitCounter("queue.feed_processed", 1, {
            status: "error",
            source_id: sourceId.toString(),
            attempts: message.attempts.toString(),
          });

          throw error;
        }
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled").length;
    const errorCount = results.filter(r => r.status === "rejected").length;

    console.log(
      `✅ Processed ${batch.messages.length} feeds: ${successCount} success, ${errorCount} errors`
    );

    emitCounter("queue.batch_processed", 1, {
      success_count: successCount.toString(),
      error_count: errorCount.toString(),
      batch_size: batch.messages.length.toString(),
    });
  }
};
```

**Entry Point (Cloudflare):**

```typescript
// packages/api/src/entries/cloudflare.ts (add queue consumer export)
import feedConsumer from "@/queue/consumers/feed-consumer";

// Existing default export for HTTP requests
export default Sentry.withSentry(/* ... */);

// NEW: Export queue consumer for Cloudflare Queues
export { feedConsumer as queue };
```

**Node.js Consumer (Docker):**

```typescript
// packages/api/src/entries/node-queue-consumer.ts
import { createQueueAdapter } from "@/queue/factory";
import { createDatabase } from "@/db/client";
import { fetchSingleFeed } from "@/services/rss-fetcher";
import type { Env } from "@/types";
import type { FeedMessage } from "@/queue/consumers/feed-consumer";

/**
 * Start queue consumer for Node.js/Docker deployment
 */
export async function startQueueConsumer(env: Env): Promise<void> {
  console.log("🔄 Starting queue consumer...");

  const queue = createQueueAdapter(env);
  const db = createDatabase(env);

  // Start processing queue
  await queue.processBatch<FeedMessage>(async (batch) => {
    console.log(`Processing ${batch.messages.length} feeds from queue...`);

    await Promise.allSettled(
      batch.messages.map(async (message) => {
        const { sourceId, url } = message.body;

        try {
          await fetchSingleFeed(sourceId, url, db);
          message.ack();
          console.log(`✓ Processed feed ${sourceId}`);
        } catch (error) {
          console.error(`✗ Failed to process feed ${sourceId}:`, error);
          message.retry({ delaySeconds: 60 });
        }
      })
    );
  });

  console.log("✅ Queue consumer started");
}

// Start consumer if running as standalone process
if (require.main === module) {
  const env = process.env as unknown as Env;
  startQueueConsumer(env).catch((error) => {
    console.error("❌ Queue consumer failed:", error);
    process.exit(1);
  });
}
```

##### 5. Configuration

**Cloudflare (wrangler.toml):**

```toml
# Queue configuration
[[queues.producers]]
binding = "FEED_QUEUE"
queue = "feed-fetcher"

[[queues.consumers]]
queue = "feed-fetcher"
max_batch_size = 100
max_batch_timeout = 30
max_retries = 100
dead_letter_queue = "feed-fetcher-dlq"
```

**Docker (docker-compose.yml):**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  api:
    # ... existing config ...
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis

  queue-consumer:
    build: .
    command: node packages/api/dist/entries/node-queue-consumer.js
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - DATABASE_PATH=/data/tuvix.db
    volumes:
      - ./data:/data
    depends_on:
      - redis

volumes:
  redis-data:
```

---

## Migration Strategy

### Step 1: Develop Queue Abstraction (Week 1)

**Tasks:**
1. Create queue adapter interfaces (`packages/api/src/queue/types.ts`)
2. Implement Cloudflare adapter (`adapters/cloudflare.ts`)
3. Implement BullMQ adapter (`adapters/bullmq.ts`)
4. Implement in-memory adapter (`adapters/in-memory.ts`)
5. Create factory function (`factory.ts`)
6. Write unit tests for all adapters

**Testing:**
- Test Cloudflare adapter with `wrangler dev` + queue bindings
- Test BullMQ adapter with local Redis
- Test in-memory adapter with Jest

### Step 2: Implement Scheduler Changes (Week 1)

**Tasks:**
1. Update `fetchAllFeeds()` with staleness filter
2. Modify `_handleRSSFetch()` to enqueue feeds
3. Add priority calculation
4. Update metrics/logging

**Testing:**
- Run locally with in-memory queue
- Verify feeds are enqueued correctly
- Check staleness filtering works

### Step 3: Implement Queue Consumer (Week 2)

**Tasks:**
1. Create feed consumer (`queue/consumers/feed-consumer.ts`)
2. Add Cloudflare entry point export
3. Create Node.js consumer entry point
4. Add error handling and retries
5. Integrate with Sentry for monitoring

**Testing:**
- Deploy to Cloudflare staging environment
- Test with local Docker + Redis
- Verify parallel processing works
- Test retry logic with failing feeds

### Step 4: Deploy and Monitor (Week 2)

**Tasks:**
1. Deploy to Cloudflare production
2. Update Docker Compose configuration
3. Monitor queue depth and throughput
4. Tune batch sizes and delays
5. Set up Sentry alerts for queue errors

**Success Metrics:**
- All 50,000 feeds processed in <5 minutes
- <1% retry rate
- <0.1% dead-letter queue rate
- Zero data loss

---

## Rollback Plan

### If Queue Implementation Fails

**Immediate Rollback:**
1. Revert cron handler to call `fetchAllFeeds()` directly
2. Keep queue code in codebase but unused
3. Monitor for stability

**Fallback to Phase 2:**
```typescript
// packages/api/src/cron/handlers.ts
async function _handleRSSFetch(env: Env): Promise<void> {
  const db = createDatabase(env);

  // FALLBACK: Direct call without queue
  const result = await fetchAllFeeds(db, {
    maxFeedsPerBatch: 100,
    stalenessThresholdMinutes: 30,
  });

  console.log(`✅ Fallback fetch completed: ${result.successCount} success`);
}
```

### Graceful Degradation

**Queue Unavailable Handling:**
```typescript
async function _handleRSSFetch(env: Env): Promise<void> {
  const db = createDatabase(env);

  try {
    const queue = createQueueAdapter(env);
    await enqueueFeeds(queue, db);
  } catch (error) {
    console.warn("⚠️ Queue unavailable, falling back to direct fetch:", error);

    // Fallback: Direct processing
    await fetchAllFeeds(db, {
      maxFeedsPerBatch: 100,
      stalenessThresholdMinutes: 30,
    });
  }
}
```

---

## Cost Analysis

### Cloudflare Queues Pricing

**Base Cost:**
- Workers Paid plan: $5/month (required)
- Queues: $0.40/million operations (after 1M free)

**Cost Projections:**

| Feeds | Fetches/Day | Queue Ops/Day | Queue Ops/Month | Cost/Month |
|-------|-------------|---------------|-----------------|------------|
| 2,000 | 96,000 | 192K | 5.76M | $1.90 |
| 10,000 | 480,000 | 960K | 28.8M | $11.12 |
| 50,000 | 2,400,000 | 4.8M | 144M | $57.20 |

**Calculation:**
- 2 operations per feed (1 enqueue + 1 dequeue)
- Fetches per day: (feeds × 24 hours × 60 min) / 30 min refresh = feeds × 48
- First 1M operations free per month

### Docker/BullMQ Pricing

**Infrastructure:**
- Redis: $0 (self-hosted) OR $10-20/month (managed)
- CPU/Memory: Included in existing server costs

**Total Cost:**
- Self-hosted Redis: $0/month (use existing Docker host)
- Managed Redis (e.g., Redis Cloud): $10-20/month

---

## Performance Benchmarks

### Target Metrics

| Metric | Phase 1 (Cron) | Phase 2 (Smart Cron) | Phase 3 (Queue) |
|--------|----------------|----------------------|-----------------|
| Max feeds | 2,000 | 5,000 | 50,000+ |
| Update frequency | 10-20 min | 15-30 min | <5 min |
| Throughput | 6K feeds/hr | 10K feeds/hr | 600K feeds/hr |
| Parallelization | None (sequential) | None | 100x (batch size) |
| Retry logic | None | None | Automatic (100 retries) |
| Fault tolerance | All-or-nothing | All-or-nothing | Per-feed |

### Cloudflare Workers Limits

| Resource | Limit | Usage (Queue) | Headroom |
|----------|-------|---------------|----------|
| CPU time | 30s (paid) | ~15s (100 feeds) | ✅ 50% |
| Memory | 128 MB | ~30 MB | ✅ 75% |
| Subrequests | 1,000 | ~105 (100 feeds + 5 DB) | ✅ 90% |
| Queue throughput | 5,000 msg/sec | ~300 msg/sec (peak) | ✅ 94% |

---

## Monitoring and Observability

### Key Metrics to Track

**Scheduler Metrics:**
- `rss.feeds_enqueued` - Number of feeds enqueued per run
- `rss.scheduler_run` - Scheduler execution count and status
- `rss.staleness_threshold` - Age of oldest feed processed

**Queue Metrics:**
- `queue.depth` - Number of pending messages (gauge)
- `queue.throughput` - Messages processed per second
- `queue.retry_rate` - Percentage of messages retried
- `queue.dlq_size` - Dead-letter queue size (should be near 0)

**Consumer Metrics:**
- `queue.feed_processed` - Individual feed processing results
- `queue.batch_processed` - Batch processing summary
- `queue.processing_time` - Time to process each batch

**Sentry Alerts:**
1. DLQ size > 10 messages (feeds failing repeatedly)
2. Queue depth > 10,000 messages (backlog building up)
3. Retry rate > 10% (widespread fetching issues)
4. Consumer errors > 5% (consumer crash or bug)

---

## Testing Strategy

### Unit Tests

```typescript
// packages/api/src/queue/__tests__/adapters.test.ts
describe("Queue Adapters", () => {
  describe("InMemoryQueueAdapter", () => {
    it("should enqueue and process messages", async () => {
      const adapter = new InMemoryQueueAdapter();

      await adapter.send({ sourceId: 1, url: "https://example.com/feed" });

      const processed: any[] = [];
      await adapter.processBatch(async (batch) => {
        processed.push(...batch.messages.map(m => m.body));
      });

      expect(processed).toHaveLength(1);
      expect(processed[0].sourceId).toBe(1);
    });
  });

  // Similar tests for CloudflareQueueAdapter and BullMQAdapter
});
```

### Integration Tests

```typescript
// packages/api/src/queue/__tests__/integration.test.ts
describe("Queue Integration", () => {
  it("should process feeds end-to-end", async () => {
    const env = createTestEnv();
    const db = createTestDatabase();

    // Seed database with test sources
    await db.insert(schema.sources).values([
      { url: "https://example.com/feed1", title: "Feed 1" },
      { url: "https://example.com/feed2", title: "Feed 2" },
    ]);

    // Run scheduler
    await handleRSSFetch(env);

    // Process queue
    const queue = createQueueAdapter(env);
    let processed = 0;
    await queue.processBatch(async (batch) => {
      processed = batch.messages.length;
    });

    expect(processed).toBe(2);
  });
});
```

### Load Tests

```typescript
// scripts/load-test-queue.ts
import { createQueueAdapter } from "@/queue/factory";

async function loadTest() {
  const queue = createQueueAdapter(process.env as any);

  // Enqueue 10,000 test feeds
  const feeds = Array.from({ length: 10000 }, (_, i) => ({
    sourceId: i,
    url: `https://example.com/feed-${i}`,
    priority: Math.random() * 100,
  }));

  console.time("Enqueue 10K feeds");
  await queue.sendBatch(feeds);
  console.timeEnd("Enqueue 10K feeds");

  // Measure processing time
  console.time("Process 10K feeds");
  await queue.processBatch(async (batch) => {
    // Simulate processing
    await Promise.all(
      batch.messages.map(async (msg) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms per feed
        msg.ack();
      })
    );
  });
  console.timeEnd("Process 10K feeds");
}

loadTest().catch(console.error);
```

---

## Security Considerations

### Queue Message Validation

```typescript
// packages/api/src/queue/validation.ts
import { z } from "zod";

const FeedMessageSchema = z.object({
  sourceId: z.number().int().positive(),
  url: z.string().url(),
  priority: z.number().int().min(0).max(1000),
});

export function validateFeedMessage(message: unknown): FeedMessage {
  return FeedMessageSchema.parse(message);
}

// In consumer:
try {
  const validatedMessage = validateFeedMessage(message.body);
  await fetchSingleFeed(validatedMessage.sourceId, validatedMessage.url, db);
} catch (error) {
  console.error("Invalid message format:", error);
  message.ack(); // Don't retry invalid messages
}
```

### Rate Limiting

Queue consumers should respect external API rate limits:

```typescript
// packages/api/src/queue/rate-limiter.ts
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  async throttle(domain: string, maxRequests: number, windowMs: number): Promise<void> {
    const now = Date.now();
    const requests = this.requests.get(domain) || [];

    // Remove old requests outside window
    const recent = requests.filter(time => now - time < windowMs);

    if (recent.length >= maxRequests) {
      const oldestRequest = recent[0];
      const waitTime = windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    recent.push(now);
    this.requests.set(domain, recent);
  }
}

// In consumer:
const rateLimiter = new RateLimiter();
await rateLimiter.throttle(domain, 60, 60000); // 60 req/min
```

---

## Open Questions and Future Enhancements

### Open Questions

1. **Queue priority**: Should we implement priority queues for high-priority feeds?
   - **Answer**: Phase 3 can add priority via separate queues (high/normal/low)

2. **Dead-letter queue handling**: What should we do with feeds that fail 100 times?
   - **Answer**: Manual review dashboard + auto-disable after 7 days in DLQ

3. **Multi-region**: Should we deploy consumers in multiple regions?
   - **Answer**: Not needed until >100K feeds (Phase 4)

### Future Enhancements

**Phase 4: Multi-Region Deployment (100K+ feeds)**

- Deploy queue consumers in multiple Cloudflare regions
- Use Durable Objects for feed state management
- Implement global rate limiting across regions

**Phase 5: Intelligent Scheduling (1M+ feeds)**

- ML-based feed update prediction (only fetch when new content expected)
- Adaptive refresh intervals based on historical update patterns
- User-specific priority (fetch feeds user reads first)

**Phase 6: Real-Time Updates**

- WebSocket connections for instant article delivery
- Push notifications for high-priority feeds
- Integration with WebSub/PubSubHubbub for instant updates

---

## Summary and Next Steps

### Current State (Phase 1 ✅)

- Batch size: 100 feeds
- Cron frequency: 1 minute (Cloudflare) / configurable (Docker)
- Capacity: 6,000 feeds/hour = 2,000-5,000 feeds with 20-30 min freshness

### Recommended Next Steps

**Short-term (1-2 days): Phase 2 Implementation**

1. Add staleness-based filtering to `fetchAllFeeds()`
2. Test with existing cron infrastructure
3. Deploy to production (no infrastructure changes)

**Medium-term (1-2 weeks): Phase 3 Implementation**

1. Develop queue abstraction layer
2. Implement Cloudflare Queues + BullMQ adapters
3. Create scheduler and consumer
4. Deploy to staging and test
5. Gradual rollout to production

**Long-term (3-6 months): Monitor and Optimize**

1. Monitor queue metrics in production
2. Tune batch sizes and retry policies
3. Add priority queues if needed
4. Plan for Phase 4 (multi-region) if feed count exceeds 50K

---

## References

- [Cloudflare Queues Documentation](https://developers.cloudflare.com/queues/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [RSS Best Practices (RFC 5005)](https://www.rfc-editor.org/rfc/rfc5005.html)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-05
**Author**: Claude (Anthropic)
**Status**: Draft for Review
