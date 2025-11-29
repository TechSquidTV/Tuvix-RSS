/**
 * Articles Router Helper Functions
 *
 * Extracted helpers to reduce duplication and improve maintainability
 */

import { eq, and, or, isNull, type SQL } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/db/client";

/**
 * Build base query for articles with all necessary joins
 *
 * This is used by both the main list query and the count query to ensure
 * they use identical JOIN logic.
 */
export function buildArticlesBaseQuery(db: Database, userId: number) {
  return db
    .select()
    .from(schema.articles)
    .innerJoin(schema.sources, eq(schema.articles.sourceId, schema.sources.id))
    .innerJoin(
      schema.subscriptions,
      and(
        eq(schema.articles.sourceId, schema.subscriptions.sourceId),
        eq(schema.subscriptions.userId, userId)
      )
    )
    .leftJoin(
      schema.userArticleStates,
      and(
        eq(schema.userArticleStates.articleId, schema.articles.id),
        eq(schema.userArticleStates.userId, userId)
      )
    )
    .$dynamic();
}

/**
 * Apply category filter to query builder
 */
export function applyCategoryFilter(
  queryBuilder: ReturnType<typeof buildArticlesBaseQuery>,
  categoryId: number
) {
  return queryBuilder.innerJoin(
    schema.subscriptionCategories,
    and(
      eq(schema.subscriptionCategories.subscriptionId, schema.subscriptions.id),
      eq(schema.subscriptionCategories.categoryId, categoryId)
    )
  );
}

/**
 * Build WHERE condition for boolean field (read/saved)
 *
 * Handles the common pattern of:
 * - true: field = true
 * - false: field IS NULL OR field = false
 */
export function buildBooleanFieldCondition(
  field:
    | typeof schema.userArticleStates.read
    | typeof schema.userArticleStates.saved,
  value: boolean
): SQL {
  if (value) {
    return eq(field, true);
  } else {
    return or(isNull(field), eq(field, false))!;
  }
}

/**
 * Build all WHERE conditions for articles query
 */
export function buildArticlesWhereConditions(input: {
  subscriptionId?: number;
  read?: boolean;
  saved?: boolean;
}): SQL[] {
  const conditions: SQL[] = [];

  // Subscription filter
  if (input.subscriptionId) {
    conditions.push(eq(schema.subscriptions.id, input.subscriptionId));
  }

  // Read filter
  if (input.read !== undefined) {
    conditions.push(
      buildBooleanFieldCondition(schema.userArticleStates.read, input.read)
    );
  }

  // Saved filter
  if (input.saved !== undefined) {
    conditions.push(
      buildBooleanFieldCondition(schema.userArticleStates.saved, input.saved)
    );
  }

  return conditions;
}
