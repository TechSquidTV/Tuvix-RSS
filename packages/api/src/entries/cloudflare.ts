/**
 * Cloudflare Workers Entry Point for Hono App
 *
 * This entry point runs on Cloudflare Workers edge runtime.
 */

import * as Sentry from "@sentry/cloudflare";
import { createHonoApp } from "../hono/app";
import { getSentryConfig } from "../config/sentry";
import type { Env } from "../types";

// Create the Hono app with Cloudflare-specific Sentry
const createWorkerHandler = (env: Env) => {
  // Ensure RUNTIME is set to "cloudflare"
  let workerEnv: Env = { ...env, RUNTIME: "cloudflare" };

  // Instrument D1 database with Sentry if available
  if (env.DB && env.SENTRY_DSN) {
    try {
      const instrumentedD1 = Sentry.instrumentD1WithSentry(env.DB);
      workerEnv = { ...workerEnv, DB: instrumentedD1 };
    } catch {
      // Sentry instrumentation failed, continue with regular D1
    }
  }

  return createHonoApp({
    env: workerEnv,
    sentry: Sentry,
    runtime: "cloudflare",
  });
};

// Worker handler with fetch and scheduled methods
const workerHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = createWorkerHandler(env);
    return app.fetch(request, env);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    console.log("⏰ Cron triggered:", controller.cron);

    try {
      // Import dependencies
      const { handleRSSFetch, handleArticlePrune } = await import(
        "../cron/handlers"
      );
      const { getGlobalSettings } = await import("../services/global-settings");
      const { createDatabase } = await import("../db/client");
      const { eq } = await import("drizzle-orm");
      const schema = await import("../db/schema");

      const db = createDatabase(env);
      const now = new Date();

      // Get global settings
      const settings = await getGlobalSettings(db);

      // Check if RSS fetch should run
      const shouldFetch =
        !settings.lastRssFetchAt ||
        now.getTime() - settings.lastRssFetchAt.getTime() >=
          settings.fetchIntervalMinutes * 60 * 1000;

      if (shouldFetch) {
        console.log("🔄 Executing RSS fetch...");
        await handleRSSFetch(env);

        // Update lastRssFetchAt
        await db
          .update(schema.globalSettings)
          .set({ lastRssFetchAt: now })
          .where(eq(schema.globalSettings.id, 1));

        console.log("✅ RSS fetch completed");
      } else {
        const minutesSinceLastFetch = Math.floor(
          (now.getTime() - settings.lastRssFetchAt!.getTime()) / (60 * 1000)
        );
        console.log(
          `⏭️ Skipping RSS fetch (last fetch was ${minutesSinceLastFetch} minutes ago, interval: ${settings.fetchIntervalMinutes} minutes)`
        );
      }

      // Check if prune should run (daily)
      const shouldPrune =
        !settings.lastPruneAt ||
        now.getTime() - settings.lastPruneAt.getTime() >= 24 * 60 * 60 * 1000; // 24 hours

      if (shouldPrune) {
        console.log("🗑️ Executing article prune...");
        const result = await handleArticlePrune(env);

        // Update lastPruneAt
        await db
          .update(schema.globalSettings)
          .set({ lastPruneAt: now })
          .where(eq(schema.globalSettings.id, 1));

        console.log(
          `✅ Prune completed (deleted ${result.deletedCount} articles)`
        );
      } else {
        const hoursSinceLastPrune = Math.floor(
          (now.getTime() - settings.lastPruneAt!.getTime()) / (60 * 60 * 1000)
        );
        console.log(
          `⏭️ Skipping prune (last prune was ${hoursSinceLastPrune} hours ago)`
        );
      }

      console.log("✅ Cron job completed successfully");
    } catch (error) {
      console.error("❌ Cron job failed:", error);
      throw error;
    }
  },
};

// Wrap with Sentry using withSentry pattern
export default Sentry.withSentry((env: Env) => {
  const config = getSentryConfig(env);

  // If no DSN provided, Sentry will be disabled
  if (!config) {
    return { dsn: undefined };
  }

  // Add version metadata if available
  const versionId = env?.CF_VERSION_METADATA?.id;
  if (versionId && typeof versionId === "string") {
    config.release = versionId;
  }

  return config;
}, workerHandler);
