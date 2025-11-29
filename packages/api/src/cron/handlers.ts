/**
 * Cron Job Handlers (Portable)
 *
 * These handlers work on both Node.js and Cloudflare Workers.
 * The scheduler (node-cron or Workers scheduled events) calls these.
 */

import { createDatabase } from "@/db/client";
import { fetchAllFeeds } from "@/services/rss-fetcher";
import { getGlobalSettings } from "@/services/global-settings";
import { inArray, lt, or, isNull, and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Env } from "@/types";
import { D1_MAX_PARAMETERS, chunkArray } from "@/db/utils";
import { emitCounter, withTiming } from "@/utils/metrics";

/**
 * Fetch all RSS feeds
 *
 * Called by:
 * - Node.js: node-cron scheduler (scheduler.ts)
 * - Workers: scheduled event (cloudflare.ts)
 */
async function _handleRSSFetch(env: Env): Promise<void> {
  console.log("🔄 Starting scheduled RSS fetch...");

  const db = createDatabase(env);

  try {
    const result = await fetchAllFeeds(db);

    console.log(`✅ RSS fetch completed:`, {
      total: result.total,
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

// Export wrapped versions with Sentry monitoring (Cloudflare only)
// For Node.js, these will be used directly without monitoring
export async function handleRSSFetch(env: Env): Promise<void> {
  if (env.RUNTIME === "cloudflare" && env.SENTRY_DSN) {
    try {
      // Dynamic import for Cloudflare-only Sentry module
      const Sentry = (await import("@sentry/cloudflare")) as {
        withMonitor: (
          name: string,
          handler: () => Promise<void>,
          options: { schedule: { type: string; value: string } }
        ) => Promise<void>;
      };
      await Sentry.withMonitor("rss-fetch", () => _handleRSSFetch(env), {
        schedule: { type: "crontab", value: "*/5 * * * *" },
      });
      return;
    } catch {
      // Sentry not available, use regular handler
    }
  }
  return _handleRSSFetch(env);
}

export async function handleArticlePrune(env: Env): Promise<{
  deletedCount: number;
}> {
  if (env.RUNTIME === "cloudflare" && env.SENTRY_DSN) {
    try {
      // Dynamic import for Cloudflare-only Sentry module
      const Sentry = (await import("@sentry/cloudflare")) as {
        withMonitor: <T>(
          name: string,
          handler: () => Promise<T>,
          options: { schedule: { type: string; value: string } }
        ) => Promise<T>;
      };
      return await Sentry.withMonitor(
        "article-prune",
        () => _handleArticlePrune(env),
        {
          schedule: { type: "crontab", value: "0 2 * * *" },
        }
      );
    } catch {
      // Sentry not available, use regular handler
    }
  }
  return _handleArticlePrune(env);
}

export async function handleTokenCleanup(env: Env): Promise<{
  deletedCount: number;
}> {
  if (env.RUNTIME === "cloudflare" && env.SENTRY_DSN) {
    try {
      // Dynamic import for Cloudflare-only Sentry module
      const Sentry = (await import("@sentry/cloudflare")) as {
        withMonitor: <T>(
          name: string,
          handler: () => Promise<T>,
          options: { schedule: { type: string; value: string } }
        ) => Promise<T>;
      };
      return await Sentry.withMonitor(
        "token-cleanup",
        () => _handleTokenCleanup(env),
        {
          schedule: { type: "crontab", value: "0 * * * *" }, // Every hour
        }
      );
    } catch {
      // Sentry not available, use regular handler
    }
  }
  return _handleTokenCleanup(env);
}
