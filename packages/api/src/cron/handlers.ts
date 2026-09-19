import { CRON_SCHEDULES } from "./schedules";
/**
 * Cron Job Handlers (Portable)
 *
 * These handlers work on both Node.js and Cloudflare Workers.
 * The scheduler (node-cron or Workers scheduled events) calls these.
 */

import { createDatabase } from "@api/db/client";
import { fetchAllFeeds } from "@api/services/rss-fetcher";
import { getGlobalSettings } from "@api/services/global-settings";
import { sql, inArray, lt, or, isNull, and, eq } from "drizzle-orm";
import * as schema from "@api/db/schema";
import type { Env } from "@api/types";
import { D1_MAX_PARAMETERS, chunkArray } from "@api/db/utils";
import { emitCounter, withTiming } from "@api/utils/metrics";

/**
 * Fetch all RSS feeds
 *
 * Called by:
 * - Node.js: node-cron scheduler (scheduler.ts)
 * - Workers: scheduled event (cloudflare.ts)
 */
async function _handleRSSFetch(
  env: Env,
  stalenessThresholdMinutes: number
): Promise<void> {
  console.log("🔄 Starting scheduled RSS fetch...");

  const db = createDatabase(env);

  try {
    const result = await fetchAllFeeds(db, { stalenessThresholdMinutes });

    console.log(`✅ RSS fetch completed:`, {
      processed: result.processedCount,
      success: result.successCount,
      errors: result.errorCount,
    });
  } catch (error) {
    console.error("❌ RSS fetch failed:", error);
    throw error;
  }
}

/**
 * Clean up expired verification tokens
 *
 * Called by:
 * - Node.js: node-cron scheduler (scheduler.ts) - hourly
 * - Workers: scheduled event (cloudflare.ts) - checked on each cron trigger
 *
 * Deletes verification tokens that expired more than 24 hours ago.
 * Keeps recently expired tokens for debugging purposes.
 *
 * @returns Number of tokens deleted
 */
async function _handleTokenCleanup(env: Env): Promise<{
  deletedCount: number;
}> {
  console.log("🧹 Starting token cleanup...");

  return await withTiming(
    "cron.token_cleanup_duration",
    async () => {
      const db = createDatabase(env);

      try {
        // Delete tokens expired more than 24 hours ago
        // Keep recently expired tokens for debugging
        const cutoffTimestamp = Date.now() - 24 * 60 * 60 * 1000;

        const deletedTokens = await db
          .delete(schema.verification)
          .where(lt(schema.verification.expiresAt, new Date(cutoffTimestamp)))
          .returning();

        await db
          .delete(schema.authRateLimits)
          .where(
            sql`${schema.authRateLimits.windowStartedAt} < ${cutoffTimestamp} AND ${schema.authRateLimits.lockedUntil} < ${Date.now()}`
          );

        const deletedCount = deletedTokens.length;

        console.log(
          `🧹 Cleaned up ${deletedCount} expired verification tokens`
        );

        // Emit metrics
        emitCounter("cron.tokens_cleaned", deletedCount);
        emitCounter("cron.token_cleanup_completed", 1, {
          status: "success",
        });

        return { deletedCount };
      } catch (error) {
        console.error("❌ Token cleanup failed:", error);

        // Emit error metric
        emitCounter("cron.token_cleanup_completed", 1, {
          status: "error",
        });

        throw error;
      }
    },
    { operation: "token_cleanup" }
  );
}

/**
 * Prune articles older than configured days
 *
 * Called by:
 * - Node.js: node-cron scheduler (scheduler.ts) - daily at 2 AM
 * - Workers: scheduled event (cloudflare.ts) - checked on each cron trigger
 *
 * @returns Number of articles deleted
 */
