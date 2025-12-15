/**
 * Admin Router
 *
 * User management, plan changes, suspension, and analytics.
 * All endpoints require admin role.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  eq,
  sql,
  desc,
  asc,
  and,
  gte,
  or,
  inArray,
  like,
  type SQL,
} from "drizzle-orm";
import { router, adminProcedure } from "@/trpc/init";
import * as schema from "@/db/schema";
import {
  getUserLimits,
  getUserUsage,
  recalculateUsage,
} from "@/services/limits";
import {
  createPaginatedSchema,
  withUndefinedAsEmpty,
  paginationInputSchema,
  createPaginatedResponse,
} from "@/types/pagination";
import { validatePlanExists, getAllPlans } from "@/services/plans";
import {
  titleValidator,
  descriptionValidator,
  domainValidator,
} from "@/types/validators";
import { normalizeDomain } from "@/utils/domain-checker";
import { chunkArray, D1_MAX_PARAMETERS } from "@/db/utils";
import { withQueryMetrics } from "@/utils/db-metrics";
import { aggregateByDay, calculateStartDate } from "@/utils/admin-metrics";
import { createAuth } from "@/auth/better-auth";
import { getGlobalSettings } from "@/services/global-settings";
import { logSecurityEvent } from "@/auth/security";
import * as Sentry from "@/utils/sentry";

// ============================================================================
// SHARED SCHEMAS AND CONSTANTS
// ============================================================================

/**
 * Blocked domain reason enum - used across multiple endpoints
 */
const blockedDomainReasonSchema = z.enum([
  "illegal_content",
  "excessive_automation",
  "spam",
  "malware",
  "copyright_violation",
  "other",
]);

/**
 * Plan output schema - used by listPlans and getPlan
 */
const planOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  maxSources: z.number(),
  maxPublicFeeds: z.number(),
  maxCategories: z.number().nullable(),
  apiRateLimitPerMinute: z.number(),
  publicFeedRateLimitPerMinute: z.number(),
  priceCents: z.number(),
  features: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Global settings output schema
 */
const globalSettingsOutputSchema = z.object({
  maxLoginAttempts: z.number(),
  loginAttemptWindowMinutes: z.number(),
  lockoutDurationMinutes: z.number(),
  allowRegistration: z.boolean(),
  requireEmailVerification: z.boolean(),
  adminBypassEmailVerification: z.boolean(),
  passwordResetTokenExpiryHours: z.number(),
  fetchIntervalMinutes: z.number(),
  pruneDays: z.number(),
  lastRssFetchAt: z.date().nullable(),
  lastPruneAt: z.date().nullable(),
  updatedAt: z.date(),
});

// User with usage info for admin views
const AdminUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.enum(["user", "admin"]),
  plan: z.string(), // Plan ID - validated against plans table
  banned: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastSeenAt: z.date().nullable(),
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
    apiRateLimitPerMinute: z.number(),
  }),
  customLimits: z
    .object({
      maxSources: z.number().nullable(),
      maxPublicFeeds: z.number().nullable(),
      maxCategories: z.number().nullable(),
      // Rate limits are not customizable - they come from plan-specific bindings
      apiRateLimitPerMinute: z.number().nullable(), // Always null, kept for backward compatibility
      publicFeedRateLimitPerMinute: z.number().nullable(), // Always null, kept for backward compatibility
      notes: z.string().nullable(),
    })
    .nullable(),
  rateLimitEnabled: z.boolean(),
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Transform user data into AdminUser format with usage and limits
 */
function transformAdminUser(
  user: typeof schema.user.$inferSelect,
  usage: Awaited<ReturnType<typeof getUserUsage>>,
  limits: Awaited<ReturnType<typeof getUserLimits>>,
  customLimits: typeof schema.userLimits.$inferSelect | null | undefined,
  rateLimitEnabled: boolean
): z.infer<typeof AdminUserSchema> {
  return {
    id: user.id,
    username: user.username || user.name,
    email: user.email,
    emailVerified: user.emailVerified || false,
    role: (user.role as "user" | "admin") || "user",
    plan: user.plan || "free",
    banned: user.banned || false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSeenAt: user.lastSeenAt,
    usage: {
      sourceCount: usage.sourceCount,
      publicFeedCount: usage.publicFeedCount,
      categoryCount: usage.categoryCount,
      articleCount: usage.articleCount,
      lastUpdated: usage.lastUpdated,
    },
    limits: {
      maxSources: limits.maxSources,
      maxPublicFeeds: limits.maxPublicFeeds,
      maxCategories: limits.maxCategories,
      apiRateLimitPerMinute: limits.apiRateLimitPerMinute,
    },
    customLimits: customLimits
      ? {
          maxSources: customLimits.maxSources,
          maxPublicFeeds: customLimits.maxPublicFeeds,
          maxCategories: customLimits.maxCategories,
          // Rate limits are not customizable - they come from plan-specific bindings
          apiRateLimitPerMinute: null,
          publicFeedRateLimitPerMinute: null,
          notes: customLimits.notes,
        }
      : null,
    rateLimitEnabled,
  };
}

/**
 * Format global settings from database record
 */
function formatGlobalSettings(
  settings: typeof schema.globalSettings.$inferSelect
): z.infer<typeof globalSettingsOutputSchema> {
  return {
    maxLoginAttempts: settings.maxLoginAttempts,
    loginAttemptWindowMinutes: settings.loginAttemptWindowMinutes,
    lockoutDurationMinutes: settings.lockoutDurationMinutes,
    allowRegistration: settings.allowRegistration,
    requireEmailVerification: settings.requireEmailVerification,
    adminBypassEmailVerification: settings.adminBypassEmailVerification,
    passwordResetTokenExpiryHours: settings.passwordResetTokenExpiryHours,
    fetchIntervalMinutes: settings.fetchIntervalMinutes,
    pruneDays: settings.pruneDays,
    lastRssFetchAt: settings.lastRssFetchAt,
    lastPruneAt: settings.lastPruneAt,
    updatedAt: settings.updatedAt,
  };
}

