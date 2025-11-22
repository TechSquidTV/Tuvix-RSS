/**
 * Database Row Transformers
 *
 * Transform database rows to properly typed objects and build complex responses.
 * Includes N+1 query prevention through bulk fetching.
 */

import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";

/**
 * Transform subscription filter row to properly typed filter
 */
export function transformSubscriptionFilter(
  filter: typeof schema.subscriptionFilters.$inferSelect
): {
  id: number;
  subscriptionId: number;
  field: "title" | "content" | "description" | "author" | "any";
  matchType: "contains" | "regex" | "exact";
  pattern: string;
  caseSensitive: boolean;
  createdAt: Date;
} {
  return {
    id: filter.id,
    subscriptionId: filter.subscriptionId,
    field: filter.field,
    matchType: filter.matchType,
    pattern: filter.pattern,
    caseSensitive: filter.caseSensitive,
    createdAt: filter.createdAt,
  };
}

/**
 * Fetch categories for multiple subscriptions (bulk fetch to avoid N+1)
 *
 * @param db Database instance
 * @param subscriptionIds Array of subscription IDs
 * @returns Map of subscriptionId => Category[]
 */
export async function fetchSubscriptionCategories(
  db: Database,
  subscriptionIds: number[]
): Promise<Map<number, (typeof schema.categories.$inferSelect)[]>> {
  if (subscriptionIds.length === 0) {
    return new Map();
  }

  const categoryLinks = await db
    .select()
    .from(schema.subscriptionCategories)
    .innerJoin(
      schema.categories,
      eq(schema.subscriptionCategories.categoryId, schema.categories.id)
    )
    .where(
      inArray(schema.subscriptionCategories.subscriptionId, subscriptionIds)
    );

  // Group by subscription ID
  const categoriesMap = new Map<
    number,
    (typeof schema.categories.$inferSelect)[]
  >();

  for (const link of categoryLinks) {
    const subscriptionId = link.subscription_categories.subscriptionId;
    const category = link.categories;

    if (!categoriesMap.has(subscriptionId)) {
      categoriesMap.set(subscriptionId, []);
    }
    categoriesMap.get(subscriptionId)!.push(category);
  }

  return categoriesMap;
}

/**
 * Fetch filters for multiple subscriptions (bulk fetch to avoid N+1)
 *
 * @param db Database instance
 * @param subscriptionIds Array of subscription IDs
 * @returns Map of subscriptionId => SubscriptionFilter[]
 */
export async function fetchSubscriptionFilters(
  db: Database,
  subscriptionIds: number[]
): Promise<Map<number, ReturnType<typeof transformSubscriptionFilter>[]>> {
  if (subscriptionIds.length === 0) {
    return new Map();
  }

  const filters = await db
    .select()
    .from(schema.subscriptionFilters)
    .where(inArray(schema.subscriptionFilters.subscriptionId, subscriptionIds));

  // Group by subscription ID
  const filtersMap = new Map<
    number,
    ReturnType<typeof transformSubscriptionFilter>[]
  >();

  for (const filter of filters) {
    const subscriptionId = filter.subscriptionId;
    const transformedFilter = transformSubscriptionFilter(filter);

    if (!filtersMap.has(subscriptionId)) {
      filtersMap.set(subscriptionId, []);
    }
    filtersMap.get(subscriptionId)!.push(transformedFilter);
  }

  return filtersMap;
}

/**
 * Build subscription response with source, categories, and filters
 *
 * This is the standard subscription response format used across
 * list, getById, create, and update procedures.
 *
 * @param subscription Subscription row from database
 * @param source Source row from database
 * @param categories Categories for this subscription
 * @param filters Filters for this subscription (if filterEnabled)
 * @returns Properly typed subscription response
 */
