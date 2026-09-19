// Set runtime FIRST (before any imports)
process.env.RUNTIME = "nodejs";

import * as Sentry from "@sentry/node";
import { serve } from "@hono/node-server";
import { createHonoApp } from "@api/hono/app";
import { runMigrationsIfNeeded } from "@api/db/migrate-local";
import { initCronJobs } from "@api/cron/scheduler";
import { initializeAdmin } from "@api/services/admin-init";
import { createDatabase } from "@api/db/client";
import { getSentryConfig } from "@api/config/sentry";
import type { Env } from "@api/types";

// Load environment
const env: Env = {
  RUNTIME: "nodejs",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  DATABASE_PATH: process.env.DATABASE_PATH || "./data/tuvix.db",
  PORT: process.env.PORT || "3001",
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
  BASE_URL: process.env.BASE_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  API_URL: process.env.API_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  ALLOW_FIRST_USER_ADMIN: process.env.ALLOW_FIRST_USER_ADMIN,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  SENTRY_RELEASE: process.env.SENTRY_RELEASE,
};

// Validate required env vars
if (!env.BETTER_AUTH_SECRET) {
  console.error(
    "❌ FATAL: BETTER_AUTH_SECRET environment variable is required.\n" +
      "   Generate: openssl rand -base64 32"
  );
  process.exit(1);
}

if (env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET.length < 32) {
  console.warn("⚠️  WARNING: BETTER_AUTH_SECRET should be >=32 characters");
}

// Initialize Sentry (optional)
if (env.SENTRY_DSN) {
  const sentryConfig = getSentryConfig(env);
  if (sentryConfig) {
    Sentry.init({
      ...sentryConfig,
      integrations: [
        // Configure HTTP integration to NOT capture request bodies for tRPC routes
        // tRPC needs to read the body stream, and Sentry's body capture consumes it
        // See: https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/http/
        Sentry.httpIntegration({
          // Ignore request bodies for tRPC routes - tRPC needs to read the stream itself
          // If Sentry reads it first, the stream is consumed and tRPC receives undefined
          ignoreIncomingRequestBody: (url) => url.includes("/trpc"),
        }),
        Sentry.nativeNodeFetchIntegration(),
        // Vercel AI SDK integration for automatic AI span tracking
        // Captures token usage, model info, latency, and errors from AI SDK calls
        Sentry.vercelAIIntegration({
          recordInputs: true, // Safe: only used for pro/enterprise users with opt-in
          recordOutputs: true, // Captures structured category suggestions
        }),
        // Automatically capture console.log, console.warn, and console.error as logs
        Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
        // Hono error capturing integration
        Sentry.honoIntegration(),
      ],
    });
    console.log(
      "✅ Sentry initialized (metrics, AI tracking, console logging, HTTP tracing, tRPC tracing enabled)"
    );
  }
}

// Main initialization
void (async () => {
  try {
    // Run migrations
    await runMigrationsIfNeeded(env);
    console.log("✅ Migrations completed");

    // Create Hono app
    const app = createHonoApp({
      env,
      sentry: Sentry,
      runtime: "nodejs",
    });

    // Initialize cron jobs (background)
    initCronJobs(env).catch((error) => {
      console.error("Failed to initialize cron:", error);
    });

    // Initialize admin
    const db = createDatabase(env);
    initializeAdmin(db, env)
      .then((result) => {
        if (result.created) {
          console.log(`✅ ${result.message}`);
        } else if (result.message.startsWith("Failed")) {
          console.error(`❌ ${result.message}`);
        }
      })
      .catch((error) => {
        console.error("❌ Failed to initialize admin:", error);
      });

    // Start server
    const port = parseInt(env.PORT || "3001", 10);
    serve(
      {
        fetch: (request, bindings) => {
          // Proxy headers are attacker-controlled on a directly exposed Node API.
          if (env.TRUST_PROXY_HEADERS === "true")
            return app.fetch(request, bindings);
          const headers = new Headers(request.headers);
          for (const name of [
            "cf-connecting-ip",
            "x-real-ip",
            "x-forwarded-for",
            "x-client-ip",
          ])
            headers.delete(name);
          headers.set(
            "x-real-ip",
            bindings.incoming.socket.remoteAddress ?? "unidentified"
          );
          return app.fetch(new Request(request, { headers }), bindings);
        },
        port,
      },
      () => {
        console.log(`🚀 Hono Server (Node.js) on http://localhost:${port}`);
        console.log(`📊 Health: http://localhost:${port}/health`);
        console.log(`🔌 tRPC: http://localhost:${port}/trpc`);
      }
    );
  } catch (error) {
    console.error("❌ Failed to start:", error);
    process.exit(1);
  }
})();
