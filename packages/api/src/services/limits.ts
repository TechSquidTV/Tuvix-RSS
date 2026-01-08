/**
 * User Limits Service
 *
 * Handles user resource limits and usage tracking:
 * - Get user limits (from plan or custom overrides)
 * - Get current usage stats
 * - Check if user can perform an action
 * - Update usage stats
 */

import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";

// Generic database type that works with both D1 and better-sqlite3
type Database =
  | DrizzleD1Database<typeof schema>
  | BetterSQLite3Database<typeof schema>;

// ============================================================================
// TYPES
// ============================================================================

export interface UserLimits {
  maxSources: number;
  maxPublicFeeds: number;
  maxCategories: number | null; // null = unlimited
  apiRateLimitPerMinute: number;
  publicFeedRateLimitPerMinute: number;
}

export interface UserUsage {
  sourceCount: number;
  publicFeedCount: number;
  categoryCount: number;
  articleCount: number;
  lastUpdated: Date;
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number | null; // null = unlimited
  current: number;
  remaining: number | null; // null = unlimited
}

// ============================================================================
// GET USER LIMITS
// ============================================================================

/**
 * Get effective limits for a user
 * Checks user-specific overrides first, falls back to plan limits
 *
 * @param db Database connection
 * @param userId User ID
 * @returns User's effective limits
 */
export async function getUserLimits(
  db: Database,
  userId: number
): Promise<UserLimits> {
  // Get user's plan
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  // Check for custom user limits
  const [customLimits] = await db
    .select()
    .from(schema.userLimits)
    .where(eq(schema.userLimits.userId, userId))
    .limit(1);

  // Get plan limits
  const planId = user.plan || "free";
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .limit(1);

  if (!plan) {
    throw new Error(`Plan '${planId}' not found`);
  }

  // Use custom limits for non-rate-limit fields if they exist, otherwise use plan limits
  // Rate limits always come from plan (plan-specific bindings enforce them)
  return {
    maxSources: customLimits?.maxSources ?? plan.maxSources,
    maxPublicFeeds: customLimits?.maxPublicFeeds ?? plan.maxPublicFeeds,
    maxCategories: customLimits?.maxCategories ?? plan.maxCategories,
    // Rate limits always use plan limits (plan-specific bindings enforce them)
    apiRateLimitPerMinute: plan.apiRateLimitPerMinute,
    publicFeedRateLimitPerMinute: plan.publicFeedRateLimitPerMinute,
  };
}

// ============================================================================
// GET USER USAGE
// ============================================================================

/**
 * Get current usage stats for a user
 * Auto-creates missing usage stats if they don't exist (defensive programming)
 *
 * @param db Database connection
 * @param userId User ID
 * @returns User's current usage stats
 */
export async function getUserUsage(
  db: Database,
  userId: number
): Promise<UserUsage> {
  let [usage] = await db
    .select()
    .from(schema.usageStats)
    .where(eq(schema.usageStats.userId, userId))
    .limit(1);

  // Auto-create missing usage stats (fixes users who signed up with incomplete initialization)
  if (!usage) {
    console.warn(
      `[getUserUsage] Auto-creating missing usage stats for user ${userId}`
    );

    await db.insert(schema.usageStats).values({
      userId,
      sourceCount: 0,
      publicFeedCount: 0,
      categoryCount: 0,
      articleCount: 0,
      lastUpdated: new Date(),
    });

    // Fetch the newly created record
    [usage] = await db
      .select()
      .from(schema.usageStats)
      .where(eq(schema.usageStats.userId, userId))
      .limit(1);

    // If still no record, something is seriously wrong
    if (!usage) {
      throw new Error(
        `Failed to create usage stats for user ${userId} - database insert failed`
      );
    }
  }

  return {
    sourceCount: usage.sourceCount,
    publicFeedCount: usage.publicFeedCount,
    categoryCount: usage.categoryCount,
    articleCount: usage.articleCount,
    lastUpdated: usage.lastUpdated,
  };
}

// ============================================================================
// CHECK LIMITS
// ============================================================================

/**
 * Check if user can create a new source
 *
 * @param db Database connection
 * @param userId User ID
 * @returns Limit check result
 */
export async function checkSourceLimit(
  db: Database,
  userId: number
): Promise<LimitCheckResult> {
  const limits = await getUserLimits(db, userId);
  const usage = await getUserUsage(db, userId);

  return {
    allowed: usage.sourceCount < limits.maxSources,
    limit: limits.maxSources,
    current: usage.sourceCount,
    remaining: limits.maxSources - usage.sourceCount,
  };
}

/**
 * Check if user can create a new public feed or public category
 * Checks combined count of both custom feeds and public categories
 *
 * @param db Database connection
 * @param userId User ID
 * @returns Limit check result
 */
export async function checkPublicFeedLimit(
  db: Database,
  userId: number
): Promise<LimitCheckResult> {
  const limits = await getUserLimits(db, userId);
  const usage = await getUserUsage(db, userId);

  return {
    allowed: usage.publicFeedCount < limits.maxPublicFeeds,
    limit: limits.maxPublicFeeds,
    current: usage.publicFeedCount,
    remaining: limits.maxPublicFeeds - usage.publicFeedCount,
  };
}

/**
 * Check if user can create a new category
 *
 * @param db Database connection
 * @param userId User ID
 * @returns Limit check result
 */