export function buildSubscriptionResponse(
  subscription: typeof schema.subscriptions.$inferSelect,
  source: typeof schema.sources.$inferSelect,
  categories: (typeof schema.categories.$inferSelect)[],
  filters: ReturnType<typeof transformSubscriptionFilter>[]
): {
  id: number;
  userId: number;
  sourceId: number;
  customTitle: string | null;
  filterEnabled: boolean;
  filterMode: "include" | "exclude";
  createdAt: Date;
  updatedAt: Date;
  source: {
    id: number;
    url: string;
    title: string;
    description: string | null;
    siteUrl: string | null;
    iconUrl: string | null;
    iconType: "auto" | "custom" | "none" | null;
    iconUpdatedAt: Date | null;
    lastFetched: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  categories: (typeof schema.categories.$inferSelect)[];
  filters: ReturnType<typeof transformSubscriptionFilter>[];
} {
  return {
    id: subscription.id,
    userId: subscription.userId,
    sourceId: subscription.sourceId,
    customTitle: subscription.customTitle,
    filterEnabled: subscription.filterEnabled,
    filterMode: subscription.filterMode,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    source: {
      id: source.id,
      url: source.url,
      title: source.title,
      description: source.description,
      siteUrl: source.siteUrl,
      iconUrl: source.iconUrl || null,
      iconType: source.iconType,
      iconUpdatedAt: source.iconUpdatedAt,
      lastFetched: source.lastFetched,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    },
    categories,
    filters,
  };
}

/**
 * Fetch complete subscription with all related data
 *
 * Convenience function to fetch a subscription with its source,
 * categories, and filters in one go.
 *
 * @param db Database instance
 * @param subscriptionId Subscription ID to fetch
 * @returns Subscription response or null if not found
 */
export async function fetchCompleteSubscription(
  db: Database,
  subscriptionId: number
): Promise<ReturnType<typeof buildSubscriptionResponse> | null> {
  // Fetch subscription with source
  const result = await db
    .select()
    .from(schema.subscriptions)
    .innerJoin(
      schema.sources,
      eq(schema.subscriptions.sourceId, schema.sources.id)
    )
    .where(eq(schema.subscriptions.id, subscriptionId))
    .limit(1);

  if (!result.length) {
    return null;
  }

  const subscription = result[0].subscriptions;
  const source = result[0].sources;

  // Fetch categories
  const categoryLinks = await db
    .select()
    .from(schema.subscriptionCategories)
    .innerJoin(
      schema.categories,
      eq(schema.subscriptionCategories.categoryId, schema.categories.id)
    )
    .where(eq(schema.subscriptionCategories.subscriptionId, subscriptionId));

  const categories = categoryLinks.map((link) => link.categories);

  // Fetch filters if enabled
  let filters: ReturnType<typeof transformSubscriptionFilter>[] = [];
  if (subscription.filterEnabled) {
    const dbFilters = await db
      .select()
      .from(schema.subscriptionFilters)
      .where(eq(schema.subscriptionFilters.subscriptionId, subscriptionId));
    filters = dbFilters.map(transformSubscriptionFilter);
  }

  return buildSubscriptionResponse(subscription, source, categories, filters);
}

/**
 * Fetch categories for multiple feeds (bulk fetch to avoid N+1)
 *
 * @param db Database instance
 * @param feedIds Array of feed IDs
 * @returns Map of feedId => number[] (category IDs)
 */
export async function fetchFeedCategories(
  db: Database,
  feedIds: number[]
): Promise<Map<number, number[]>> {
  if (feedIds.length === 0) {
    return new Map();
  }

  const categoryLinks = await db
    .select()
    .from(schema.feedCategories)
    .where(inArray(schema.feedCategories.feedId, feedIds));

  // Group by feed ID
  const categoriesMap = new Map<number, number[]>();

  for (const link of categoryLinks) {
    const feedId = link.feedId;
    const categoryId = link.categoryId;

    if (!categoriesMap.has(feedId)) {
      categoriesMap.set(feedId, []);
    }
    categoriesMap.get(feedId)!.push(categoryId);
  }

  return categoriesMap;
}
