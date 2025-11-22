/**
 * Zod Schemas Generated from Drizzle ORM
 *
 * Auto-generated Zod schemas for validation from our Drizzle database schema.
 * This eliminates duplication between database schema and API validation.
 *
 * @see https://orm.drizzle.team/docs/zod
 */

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import * as schema from "./schema";

// ============================================================================
// USER SCHEMAS (Better Auth user table)
// ============================================================================

export const selectUserSchema = createSelectSchema(schema.user);
export const insertUserSchema = createInsertSchema(schema.user, {
  email: (s) => s.email(),
});
export const updateUserSchema = insertUserSchema.partial();

// ============================================================================
// USER SETTINGS SCHEMAS
// ============================================================================

export const selectUserSettingsSchema = createSelectSchema(
  schema.userSettings,
  {
    theme: (s) => s,
    defaultFilter: (s) => s,
    autoAgeDays: (s) => s.int().min(0).max(365),
  }
);
export const insertUserSettingsSchema = createInsertSchema(
  schema.userSettings,
  {
    theme: (s) => s,
    defaultFilter: (s) => s,
    autoAgeDays: (s) => s.int().min(0).max(365),
  }
);
export const updateUserSettingsSchema = insertUserSettingsSchema.partial();

// ============================================================================
// SOURCE SCHEMAS
// ============================================================================

export const selectSourceSchema = createSelectSchema(schema.sources);
export const insertSourceSchema = createInsertSchema(schema.sources, {
  url: (s) => s.url(),
  siteUrl: (s) => s.url().optional(),
});
export const updateSourceSchema = insertSourceSchema.partial();

// ============================================================================
// CATEGORY SCHEMAS
// ============================================================================

export const selectCategorySchema = createSelectSchema(schema.categories, {
  color: (s) => s.regex(/^#[0-9A-Fa-f]{6}$/),
});
export const insertCategorySchema = createInsertSchema(schema.categories, {
  color: (s) => s.regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
export const updateCategorySchema = insertCategorySchema.partial();

// ============================================================================
// SUBSCRIPTION SCHEMAS
// ============================================================================

export const selectSubscriptionSchema = createSelectSchema(
  schema.subscriptions
);
export const insertSubscriptionSchema = createInsertSchema(
  schema.subscriptions
);
export const updateSubscriptionSchema = insertSubscriptionSchema.partial();

// ============================================================================
// SUBSCRIPTION FILTER SCHEMAS
// ============================================================================

export const selectSubscriptionFilterSchema = createSelectSchema(
  schema.subscriptionFilters
);

/**
 * Subscription response schema with nested source, categories, and filters
 * This matches the structure returned by buildSubscriptionResponse
 *
 * Note: categories and filters are always arrays (never undefined) in the response
 */
export const subscriptionResponseSchema = selectSubscriptionSchema.extend({
  source: selectSourceSchema.extend({
    title: z.string(),
  }),
  categories: z.array(selectCategorySchema),
  filters: z.array(selectSubscriptionFilterSchema),
});
export const insertSubscriptionFilterSchema = createInsertSchema(
  schema.subscriptionFilters
);
export const updateSubscriptionFilterSchema =
  insertSubscriptionFilterSchema.partial();

// ============================================================================
// ARTICLE SCHEMAS
// ============================================================================

export const selectArticleSchema = createSelectSchema(schema.articles);
export const insertArticleSchema = createInsertSchema(schema.articles);
export const updateArticleSchema = insertArticleSchema.partial();

/**
 * Article with source information (for API responses)
 * Used when articles are fetched with joined source data
 */
export const articleWithSourceSchema = selectArticleSchema.extend({
  read: z.boolean().optional().default(false),
  saved: z.boolean().optional().default(false),
  source: createSelectSchema(schema.sources).optional(),
});

// ============================================================================
// USER ARTICLE STATE SCHEMAS (user-specific read/saved state)
// ============================================================================

export const selectUserArticleStateSchema = createSelectSchema(
  schema.userArticleStates
);
export const insertUserArticleStateSchema = createInsertSchema(
  schema.userArticleStates
);
export const updateUserArticleStateSchema =
  insertUserArticleStateSchema.partial();

// ============================================================================
// FEED SCHEMAS (User-generated public feeds)
// ============================================================================

export const selectFeedSchema = createSelectSchema(schema.feeds);
export const insertFeedSchema = createInsertSchema(schema.feeds);
export const updateFeedSchema = insertFeedSchema.partial();

// ============================================================================
// GLOBAL SETTINGS SCHEMAS
// ============================================================================

export const selectGlobalSettingsSchema = createSelectSchema(
  schema.globalSettings,
  {
    fetchIntervalMinutes: (s) => s.int().min(5).max(1440),
    pruneDays: (s) => s.int().min(0).max(365),
  }
);
export const insertGlobalSettingsSchema = createInsertSchema(
  schema.globalSettings,
  {
    fetchIntervalMinutes: (s) => s.int().min(5).max(1440),
    pruneDays: (s) => s.int().min(0).max(365),
  }
);
export const updateGlobalSettingsSchema = insertGlobalSettingsSchema.partial();