async function _handleArticlePrune(env: Env): Promise<{
  deletedCount: number;
}> {
  console.log("🗑️ Starting article prune...");

  return await withTiming(
    "cron.article_prune_duration",
    async () => {
      const db = createDatabase(env);

      try {
        // Get global settings
        const settings = await getGlobalSettings(db);

        // Calculate cutoff date (convert to timestamp for SQLite)
        const cutoffDate = new Date(
          Date.now() - settings.pruneDays * 24 * 60 * 60 * 1000
        );
        const cutoffTimestamp = cutoffDate.getTime();

        // Find articles to delete (use publishedAt or createdAt if publishedAt is null)
        // Exclude articles that are saved by any user
        const cutoffDateForComparison = new Date(cutoffTimestamp);

        // Find old articles that are NOT saved by any user
        // Uses LEFT JOIN with NULL check for better performance than NOT IN subquery
        const articlesToDelete = await db
          .select()
          .from(schema.articles)
          .leftJoin(
            schema.userArticleStates,
            and(
              eq(schema.userArticleStates.articleId, schema.articles.id),
              eq(schema.userArticleStates.saved, true)
            )
          )
          .where(
            and(
              // Article is old (either by publishedAt or createdAt)
              or(
                lt(schema.articles.publishedAt, cutoffDateForComparison),
                and(
                  isNull(schema.articles.publishedAt),
                  lt(schema.articles.createdAt, cutoffDateForComparison)
                )!
              )!,
              // Article is NOT saved by any user (no matching JOIN row)
              isNull(schema.userArticleStates.articleId)
            )!
          );

        const articleIds = articlesToDelete.map((row) => row.articles.id);

        if (articleIds.length === 0) {
          console.log("✅ No articles to prune");
          emitCounter("cron.articles_pruned", 0);
          return { deletedCount: 0 };
        }

        // Delete articles in batches (cascade will auto-delete user_article_states)
        // Cloudflare D1 has a limit of 100 parameters per query, so batch in chunks
        const batches = chunkArray(articleIds, D1_MAX_PARAMETERS);
        let deletedCount = 0;

        for (const batch of batches) {
          await db
            .delete(schema.articles)
            .where(inArray(schema.articles.id, batch));
          deletedCount += batch.length;
        }

        console.log(
          `🗑️ Pruned ${deletedCount} articles older than ${settings.pruneDays} days (saved articles excluded)`
        );

        // Emit metrics
        emitCounter("cron.articles_pruned", deletedCount, {
          prune_days: settings.pruneDays.toString(),
        });

        emitCounter("cron.prune_completed", 1, {
          status: "success",
        });

        return { deletedCount };
      } catch (error) {
        console.error("❌ Article prune failed:", error);

        // Emit error metric
        emitCounter("cron.prune_completed", 1, {
          status: "error",
        });

        throw error;
      }
    },
    { operation: "article_prune" }
  );
}

/** Import failures may disable monitoring; task failures must never rerun work. */
async function runMonitored<T>(
  env: Env,
  name: keyof typeof CRON_SCHEDULES,
  task: () => Promise<T>
): Promise<T> {
  if (env.RUNTIME !== "cloudflare" || !env.SENTRY_DSN) return task();
  let sdk: typeof import("@sentry/cloudflare");
  try {
    sdk = await import("@sentry/cloudflare");
  } catch {
    return task();
  }
  return sdk.withMonitor(name, task, {
    schedule: {
      type: "interval",
      value: CRON_SCHEDULES[name].minutes,
      unit: "minute",
    },
  });
}

export function handleRSSFetch(
  env: Env,
  stalenessThresholdMinutes: number
): Promise<void> {
  return runMonitored(env, "rss-fetch", () =>
    _handleRSSFetch(env, stalenessThresholdMinutes)
  );
}

export function handleArticlePrune(
  env: Env
): Promise<{ deletedCount: number }> {
  return runMonitored(env, "article-prune", () => _handleArticlePrune(env));
}

export function handleTokenCleanup(
  env: Env
): Promise<{ deletedCount: number }> {
  return runMonitored(env, "token-cleanup", () => _handleTokenCleanup(env));
}
