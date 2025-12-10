/**
 * tRPC Initialization
 *
 * Sets up the tRPC instance with context and creates procedure helpers.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import * as schema from "@/db/schema";
import { checkLimit, getUserLimits } from "@/services/limits";
import { checkApiRateLimit } from "@/services/rate-limiter";
import { getGlobalSettings } from "@/services/global-settings";
import * as Sentry from "@/utils/sentry";
import type { Context } from "./context";

// Initialize tRPC with context
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    // Log all errors to console for debugging
    console.error("❌ tRPC Error:", {
      code: error.code,
      message: error.message,
      cause: error.cause,
      stack: error.stack,
    });

    // Capture to Sentry (if available and configured)
    // Filter out expected errors to reduce noise
    const isExpectedError =
      error.code === "UNAUTHORIZED" ||
      error.code === "NOT_FOUND" ||
      // Filter out email verification FORBIDDEN errors (these are expected)
      (error.code === "FORBIDDEN" &&
        error.message.includes("Email verification required"));

    if (ctx?.env?.SENTRY_DSN && !isExpectedError) {
      // Try to import and use Sentry
      import("@sentry/cloudflare")
        .then((Sentry) => {
          Sentry.captureException(error, {
            tags: {
              trpc_code: error.code,
              trpc_path: shape.data.path || "unknown",
            },
            level: error.code === "INTERNAL_SERVER_ERROR" ? "error" : "warning",
          });
        })
        .catch(() => {
          // Sentry not available - ignore silently
        });
    }

    return shape;
  },
});

// Base router and procedure helpers
export const router = t.router;

/**
 * Sentry tRPC middleware (optional)
 * Creates spans and improves error capturing for tRPC handlers
 * See: https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/integrations/trpc
 *
 * The middleware is created at module load time, but will only create spans
 * if Sentry is initialized (checked internally by Sentry).
 */
let sentryMiddleware: ReturnType<typeof t.middleware> | null = null;
try {
  // Try to import Sentry and create middleware
  // This will work in Cloudflare Workers where @sentry/cloudflare is available
  // In Node.js, this will fail gracefully and we'll continue without it
  const SentryModule = await import("@sentry/cloudflare");
  if (SentryModule.trpcMiddleware) {
    sentryMiddleware = t.middleware(
      SentryModule.trpcMiddleware({
        attachRpcInput: true, // Include RPC input in error context for debugging
      })
    );
  }
} catch {
  // Sentry not available (e.g., in Node.js environment or not installed)
  // Continue without Sentry middleware - it's optional
  sentryMiddleware = null;
}

// Base procedure with Sentry middleware if available
// The middleware will only create spans if Sentry is initialized at runtime
export const publicProcedure = sentryMiddleware
  ? t.procedure.use(sentryMiddleware)
  : t.procedure;

// Auth middleware - ensures user is authenticated and not banned
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  // Check cache first to avoid N+1 queries in batch requests
  let userRecord = ctx.cache.userRecord;

  if (!userRecord) {
    // Cache miss - fetch from database and store in cache
    const [fetchedUser] = await ctx.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.userId))
      .limit(1);

    if (!fetchedUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    // Store in cache for subsequent middleware/procedures in this request
    userRecord = fetchedUser;
    ctx.cache.userRecord = userRecord;
  }

  if (userRecord.banned) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account banned. Please contact support.",
    });
  }

  // Check email verification requirement (admin users bypass this check)
  if (ctx.user.role !== "admin") {
    const settings = await getGlobalSettings(ctx.db);
    if (settings.requireEmailVerification && !userRecord.emailVerified) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Email verification required. Please check your email for a verification link.",
      });
    }
  }

  // Update lastSeenAt (throttled to once every 5 minutes)
  // Fire-and-forget update to avoid blocking the request
  const now = new Date();
  const lastSeen = userRecord.lastSeenAt;
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  // Only update if lastSeenAt is null or older than 5 minutes
  if (!lastSeen || lastSeen < fiveMinutesAgo) {
    // Capture userId for error logging (TypeScript safety)
    const userId = ctx.user.userId;

    // Fire-and-forget update (don't await)
    // Note: Race condition is acceptable here - worst case multiple rapid requests
    // update lastSeenAt simultaneously, but all will set roughly the same timestamp
    ctx.db
      .update(schema.user)
      .set({ lastSeenAt: now })
      .where(eq(schema.user.id, userId))
      .then(() => {
        // Query executed successfully - no action needed
      })
      .catch((error) => {
        // Log error to Sentry but don't fail the request
        // Using 'info' level since this is fire-and-forget user activity tracking
        // Sentry.captureException returns a promise, but we don't await it
        // Add .catch() to prevent unhandled rejection warnings
        Sentry.captureException(error, {
          level: "info",
          tags: {
            context: "isAuthed_middleware",
            operation: "update_lastSeenAt",
          },
          extra: {
            userId,
          },
        }).catch(() => {
          // Silently ignore Sentry logging failures - this is best-effort tracking
        });
      });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Type narrowing: user is guaranteed non-null
    },
  });
});

