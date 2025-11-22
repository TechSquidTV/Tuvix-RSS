/**
 * Cron Job Handlers (Portable)
 *
 * These handlers work on both Node.js and Cloudflare Workers.
 * The scheduler (node-cron or Workers scheduled events) calls these.
 */

import { createDatabase } from "@/db/client";
import { fetchAllFeeds } from "@/services/rss-fetcher";
import { getGlobalSettings } from "@/services/global-settings";
import { inArray, lt, or, isNull, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Env } from "@/types";

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
    const cutoffDateForComparison = new Date(cutoffTimestamp);
    // Use SQL COALESCE but ensure proper comparison by using sql template for the comparison value too
    const articlesToDelete = await db
      .select()
      .from(schema.articles)
      .where(
        or(
          // Articles with publishedAt that are older than cutoff
          lt(schema.articles.publishedAt, cutoffDateForComparison),
          // Articles without publishedAt but with createdAt older than cutoff
          and(
            isNull(schema.articles.publishedAt),
            lt(schema.articles.createdAt, cutoffDateForComparison)
          )!
        )!
      );

    const articleIds = articlesToDelete.map((a) => a.id);

    if (articleIds.length === 0) {
      console.log("✅ No articles to prune");
      return { deletedCount: 0 };
    }

    // Delete articles in batches (cascade will auto-delete user_article_states)
    // SQLite has a limit on number of parameters, so batch in chunks of 999
    const batchSize = 999;
    let deletedCount = 0;

    for (let i = 0; i < articleIds.length; i += batchSize) {
      const batch = articleIds.slice(i, i + batchSize);
      await db
        .delete(schema.articles)
        .where(inArray(schema.articles.id, batch));
      deletedCount += batch.length;
    }

    console.log(
      `🗑️ Pruned ${deletedCount} articles older than ${settings.pruneDays} days`
    );

    return { deletedCount };
  } catch (error) {
    console.error("❌ Article prune failed:", error);
    throw error;
  }
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
