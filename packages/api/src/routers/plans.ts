/**
 * Plans Router
 *
 * Public endpoints for listing available plans and their features.
 * Admin endpoints for managing plans (create, update, delete).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, adminProcedure } from "@/trpc/init";
import { getAllPlans, getPlanById } from "@/services/plans";
import * as schema from "@/db/schema";
import { withUndefinedAsEmpty } from "@/types/pagination";

export const plansRouter = router({
  /**
   * List all available plans
   * Public endpoint - no authentication required
   */
  list: publicProcedure
    .input(withUndefinedAsEmpty(z.object({})))
    .output(
      z.array(
        z.object({
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
        })
      )
    )
    .query(async ({ ctx }) => {
      return await getAllPlans(ctx.db);
    }),

  /**
   * Get a specific plan by ID
   * Public endpoint - no authentication required
   */
  getById: publicProcedure
    .input(z.object({ planId: z.string() }))
    .output(
      z
        .object({
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
        })
        .nullable()
    )
    .query(async ({ ctx, input }) => {
      return await getPlanById(ctx.db, input.planId);
    }),

  /**
   * Create a new plan (admin only)
   */
  create: adminProcedure
    .input(
      z.object({
        id: z.string().min(1).max(50),
        name: z.string().min(1).max(100),
        maxSources: z.number().int().positive(),
        maxPublicFeeds: z.number().int().positive(),
        maxCategories: z.number().int().positive().nullable(),
        apiRateLimitPerMinute: z.number().int().positive(),
        publicFeedRateLimitPerMinute: z.number().int().positive(),
        priceCents: z.number().int().nonnegative(),
        features: z.string().nullable().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if plan ID already exists
      const existing = await ctx.db.query.plans.findFirst({
        where: eq(schema.plans.id, input.id),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Plan with ID '${input.id}' already exists`,
        });
      }

      // Create the plan
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
   * Update an existing plan (admin only)
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        maxSources: z.number().int().positive().optional(),
        maxPublicFeeds: z.number().int().positive().optional(),
        maxCategories: z.number().int().positive().nullable().optional(),
        apiRateLimitPerMinute: z.number().int().positive().optional(),
        publicFeedRateLimitPerMinute: z.number().int().positive().optional(),
        priceCents: z.number().int().nonnegative().optional(),
        features: z.string().nullable().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if plan exists
      const existing = await ctx.db.query.plans.findFirst({
        where: eq(schema.plans.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Plan '${input.id}' not found`,
        });
      }

      // Build update object with only provided fields
      const updateData: Partial<typeof schema.plans.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updateData.name = input.name;
      if (input.maxSources !== undefined)
        updateData.maxSources = input.maxSources;
      if (input.maxPublicFeeds !== undefined)
        updateData.maxPublicFeeds = input.maxPublicFeeds;
      if (input.maxCategories !== undefined)
        updateData.maxCategories = input.maxCategories;
      if (input.apiRateLimitPerMinute !== undefined)
        updateData.apiRateLimitPerMinute = input.apiRateLimitPerMinute;
      if (input.publicFeedRateLimitPerMinute !== undefined)
        updateData.publicFeedRateLimitPerMinute =
          input.publicFeedRateLimitPerMinute;
      if (input.priceCents !== undefined)
        updateData.priceCents = input.priceCents;
      if (input.features !== undefined) updateData.features = input.features;

      // Update the plan
      await ctx.db
        .update(schema.plans)
        .set(updateData)
        .where(eq(schema.plans.id, input.id));

      return { success: true };
    }),

  /**
   * Delete a plan (admin only)
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Check if plan exists
      const existing = await ctx.db.query.plans.findFirst({
        where: eq(schema.plans.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Plan '${input.id}' not found`,
        });
      }

      // Check if any users are currently on this plan
      const usersOnPlan = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.plan, input.id))
        .limit(1);

      if (usersOnPlan.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete plan '${input.id}' because ${usersOnPlan.length} user(s) are currently assigned to it. Please reassign users to another plan first.`,
        });
      }

      // Delete the plan
      await ctx.db.delete(schema.plans).where(eq(schema.plans.id, input.id));

      return { success: true };
    }),
});
