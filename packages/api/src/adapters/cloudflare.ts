/**
 * Cloudflare Workers Adapter for tRPC
 *
 * This adapter runs on Cloudflare Workers edge runtime.
 */

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq, and, sql } from "drizzle-orm";
import { appRouter } from "@/trpc/router";
import { createContext } from "@/trpc/context";
import { createAuth } from "@/auth/better-auth";
import { initializeAdmin } from "@/services/admin-init";
import { getUserLimits } from "@/services/limits";
import { checkPublicFeedRateLimit } from "@/services/rate-limiter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import type { Env } from "@/types";
import { getSentryConfig } from "@/config/sentry";
import * as Sentry from "@sentry/cloudflare";

// Create the worker handler
const workerHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Instrument D1 database with Sentry if available (per-request)
    // This must be done here, not in the Sentry config callback, to avoid
    // modifying the shared env object and potential race conditions.
    // Create a local env object with instrumented DB for this request only.
    let requestEnv: Env = env;
    if (env.DB && env.SENTRY_DSN) {
      try {
        const instrumentedD1 = Sentry.instrumentD1WithSentry(env.DB);
        // Create a local env object with instrumented DB for this request
        requestEnv = { ...env, DB: instrumentedD1 };
      } catch {
        // Sentry instrumentation failed, continue with regular D1
        requestEnv = env;
      }
    }

    // SECURITY: Validate required environment variables
    const authSecret = requestEnv.BETTER_AUTH_SECRET;
    if (!authSecret) {
      console.error(
        "❌ FATAL: BETTER_AUTH_SECRET environment variable is required"
      );
      return new Response(
        JSON.stringify({
          error: "Server configuration error",
          message: "BETTER_AUTH_SECRET not configured",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // SECURITY: Get allowed CORS origins
    // For Cloudflare: Set CORS_ORIGIN in wrangler.toml or Workers secrets
    // Supports comma-separated list for multiple origins
    const allowedOrigins = requestEnv.CORS_ORIGIN
      ? requestEnv.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : ["*"]; // Default to allow all in Cloudflare (can be restricted by Cloudflare settings)

    // Helper to get CORS headers
    const getCorsHeaders = (requestOrigin: string | null) => {
      let allowOrigin = "*";

      if (requestOrigin && !allowedOrigins.includes("*")) {
        // Check if origin is allowed
        allowOrigin = allowedOrigins.includes(requestOrigin)
          ? requestOrigin
          : "";
      } else if (allowedOrigins.length === 1 && allowedOrigins[0] !== "*") {
        // Single specific origin
        allowOrigin = allowedOrigins[0];
      }

      return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, sentry-trace, baggage",
        "Access-Control-Allow-Credentials": "true",
      };
    };

    const requestOrigin = request.headers.get("Origin");

    // Handle CORS preflight globally (before any endpoint-specific checks)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...getCorsHeaders(requestOrigin),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", runtime: "cloudflare" }),
        {
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(requestOrigin),
          },
        }
      );
    }

    // Sentry test endpoint
    if (url.pathname === "/debug-sentry") {
      if (requestEnv.SENTRY_DSN) {
        try {
          const testError = new Error("Test Sentry error!");
          // Explicitly capture the exception
          const eventId = await Sentry.captureException(testError, {
            tags: { test: "debug-sentry" },
            extra: {
              endpoint: "/debug-sentry",
              timestamp: new Date().toISOString(),
            },
          });

          // Also create a span for tracing
          await Sentry.startSpan(
            {
              op: "test",
              name: "Test Sentry Transaction",
            },
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          );

          return new Response(
            JSON.stringify({
              error: "Test error captured by Sentry",
              message: testError.message,
              eventId: eventId || "unknown",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                ...getCorsHeaders(requestOrigin),
              },
            }
          );
        } catch (error) {
          // Fallback: capture any unexpected errors
          const eventId = await Sentry.captureException(error);
          return new Response(
            JSON.stringify({
              error: "Unexpected error occurred",
              message: error instanceof Error ? error.message : String(error),
              eventId: eventId || "unknown",
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                ...getCorsHeaders(requestOrigin),
              },
            }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ message: "Sentry not configured" }),
          {
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(requestOrigin),
            },
          }
        );
      }
    }

    // Admin initialization endpoint
    // POST /_admin/init - Initialize admin user from environment variables
    if (url.pathname === "/_admin/init" && request.method === "POST") {
      try {
        if (!requestEnv.DB) {
          return new Response(
            JSON.stringify({ error: "Database not configured" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const db = drizzle(requestEnv.DB, { schema });
        const result = await initializeAdmin(db, requestEnv);

        return new Response(JSON.stringify(result), {
          status: result.created ? 201 : 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error initializing admin:", error);
        const initError = error as { message?: string };
        return new Response(
          JSON.stringify({
            created: false,
            message: initError.message || "Failed to initialize admin",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Public RSS feed endpoint
    const publicFeedMatch = url.pathname.match(/^\/public\/([^/]+)\/([^/]+)$/);
    if (publicFeedMatch) {
      try {
        const [, username, slug] = publicFeedMatch;

        // Get context
        const ctx = await createContext({
          req: request,
          resHeaders: {} as FetchCreateContextFnOptions["resHeaders"],
          info: {} as FetchCreateContextFnOptions["info"],
          env: requestEnv,
        });

        // Find user by username (needed for rate limiting)
        const [user] = await ctx.db
          .select()
          .from(schema.user)
          .where(
            sql`COALESCE(${schema.user.username}, ${schema.user.name}) = ${username}`
          )
          .limit(1);

        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Check rate limit for this user's public feeds
        const limits = await getUserLimits(ctx.db, user.id);
        const planId = user.plan || "free";
        const rateLimitResult = await checkPublicFeedRateLimit(
          requestEnv,
          user.id,
          planId,
          limits.publicFeedRateLimitPerMinute
        );

        if (!rateLimitResult.allowed) {
          return new Response(
            JSON.stringify({
              error: "Rate limit exceeded",
              message: `This feed has been accessed too many times. Limit: ${rateLimitResult.limit} requests per minute.`,
              limit: rateLimitResult.limit,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                ...getCorsHeaders(requestOrigin),
              },
            }
          );
        }

        // Get public feed (all public RSS is now through feeds)
        let xml: string;
        let feedId: number | null = null;

        try {
          xml = await appRouter.createCaller(ctx).feeds.getPublicXml({
            username,
            slug,
          });

          // Get feed ID for logging
          const [feed] = await ctx.db
            .select()
            .from(schema.feeds)
            .where(
              and(eq(schema.feeds.userId, user.id), eq(schema.feeds.slug, slug))
            )
            .limit(1);

          if (feed) {
            feedId = feed.id;
          }
        } catch (error) {
          const tRPCError = error as { code?: string; message?: string };
          if (tRPCError.code === "NOT_FOUND") {
            return new Response(JSON.stringify({ error: "Feed not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          throw error;
        }

        // Log access for analytics (non-blocking)
        if (feedId) {
          try {
            const clientIP =
              request.headers.get("cf-connecting-ip") ||
              request.headers.get("x-forwarded-for") ||
              "unknown";
            const userAgent = request.headers.get("user-agent") || null;

            await ctx.db.insert(schema.publicFeedAccessLog).values({
              feedId,
              ipAddress: clientIP,
              userAgent: userAgent,
              accessedAt: new Date(),
            });
          } catch (logError) {
            // Don't fail the request if logging fails
            console.error("Failed to log public feed access:", logError);
          }
        }

        // Return RSS XML
        return new Response(xml, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            ...getCorsHeaders(requestOrigin),
          },
        });
      } catch (error) {
        console.error("Error serving public feed:", error);
        const tRPCError = error as { code?: string; message?: string };
        const status = tRPCError.code === "NOT_FOUND" ? 404 : 500;
        return new Response(
          JSON.stringify({
            error: tRPCError.message || "Failed to generate feed",
          }),
          {
            status,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // Better Auth route handler
    if (url.pathname.startsWith("/api/auth/")) {
      const auth = createAuth(requestEnv);
      const response = await auth.handler(request);

      // Add CORS headers
      const headers = new Headers(response.headers);
      const corsHeaders = getCorsHeaders(requestOrigin);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    // tRPC endpoint
    if (url.pathname.startsWith("/trpc")) {
      const response = await fetchRequestHandler({
        endpoint: "/trpc",
        req: request,
        router: appRouter,
        createContext: async ({ req, resHeaders, info }) => {
          return createContext({ req, resHeaders, info, env: requestEnv });
        },
      });

      // Add CORS headers
      const headers = new Headers(response.headers);
      const corsHeaders = getCorsHeaders(requestOrigin);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    // 404 for other routes
    return new Response("Not Found", { status: 404 });
  },

  // Scheduled handler for cron triggers
  // Note: When wrapped with Sentry.withSentry, the signature changes to ScheduledController
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    console.log("⏰ Cron triggered:", controller.cron);

    try {
      // Import dependencies
      const { handleRSSFetch, handleArticlePrune } = await import(
        "@/cron/handlers"
      );
      const { getGlobalSettings } = await import("@/services/global-settings");
      const { createDatabase } = await import("@/db/client");
      const { eq } = await import("drizzle-orm");
      const schema = await import("@/db/schema");

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
// This initializes Sentry and wraps the fetch handler automatically
export default Sentry.withSentry((env: Env) => {
  const config = getSentryConfig(env);
  if (!config) {
    // Return minimal config if DSN not provided (Sentry will be disabled)
    return { dsn: undefined };
  }

  // Add version metadata if available
  const versionId = env.CF_VERSION_METADATA?.id;
  if (versionId) {
    config.release = versionId;
  }

  // Note: D1 instrumentation is done per-request in the fetch handler
  // to avoid modifying the shared env object in this config callback

  return config;
}, workerHandler);
