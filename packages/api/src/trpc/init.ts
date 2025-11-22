/**
 * tRPC Initialization
 *
 * Sets up the tRPC instance with context and creates procedure helpers.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { checkLimit, getUserLimits } from "@/services/limits";
import { checkApiRateLimit } from "@/services/rate-limiter";
import { getGlobalSettings } from "@/services/global-settings";
import type { Context } from "./context";

// Initialize tRPC with context
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    // Log all errors to console for debugging
    console.error("❌ tRPC Error:", {
      code: error.code,
      message: error.message,
      cause: error.cause,
      stack: error.stack,
    });

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

  // Check if user is banned (using Better Auth user table)
  const [userRecord] = await ctx.db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, ctx.user.userId))
    .limit(1);

  if (!userRecord) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not found",
    });
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

  // Check if user is banned (using Better Auth user table)
  const [userRecord] = await ctx.db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, ctx.user.userId))
    .limit(1);

  if (!userRecord) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not found",
    });
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

  // Check if user is admin (using Better Auth user table)
  const [userRecord] = await ctx.db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, ctx.user.userId))
    .limit(1);

  if (!userRecord) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User not found",
    });
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

  // Get user's plan and limits
  const limits = await getUserLimits(ctx.db, ctx.user.userId);

  // Get user's plan ID (needed to select the correct binding)
  const [user] = await ctx.db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, ctx.user.userId))
    .limit(1);

  const planId = user?.plan || "free";

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