export async function checkCategoryLimit(
  db: Database,
  userId: number
): Promise<LimitCheckResult> {
  const limits = await getUserLimits(db, userId);
  const usage = await getUserUsage(db, userId);

  // null = unlimited
  if (limits.maxCategories === null) {
    return {
      allowed: true,
      limit: null,
      current: usage.categoryCount,
      remaining: null,
    };
  }

  return {
    allowed: usage.categoryCount < limits.maxCategories,
    limit: limits.maxCategories,
    current: usage.categoryCount,
    remaining: limits.maxCategories - usage.categoryCount,
  };
}

/**
 * Generic limit check
 *
 * @param db Database connection
 * @param userId User ID
 * @param resource Resource type to check
 * @returns Limit check result
 */
export async function checkLimit(
  db: Database,
  userId: number,
  resource: "sources" | "publicFeeds" | "categories"
): Promise<LimitCheckResult> {
  switch (resource) {
    case "sources":
      return checkSourceLimit(db, userId);
    case "publicFeeds":
      return checkPublicFeedLimit(db, userId);
    case "categories":
      return checkCategoryLimit(db, userId);
  }
}

// ============================================================================
// UPDATE USAGE STATS
// ============================================================================

/**
 * Increment source count
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function incrementSourceCount(
  db: Database,
  userId: number
): Promise<void> {
  const usage = await getUserUsage(db, userId);

  await db
    .update(schema.usageStats)
    .set({
      sourceCount: usage.sourceCount + 1,
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}

/**
 * Decrement source count
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function decrementSourceCount(
  db: Database,
  userId: number
): Promise<void> {
  const usage = await getUserUsage(db, userId);

  await db
    .update(schema.usageStats)
    .set({
      sourceCount: Math.max(0, usage.sourceCount - 1),
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}

/**
 * Increment public feed count
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function incrementPublicFeedCount(
  db: Database,
  userId: number
): Promise<void> {
  const usage = await getUserUsage(db, userId);

  await db
    .update(schema.usageStats)
    .set({
      publicFeedCount: usage.publicFeedCount + 1,
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}

/**
 * Decrement public feed count
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function decrementPublicFeedCount(
  db: Database,
  userId: number
): Promise<void> {
  const usage = await getUserUsage(db, userId);

  await db
    .update(schema.usageStats)
    .set({
      publicFeedCount: Math.max(0, usage.publicFeedCount - 1),
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}

/**
 * Increment category count
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function incrementCategoryCount(
  db: Database,
  userId: number
): Promise<void> {
  const usage = await getUserUsage(db, userId);

  await db
    .update(schema.usageStats)
    .set({
      categoryCount: usage.categoryCount + 1,
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}

/**
 * Decrement category count
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function decrementCategoryCount(
  db: Database,
  userId: number
): Promise<void> {
  const usage = await getUserUsage(db, userId);

  await db
    .update(schema.usageStats)
    .set({
      categoryCount: Math.max(0, usage.categoryCount - 1),
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}

/**
 * Recalculate and update all usage stats for a user
 * Useful for fixing inconsistencies
 *
 * @param db Database connection
 * @param userId User ID
 */
export async function recalculateUsage(
  db: Database,
  userId: number
): Promise<void> {
  // Count unique sources
  const subscriptions = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId));

  const uniqueSourceIds = new Set(subscriptions.map((s) => s.sourceId));
  const sourceCount = uniqueSourceIds.size;

  // Count public feeds
  const publicFeeds = await db
    .select()
    .from(schema.feeds)
    .where(and(eq(schema.feeds.userId, userId), eq(schema.feeds.public, true)));

  const publicFeedCount = publicFeeds.length;

  // Count categories
  const categories = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.userId, userId));

  const categoryCount = categories.length;

  // Count articles for user's subscribed sources
  let articleCount = 0;
  if (uniqueSourceIds.size > 0) {
    const articles = await db
      .select()
      .from(schema.articles)
      .where(inArray(schema.articles.sourceId, Array.from(uniqueSourceIds)));

    articleCount = articles.length;
  }

  // Update usage stats
  await db
    .update(schema.usageStats)
    .set({
      sourceCount,
      publicFeedCount,
      categoryCount,
      articleCount,
      lastUpdated: new Date(),
    })
    .where(eq(schema.usageStats.userId, userId));
}
/**
 * Check if user has access to AI-powered features
 *
 * Checks:
 * 1. Global AI feature flag in settings
 * 2. User's plan (must be pro or enterprise)
 * 3. Environment configuration (must have API key)
 *
 * @param db Database connection
 * @param userId User ID
 * @param env Environment bindings
 * @returns Access status and reason if denied
 */
export async function checkAiFeatureAccess(
  db: Database,
  userId: number,
  env: { OPENAI_API_KEY?: string }
): Promise<{ allowed: boolean; reason?: string }> {
  // 1. Check global setting
  const { getGlobalSettings } = await import('@/services/global-settings');
  const globalSettings = await getGlobalSettings(db);

  if (!globalSettings.aiEnabled) {
    return { allowed: false, reason: 'AI features are disabled by administrator' };
  }

  // 2. Check API key
  if (!env.OPENAI_API_KEY) {
    return { allowed: false, reason: 'AI service not configured (missing API key)' };
  }

  // 3. Check user plan
  const [user] = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  const planId = user.plan || 'free';
  const AI_ENABLED_PLANS = ['pro', 'enterprise'];

  if (!AI_ENABLED_PLANS.includes(planId)) {
    return { allowed: false, reason: 'AI features require a Pro or Enterprise plan' };
  }

  return { allowed: true };
}
