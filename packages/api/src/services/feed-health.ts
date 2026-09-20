import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@api/db/client";
import { feedFetchHealth } from "@api/db/schema";
import * as Sentry from "@api/utils/sentry";

/** Alert on sustained ingestion failures/growing backlog; throttle across workers. */
export async function recordFeedBatchHealth(
  db: Database,
  batch: {
    backlog: number;
    errors: number;
    added: number;
    processed: number;
  }
): Promise<void> {
  if (batch.processed === 0) return;
  // A successful fetch is progress even when the publisher has no new articles.
  const stalled = batch.errors === batch.processed;
  const [health] = await db
    .insert(feedFetchHealth)
    .values({
      id: 1,
      backlog: batch.backlog,
      failingBatches: stalled ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: feedFetchHealth.id,
      set: {
        backlog: batch.backlog,
        failingBatches: stalled
          ? sql`${feedFetchHealth.failingBatches} + 1`
          : 0,
        growingBatches: sql`CASE WHEN ${batch.backlog} > ${feedFetchHealth.backlog} THEN ${feedFetchHealth.growingBatches} + 1 ELSE 0 END`,
      },
    })
    .returning();
  if (!health || (health.failingBatches < 3 && health.growingBatches < 3))
    return;
  const now = new Date();
  const claimed = await db
    .update(feedFetchHealth)
    .set({ lastAlertAt: now })
    .where(
      and(
        eq(feedFetchHealth.id, 1),
        or(
          isNull(feedFetchHealth.lastAlertAt),
          lt(feedFetchHealth.lastAlertAt, new Date(now.getTime() - 30 * 60_000))
        )
      )
    )
    .returning();
  if (!claimed.length) return;
  Sentry.captureMessage("RSS ingestion is stalled or falling behind", {
    level: "error",
    tags: { operation: "rss_ingestion_health" },
    extra: {
      ...batch,
      failing_batches: health.failingBatches,
      growing_batches: health.growingBatches,
    },
  });
}
