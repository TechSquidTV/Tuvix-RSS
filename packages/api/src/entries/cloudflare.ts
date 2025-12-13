/**
 * Cloudflare Workers Entry Point for Hono App
 *
 * This entry point runs on Cloudflare Workers edge runtime.
 */

import * as Sentry from "@sentry/cloudflare";
import { createHonoApp } from "@/hono/app";
import { getSentryConfig } from "@/config/sentry";
import type { Env } from "@/types";

/**
 * Prepare environment with D1 instrumentation
 * Extracts common logic used by both fetch and scheduled handlers
 */
function prepareEnv(env: Env): Env {
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

  return workerEnv;
}

// Worker handler with fetch and scheduled methods
const workerHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Validate required environment variables
    // In Cloudflare Workers, we can't exit() so we log errors and return error responses
    if (!env.BETTER_AUTH_SECRET) {
      console.error(
        "❌ FATAL: BETTER_AUTH_SECRET environment variable is required.\n" +
          "   Set it in wrangler.toml or via Cloudflare dashboard"
      );
      return new Response(
        JSON.stringify({
          error: "Server misconfiguration: BETTER_AUTH_SECRET not set",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Warn about weak secrets in production
    if (
      env.SENTRY_ENVIRONMENT === "production" &&
      env.BETTER_AUTH_SECRET.length < 32
    ) {
      console.warn("⚠️  WARNING: BETTER_AUTH_SECRET should be >=32 characters");
    }

    const workerEnv = prepareEnv(env);
    const app = createHonoApp({
      env: workerEnv,
      sentry: Sentry,
      runtime: "cloudflare",
    });

    return app.fetch(request, workerEnv);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    console.log("⏰ Cron triggered:", controller.cron);

    try {
      // Dynamic imports to reduce cold start time
      const { executeScheduledTasks } = await import("../cron/executor");
      const { createDatabase } = await import("../db/client");

      const workerEnv = prepareEnv(env);
      const db = createDatabase(workerEnv);

      const result = await executeScheduledTasks(workerEnv, db);

      console.log("✅ Cron job completed:", {
        rssFetch: result.rssFetch.executed ? "executed" : "skipped",
        articlePrune: result.articlePrune.executed ? "executed" : "skipped",
        tokenCleanup: result.tokenCleanup.executed ? "executed" : "skipped",
      });
    } catch (error) {
      console.error("❌ Cron job failed:", error);
      throw error;
    } finally {
      // Flush Sentry metrics before Workers execution ends
      if (env.SENTRY_DSN) {
        await Sentry.flush(2000); // 2 second timeout
      }
    }
  },
};

// Wrap with Sentry using withSentry pattern
export default Sentry.withSentry((env: Env) => {
  const config = getSentryConfig(env);

  // If no DSN provided, Sentry will be disabled
  if (!config) {
    console.warn(
      "⚠️ Sentry not initialized: SENTRY_DSN not configured. Set SENTRY_DSN in wrangler.toml or Cloudflare secrets."
    );
    return { dsn: undefined };
  }

  // Add version metadata if available
  const versionId = env?.CF_VERSION_METADATA?.id;
  if (versionId && typeof versionId === "string") {
    config.release = versionId;
  }

  // Log Sentry initialization in development
  const environment = (env.SENTRY_ENVIRONMENT ||
    env.NODE_ENV ||
    "development") as string;
  if (environment === "development") {
    console.log("✅ Sentry initialized for backend:", {
      environment,
      release: config.release,
      hasDsn: !!config.dsn,
    });
  }

  return config;
}, workerHandler);
