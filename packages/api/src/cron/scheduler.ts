/**
 * Node.js Cron Scheduler
 *
 * Uses node-cron for Docker deployments.
 * For Cloudflare Workers, scheduled events are used instead (see cloudflare.ts).
 */

import cron from "node-cron";
import {
  handleRSSFetch,
  handleArticlePrune,
  handleTokenCleanup,
} from "./handlers";
import { getGlobalSettings } from "@/services/global-settings";
import { createDatabase } from "@/db/client";
import type { Env } from "@/types";

/**
 * Convert minutes to cron expression
 *
 * @param minutes Number of minutes
 * @returns Cron expression string
 */
function minutesToCronExpression(minutes: number): string {
  if (minutes <= 0) {
    throw new Error(`Invalid minutes: ${minutes}. Must be positive.`);
  }

  // For values <= 60, use */minutes format
  if (minutes <= 60) {
    return `*/${minutes} * * * *`;
  }

  // For values > 60, convert to hours
  const hours = Math.floor(minutes / 60);
  if (hours === 24) {
    // Daily at midnight
    return "0 0 * * *";
  }

  // Hourly at minute 0
  return `0 */${hours} * * *`;
}

/**
 * Initialize cron jobs for Node.js runtime
 */
export async function initCronJobs(env: Env): Promise<void> {
  console.log("⏰ Initializing cron jobs...");

  const db = createDatabase(env);

  try {
    // Get global settings to determine fetch interval
    const settings = await getGlobalSettings(db);
    const fetchCronExpression = minutesToCronExpression(
      settings.fetchIntervalMinutes
    );

    // Schedule RSS fetch with dynamic interval
    cron.schedule(fetchCronExpression, async () => {
      try {
        await handleRSSFetch(env);
      } catch (error) {
        console.error("❌ RSS fetch cron job error:", error);
        throw error;
      }
    });

    // Schedule article prune daily at 2 AM
    cron.schedule("0 2 * * *", async () => {
      try {
        await handleArticlePrune(env);
      } catch (error) {
        console.error("❌ Prune cron job error:", error);
        throw error;
      }
    });

    // Schedule token cleanup hourly
    cron.schedule("0 * * * *", async () => {
      try {
        await handleTokenCleanup(env);
      } catch (error) {
        console.error("❌ Token cleanup cron job error:", error);
        throw error;
      }
    });

    console.log("✅ Cron jobs initialized");
    console.log(
      `   - RSS fetch: every ${settings.fetchIntervalMinutes} minutes`
    );
    console.log("   - Article prune: daily at 2 AM");
    console.log("   - Token cleanup: hourly");
  } catch (error) {
    console.error("❌ Failed to initialize cron jobs:", error);
    throw error;
  }
}