// Auth middleware without email verification check
// Used for endpoints that unverified users need to access (e.g., verification endpoints)
const isAuthedWithoutVerification = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  // Check cache first to avoid N+1 queries in batch requests
  let userRecord = ctx.cache.userRecord;

  if (!userRecord) {
    // Cache miss - fetch from database and store in cache
    const [fetchedUser] = await ctx.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.userId))
      .limit(1);

    if (!fetchedUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    // Store in cache for subsequent middleware/procedures in this request
    userRecord = fetchedUser;
    ctx.cache.userRecord = userRecord;
  }

  if (userRecord.banned) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account banned. Please contact support.",
    });
  }

  // NOTE: Email verification check is intentionally skipped here
  // This allows unverified users to access verification-related endpoints

  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Type narrowing: user is guaranteed non-null
    },
  });
});

// Protected procedure - requires authentication
export const protectedProcedure = t.procedure.use(isAuthed);

// Protected procedure without email verification check
// Use this for endpoints that unverified users need (e.g., checkVerificationStatus, resendVerificationEmail)
export const protectedProcedureWithoutVerification = t.procedure.use(
  isAuthedWithoutVerification
);

/**
 * Limit check middleware factory
 * Checks if user can perform an action based on resource limits
 *
 * @param resource Resource type to check
 * @returns Middleware that checks the limit
 */
export function withLimitCheck(
  resource: "sources" | "publicFeeds" | "categories"
) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    // Check the limit
    const limitCheck = await checkLimit(ctx.db, ctx.user.userId, resource);

    if (!limitCheck.allowed) {
      const resourceName =
        resource === "sources"
          ? "RSS sources"
          : resource === "publicFeeds"
            ? "public feeds"
            : "categories";

      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You have reached your limit of ${limitCheck.limit} ${resourceName}. Please upgrade your plan.`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        limitCheck, // Pass limit info to the procedure
      },
    });
  });
}

// Protected procedure with limit check helper
export const createProtectedWithLimit = (
  resource: "sources" | "publicFeeds" | "categories"
) => protectedProcedure.use(withLimitCheck(resource));

/**
 * Admin middleware - ensures user is authenticated and has admin role
 */
const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  // Check cache first to avoid N+1 queries in batch requests
  let userRecord = ctx.cache.userRecord;

  if (!userRecord) {
    // Cache miss - fetch from database and store in cache
    const [fetchedUser] = await ctx.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.userId))
      .limit(1);

    if (!fetchedUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    // Store in cache for subsequent middleware/procedures in this request
    userRecord = fetchedUser;
    ctx.cache.userRecord = userRecord;
  }

  if (userRecord.banned) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account banned. Please contact support.",
    });
  }

  // Check admin role from Better Auth session
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Admin procedure - requires authentication and admin role
export const adminProcedure = t.procedure.use(isAdmin);

/**
 * Rate limiting middleware
 * Checks API rate limit for authenticated users
 * Uses plan-specific Cloudflare Workers rate limit bindings
 */
const withRateLimit = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    // Rate limiting only applies to authenticated users
    return next();
  }

  // Skip rate limiting in test environment
  if (ctx.env.SKIP_RATE_LIMIT === "true") {
    return next();
  }

  // Check cache first to avoid N+1 queries in batch requests
  let limits = ctx.cache.userLimits;
  let userRecord = ctx.cache.userRecord;

  if (!limits) {
    // Cache miss - fetch user limits and store in cache
    limits = await getUserLimits(ctx.db, ctx.user.userId);
    ctx.cache.userLimits = limits;
  }

  if (!userRecord) {
    // Cache miss - fetch user record and store in cache
    const [fetchedUser] = await ctx.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.userId))
      .limit(1);

    if (!fetchedUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not found",
      });
    }

    userRecord = fetchedUser;
    ctx.cache.userRecord = userRecord;
  }

  const planId = userRecord.plan || "free";

  // Check rate limit using plan-specific binding
  const rateLimitResult = await checkApiRateLimit(
    ctx.env,
    ctx.user.userId,
    planId,
    limits.apiRateLimitPerMinute
  );

  if (!rateLimitResult.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. ${rateLimitResult.limit} requests per minute allowed.`,
    });
  }

  return next();
});

/**
 * Protected procedure with rate limiting
 * Includes authentication, suspension check, and rate limiting
 */
export const rateLimitedProcedure = protectedProcedure.use(withRateLimit);
