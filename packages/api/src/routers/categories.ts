/**
 * Categories Router
 *
 * Handles category (tag) management for organizing subscriptions.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";
import { router, rateLimitedProcedure } from "@/trpc/init";
import { hexColorValidator } from "@/types";
import { selectCategorySchema } from "@/db/schemas.zod";
import * as schema from "@/db/schema";
import { generateColorFromString } from "@/utils/color-generator";
import { requireOwnership, categoryNameExists } from "@/db/helpers";
import {
  checkCategoryLimit,
  incrementCategoryCount,
  decrementCategoryCount,
} from "@/services/limits";
import { withUndefinedAsEmpty } from "@/types/pagination";

export const categoriesRouter = router({
  /**
   * List all user's categories
   */
  list: rateLimitedProcedure
    .input(withUndefinedAsEmpty(z.object({})))
    .output(z.array(selectCategorySchema))
    .query(async ({ ctx }) => {
      const { userId } = ctx.user;

      const categories = await ctx.db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.userId, userId))
        .orderBy(schema.categories.name);

      return categories;
    }),

  /**
   * Get single category by ID
   */
  getById: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(selectCategorySchema)
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      const category = await requireOwnership<
        typeof schema.categories.$inferSelect
      >(ctx.db, schema.categories, input.id, userId, "Category");

      return category;
    }),

  /**
   * Create new category
   */
  create: rateLimitedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: hexColorValidator.optional(),
        icon: z.string().optional(),
      })
    )
    .output(selectCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Check for duplicate category name (case-insensitive)
      const exists = await categoryNameExists(
        ctx.db,
        schema.categories,
        userId,
        input.name
      );

      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Category with this name already exists",
        });
      }

      // Check category limit (null limit = unlimited)
      const limitCheck = await checkCategoryLimit(ctx.db, userId);
      if (!limitCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: limitCheck.limit
            ? `You have reached your limit of ${limitCheck.limit} categories. Please upgrade your plan.`
            : "Category limit reached",
        });
      }

      // Generate color if not provided
      const color = input.color || generateColorFromString(input.name);

      const newCategory = await ctx.db
        .insert(schema.categories)
        .values({
          userId,
          name: input.name,
          color,
          icon: input.icon || null,
        })
        .returning();

      // Update usage stats
      await incrementCategoryCount(ctx.db, userId);

      if (!newCategory[0]) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create category",
        });
      }

      return newCategory[0];
    }),

  /**
   * Update category
   */
  update: rateLimitedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(50).optional(),
        color: hexColorValidator.optional(),
        icon: z.string().optional(),
      })
    )
    .output(selectCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify ownership
      const existing = await requireOwnership<
        typeof schema.categories.$inferSelect
      >(ctx.db, schema.categories, input.id, userId, "Category");

      // Check for duplicate name if name is being changed
      if (input.name && input.name !== existing.name) {
        const exists = await categoryNameExists(
          ctx.db,
          schema.categories,
          userId,
          input.name,
          input.id // Exclude current category from check
        );

        if (exists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Category with this name already exists",
          });
        }
      }

      // Build update object
      const updates: Partial<typeof schema.categories.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) updates.name = input.name;
      if (input.color !== undefined) updates.color = input.color;
      if (input.icon !== undefined) updates.icon = input.icon;

      const updatedCategory = await ctx.db
        .update(schema.categories)
        .set(updates)
        .where(eq(schema.categories.id, input.id))
        .returning();

      if (!updatedCategory[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Failed to update category",
        });
      }

      return updatedCategory[0];
    }),

  /**
   * Delete category
   */
  delete: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify ownership
      await requireOwnership<typeof schema.categories.$inferSelect>(
        ctx.db,
        schema.categories,
        input.id,
        userId,
        "Category"
      );

      // Delete category (cascade will remove subscription_categories links)
      await ctx.db
        .delete(schema.categories)
        .where(eq(schema.categories.id, input.id));

      // Update usage stats
      await decrementCategoryCount(ctx.db, userId);

      return { success: true };
    }),

  /**
   * Get category suggestions (autocomplete)
   */
  suggestions: rateLimitedProcedure
    .input(z.object({ query: z.string() }))
    .output(z.array(selectCategorySchema))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Search categories by name prefix (case-insensitive)
      const categories = await ctx.db
        .select()
        .from(schema.categories)
        .where(
          and(
            eq(schema.categories.userId, userId),
            sql`LOWER(${schema.categories.name}) LIKE LOWER(${input.query + "%"})`
          )
        )
        .orderBy(schema.categories.name)
        .limit(10);

      return categories;
    }),
});
