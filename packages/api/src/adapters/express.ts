/**
 * Express HTTP Adapter for tRPC
 *
 * This adapter runs on Node.js for Docker deployments.
 */

import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { toNodeHandler } from "better-auth/node";
import { eq, and, sql } from "drizzle-orm";
import { appRouter } from "@/trpc/router";
import { createContext } from "@/trpc/context";
import { createAuth } from "@/auth/better-auth";
import { createDatabase } from "@/db/client";
import { initCronJobs } from "@/cron/scheduler";
import {
  expressHeadersToWeb,
  createContextFromExpressHeaders,
} from "@/utils/http-helpers";
import { getUserLimits } from "@/services/limits";
import { checkPublicFeedRateLimit } from "@/services/rate-limiter";
import { initializeAdmin } from "@/services/admin-init";
import * as schema from "@/db/schema";
import type { Env } from "@/types";
import { initSentryNode } from "@/config/sentry";

const app = express();

// Load environment variables first (before validation)
const env: Env = {
  RUNTIME: "nodejs",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  DATABASE_PATH: process.env.DATABASE_PATH || "./data/tuvix.db",
  PORT: process.env.PORT || "3001",
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
  BASE_URL: process.env.BASE_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || process.env.BASE_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
  SENTRY_RELEASE: process.env.SENTRY_RELEASE,
};

// SECURITY: Validate required environment variables
const authSecret = env.BETTER_AUTH_SECRET;
if (!authSecret) {
  console.error(
    "❌ FATAL: BETTER_AUTH_SECRET environment variable is required.\n" +
      "   Generate a secure secret with: openssl rand -base64 32\n" +
      "   Or: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n" +
      "   Then set BETTER_AUTH_SECRET in your .env file or environment.",
  );
  process.exit(1);
}

// Warn if using development mode with default settings
if (env.NODE_ENV === "production" && authSecret.length < 32) {
  console.warn(
    "⚠️  WARNING: BETTER_AUTH_SECRET should be at least 32 characters for production use.",
  );
}

// SECURITY: Configure CORS with specific origins
// For Docker Compose: Set CORS_ORIGIN to frontend URL (e.g., http://localhost:5173)
// For multiple origins: Set CORS_ORIGIN as comma-separated list
const allowedOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : env.NODE_ENV === "production"
    ? [] // Production requires explicit CORS_ORIGIN
    : ["http://localhost:5173", "http://localhost:3000"]; // Dev defaults

if (env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn(
    "⚠️  WARNING: CORS_ORIGIN not set in production. All origins will be blocked.\n" +
      "   Set CORS_ORIGIN environment variable to your frontend URL(s).",
  );
}