export const adminRouter = router({
  /**
   * List all users with pagination and filtering
   */
  listUsers: adminProcedure
    .input(
      withUndefinedAsEmpty(
        paginationInputSchema.extend({
          role: z.enum(["user", "admin"]).optional(),
          plan: z.string().optional(), // Plan ID filter - validated at runtime
          banned: z.boolean().optional(),
          emailVerified: z.boolean().optional(), // Filter by email verification status
          search: z.string().optional(), // Search by username or email
          sortBy: z
            .enum([
              "username",
              "email",
              "role",
              "plan",
              "banned",
              "emailVerified",
              "createdAt",
              "lastSeenAt",
            ])
            .optional(),
          sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
        })
      )
    )
    .output(createPaginatedSchema(AdminUserSchema))
    .query(async ({ ctx, input }) => {
      // Extract filter and pagination params (TypeScript loses track of Zod defaults with withUndefinedAsEmpty)
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const role = input.role;
      const plan = input.plan;
      const banned = input.banned;
      const emailVerified = input.emailVerified;
      const search = input.search;
      const sortBy = input.sortBy;
      const sortOrder = input.sortOrder ?? "desc";

      // Build WHERE conditions
      const conditions: SQL[] = [];
      if (role !== undefined) {
        conditions.push(eq(schema.user.role, role));
      }
      if (plan !== undefined) {
        conditions.push(eq(schema.user.plan, plan));
      }
      if (banned !== undefined) {
        conditions.push(eq(schema.user.banned, banned));
      }
      if (emailVerified !== undefined) {
        conditions.push(eq(schema.user.emailVerified, emailVerified));
      }
      if (search) {
        conditions.push(
          sql`(LOWER(COALESCE(${schema.user.username}, ${schema.user.name})) LIKE LOWER(${`%${search}%`}) OR LOWER(${schema.user.email}) LIKE LOWER(${`%${search}%`}))`
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count (separate query for accurate pagination)
      // Note: For optimal performance with large datasets, a COUNT query would be better,
      // but Drizzle's type system makes it difficult with conditional WHERE clauses.
      // Since admin dashboards are low-traffic and user tables are typically small (<10k users),
      // fetching all matching rows for counting is acceptable.
      const allMatchingUsers = await ctx.db
        .select()
        .from(schema.user)
        .where(whereClause);
      const totalCount = allMatchingUsers.length;

      // Determine sort field and order
      const sortField = sortBy || "createdAt";
      const sortFn = sortOrder === "asc" ? asc : desc;

      // Map sortBy field names to database columns
      const sortColumnMap = {
        username: schema.user.username,
        email: schema.user.email,
        role: schema.user.role,
        plan: schema.user.plan,
        banned: schema.user.banned,
        emailVerified: schema.user.emailVerified,
        createdAt: schema.user.createdAt,
        lastSeenAt: schema.user.lastSeenAt,
      } as const;
      const sortColumn =
        sortColumnMap[sortField as keyof typeof sortColumnMap] ??
        schema.user.createdAt;

      // Build ORDER BY clause - handle NULL-last sorting for lastSeenAt
      let orderByClause: SQL<unknown>;
      if (sortField === "lastSeenAt") {
        // Sort NULLs last for lastSeenAt (users who have never logged in)
        // SQLite doesn't support NULLS LAST, so we use CASE to sort nulls as max value
        if (sortOrder === "asc") {
          // ASC: real dates ascending, then nulls at end
          orderByClause = sql`CASE WHEN ${sortColumn} IS NULL THEN 1 ELSE 0 END, ${sortColumn} ASC`;
        } else {
          // DESC: real dates descending, then nulls at end
          orderByClause = sql`CASE WHEN ${sortColumn} IS NULL THEN 1 ELSE 0 END, ${sortColumn} DESC`;
        }
      } else {
        orderByClause = sortFn(sortColumn);
      }

      // Get users (fetch one extra for pagination)
      const users = await withQueryMetrics(
        "admin.listUsers",
        async () =>
          ctx.db
            .select()
            .from(schema.user)
            .where(whereClause)
            .orderBy(orderByClause)
            .limit(limit + 1)
            .offset(offset),
        {
          "db.table": "user",
          "db.operation": "select",
          "db.has_role_filter": role !== undefined,
          "db.has_plan_filter": plan !== undefined,
          "db.has_banned_filter": banned !== undefined,
          "db.has_email_verified_filter": emailVerified !== undefined,
          "db.has_search": !!search,
          "db.sort_by": sortField,
          "db.sort_order": sortOrder,
        }
      );

      // Check if there are more results for pagination
      const hasMore = users.length > limit;

      // Slice to actual requested items (don't process the extra pagination-detection item)
      const requestedUsers = users.slice(0, limit);

      // Bulk fetch usage stats and custom limits for requested users only
      const userIds = requestedUsers.map((u) => u.id);

      // Guard against empty userIds to avoid invalid SQL "IN ()" syntax
      // This can happen when navigating beyond available pages
      const usageRecords =
        userIds.length > 0
          ? await ctx.db
              .select()
              .from(schema.usageStats)
              .where(
                sql`${schema.usageStats.userId} IN (${sql.join(userIds, sql`, `)})`
              )
          : [];

      const customLimitsRecords =
        userIds.length > 0
          ? await ctx.db
              .select()
              .from(schema.userLimits)
              .where(
                sql`${schema.userLimits.userId} IN (${sql.join(userIds, sql`, `)})`
              )
          : [];

      // Create maps for quick lookup
      const usageMap = new Map(usageRecords.map((u) => [u.userId, u]));
      const customLimitsMap = new Map(
        customLimitsRecords.map((l) => [l.userId, l])
      );

      // Build results with usage and limits for requested users only
      const rateLimitEnabled = ctx.env.RUNTIME === "cloudflare";

      const allResults = await Promise.all(
        requestedUsers.map(async (user) => {
          const usage = usageMap.get(user.id);
          const customLimits = customLimitsMap.get(user.id);
          const limits = await getUserLimits(ctx.db, user.id);

          // Provide default usage if not found
          const usageData = usage || {
            sourceCount: 0,
            publicFeedCount: 0,
            categoryCount: 0,
            articleCount: 0,
            lastUpdated: new Date(),
          };

          return transformAdminUser(
            user,
            usageData,
            limits,
            customLimits,
            rateLimitEnabled
          );
        })
      );

      // Return paginated response with accurate total count
      return {
        items: allResults,
        total: totalCount,
        hasMore,
      };
    }),

  /**
   * Get detailed user information
   */
  getUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .output(AdminUserSchema)
    .query(async ({ ctx, input }) => {
      // Get target user
      const [user] = await withQueryMetrics(
        "admin.getUser",
        async () =>
          ctx.db
            .select()
            .from(schema.user)
            .where(eq(schema.user.id, input.userId))
            .limit(1),
        {
          "db.table": "user",
          "db.operation": "select",
          "db.user_id": input.userId,
        }
      );

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Get usage and limits
      const usage = await getUserUsage(ctx.db, input.userId);
      const limits = await getUserLimits(ctx.db, input.userId);

      // Get custom limits if any
      const [customLimits] = await ctx.db
        .select()
        .from(schema.userLimits)
        .where(eq(schema.userLimits.userId, input.userId))
        .limit(1);

      // Check if rate limiting is enabled (Cloudflare Workers)
      // Note: Actual binding checks will be added in Phase 3
      const rateLimitEnabled = ctx.env.RUNTIME === "cloudflare";

      return transformAdminUser(
        user,
        usage,
        limits,
        customLimits,
        rateLimitEnabled
      );
    }),

  /**
   * Ban or unban a user
   */
  banUser: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        banned: z.boolean(),
        reason: z.string().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Cannot ban yourself
      if (input.userId === ctx.user.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot ban your own account",
        });
      }

      // Update Better Auth user table
      await withQueryMetrics(
        "admin.banUser.update",
        async () =>
          ctx.db
            .update(schema.user)
            .set({
              banned: input.banned,
              updatedAt: new Date(),
              banReason: input.reason || null,
            })
            .where(eq(schema.user.id, input.userId)),
        {
          "db.table": "user",
          "db.operation": "update",
          "db.user_id": input.userId,
          "db.banned": input.banned,
        }
      );

      // Log the action
      await withQueryMetrics(
        "admin.banUser.auditLog",
        async () =>
          ctx.db.insert(schema.securityAuditLog).values({
            userId: input.userId,
            action: input.banned ? "account_locked" : "account_unlocked",
            metadata: input.reason
              ? JSON.stringify({ reason: input.reason })
              : null,
            success: true,
          }),
        {
          "db.table": "securityAuditLog",
          "db.operation": "insert",
          "db.action": input.banned ? "account_locked" : "account_unlocked",
        }
      );

      return { success: true };
    }),

  /**
   * Change user's plan
   */
  changePlan: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        plan: z.string(), // Plan ID - validated at runtime
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Validate plan exists in database
      const planExists = await validatePlanExists(ctx.db, input.plan);
      if (!planExists) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Plan '${input.plan}' does not exist`,
        });
      }

      // Update user's plan in Better Auth user table
      await withQueryMetrics(
        "admin.changePlan",
        async () =>
          ctx.db
            .update(schema.user)
            .set({
              plan: input.plan,
              updatedAt: new Date(),
            })
            .where(eq(schema.user.id, input.userId)),
        {
          "db.table": "user",
          "db.operation": "update",
          "db.user_id": input.userId,
          "db.new_plan": input.plan,
        }
      );

      return { success: true };
    }),

  /**
   * Set custom limits for a user
   * Note: Rate limits are not customizable - they are enforced by plan-specific bindings
   */
  setCustomLimits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        maxSources: z.number().nullable().optional(),
        maxPublicFeeds: z.number().nullable().optional(),
        maxCategories: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user exists
      const [user] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if custom limits already exist
      const [existingLimits] = await ctx.db
        .select()
        .from(schema.userLimits)
        .where(eq(schema.userLimits.userId, input.userId))
        .limit(1);

      const updates: Partial<typeof schema.userLimits.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.maxSources !== undefined) updates.maxSources = input.maxSources;
      if (input.maxPublicFeeds !== undefined)
        updates.maxPublicFeeds = input.maxPublicFeeds;
      if (input.maxCategories !== undefined)
        updates.maxCategories = input.maxCategories;
      if (input.notes !== undefined) updates.notes = input.notes;

      if (existingLimits) {
        // Update existing limits (preserve rate limit fields from database, don't update them)
        await ctx.db
          .update(schema.userLimits)
          .set(updates)
          .where(eq(schema.userLimits.userId, input.userId));
      } else {
        // Create new custom limits (rate limit fields will be null, plan limits will be used)
        await ctx.db.insert(schema.userLimits).values({
          userId: input.userId,
          maxSources: input.maxSources,
          maxPublicFeeds: input.maxPublicFeeds,
          maxCategories: input.maxCategories,
          apiRateLimitPerMinute: null, // Rate limits always use plan limits
          publicFeedRateLimitPerMinute: null, // Rate limits always use plan limits
          notes: input.notes || null,
        });
      }

      return { success: true };
    }),

  /**
   * Remove custom limits (revert to plan defaults)
   */
  removeCustomLimits: adminProcedure
    .input(z.object({ userId: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Delete custom limits
      await ctx.db
        .delete(schema.userLimits)
        .where(eq(schema.userLimits.userId, input.userId));

      return { success: true };
    }),

  /**
   * Recalculate usage stats for a user
   */
  recalculateUsage: adminProcedure
    .input(z.object({ userId: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await recalculateUsage(ctx.db, input.userId);

      return { success: true };
    }),

  /**
   * Resend verification email to a user
   * Manually triggers email verification for unverified users
   * Rate limited: 1 request per admin per 30 seconds (global)
   */
  resendVerificationEmail: adminProcedure
    .input(z.object({ userId: z.number() }))
    .output(
      z.object({
        success: z.boolean(),
        message: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return Sentry.startSpan(
        {
          name: "admin.resendVerificationEmail",
          op: "admin.email",
          attributes: {
            "admin.user_id": ctx.user.userId.toString(),
            "target.user_id": input.userId.toString(),
          },
        },
        async (parentSpan) => {
          const startTime = Date.now();

          try {
            // Check if email verification is enabled globally
            const settings = await getGlobalSettings(ctx.db);
            if (!settings.requireEmailVerification) {
              parentSpan?.setAttribute("verification.disabled", true);
              return {
                success: false,
                message: "Email verification is not enabled",
              };
            }

            // Check if user exists
            const [user] = await ctx.db
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, input.userId))
              .limit(1);

            if (!user) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "User not found",
              });
            }

            // Check if user is already verified
            if (user.emailVerified) {
              parentSpan?.setAttribute("user.already_verified", true);
              return {
                success: false,
                message: "User email is already verified",
              };
            }

            // Create Better Auth instance
            const auth = createAuth(ctx.env, ctx.db);

            // Get frontend URL for callback
            const frontendUrl = ctx.env.BASE_URL || "http://localhost:5173";

            // Send verification email using Better Auth API
            // This creates a new token with a fresh 1-hour expiration
            const result = await auth.api.sendVerificationEmail({
              body: {
                email: user.email,
                callbackURL: `${frontendUrl}/app/articles`,
              },
            });

            // Check if the operation was successful
            if (!result.status) {
              parentSpan?.setAttribute("email.send_failed", true);
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to send verification email",
              });
            }

            // Log security event
            await logSecurityEvent(ctx.db, {
              userId: ctx.user.userId,
              action: "admin_resend_verification",
              ipAddress: undefined,
              userAgent: undefined,
              success: true,
              metadata: {
                targetUserId: input.userId,
                targetEmail: user.email,
              },
            });

            const duration = Date.now() - startTime;
            parentSpan?.setAttributes({
              "verification.sent": true,
              duration_ms: duration,
            });

            return {
              success: true,
              message: "Verification email sent successfully",
            };
          } catch (error) {
            const duration = Date.now() - startTime;

            // Log failed attempt
            try {
              await logSecurityEvent(ctx.db, {
                userId: ctx.user.userId,
                action: "admin_resend_verification",
                ipAddress: undefined,
                userAgent: undefined,
                success: false,
                metadata: {
                  targetUserId: input.userId,
                  error: (error as Error).message,
                },
              });
            } catch (auditError) {
              console.error(
                "Failed to log failed resend verification:",
                auditError
              );
            }

            parentSpan?.setAttributes({
              "verification.sent": false,
              error: (error as Error).message,
              duration_ms: duration,
            });

            Sentry.captureException(error, {
              tags: {
                flow: "admin_resend_verification",
              },
              extra: {
                adminUserId: ctx.user.userId,
                targetUserId: input.userId,
              },
            });

            // Re-throw if it's already a TRPCError
            if (error instanceof TRPCError) {
              throw error;
            }

            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to resend verification email",
            });
          }
        }
      );
    }),

  /**
   * Delete a user (careful!)
   */
  deleteUser: adminProcedure
    .input(z.object({ userId: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Cannot delete yourself
      if (input.userId === ctx.user.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete your own account",
        });
      }

      // Check if user exists
      const [user] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Delete user from Better Auth user table (cascade will delete all related data)
      await withQueryMetrics(
        "admin.deleteUser.delete",
        async () =>
          ctx.db.delete(schema.user).where(eq(schema.user.id, input.userId)),
        {
          "db.table": "user",
          "db.operation": "delete",
          "db.user_id": input.userId,
        }
      );

      // Log the deletion
      await withQueryMetrics(
        "admin.deleteUser.auditLog",
        async () =>
          ctx.db.insert(schema.securityAuditLog).values({
            action: "account_locked", // Using account_locked as closest action
            metadata: JSON.stringify({
              deletedUserId: input.userId,
              deletedUsername: user.username,
              deletedBy: ctx.user.username,
            }),
            success: true,
          }),
        {
          "db.table": "securityAuditLog",
          "db.operation": "insert",
          "db.action": "account_deleted",
        }
      );

      return { success: true };
    }),

  // ==========================================================================
  // GLOBAL SETTINGS MANAGEMENT
  // ==========================================================================

  /**
   * Get global settings
   */
  getGlobalSettings: adminProcedure
    .input(withUndefinedAsEmpty(z.object({})))
    .output(globalSettingsOutputSchema)
    .query(async ({ ctx }) => {
      const [settings] = await ctx.db
        .select()
        .from(schema.globalSettings)
        .limit(1);

      // If no settings exist, create defaults
      if (!settings) {
        const [newSettings] = await ctx.db
          .insert(schema.globalSettings)
          .values({
            maxLoginAttempts: 5,
            loginAttemptWindowMinutes: 15,
            lockoutDurationMinutes: 30,
            allowRegistration: true,
            requireEmailVerification: false,
            adminBypassEmailVerification: true,
            passwordResetTokenExpiryHours: 1,
            fetchIntervalMinutes: 60,
            pruneDays: 30,
          })
          .returning();

        if (!newSettings) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create default global settings",
          });
        }

        return formatGlobalSettings(newSettings);
      }

      return formatGlobalSettings(settings);
    }),

  /**
   * Update global settings
   */
  updateGlobalSettings: adminProcedure
    .input(
      z.object({
        maxLoginAttempts: z.number().int().min(1).max(100).optional(),
        loginAttemptWindowMinutes: z.number().int().min(1).max(1440).optional(),
        lockoutDurationMinutes: z.number().int().min(1).max(10080).optional(),
        allowRegistration: z.boolean().optional(),
        requireEmailVerification: z.boolean().optional(),
        adminBypassEmailVerification: z.boolean().optional(),
        passwordResetTokenExpiryHours: z
          .number()
          .int()
          .min(1)
          .max(72)
          .optional(),
        fetchIntervalMinutes: z.number().int().min(5).max(1440).optional(),
        pruneDays: z.number().int().min(0).max(365).optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if settings exist
      const [existing] = await ctx.db
        .select()
        .from(schema.globalSettings)
        .limit(1);

      const updates: Partial<typeof schema.globalSettings.$inferInsert> = {
        updatedAt: new Date(),
        updatedBy: ctx.user.userId,
      };

      if (input.maxLoginAttempts !== undefined)
        updates.maxLoginAttempts = input.maxLoginAttempts;
      if (input.loginAttemptWindowMinutes !== undefined)
        updates.loginAttemptWindowMinutes = input.loginAttemptWindowMinutes;
      if (input.lockoutDurationMinutes !== undefined)
        updates.lockoutDurationMinutes = input.lockoutDurationMinutes;
      if (input.allowRegistration !== undefined)
        updates.allowRegistration = input.allowRegistration;
      if (input.requireEmailVerification !== undefined)
        updates.requireEmailVerification = input.requireEmailVerification;
      if (input.adminBypassEmailVerification !== undefined)
        updates.adminBypassEmailVerification =
          input.adminBypassEmailVerification;
      if (input.passwordResetTokenExpiryHours !== undefined)
        updates.passwordResetTokenExpiryHours =
          input.passwordResetTokenExpiryHours;
      if (input.fetchIntervalMinutes !== undefined)
        updates.fetchIntervalMinutes = input.fetchIntervalMinutes;
      if (input.pruneDays !== undefined) updates.pruneDays = input.pruneDays;

      if (existing) {
        // Update existing settings
        await ctx.db
          .update(schema.globalSettings)
          .set(updates)
          .where(eq(schema.globalSettings.id, 1));
      } else {
        // Create new settings
        await ctx.db.insert(schema.globalSettings).values({
          ...updates,
          maxLoginAttempts: input.maxLoginAttempts ?? 5,
          loginAttemptWindowMinutes: input.loginAttemptWindowMinutes ?? 15,
          lockoutDurationMinutes: input.lockoutDurationMinutes ?? 30,
          allowRegistration: input.allowRegistration ?? true,
          requireEmailVerification: input.requireEmailVerification ?? false,
          adminBypassEmailVerification:
            input.adminBypassEmailVerification ?? true,
          passwordResetTokenExpiryHours:
            input.passwordResetTokenExpiryHours ?? 1,
          fetchIntervalMinutes: input.fetchIntervalMinutes ?? 60,
          pruneDays: input.pruneDays ?? 30,
        });
      }

      return { success: true };
    }),

  // ==========================================================================
  // PLAN MANAGEMENT
  // ==========================================================================

  /**
   * List all plans
   */
  listPlans: adminProcedure
    .output(z.array(planOutputSchema))
    .query(async ({ ctx }) => {
      return await getAllPlans(ctx.db);
    }),

  /**
   * Get plan by ID
   */
  getPlan: adminProcedure
    .input(z.object({ planId: z.string() }))
    .output(planOutputSchema)
    .query(async ({ ctx, input }) => {
      const [plan] = await ctx.db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, input.planId))
        .limit(1);

      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plan not found",
        });
      }

      return plan;
    }),

  /**
   * Create new plan
   */
  createPlan: adminProcedure
    .input(
      z.object({
        id: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9-]+$/),
        name: titleValidator,
        maxSources: z.number().int().min(0),
        maxPublicFeeds: z.number().int().min(0),
        maxCategories: z.number().int().min(0).nullable(),
        apiRateLimitPerMinute: z.number().int().min(1).max(10000),
        publicFeedRateLimitPerMinute: z.number().int().min(1).max(10000),
        priceCents: z.number().int().min(0),
        features: descriptionValidator,
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if plan ID already exists
      const exists = await validatePlanExists(ctx.db, input.id);
      if (exists) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Plan with ID '${input.id}' already exists`,
        });
      }

      await ctx.db.insert(schema.plans).values({
        id: input.id,
        name: input.name,
        maxSources: input.maxSources,
        maxPublicFeeds: input.maxPublicFeeds,
        maxCategories: input.maxCategories,
        apiRateLimitPerMinute: input.apiRateLimitPerMinute,
        publicFeedRateLimitPerMinute: input.publicFeedRateLimitPerMinute,
        priceCents: input.priceCents,
        features: input.features || null,
      });

      return { success: true };
    }),

  /**
   * Update existing plan
   */
  updatePlan: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: titleValidator.optional(),
        maxSources: z.number().int().min(0).optional(),
        maxPublicFeeds: z.number().int().min(0).optional(),
        maxCategories: z.number().int().min(0).nullable().optional(),
        apiRateLimitPerMinute: z.number().int().min(1).max(10000).optional(),
        publicFeedRateLimitPerMinute: z
          .number()
          .int()
          .min(1)
          .max(10000)
          .optional(),
        priceCents: z.number().int().min(0).optional(),
        features: descriptionValidator.optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if plan exists
      const exists = await validatePlanExists(ctx.db, input.id);
      if (!exists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Plan '${input.id}' not found`,
        });
      }

      const updates: Partial<typeof schema.plans.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updates.name = input.name;
      if (input.maxSources !== undefined) updates.maxSources = input.maxSources;
      if (input.maxPublicFeeds !== undefined)
        updates.maxPublicFeeds = input.maxPublicFeeds;
      if (input.maxCategories !== undefined)
        updates.maxCategories = input.maxCategories;
      if (input.apiRateLimitPerMinute !== undefined)
        updates.apiRateLimitPerMinute = input.apiRateLimitPerMinute;
      if (input.publicFeedRateLimitPerMinute !== undefined)
        updates.publicFeedRateLimitPerMinute =
          input.publicFeedRateLimitPerMinute;
      if (input.priceCents !== undefined) updates.priceCents = input.priceCents;
      if (input.features !== undefined) updates.features = input.features;

      await ctx.db
        .update(schema.plans)
        .set(updates)
        .where(eq(schema.plans.id, input.id));

      return { success: true };
    }),

  /**
   * Delete plan (cannot delete if users are assigned to it)
   */
  deletePlan: adminProcedure
    .input(z.object({ planId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if any users have this plan
      const usersWithPlan = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.plan, input.planId))
        .limit(1);

      if (usersWithPlan.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete plan '${input.planId}' because users are assigned to it`,
        });
      }

      await ctx.db
        .delete(schema.plans)
        .where(eq(schema.plans.id, input.planId));

      return { success: true };
    }),

  // ==========================================================================
  // PLATFORM STATISTICS
  // ==========================================================================

  /**
   * Get platform statistics
   */
  getStats: adminProcedure
    .output(
      z.object({
        totalUsers: z.number(),
        activeUsers: z.number(), // Non-banned users
        adminUsers: z.number(),
        bannedUsers: z.number(),
        usersByPlan: z.record(z.string(), z.number()), // Dynamic plan counts
        totalSources: z.number(),
        totalPublicFeeds: z.number(),
        totalCategories: z.number(),
        totalArticles: z.number(),
      })
    )
    .query(async ({ ctx }) => {
      // Get all users
      const allUsers = await withQueryMetrics(
        "admin.getStats.allUsers",
        async () => ctx.db.select().from(schema.user),
        {
          "db.table": "user",
          "db.operation": "select",
        }
      );

      // Count various user categories
      const totalUsers = allUsers.length;
      const activeUsers = allUsers.filter((u) => !u.banned).length;
      const adminUsers = allUsers.filter((u) => u.role === "admin").length;
      const bannedUsers = allUsers.filter((u) => u.banned).length;

      // Count users by plan (dynamic based on actual plans in database)
      const allPlans = await getAllPlans(ctx.db);
      const usersByPlan: Record<string, number> = {};

      // Initialize all plan counts to 0
      for (const plan of allPlans) {
        usersByPlan[plan.id] = 0;
      }

      // Count users for each plan
      for (const user of allUsers) {
        const planId = user.plan || "free";
        if (usersByPlan[planId] !== undefined) {
          usersByPlan[planId]++;
        } else {
          // Handle case where user has a plan that's not in the plans table
          usersByPlan[planId] = (usersByPlan[planId] || 0) + 1;
        }
      }

      // Get total usage stats
      const allUsageStats = await withQueryMetrics(
        "admin.getStats.usageStats",
        async () => ctx.db.select().from(schema.usageStats),
        {
          "db.table": "usageStats",
          "db.operation": "select",
        }
      );

      const totalSources = allUsageStats.reduce(
        (sum, stat) => sum + stat.sourceCount,
        0
      );
      const totalPublicFeeds = allUsageStats.reduce(
        (sum, stat) => sum + stat.publicFeedCount,
        0
      );

      // Count categories directly from categories table (more accurate)
      const categories = await withQueryMetrics(
        "admin.getStats.categories",
        async () => ctx.db.select().from(schema.categories),
        {
          "db.table": "categories",
          "db.operation": "select",
        }
      );
      const totalCategories = categories.length;

      // Count articles directly from articles table (more accurate)
      const articles = await withQueryMetrics(
        "admin.getStats.articles",
        async () => ctx.db.select().from(schema.articles),
        {
          "db.table": "articles",
          "db.operation": "select",
        }
      );
      const totalArticles = articles.length;

      return {
        totalUsers,
        activeUsers,
        adminUsers,
        bannedUsers,
        usersByPlan,
        totalSources,
        totalPublicFeeds,
        totalCategories,
        totalArticles,
      };
    }),

  /**
   * Get system-wide rate limit statistics
   */
  getRateLimitStats: adminProcedure
    .output(
      z.object({
        totalPublicFeedAccessLast24h: z.number(),
        rateLimitEnabled: z.boolean(),
      })
    )
    .query(async ({ ctx }) => {
      // Get public feed access count from last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const accessLogs = await ctx.db
        .select()
        .from(schema.publicFeedAccessLog)
        .where(
          sql`${schema.publicFeedAccessLog.accessedAt} > ${twentyFourHoursAgo.toISOString()}`
        );

      const totalPublicFeedAccessLast24h = accessLogs.length;

      // Check if rate limiting is enabled (Cloudflare Workers)
      // Note: Actual binding checks will be added in Phase 3
      const rateLimitEnabled = ctx.env.RUNTIME === "cloudflare";

      return {
        totalPublicFeedAccessLast24h,
        rateLimitEnabled,
      };
    }),

  /**
   * Get recent public feed access log
   */
  getPublicFeedAccessLog: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        feedId: z.number().optional(),
      })
    )
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.number(),
            feedId: z.number(),
            feedSlug: z.string(),
            ownerUsername: z.string(),
            ipAddress: z.string(),
            userAgent: z.string().nullable(),
            accessedAt: z.date(),
          })
        ),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Build WHERE conditions
      const conditions: SQL[] = [];
      if (input.feedId) {
        conditions.push(eq(schema.publicFeedAccessLog.feedId, input.feedId));
      }

      // Get total count
      const countResults = await ctx.db
        .select()
        .from(schema.publicFeedAccessLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = countResults.length;

      // Get access logs with feed and user details
      type LogSelectResult = {
        id: number;
        feedId: number;
        feedSlug: string | null;
        ownerUsername: string | null;
        ipAddress: string;
        userAgent: string | null;
        accessedAt: Date;
      };

      // Query builder - Drizzle's union type requires type assertion for select with explicit fields
      // This is a known limitation when using union types (D1Database | BetterSQLite3Database)
      const queryResult = await (
        ctx.db as unknown as {
          select: (selection: Record<string, unknown>) => {
            from: (table: unknown) => {
              innerJoin: (
                table: unknown,
                condition: unknown
              ) => {
                innerJoin: (
                  table: unknown,
                  condition: unknown
                ) => {
                  where: (condition: unknown) => {
                    orderBy: (order: unknown) => {
                      limit: (limit: number) => {
                        offset: (offset: number) => Promise<LogSelectResult[]>;
                      };
                    };
                  };
                };
              };
            };
          };
        }
      )
        .select({
          id: schema.publicFeedAccessLog.id,
          feedId: schema.publicFeedAccessLog.feedId,
          feedSlug: schema.feeds.slug,
          ownerUsername:
            sql<string>`COALESCE(${schema.user.username}, ${schema.user.name})`.as(
              "ownerUsername"
            ),
          ipAddress: schema.publicFeedAccessLog.ipAddress,
          userAgent: schema.publicFeedAccessLog.userAgent,
          accessedAt: schema.publicFeedAccessLog.accessedAt,
        })
        .from(schema.publicFeedAccessLog)
        .innerJoin(
          schema.feeds,
          eq(schema.publicFeedAccessLog.feedId, schema.feeds.id)
        )
        .innerJoin(schema.user, eq(schema.feeds.userId, schema.user.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.publicFeedAccessLog.accessedAt))
        .limit(input.limit)
        .offset(input.offset);

      const logsRaw = queryResult;

      return {
        items: logsRaw.map((log) => ({
          id: log.id,
          feedId: log.feedId,
          feedSlug: log.feedSlug ?? "",
          ownerUsername: log.ownerUsername ?? "",
          ipAddress: log.ipAddress,
          userAgent: log.userAgent ?? null,
          accessedAt: log.accessedAt,
        })),
        total,
      };
    }),

  /**
   * Get user growth over time
   */
  getUserGrowth: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const users = await ctx.db
        .select()
        .from(schema.user)
        .where(gte(schema.user.createdAt, startDate));

      const data = aggregateByDay(
        users,
        (user) => new Date(user.createdAt),
        input.days,
        startDate
      );

      return { data };
    }),

  /**
   * Get source growth over time
   */
  getSourceGrowth: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const sources = await ctx.db
        .select()
        .from(schema.sources)
        .where(gte(schema.sources.createdAt, startDate));

      const data = aggregateByDay(
        sources,
        (source) => new Date(source.createdAt),
        input.days,
        startDate
      );

      return { data };
    }),

  /**
   * Get article activity over time
   */
  getArticleActivity: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      // Get articles where either publishedAt or createdAt is within range
      // Use or() to check both publishedAt and createdAt separately
      const articles = await ctx.db
        .select()
        .from(schema.articles)
        .where(
          or(
            and(
              sql`${schema.articles.publishedAt} IS NOT NULL`,
              gte(schema.articles.publishedAt, startDate)
            )!,
            and(
              sql`${schema.articles.publishedAt} IS NULL`,
              gte(schema.articles.createdAt, startDate)
            )!
          )!
        )
        .then((rows) =>
          rows.map((row) => ({
            publishedAt: row.publishedAt,
            createdAt: row.createdAt,
          }))
        );

      // Group by day using publishedAt or createdAt
      const grouped = new Map<string, number>();
      articles.forEach((article) => {
        const date = article.publishedAt || article.createdAt;
        if (date) {
          const dateObj = new Date(date);
          const dateStr = dateObj.toISOString().split("T")[0]!;
          grouped.set(dateStr, (grouped.get(dateStr) || 0) + 1);
        }
      });

      // Fill in missing days
      const data: { date: string; count: number }[] = [];
      for (let i = 0; i < input.days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0]!;
        data.push({
          date: dateStr,
          count: grouped.get(dateStr) || 0,
        });
      }

      return { data };
    }),

  /**
   * Get public feed access over time
   */
  getPublicFeedAccess: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const logs = await ctx.db
        .select()
        .from(schema.publicFeedAccessLog)
        .where(gte(schema.publicFeedAccessLog.accessedAt, startDate));

      const data = aggregateByDay(
        logs,
        (log) => new Date(log.accessedAt),
        input.days,
        startDate
      );

      return { data };
    }),

  /**
   * Get API usage by endpoint
   */
  getApiUsage: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        byEndpoint: z.array(
          z.object({
            endpoint: z.string(),
            count: z.number(),
          })
        ),
        overTime: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const logs = await ctx.db
        .select()
        .from(schema.apiUsageLog)
        .where(gte(schema.apiUsageLog.createdAt, startDate));

      // Group by endpoint
      const endpointCounts = new Map<string, number>();
      logs.forEach((log) => {
        endpointCounts.set(
          log.endpoint,
          (endpointCounts.get(log.endpoint) || 0) + 1
        );
      });

      // Use shared aggregation for overTime
      const overTime = aggregateByDay(
        logs,
        (log) => new Date(log.createdAt),
        input.days,
        startDate
      );

      // Sort endpoints by count and take top 10
      const byEndpoint = Array.from(endpointCounts.entries())
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return { byEndpoint, overTime };
    }),

  /**
   * Get security events over time
   */
  getSecurityEvents: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            logins: z.number(),
            failedLogins: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const logs = await ctx.db
        .select()
        .from(schema.securityAuditLog)
        .where(gte(schema.securityAuditLog.createdAt, startDate))
        .then((rows) =>
          rows.map((row) => ({
            action: row.action,
            createdAt: row.createdAt,
            success: row.success,
          }))
        );

      // Group by day and action type
      const grouped = new Map<
        string,
        { logins: number; failedLogins: number }
      >();
      logs.forEach((log) => {
        const date = new Date(log.createdAt);
        const dateStr = date.toISOString().split("T")[0]!;
        const dayData = grouped.get(dateStr) || { logins: 0, failedLogins: 0 };

        if (log.action === "login") {
          if (log.success) {
            dayData.logins++;
          } else {
            dayData.failedLogins++;
          }
        }

        grouped.set(dateStr, dayData);
      });

      // Fill in missing days
      const data: { date: string; logins: number; failedLogins: number }[] = [];
      for (let i = 0; i < input.days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split("T")[0]!;
        const dayData = grouped.get(dateStr) || { logins: 0, failedLogins: 0 };
        data.push({
          date: dateStr,
          logins: dayData.logins,
          failedLogins: dayData.failedLogins,
        });
      }

      return { data };
    }),

  /**
   * Get subscription growth over time
   */
  getSubscriptionGrowth: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const subscriptions = await ctx.db
        .select()
        .from(schema.subscriptions)
        .where(gte(schema.subscriptions.createdAt, startDate));

      const data = aggregateByDay(
        subscriptions,
        (subscription) => new Date(subscription.createdAt),
        input.days,
        startDate
      );

      return { data };
    }),

  /**
   * Get articles read over time
   */
  getArticlesRead: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(365).default(30),
      })
    )
    .output(
      z.object({
        data: z.array(
          z.object({
            date: z.string(),
            count: z.number(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const startDate = calculateStartDate(input.days);

      const readStates = await ctx.db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.read, true),
            gte(schema.userArticleStates.updatedAt, startDate)
          )
        );

      const data = aggregateByDay(
        readStates,
        (state) => new Date(state.updatedAt),
        input.days,
        startDate
      );

      return { data };
    }),

  // ============================================================================
  // BLOCKED DOMAINS MANAGEMENT
  // ============================================================================

  /**
   * List all blocked domains with pagination and filtering
   */
  listBlockedDomains: adminProcedure
    .input(
      withUndefinedAsEmpty(
        paginationInputSchema.extend({
          search: z.string().optional(),
          reason: blockedDomainReasonSchema.optional(),
        })
      )
    )
    .output(
      createPaginatedSchema(
        z.object({
          id: z.number(),
          domain: z.string(),
          reason: blockedDomainReasonSchema.nullable(),
          notes: z.string().nullable(),
          createdAt: z.date(),
          updatedAt: z.date(),
          createdBy: z.number().nullable(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      // Extract filter and pagination params (TypeScript loses track of Zod defaults with withUndefinedAsEmpty)
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const search = input.search;
      const reason = input.reason;

      const conditions: SQL[] = [];

      if (search) {
        conditions.push(like(schema.blockedDomains.domain, `%${search}%`));
      }

      if (reason !== undefined) {
        conditions.push(eq(schema.blockedDomains.reason, reason));
      }

      const blocked = await withQueryMetrics(
        "admin.listBlockedDomains",
        async () =>
          ctx.db
            .select()
            .from(schema.blockedDomains)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(schema.blockedDomains.createdAt))
            .limit(limit + 1)
            .offset(offset),
        {
          "db.table": "blockedDomains",
          "db.operation": "select",
          "db.has_search": !!search,
          "db.has_reason_filter": reason !== undefined,
        }
      );

      return createPaginatedResponse(blocked, limit, offset);
    }),

  /**
   * Add a blocked domain
   */
  addBlockedDomain: adminProcedure
    .input(
      z.object({
        domain: domainValidator,
        reason: blockedDomainReasonSchema.nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
    )
    .output(
      z.object({
        id: z.number(),
        domain: z.string(),
        reason: blockedDomainReasonSchema.nullable(),
        notes: z.string().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
        createdBy: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalizedDomain = normalizeDomain(input.domain);

      // Check for duplicate
      const existing = await ctx.db
        .select()
        .from(schema.blockedDomains)
        .where(eq(schema.blockedDomains.domain, normalizedDomain))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Domain already blocked",
        });
      }

      const [blocked] = await ctx.db
        .insert(schema.blockedDomains)
        .values({
          domain: normalizedDomain,
          reason: input.reason || null,
          notes: input.notes || null,
          createdBy: ctx.user.userId,
        })
        .returning();

      if (!blocked) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create blocked domain",
        });
      }

      return blocked;
    }),

  /**
   * Update a blocked domain (reason and notes only, domain cannot be changed)
   */
  updateBlockedDomain: adminProcedure
    .input(
      z.object({
        id: z.number(),
        reason: blockedDomainReasonSchema.nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
    )
    .output(
      z.object({
        id: z.number(),
        domain: z.string(),
        reason: blockedDomainReasonSchema.nullable(),
        notes: z.string().nullable(),
        createdAt: z.date(),
        updatedAt: z.date(),
        createdBy: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if domain exists
      const [existing] = await ctx.db
        .select()
        .from(schema.blockedDomains)
        .where(eq(schema.blockedDomains.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Blocked domain not found",
        });
      }

      const updateData: {
        reason?:
          | "illegal_content"
          | "excessive_automation"
          | "spam"
          | "malware"
          | "copyright_violation"
          | "other"
          | null;
        notes?: string | null;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (input.reason !== undefined) {
        updateData.reason = input.reason;
      }

      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }

      const [updated] = await ctx.db
        .update(schema.blockedDomains)
        .set(updateData)
        .where(eq(schema.blockedDomains.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Failed to update blocked domain",
        });
      }

      return updated;
    }),

  /**
   * Remove a blocked domain
   */
  removeBlockedDomain: adminProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.blockedDomains)
        .where(eq(schema.blockedDomains.id, input.id));

      return { success: true };
    }),

  /**
   * Bulk add blocked domains
   */
  bulkAddBlockedDomains: adminProcedure
    .input(
      z.object({
        domains: z.string(),
        reason: blockedDomainReasonSchema.nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      })
    )
    .output(
      z.object({
        added: z.number(),
        skipped: z.number(),
        errors: z.array(z.object({ domain: z.string(), error: z.string() })),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Parse domains: split by newlines and commas, trim whitespace
      const domainStrings = input.domains
        .split(/[\n,]+/)
        .map((d) => d.trim())
        .filter((d) => d.length > 0);

      const errors: Array<{ domain: string; error: string }> = [];
      const validDomains: string[] = [];
      let added = 0;
      let skipped = 0;

      // Validate each domain
      for (const domainStr of domainStrings) {
        try {
          const validated = domainValidator.parse(domainStr);
          const normalized = normalizeDomain(validated);
          validDomains.push(normalized);
        } catch (error) {
          errors.push({
            domain: domainStr,
            error:
              error instanceof Error ? error.message : "Invalid domain format",
          });
        }
      }

      if (validDomains.length === 0) {
        return { added: 0, skipped: 0, errors };
      }

      // Get existing domains to skip duplicates
      const existingDomains = await ctx.db
        .select()
        .from(schema.blockedDomains)
        .where(inArray(schema.blockedDomains.domain, validDomains));

      const existingSet = new Set(existingDomains.map((e) => e.domain));
      const domainsToAdd = validDomains.filter((d) => !existingSet.has(d));

      skipped = validDomains.length - domainsToAdd.length;

      if (domainsToAdd.length === 0) {
        return { added: 0, skipped, errors };
      }

      // Batch insert (chunk for Cloudflare D1 parameter limit)
      // Each domain insert has 4 parameters: domain, reason, notes, createdBy
      // So we need to divide the parameter limit by 4 to get the max domains per chunk
      const paramsPerRecord = 4;
      const maxDomainsPerChunk = Math.floor(
        D1_MAX_PARAMETERS / paramsPerRecord
      );
      const chunks = chunkArray(domainsToAdd, maxDomainsPerChunk);

      for (const chunk of chunks) {
        const values = chunk.map((domain) => ({
          domain,
          reason: input.reason || null,
          notes: input.notes || null,
          createdBy: ctx.user.userId,
        }));

        await ctx.db.insert(schema.blockedDomains).values(values);
        added += chunk.length;
      }

      return { added, skipped, errors };
    }),

  /**
   * Bulk remove blocked domains
   */
  bulkRemoveBlockedDomains: adminProcedure
    .input(z.object({ ids: z.array(z.number()).max(1000) }))
    .output(z.object({ removed: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) {
        return { removed: 0 };
      }

      // Chunk IDs for Cloudflare D1 parameter limit
      const chunks = chunkArray(input.ids, D1_MAX_PARAMETERS - 1);
      let removed = 0;

      for (const chunk of chunks) {
        await ctx.db
          .delete(schema.blockedDomains)
          .where(inArray(schema.blockedDomains.id, chunk));
        removed += chunk.length;
      }

      return { removed };
    }),

  /**
   * Export blocked domains to CSV
   */
  exportBlockedDomains: adminProcedure
    .input(
      z
        .object({
          reason: blockedDomainReasonSchema.optional(),
        })
        .optional()
    )
    .output(z.string())
    .query(async ({ ctx, input }) => {
      const conditions = [];

      if (input?.reason !== undefined) {
        conditions.push(eq(schema.blockedDomains.reason, input.reason));
      }

      const blocked = await ctx.db
        .select()
        .from(schema.blockedDomains)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.blockedDomains.createdAt));

      // Format as CSV
      const csvRows = [
        "domain,reason,notes,created_at", // Header
        ...blocked.map((b) => {
          const domain = b.domain;
          const reason = b.reason || "";
          const notes = b.notes ? `"${b.notes.replace(/"/g, '""')}"` : "";
          const createdAt = b.createdAt.toISOString();
          return `${domain},${reason},${notes},${createdAt}`;
        }),
      ];

      return csvRows.join("\n");
    }),

  /**
   * Manually trigger RSS feed refresh for all feeds (admin only)
   *
   * Note: This operation runs asynchronously (fire-and-forget) and returns immediately.
   * The actual feed refresh continues in the background. In Cloudflare Workers, background
   * tasks may be terminated when the response is sent unless waitUntil is used.
   *
   * For guaranteed completion of long-running operations, consider using:
   * - Cloudflare Queues for reliable background processing
   * - Durable Objects for stateful long-running tasks
   * - Scheduled triggers (cron) for periodic refresh
   */
  refreshAllFeeds: adminProcedure
    .output(
      z.object({
        message: z.string(),
        triggered: z.boolean(),
      })
    )
    .mutation(async ({ ctx }) => {
      // Import RSS fetcher (required)
      const { fetchAllFeeds } = await import("../services/rss-fetcher");

      // Import Sentry (optional - gracefully handle if unavailable)
      let Sentry: typeof import("@/utils/sentry") | null = null;
      try {
        Sentry = await import("@/utils/sentry");
      } catch (error) {
        console.warn(
          "Sentry unavailable, continuing without monitoring:",
          error
        );
      }

      // Fire-and-forget: Start the feed refresh but don't await completion
      // This prevents timeout issues in Cloudflare Workers for large feed counts
      // Note: In Cloudflare Workers, this may be terminated when response is sent
      fetchAllFeeds(ctx.db)
        .then((result) => {
          console.log(
            `Feed refresh completed: ${result.successCount} succeeded, ${result.errorCount} failed`
          );

          // Capture errors as breadcrumbs if any feeds failed (only if Sentry available)
          if (Sentry && result.errorCount > 0) {
            Sentry.addBreadcrumb({
              category: "rss.fetch",
              message: `RSS fetch completed with ${result.errorCount} errors`,
              level: "warning",
              data: {
                success_count: result.successCount,
                error_count: result.errorCount,
                errors: result.errors.slice(0, 5), // First 5 errors
              },
            });
          }
        })
        .catch((error) => {
          console.error("Feed refresh failed:", error);

          // Capture unexpected errors to Sentry (only if Sentry available)
          if (Sentry) {
            Sentry.captureException(error, {
              level: "error",
              tags: {
                operation: "admin_refresh_all_feeds",
                context: "fire_and_forget",
              },
              extra: {
                user_id: ctx.user.userId,
              },
            });
          }
        });

      return {
        message:
          "Feed refresh triggered. Check logs for completion status. Note: In serverless environments, background tasks may not complete if the worker terminates.",
        triggered: true,
      };
    }),
});
