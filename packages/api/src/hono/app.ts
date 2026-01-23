import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/trpc/router";
import { createContext } from "@/trpc/context";
import type { Env } from "@/types";
import type { BetterAuthUser, BetterAuthSession } from "@/types/better-auth";
import type * as SentryNode from "@sentry/node";
import type * as SentryCloudflare from "@sentry/cloudflare";

// Union type for Sentry SDK (Node.js or Cloudflare)
export type SentrySDK = typeof SentryNode | typeof SentryCloudflare;

// Extend Hono's context with typed variables
export type Variables = {
  env: Env;
  sentry: SentrySDK;
  runtime: "nodejs" | "cloudflare";
  user: BetterAuthUser | null;
  session: BetterAuthSession["session"] | null;
};

export interface HonoAppConfig {
  env: Env;
  sentry: SentrySDK;
  runtime: "nodejs" | "cloudflare";
}

export function createHonoApp(config: HonoAppConfig) {
  const app = new Hono<{ Variables: Variables }>();

  // Set config in context
  app.use("*", async (c, next) => {
    c.set("env", config.env);
    c.set("sentry", config.sentry);
    c.set("runtime", config.runtime);
    await next();
  });

  // Distributed tracing middleware
  // Manually extracts sentry-trace and baggage headers to continue traces from frontend
  // Required per https://docs.sentry.io/platforms/javascript/guides/cloudflare/tracing/distributed-tracing/custom-instrumentation
  app.use("*", async (c, next) => {
    const Sentry = c.get("sentry");
    const env = c.get("env");

    // Only create spans if Sentry is configured
    if (!Sentry || !env.SENTRY_DSN) {
      return await next();
    }

    // Extract distributed tracing headers sent by frontend
    const sentryTrace = c.req.header("sentry-trace");
    const baggage = c.req.header("baggage");

    // Continue trace from frontend (or start new trace if no headers)
    return await Sentry.continueTrace(
      { sentryTrace, baggage },
      async () => {
        // Create HTTP server span within the continued trace
        return await Sentry.startSpan(
          {
            name: `${c.req.method} ${c.req.path}`,
            op: "http.server",
            attributes: {
              "http.method": c.req.method,
              "http.route": c.req.path,
              "http.url": c.req.url,
            },
          },
          async (span) => {
            await next();
            // Add response status after request completes
            span.setAttribute("http.status_code", c.res.status);
          }
        );
      }
    );
  });


  // CORS middleware (must be before routes)
  const corsOrigins = getCorsOrigins(config.env);
  console.log("🔧 CORS Configuration:", {
    origins: corsOrigins,
    credentials: true,
  });
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "sentry-trace",
        "baggage",
      ],
    })
  );

  // Logger middleware
  app.use("*", async (c, next) => {
    const start = Date.now();
    console.log(`📥 ${c.req.method} ${c.req.path}`);
    await next();
    console.log(
      `📤 ${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`
    );
  });

  // Better Auth transaction naming middleware
  // Sets custom Sentry transaction names for Better Auth endpoints
  app.use("/api/auth/*", async (c, next) => {
    const path = c.req.path;
    const endpoint = path.replace("/api/auth/", "").split("/")[0];

    // Set Sentry transaction name for Better Auth endpoints
    try {
      const Sentry = c.get("sentry");
      // Use getCurrentScope() to set transaction name
      if (Sentry && typeof Sentry.getCurrentScope === "function") {
        const scope = Sentry.getCurrentScope();
        scope.setTransactionName(`auth.${endpoint}`);
      }
    } catch (error) {
      // Ignore errors setting transaction name
      console.warn("Failed to set Sentry transaction name:", error);
    }

    await next();
  });

  // BetterAuth session middleware (Node.js only)
  // In Cloudflare Workers, BetterAuth handles sessions directly via auth routes
  if (config.runtime === "nodejs") {
    app.use("*", async (c, next) => {
      const { createAuth } = await import("../auth/better-auth");
      const auth = createAuth(c.get("env"));
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      c.set("user", session?.user ?? null);
      c.set("session", session?.session ?? null);
      await next();
    });
  } else {
    // For Cloudflare Workers, set user/session to null by default
    // They will be populated by tRPC context when needed
    app.use("*", async (c, next) => {
      c.set("user", null);
      c.set("session", null);
      await next();
    });
  }

  // Error handler
  app.onError((err, c) => {
    console.error("❌ Error:", err);
    const sentry = c.get("sentry");
    const env = c.get("env");
    if (sentry && env.SENTRY_DSN) {
      sentry.captureException(err);
    }

    const status =
      "status" in err && typeof err.status === "number"
        ? (err.status as 400 | 401 | 403 | 404 | 429 | 500 | 503)
        : 500;

    return c.json(
      {
        error: err.message || "Internal server error",
        ...(env.NODE_ENV === "development" && { stack: err.stack }),
      },
      status
    );
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({ status: "ok", runtime: c.get("runtime") });
  });

  // Debug Sentry - comprehensive diagnostics
  app.get("/debug-sentry", (c) => {
    const env = c.get("env");
    const sentry = c.get("sentry");
    const runtime = c.get("runtime");

    const diagnostics = {
      runtime,
      sentryConfigured: !!env.SENTRY_DSN,
      sentryDsnLength: env.SENTRY_DSN?.length || 0,
      sentryDsnPrefix: env.SENTRY_DSN?.substring(0, 20) || "not set",
      sentryExists: !!sentry,
      sentryMethods: sentry
        ? Object.keys(sentry)
            .filter(
              (k) =>
                typeof (sentry as Record<string, unknown>)[k] === "function"
            )
            .slice(0, 10)
        : [],
      environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || "unknown",
      allEnvKeys: Object.keys(env).filter(
        (k) => !k.includes("SECRET") && !k.includes("KEY")
      ),
    };

    if (!env.SENTRY_DSN) {
      return c.json({
        status: "error",
        message: "Sentry DSN not configured",
        diagnostics,
      });
    }

    // Try to capture an exception
    try {
      const testError = new Error("Test Sentry error from debug endpoint!");
      const eventId = sentry.captureException(testError, {
        tags: { test: "debug-sentry", runtime },
      });

      return c.json(
        {
          status: "success",
          message: "Test error and log sent to Sentry",
          eventId,
          diagnostics,
        },
        500
      );
    } catch (error) {
      return c.json(
        {
          status: "error",
          message: "Failed to send test error",
          error: error instanceof Error ? error.message : String(error),
          diagnostics,
        },
        500
      );
    }
  });

  // BetterAuth routes
  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    const path = c.req.path;
    const origin = c.req.header("origin");
    console.log(`[Auth] 📥 ${c.req.method} ${path} from origin: ${origin}`);

    const { createAuth } = await import("../auth/better-auth");
    const auth = createAuth(c.get("env"));
    const response = await auth.handler(c.req.raw);

    // Log response headers (especially Set-Cookie)
    const setCookieHeader = response.headers.get("set-cookie");
    if (setCookieHeader) {
      console.log(`[Auth] 🍪 Setting cookies:`, setCookieHeader);
    }

    console.log(`[Auth] 📤 Response status: ${response.status}`);
    return response;
  });

  // tRPC routes using @hono/trpc-server middleware
  // This adapter properly handles batched requests and integrates with Hono's context
  app.use(
    "/trpc/*",
    trpcServer({
      endpoint: "/trpc",
      router: appRouter,
      // Cast to our typed Variables context - safe because this middleware runs
      // after our context-setting middleware above
      createContext: (_opts, c) =>
        createContext(c as unknown as Parameters<typeof createContext>[0]),
      onError: ({ error, type, path }) => {
        console.error("❌ tRPC Error:", { type, path, error });
        // Note: Error capturing is handled in errorFormatter in trpc/init.ts
      },
    })
  );

  // Public RSS feeds
  app.get("/public/:username/:slug", async (c) => {
    const { username, slug } = c.req.param();
    const env = c.get("env");
    const { getUserLimits } = await import("../services/limits");
    const { checkPublicFeedRateLimit } =
      await import("../services/rate-limiter");
    const schema = await import("../db/schema");
    const { sql, eq, and } = await import("drizzle-orm");

    const ctx = await createContext(c);

    // Find user
    const [user] = await ctx.db
      .select()
      .from(schema.user)
      .where(
        sql`COALESCE(${schema.user.username}, ${schema.user.name}) = ${username}`
      )
      .limit(1);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Rate limiting
    const limits = await getUserLimits(ctx.db, user.id);
    const rateLimitResult = await checkPublicFeedRateLimit(
      env,
      user.id,
      user.plan || "free",
      limits.publicFeedRateLimitPerMinute
    );

    if (!rateLimitResult.allowed) {
      return c.json(
        { error: "Rate limit exceeded", limit: rateLimitResult.limit },
        429
      );
    }

    // Get feed XML
    let xml: string;
    try {
      xml = await appRouter.createCaller(ctx).feeds.getPublicXml({
        username,
        slug,
      });
    } catch (error) {
      // Handle NOT_FOUND errors from getPublicXml (feed not found or private)
      if (error instanceof TRPCError && error.code === "NOT_FOUND") {
        return c.json({ error: error.message || "Feed not found" }, 404);
      }
      // Re-throw other errors to be handled by the generic error handler
      throw error;
    }

    // Log access (awaited to ensure completion)
    const [feed] = await ctx.db
      .select()
      .from(schema.feeds)
      .where(and(eq(schema.feeds.userId, user.id), eq(schema.feeds.slug, slug)))
      .limit(1);

    if (feed) {
      const clientIP =
        c.req.header("cf-connecting-ip") ||
        c.req.header("x-forwarded-for") ||
        "unknown";

      try {
        await ctx.db.insert(schema.publicFeedAccessLog).values({
          feedId: feed.id,
          ipAddress: clientIP,
          userAgent: c.req.header("user-agent") || null,
          accessedAt: new Date(),
        });
      } catch (error) {
        // Log but don't fail the feed request
        console.error("Failed to log feed access:", error);
      }
    }

    c.header("Content-Type", "application/rss+xml; charset=utf-8");
    c.header("Cache-Control", "public, max-age=300");
    return c.body(xml);
  });

  // Admin init (Cloudflare only)
  app.post("/_admin/init", async (c) => {
    const env = c.get("env");

    if (!env.DB) {
      return c.json({ error: "Database not configured" }, 500);
    }

    const { drizzle } = await import("drizzle-orm/d1");
    const schema = await import("../db/schema");
    const { initializeAdmin } = await import("../services/admin-init");

    const db = drizzle(env.DB, { schema });
    const result = await initializeAdmin(db, env);

    return c.json(result, result.created ? 201 : 200);
  });

  return app;
}

function getCorsOrigins(env: Env): string | string[] {
  const allowedOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://localhost:3000"];

  return allowedOrigins.length === 1 ? allowedOrigins[0]! : allowedOrigins;
}
