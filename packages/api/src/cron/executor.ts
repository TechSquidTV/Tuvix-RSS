import { CRON_SCHEDULES } from "./schedules";
/**
 * Cron Executor (Shared)
 *
 * Shared execution logic for scheduled tasks.
 * Used by both Cloudflare Workers (scheduled events) and Node.js (node-cron).
 *
 * This ensures consistent behavior across runtimes:
 * - RSS batches: every minute; individual feeds use fetchIntervalMinutes
 * - Article prune: every 24 hours
 * - Token cleanup: every 7 days (weekly)
 */

import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@api/db/schema";
import { getGlobalSettings } from "@api/services/global-settings";
import {
  handleRSSFetch,
  handleArticlePrune,
  handleTokenCleanup,
} from "./handlers";
import { emitCounter } from "@api/utils/metrics";
import type { Env } from "@api/types";

// Generic database type that works with both D1 and better-sqlite3
type Database =
  DrizzleD1Database<typeof schema> | BetterSQLite3Database<typeof schema>;

// Interval constants
const RSS_BATCH_INTERVAL_MS = CRON_SCHEDULES["rss-fetch"].minutes * 60 * 1000;
const PRUNE_INTERVAL_MS = CRON_SCHEDULES["article-prune"].minutes * 60 * 1000; // 24 hours
const TOKEN_CLEANUP_INTERVAL_MS =
  CRON_SCHEDULES["token-cleanup"].minutes * 60 * 1000; // 7 days

/**
 * Result of executing scheduled tasks
 */
export interface ExecutionResult {
  rssFetch: {
    executed: boolean;
    skippedReason?: string;
  };
  articlePrune: {
    executed: boolean;
    deletedCount?: number;
    skippedReason?: string;
  };
  tokenCleanup: {
    executed: boolean;
    deletedCount?: number;
    skippedReason?: string;
  };
}

/**
 * Check if a task should run based on last run time and interval
 */
function shouldRunTask(lastRunAt: Date | null, intervalMs: number): boolean {
  if (!lastRunAt) return true;
  const now = Date.now();
  return now - lastRunAt.getTime() >= intervalMs;
}

/**
 * Update a cron timestamp in global_settings
 */
async function updateCronTimestamp(
  db: Database,
  field: "lastRssFetchAt" | "lastPruneAt" | "lastTokenCleanupAt",
  timestamp: Date
): Promise<void> {
  await db
    .update(schema.globalSettings)
    .set({ [field]: timestamp })
    .where(eq(schema.globalSettings.id, 1));
}

/**
 * Execute all scheduled tasks based on their intervals
 *
 * This is the main entry point called by both:
 * - Cloudflare Workers: scheduled() handler
 * - Node.js: node-cron scheduler
 *
 * @param env Environment configuration
 * @param db Database connection
 * @returns Execution result for each task
 */
export async function executeScheduledTasks(
  env: Env,
  db: Database
): Promise<ExecutionResult> {
  const now = new Date();
  const settings = await getGlobalSettings(db);

  const result: ExecutionResult = {
    rssFetch: { executed: false },
    articlePrune: { executed: false },
    tokenCleanup: { executed: false },
  };

  // Drain the bounded queue every minute. The configured refresh interval
  // applies to each feed, not to the entire queue between batches.
  if (shouldRunTask(settings.lastRssFetchAt, RSS_BATCH_INTERVAL_MS)) {
    console.log("🔄 Executing RSS fetch...");
    emitCounter("cron.rss_fetch_triggered", 1, { status: "executed" });

    await handleRSSFetch(env, settings.fetchIntervalMinutes);
    await updateCronTimestamp(db, "lastRssFetchAt", now);

    result.rssFetch.executed = true;
    console.log("✅ RSS fetch completed");
  } else if (settings.lastRssFetchAt) {
    const minutesSinceLastFetch = Math.floor(
      (now.getTime() - settings.lastRssFetchAt.getTime()) / (60 * 1000)
    );
    result.rssFetch.skippedReason = `Last fetch was ${minutesSinceLastFetch} minutes ago (batch interval: 1 minute)`;
    console.log(`⏭️ Skipping RSS fetch: ${result.rssFetch.skippedReason}`);
    emitCounter("cron.rss_fetch_triggered", 1, { status: "skipped" });
  }

  // Article Prune - every 24 hours
  if (shouldRunTask(settings.lastPruneAt, PRUNE_INTERVAL_MS)) {
    console.log("🗑️ Executing article prune...");
    emitCounter("cron.prune_triggered", 1, { status: "executed" });

    const pruneResult = await handleArticlePrune(env);
    await updateCronTimestamp(db, "lastPruneAt", now);

    result.articlePrune.executed = true;
    result.articlePrune.deletedCount = pruneResult.deletedCount;
    console.log(
      `✅ Prune completed (deleted ${pruneResult.deletedCount} articles)`
    );
  } else if (settings.lastPruneAt) {
    const hoursSinceLastPrune = Math.floor(
      (now.getTime() - settings.lastPruneAt.getTime()) / (60 * 60 * 1000)
    );
    result.articlePrune.skippedReason = `Last prune was ${hoursSinceLastPrune} hours ago`;
    console.log(`⏭️ Skipping prune: ${result.articlePrune.skippedReason}`);
    emitCounter("cron.prune_triggered", 1, { status: "skipped" });
  }

  // Token Cleanup - every 7 days (weekly)
  if (shouldRunTask(settings.lastTokenCleanupAt, TOKEN_CLEANUP_INTERVAL_MS)) {
    console.log("🧹 Executing token cleanup...");
    emitCounter("cron.token_cleanup_triggered", 1, { status: "executed" });

    const cleanupResult = await handleTokenCleanup(env);
    await updateCronTimestamp(db, "lastTokenCleanupAt", now);

    result.tokenCleanup.executed = true;
    result.tokenCleanup.deletedCount = cleanupResult.deletedCount;
    console.log(
      `✅ Token cleanup completed (deleted ${cleanupResult.deletedCount} tokens)`
    );
  } else if (settings.lastTokenCleanupAt) {
    const daysSinceLastCleanup = Math.floor(
      (now.getTime() - settings.lastTokenCleanupAt.getTime()) /
        (24 * 60 * 60 * 1000)
    );
    result.tokenCleanup.skippedReason = `Last cleanup was ${daysSinceLastCleanup} days ago`;
    console.log(
      `⏭️ Skipping token cleanup: ${result.tokenCleanup.skippedReason}`
    );
    emitCounter("cron.token_cleanup_triggered", 1, { status: "skipped" });
  }

  return result;
}
