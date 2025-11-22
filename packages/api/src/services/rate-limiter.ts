/**
 * Rate Limiter Service
 *
 * Implements rate limiting for API requests and public feed access.
 * Uses Cloudflare Workers rate limit bindings for Cloudflare deployments.
 * Each plan has its own binding with the plan's rate limit.
 * Rate limiting is disabled for Docker Compose deployments.
 */

import type { Env } from "@/types";

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export type RateLimitType = "api" | "publicFeed";

// ============================================================================
// BINDING SELECTION
// ============================================================================

/**
 * Get the appropriate rate limit binding for a plan
 *
 * @param env Environment configuration
 * @param planId User's plan ID (free, pro, enterprise)
 * @param type Rate limit type (api or publicFeed)
 * @returns Rate limit binding or undefined
 */
function getBindingForPlan(
  env: Env,
  planId: string,
  type: RateLimitType
):
  | Env["FREE_API_RATE_LIMIT"]
  | Env["PRO_API_RATE_LIMIT"]
  | Env["ENTERPRISE_API_RATE_LIMIT"]
  | Env["FEED_RATE_LIMIT"]
  | undefined {
  if (type === "publicFeed") {
    return env.FEED_RATE_LIMIT;
  }

  // API rate limiting uses plan-specific bindings
  switch (planId) {
    case "free":
      return env.FREE_API_RATE_LIMIT;
    case "pro":
      return env.PRO_API_RATE_LIMIT;
    case "enterprise":
      return env.ENTERPRISE_API_RATE_LIMIT;
    default:
      // Fallback to free plan binding for unknown plans
      console.warn(
        `Unknown plan '${planId}', using free plan rate limit binding`
      );
      return env.FREE_API_RATE_LIMIT;
  }
}

// ============================================================================
// RATE LIMITING LOGIC
// ============================================================================

/**
 * Check if user can make a request
 *
 * @param env Environment configuration
 * @param userId User ID
 * @param planId User's plan ID (free, pro, enterprise)
 * @param limit Maximum requests allowed in the window (user's plan limit, for display purposes)
 * @param windowMs Window size in milliseconds
 * @param type Rate limit type (api or publicFeed)
 * @returns Rate limit result
 */
export async function checkRateLimit(
  env: Env,
  userId: number,
  planId: string,
  limit: number,
  windowMs: number,
  type: RateLimitType
): Promise<RateLimitResult> {
  // Docker Compose: Always allow (no rate limiting)
  if (env.RUNTIME === "nodejs") {
    return {
      allowed: true,
      limit,
      remaining: limit,
      resetAt: new Date(Date.now() + windowMs),
    };
  }

  // Cloudflare Workers: Use plan-specific rate limit bindings
  if (env.RUNTIME === "cloudflare") {
    // Select the appropriate binding based on plan and type
    const binding = getBindingForPlan(env, planId, type);

    if (!binding) {
      console.error(
        `❌ Rate limit binding missing for plan: ${planId}, type: ${type}. ` +
          `Rate limiting disabled for this request.`
      );
      // Fallback: allow request but log warning
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt: new Date(Date.now() + windowMs),
      };
    }

    // Create a unique key for this user
    // Since bindings are plan-specific, we only need userId as the key
    const key = userId.toString();

    try {
      const debugMode = env.RATE_LIMIT_DEBUG === "true";

      // Call the rate limit binding - this consumes a request and returns status
      // The binding tracks requests per key independently and enforces the plan's limit
      const result = await binding.limit({ key });

      // Debug: Log the actual result structure
      if (debugMode) {
        console.log(
          `[Rate Limit Debug] plan=${planId}, type=${type}, userId=${userId}, key=${key}, result:`,
          JSON.stringify(result, null, 2)
        );
      }

      // Validate result structure
      if (!result || typeof result !== "object") {
        console.error(
          `❌ Rate limit binding returned invalid result for ${key}:`,
          result
        );
        // Fallback: allow request but log error
        return {
          allowed: true,
          limit,
          remaining: limit,
          resetAt: new Date(Date.now() + windowMs),
        };
      }

      // Cloudflare bindings only return { success: boolean }
      // success: true = request allowed, success: false = rate limit exceeded
      const allowed = result.success !== false;

      // Calculate reset time (60 seconds from now, since bindings use 60s windows)
      const resetAt = new Date(Date.now() + windowMs);

      // For display purposes, estimate remaining requests
      // Since bindings don't return usage details, we use a conservative estimate
      const remaining = allowed ? Math.max(0, limit - 1) : 0;

      // Log when rate limit is hit or in debug mode
      if (debugMode || !allowed) {
        console.log(
          `[Rate Limit] plan=${planId}, type=${type}, userId=${userId}, ` +
            `limit=${limit}, allowed=${allowed}, resetAt=${resetAt.toISOString()}`
        );
      }

      return {
        allowed,
        limit,
        remaining,
        resetAt,
      };
    } catch (error) {
      console.error(`Error checking rate limit for ${key}:`, error);
      // On error, allow the request but log it
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetAt: new Date(Date.now() + windowMs),
      };
    }
  }

  // Fallback: allow request
  return {
    allowed: true,
    limit,
    remaining: limit,
    resetAt: new Date(Date.now() + windowMs),
  };
}

/**
 * Check API rate limit for a user
 *
 * @param env Environment configuration
 * @param userId User ID
 * @param planId User's plan ID (free, pro, enterprise)
 * @param limitPerMinute Max API requests per minute (for display purposes)
 * @returns Rate limit result
 */
export async function checkApiRateLimit(
  env: Env,
  userId: number,
  planId: string,
  limitPerMinute: number
): Promise<RateLimitResult> {
  return checkRateLimit(env, userId, planId, limitPerMinute, 60 * 1000, "api");
}

/**
 * Check public feed rate limit for a user
 *
 * @param env Environment configuration
 * @param userId User ID
 * @param planId User's plan ID (free, pro, enterprise) - not used for feed limits but kept for consistency
 * @param limitPerMinute Max public feed requests per minute (for display purposes)
 * @returns Rate limit result
 */
export async function checkPublicFeedRateLimit(
  env: Env,
  userId: number,
  planId: string,
  limitPerMinute: number
): Promise<RateLimitResult> {
  return checkRateLimit(
    env,
    userId,
    planId,
    limitPerMinute,
    60 * 1000,
    "publicFeed"
  );
}