// Initialize Sentry early (before routes)
initSentryNode(env);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // Check if origin is allowed
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*")
      ) {
        callback(null, true);
      } else {
        console.warn(`⚠️  Blocked CORS request from origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "sentry-trace",
      "baggage",
    ],
  }),
);

// Better Auth route handler - MUST be before express.json() middleware
// Better Auth handles its own request parsing
// Express 5 uses path-to-regexp v8 which doesn't support * wildcard
// Use :path* parameter pattern instead, or app.use for prefix matching
const auth = createAuth(env);
const authHandler = toNodeHandler(auth);
app.use("/api/auth", (req, res) => {
  // Log incoming Better Auth requests for debugging
  console.log(`🔐 Better Auth Request: ${req.method} ${req.path}`);

  // Log errors when response is sent
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      console.error(
        `❌ Better Auth Error Response: ${res.statusCode} for ${req.method} ${req.path}`,
      );
    }
  });

  // Better Auth handler only takes (req, res), not (req, res, next)
  authHandler(req, res);
});

// Mount express json middleware after Better Auth handler
// or only apply it to routes that don't interact with Better Auth
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", runtime: "nodejs" });
});

// Sentry test endpoint
app.get("/debug-sentry", async (_req, res) => {
  if (env.SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/node");
      await Sentry.startSpan(
        {
          op: "test",
          name: "Test Sentry Transaction",
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          throw new Error("Test Sentry error!");
        },
      );
      // This should never be reached since the span throws an error
      res.status(500).json({ error: "Unexpected: error was not thrown" });
    } catch (error) {
      // Error was thrown and captured by Sentry
      res.status(500).json({
        error: "Test error thrown and captured by Sentry",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    res.json({ message: "Sentry not configured" });
  }
});

// Public RSS feed endpoint (non-tRPC)
// This allows RSS readers to fetch feeds without tRPC overhead
app.get("/public/:username/:slug", async (req, res) => {
  try {
    const { username, slug } = req.params;

    // Get context using helper
    const ctx = await createContextFromExpressHeaders(req.headers, env);

    // Find user by username (needed for rate limiting)
    const [user] = await ctx.db
      .select()
      .from(schema.user)
      .where(
        sql`COALESCE(${schema.user.username}, ${schema.user.name}) = ${username}`,
      )
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check rate limit for this user's public feeds
    const limits = await getUserLimits(ctx.db, user.id);
    const planId = user.plan || "free";
    const rateLimitResult = await checkPublicFeedRateLimit(
      ctx.env,
      user.id,
      planId,
      limits.publicFeedRateLimitPerMinute,
    );

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: `This feed has been accessed too many times. Limit: ${rateLimitResult.limit} requests per minute.`,
        limit: rateLimitResult.limit,
      });
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
          and(eq(schema.feeds.userId, user.id), eq(schema.feeds.slug, slug)),
        )
        .limit(1);

      if (feed) {
        feedId = feed.id;
      }
    } catch (error) {
      const tRPCError = error as { code?: string; message?: string };
      if (tRPCError.code === "NOT_FOUND") {
        return res.status(404).json({ error: "Feed not found" });
      }
      throw error;
    }

    // Log access for analytics (non-blocking)
    if (feedId) {
      try {
        const clientIP =
          (req.headers["x-forwarded-for"] as string) ||
          req.socket.remoteAddress ||
          "unknown";
        const userAgent = req.headers["user-agent"] || null;

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

    // Set RSS headers
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300"); // 5 minute cache
    return res.send(xml);
  } catch (error) {
    console.error("Error serving public feed:", error);
    const tRPCError = error as { code?: string; message?: string };
    if (tRPCError.code === "NOT_FOUND") {
      return res
        .status(404)
        .json({ error: tRPCError.message || "Feed not found" });
    } else {
      return res.status(500).json({ error: "Failed to generate feed" });
    }
  }
});

// tRPC endpoint
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext: async ({ req, res }) => {
      // Log incoming requests
      console.log(`📥 tRPC Request: ${req.method} ${req.url}`);

      // Convert Express headers to Web API Headers
      const headers = expressHeadersToWeb(req.headers);

      // Express res.setHeader has a different signature than tRPC expects
      // Create a wrapper that matches the expected type
      const setHeaderWrapper = (name: string, value: string) => {
        res.setHeader(name, value);
      };

      return createContext({
        req: { headers } as FetchCreateContextFnOptions["req"],
        resHeaders:
          setHeaderWrapper as unknown as FetchCreateContextFnOptions["resHeaders"],
        info: {} as FetchCreateContextFnOptions["info"],
        env,
      });
    },
    onError({ error, type, path, input, ctx: _ctx, req: _req }) {
      // Log detailed error information
      console.error("❌ tRPC Error Handler:", {
        type,
        path,
        error: {
          code: error.code,
          message: error.message,
          cause: error.cause,
        },
        input,
      });
    },
  }),
);

// Initialize cron jobs
// Initialize cron jobs (async, but don't await - let it run in background)
initCronJobs(env).catch((error) => {
  console.error("Failed to initialize cron jobs:", error);
});

// Initialize admin user from environment variables (if provided)
// This runs on server startup and creates admin if credentials are provided
const db = createDatabase(env);
initializeAdmin(db, env)
  .then((result) => {
    if (result.created) {
      console.log(`✅ ${result.message}`);
    } else if (result.message.includes("already exists")) {
      console.log(`ℹ️  ${result.message}`);
    }
    // Silently skip if credentials not provided (normal for non-admin deployments)
  })
  .catch((error) => {
    console.error("❌ Failed to initialize admin:", error);
  });

// Sentry error handler (must be after all routes, before other error handlers)
if (env.SENTRY_DSN) {
  import("@sentry/node").then((Sentry) => {
    Sentry.setupExpressErrorHandler(app);
  });
}

// Global error handler (must be last)
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("❌ Unhandled Express Error:", err);
    const error = err as { status?: number; message?: string; stack?: string };
    res.status(error.status || 500).json({
      error: error.message || "Internal server error",
      ...(env.NODE_ENV === "development" && { stack: error.stack }),
    });
  },
);

// Start server
const port = parseInt(env.PORT || "3001", 10);
app.listen(port, () => {
  console.log(`🚀 tRPC Server (Express) listening on http://localhost:${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🔌 tRPC endpoint: http://localhost:${port}/trpc`);
});
