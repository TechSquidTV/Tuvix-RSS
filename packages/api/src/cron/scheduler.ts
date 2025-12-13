/**
 * Node.js Cron Scheduler
 *
 * Uses node-cron for Docker deployments.
 * Polls every minute and uses the shared executor to determine which tasks to run.
 * This matches Cloudflare Workers behavior for consistency across runtimes.
 */

import cron from "node-cron";
import { executeScheduledTasks } from "./executor";
import { createDatabase } from "@/db/client";
import type { Env } from "@/types";

/**
 * Initialize cron jobs for Node.js runtime
 *
 * Sets up a single cron job that polls every minute.
 * The executor checks timestamps in global_settings to determine
 * which tasks should actually run, ensuring consistent behavior
 * with Cloudflare Workers.
 */
export async function initCronJobs(env: Env): Promise<void> {
  console.log("⏰ Initializing cron jobs...");

  const db = createDatabase(env);

  // Poll every minute - executor handles timing logic
  // This matches Cloudflare Workers which triggers every minute via wrangler.toml
  cron.schedule("* * * * *", async () => {
    try {
      const result = await executeScheduledTasks(env, db);

      // Only log summary if something was executed
      const executed = [
        result.rssFetch.executed && "RSS fetch",
        result.articlePrune.executed && "article prune",
        result.tokenCleanup.executed && "token cleanup",
      ].filter(Boolean);

      if (executed.length > 0) {
        console.log(`✅ Cron executed: ${executed.join(", ")}`);
      }
    } catch (error) {
      console.error("❌ Cron job error:", error);
      // Don't rethrow - let the scheduler continue
    }
  });

  console.log("✅ Cron scheduler initialized (polling every minute)");
  console.log("   Tasks run based on timestamps in global_settings:");
  console.log("   - RSS fetch: based on fetchIntervalMinutes setting");
  console.log("   - Article prune: every 24 hours");
  console.log("   - Token cleanup: every 7 days");
}
