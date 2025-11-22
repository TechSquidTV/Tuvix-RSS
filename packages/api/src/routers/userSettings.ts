/**
 * User Settings Router
 *
 * Handles user preferences and settings.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { router, rateLimitedProcedure } from "@/trpc/init";
import * as schema from "@/db/schema";
import {
  selectUserSettingsSchema,
  updateUserSettingsSchema,
} from "@/db/schemas.zod";
import { getUserUsage, getUserLimits } from "@/services/limits";
import type { Database } from "@/db/client";

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Default settings values
 */
const DEFAULT_SETTINGS = {
  theme: "system" as const,
  autoAgeDays: 7,
  defaultFilter: "all" as const,
  shareEmail: true,
  shareHackernews: false,
  shareReddit: false,
  shareTwitter: false,
  shareBluesky: false,
  shareMastodon: false,
};

/**
 * Format settings from database with proper type casting
 */
const formatUserSettings = (
  settings: typeof schema.userSettings.$inferSelect
) => ({
  ...settings,
  theme: settings.theme as "system" | "light" | "dark",
  defaultFilter: settings.defaultFilter as "all" | "unread" | "read" | "saved",
});

/**
 * Get or create user settings
 */
const getOrCreateSettings = async (
  db: Database,
  userId: number
): Promise<typeof schema.userSettings.$inferSelect> => {
  // Try to get existing settings
  const existing = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create default settings if they don't exist
  const defaultSettings = await db
    .insert(schema.userSettings)
    .values({
      userId,
      ...DEFAULT_SETTINGS,
    })
    .returning();

  return defaultSettings[0];
};

// ============================================================================
// ROUTER
// ============================================================================

export const userSettingsRouter = router({
  /**
   * Get user's settings (creates defaults if not exists)
   */
  get: rateLimitedProcedure
    .output(selectUserSettingsSchema)
    .query(async ({ ctx }) => {
      const { userId } = ctx.user;
      const settings = await getOrCreateSettings(ctx.db, userId);
      return formatUserSettings(settings);
    }),

  /**
   * Update user's settings (creates defaults if not exists)
   */
  update: rateLimitedProcedure
    .input(
      updateUserSettingsSchema.omit({
        userId: true,
        createdAt: true,
        updatedAt: true,
      })
    )
    .output(selectUserSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Ensure settings exist (auto-create if needed)
      await getOrCreateSettings(ctx.db, userId);

      // Update settings
      const updates = {
        ...input,
        updatedAt: new Date(),
      };

      const updatedSettings = await ctx.db
        .update(schema.userSettings)
        .set(updates)
        .where(eq(schema.userSettings.userId, userId))
        .returning();

      return formatUserSettings(updatedSettings[0]);
    }),

  /**
   * Get user's usage statistics and limits
   */
  getUsage: rateLimitedProcedure
    .output(
      z.object({
        user: z.object({
          id: z.number(),
          username: z.string(),
          email: z.string(),
          role: z.enum(["user", "admin"]),
          plan: z.string(),
          banned: z.boolean(),
          createdAt: z.date(),
        }),
        plan: z.object({
          id: z.string(),
          name: z.string(),
          priceCents: z.number(),
          features: z.array(z.string()).nullable(),
          apiRateLimitPerMinute: z.number(),
          publicFeedRateLimitPerMinute: z.number(),
        }),
        customLimits: z
          .object({
            maxSources: z.number().nullable(),
            maxPublicFeeds: z.number().nullable(),
            maxCategories: z.number().nullable(),
            // Rate limits are not customizable - they come from plan-specific bindings
            notes: z.string().nullable(),
          })
          .nullable(),
        usage: z.object({
          sourceCount: z.number(),
          publicFeedCount: z.number(),
          categoryCount: z.number(),
          articleCount: z.number(),
          lastUpdated: z.date(),
        }),
        limits: z.object({
          maxSources: z.number(),
          maxPublicFeeds: z.number(),
          maxCategories: z.number().nullable(),
        }),
        rateLimitEnabled: z.boolean(),
      })
    )
    .query(async ({ ctx }) => {
      const { userId } = ctx.user;

      try {
        // Get user details
        const [user] = await ctx.db
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);

        if (!user) {
          throw new Error("User not found");
        }

        // Get plan details
        const planId = user.plan || "free";
        const [plan] = await ctx.db
          .select()
          .from(schema.plans)
          .where(eq(schema.plans.id, planId))
          .limit(1);

        if (!plan) {
          throw new Error(`Plan '${planId}' not found`);
        }

        // Parse features safely
        let features: string[] | null = null;
        if (plan.features) {
          try {
            const parsed = JSON.parse(plan.features) as unknown;
            // Ensure it's an array
            features =
              Array.isArray(parsed) &&
              parsed.every((f): f is string => typeof f === "string")
                ? parsed
                : null;
          } catch (e) {
            console.error("Failed to parse plan features:", e);
            features = null;
          }
        }

        // Get custom limits if they exist
        const [customLimits] = await ctx.db
          .select()
          .from(schema.userLimits)
          .where(eq(schema.userLimits.userId, userId))
          .limit(1);

        // Get usage and effective limits
        const usage = await getUserUsage(ctx.db, userId);
        const limits = await getUserLimits(ctx.db, userId);

        // Check if rate limiting is enabled (Cloudflare Workers)
        // Note: Actual binding checks will be added in Phase 3
        const rateLimitEnabled = ctx.env.RUNTIME === "cloudflare";

        return {
          user: {
            id: user.id,
            username: user.username || user.name || "",
            email: user.email,
            role: (user.role as "user" | "admin") || "user",
            plan: user.plan || "free",
            banned: user.banned || false,
            createdAt: user.createdAt,
          },
          plan: {
            id: plan.id,
            name: plan.name,
            priceCents: plan.priceCents,
            features,
            apiRateLimitPerMinute: plan.apiRateLimitPerMinute,
            publicFeedRateLimitPerMinute: plan.publicFeedRateLimitPerMinute,
          },
          customLimits: customLimits
            ? {
                maxSources: customLimits.maxSources,
                maxPublicFeeds: customLimits.maxPublicFeeds,
                maxCategories: customLimits.maxCategories,
                // Rate limits are not customizable - they come from plan-specific bindings
                notes: customLimits.notes,
              }
            : null,
          usage,
          limits: {
            maxSources: limits.maxSources,
            maxPublicFeeds: limits.maxPublicFeeds,
            maxCategories: limits.maxCategories,
          },
          rateLimitEnabled,
        };
      } catch (error) {
        console.error("Error in userSettings.getUsage:", error);
        throw error;
      }
    }),
});
