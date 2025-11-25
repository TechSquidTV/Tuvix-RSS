/**
 * Articles Router
 *
 * Handles article retrieval, read/saved states, and refresh operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, or, isNull, desc, inArray, lt, type SQL } from "drizzle-orm";
import { router, rateLimitedProcedure } from "@/trpc/init";
import { articleWithSourceSchema } from "@/db/schemas.zod";
import {
  createPaginatedSchema,
  paginationInputSchema,
} from "@/types/pagination";
import { D1_MAX_PARAMETERS, chunkArray } from "@/db/utils";
import * as schema from "@/db/schema";
import { executeBatch } from "@/db/utils";
import { withQueryMetrics } from "@/utils/db-metrics";

/**
 * Helper function to transform database row to article output
 * Returns camelCase fields (JavaScript/JSON convention)
 */
function transformArticleRow(row: {
  articles: typeof schema.articles.$inferSelect;
  sources: typeof schema.sources.$inferSelect;
  subscriptions: typeof schema.subscriptions.$inferSelect;
  user_article_states?: typeof schema.userArticleStates.$inferSelect | null;
}) {
  return {
    id: row.articles.id,
    sourceId: row.articles.sourceId,
    guid: row.articles.guid,
    title: row.articles.title,
    link: row.articles.link,
    description: row.articles.description,
    content: row.articles.content,
    author: row.articles.author,
    imageUrl: row.articles.imageUrl,
    audioUrl: row.articles.audioUrl,
    publishedAt: row.articles.publishedAt,
    createdAt: row.articles.createdAt,
    read: row.user_article_states?.read ?? false,
    saved: row.user_article_states?.saved ?? false,
    source: {
      id: row.sources.id,
      url: row.sources.url,
      title: row.sources.title,
      description: row.sources.description,
      siteUrl: row.sources.siteUrl,
      iconUrl: row.sources.iconUrl,
      iconType: row.sources.iconType as "auto" | "custom" | "none" | null,
      iconUpdatedAt: row.sources.iconUpdatedAt,
      lastFetched: row.sources.lastFetched,
      createdAt: row.sources.createdAt,
      updatedAt: row.sources.updatedAt,
    },
    // Include subscription info for filtering
    _subscription: {
      id: row.subscriptions.id,
      filterEnabled: row.subscriptions.filterEnabled,
      filterMode: row.subscriptions.filterMode,
    },
  };
}

/**
 * Type for article with subscription metadata (used internally for filtering)
 */
type ArticleWithSubscription = ReturnType<typeof transformArticleRow>;

/**
 * Check if an article matches a single filter
 */
function matchesFilter(
  article: ArticleWithSubscription,
  filter: typeof schema.subscriptionFilters.$inferSelect
): boolean {
  const fieldValue = (() => {
    switch (filter.field) {
      case "title":
        return article.title ?? "";
      case "description":
        return article.description ?? "";
      case "content":
        return article.content ?? "";
      case "author":
        return article.author ?? "";
      case "any":
        return [
          article.title ?? "",
          article.description ?? "",
          article.content ?? "",
          article.author ?? "",
        ].join(" ");
      default:
        return "";
    }
  })();

  // If field value is empty/null and pattern is not empty, no match
  if (!fieldValue && filter.pattern) {
    return false;
  }

  const searchText = filter.caseSensitive
    ? fieldValue
    : fieldValue.toLowerCase();
  const pattern = filter.caseSensitive
    ? filter.pattern
    : filter.pattern.toLowerCase();

  switch (filter.matchType) {
    case "contains":
      return searchText.includes(pattern);
    case "exact":
      return searchText === pattern;
    case "regex": {
      try {
        const regex = new RegExp(
          filter.pattern,
          filter.caseSensitive ? "" : "i"
        );
        return regex.test(fieldValue);
      } catch {
        // Invalid regex - skip this filter
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Check if an article matches subscription filters
 */
function matchesSubscriptionFilters(
  article: ArticleWithSubscription,
  filters: (typeof schema.subscriptionFilters.$inferSelect)[],
  filterMode: "include" | "exclude"
): boolean {
  // If no filters exist but filtering is enabled, exclude the article
  // (This matches the Go implementation behavior)
  if (filters.length === 0) {
    return false;
  }

  const hasMatch = filters.some((filter) => matchesFilter(article, filter));

  if (filterMode === "include") {
    // Include mode: article must match at least one filter
    return hasMatch;
  } else {
    // Exclude mode: article must not match any filter
    return !hasMatch;
  }
}

export const articlesRouter = router({
  /**
   * List articles from user's subscriptions with filters
   */
  list: rateLimitedProcedure
    .input(
      paginationInputSchema.extend({
        categoryId: z.number().optional(),
        subscriptionId: z.number().optional(),
        read: z.boolean().optional(),
        saved: z.boolean().optional(),
      })
    )
    .output(createPaginatedSchema(articleWithSourceSchema))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Build base query - select all fields from all tables
      let queryBuilder = ctx.db
        .select()
        .from(schema.articles)
        .innerJoin(
          schema.sources,
          eq(schema.articles.sourceId, schema.sources.id)
        )
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

      // Build WHERE conditions
      const conditions: SQL[] = [];

      // Category filter - optimized with JOIN instead of subquery
      if (input.categoryId) {
        queryBuilder = queryBuilder.innerJoin(
          schema.subscriptionCategories,
          and(
            eq(
              schema.subscriptionCategories.subscriptionId,
              schema.subscriptions.id
            ),
            eq(schema.subscriptionCategories.categoryId, input.categoryId)
          )
        );
      }

      // Subscription filter
      if (input.subscriptionId) {
        conditions.push(eq(schema.subscriptions.id, input.subscriptionId));
      }

      // Read filter
      if (input.read !== undefined) {
        if (input.read) {
          conditions.push(eq(schema.userArticleStates.read, true));
        } else {
          conditions.push(
            or(
              isNull(schema.userArticleStates.read),
              eq(schema.userArticleStates.read, false)
            )!
          );
        }
      }

      // Saved filter
      if (input.saved !== undefined) {
        if (input.saved) {
          conditions.push(eq(schema.userArticleStates.saved, true));
        } else {
          conditions.push(
            or(
              isNull(schema.userArticleStates.saved),
              eq(schema.userArticleStates.saved, false)
            )!
          );
        }
      }

      // Apply WHERE conditions
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      // Fetch results (fetch more than needed to account for filtering)
      // We'll fetch 2x the limit to ensure we have enough after filtering
      const fetchLimit = input.limit * 2 + 1;
      const results = await withQueryMetrics(
        "articles.list",
        async () =>
          queryBuilder
            .orderBy(desc(schema.articles.publishedAt))
            .limit(fetchLimit)
            .offset(input.offset),
        {
          "db.table": "articles",
          "db.operation": "select",
          "db.user_id": userId,
          "db.has_category_filter": !!input.categoryId,
          "db.has_subscription_filter": !!input.subscriptionId,
          "db.has_read_filter": input.read !== undefined,
          "db.has_saved_filter": input.saved !== undefined,
        }
      );

      // Transform results
      const transformedResults = results.map(transformArticleRow);

      // Load filters for subscriptions that have filtering enabled
      const subscriptionIdsWithFilters = new Set<number>();
      transformedResults.forEach((article) => {
        if (article._subscription.filterEnabled) {
          subscriptionIdsWithFilters.add(article._subscription.id);
        }
      });

      // Batch load all filters for these subscriptions
      const filtersBySubscription = new Map<
        number,
        (typeof schema.subscriptionFilters.$inferSelect)[]
      >();

      if (subscriptionIdsWithFilters.size > 0) {
        const subscriptionIdsArray = Array.from(subscriptionIdsWithFilters);
        const filters = await withQueryMetrics(
          "articles.list.loadFilters",
          async () =>
            ctx.db
              .select()
              .from(schema.subscriptionFilters)
              .where(
                inArray(
                  schema.subscriptionFilters.subscriptionId,
                  subscriptionIdsArray
                )
              ),
          {
            "db.table": "subscription_filters",
            "db.operation": "select",
            "db.subscription_count": subscriptionIdsArray.length,
          }
        );

        // Group filters by subscription ID
        filters.forEach((filter) => {
          const existing =
            filtersBySubscription.get(filter.subscriptionId) || [];
          existing.push(filter);
          filtersBySubscription.set(filter.subscriptionId, existing);
        });
      }

      // Apply subscription filters
      const filteredResults = transformedResults.filter((article) => {
        if (!article._subscription.filterEnabled) {
          // No filtering enabled for this subscription
          return true;
        }

        const filters =
          filtersBySubscription.get(article._subscription.id) || [];
        return matchesSubscriptionFilters(
          article,
          filters,
          article._subscription.filterMode
        );
      });

      // Remove the internal _subscription field before returning
      const cleanedResults = filteredResults.map(
        ({ _subscription, ...article }) => article
      );

      // Apply pagination to filtered results
      const paginatedResults = cleanedResults.slice(0, input.limit);
      const hasMore = cleanedResults.length > input.limit;

      return {
        items: paginatedResults,
        total: cleanedResults.length + input.offset, // Approximate total
        hasMore,
      };
    }),

  /**
   * Get a single article by ID
   */
  getById: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(articleWithSourceSchema)
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Query single article with all joins
      const results = await ctx.db
        .select()
        .from(schema.articles)
        .innerJoin(
          schema.sources,
          eq(schema.articles.sourceId, schema.sources.id)
        )
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
        .where(eq(schema.articles.id, input.id))
        .limit(1);

      if (!results.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found or not accessible",
        });
      }

      const article = transformArticleRow(results[0]);
      // Remove internal _subscription field before returning
      const { _subscription, ...cleanedArticle } = article;
      return cleanedArticle;
    }),

  /**
   * Mark article as read
   */
  markRead: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state to preserve 'saved' flag
      const existing = await withQueryMetrics(
        "articles.markRead.getState",
        async () =>
          ctx.db
            .select()
            .from(schema.userArticleStates)
            .where(
              and(
                eq(schema.userArticleStates.userId, userId),
                eq(schema.userArticleStates.articleId, input.id)
              )
            )
            .limit(1),
        {
          "db.table": "user_article_states",
          "db.operation": "select",
          "db.user_id": userId,
        }
      );

      // Upsert: insert or update user_article_states
      await withQueryMetrics(
        "articles.markRead.upsert",
        async () =>
          ctx.db
            .insert(schema.userArticleStates)
            .values({
              userId,
              articleId: input.id,
              read: true,
              saved: existing[0]?.saved ?? false,
            })
            .onConflictDoUpdate({
              target: [
                schema.userArticleStates.userId,
                schema.userArticleStates.articleId,
              ],
              set: {
                read: true,
                updatedAt: new Date(),
              },
            }),
        {
          "db.table": "user_article_states",
          "db.operation": "upsert",
          "db.user_id": userId,
          "db.had_existing_state": existing.length > 0,
        }
      );

      return { success: true };
    }),

  /**
   * Mark article as unread
   */
  markUnread: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state to preserve 'saved' flag
      const existing = await ctx.db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, userId),
            eq(schema.userArticleStates.articleId, input.id)
          )
        )
        .limit(1);

      // Upsert: insert or update user_article_states
      await ctx.db
        .insert(schema.userArticleStates)
        .values({
          userId,
          articleId: input.id,
          read: false,
          saved: existing[0]?.saved ?? false,
        })
        .onConflictDoUpdate({
          target: [
            schema.userArticleStates.userId,
            schema.userArticleStates.articleId,
          ],
          set: {
            read: false,
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /**
   * Save article for later
   */
  save: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state to preserve 'read' flag
      const existing = await ctx.db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, userId),
            eq(schema.userArticleStates.articleId, input.id)
          )
        )
        .limit(1);

      // Upsert: insert or update user_article_states
      await ctx.db
        .insert(schema.userArticleStates)
        .values({
          userId,
          articleId: input.id,
          read: existing[0]?.read ?? false,
          saved: true,
        })
        .onConflictDoUpdate({
          target: [
            schema.userArticleStates.userId,
            schema.userArticleStates.articleId,
          ],
          set: {
            saved: true,
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /**
   * Unsave article
   */
  unsave: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state to preserve 'read' flag
      const existing = await ctx.db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, userId),
            eq(schema.userArticleStates.articleId, input.id)
          )
        )
        .limit(1);

      // Upsert: insert or update user_article_states
      await ctx.db
        .insert(schema.userArticleStates)
        .values({
          userId,
          articleId: input.id,
          read: existing[0]?.read ?? false,
          saved: false,
        })
        .onConflictDoUpdate({
          target: [
            schema.userArticleStates.userId,
            schema.userArticleStates.articleId,
          ],
          set: {
            saved: false,
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /**
   * Bulk mark articles as read/unread
   */
  bulkMarkRead: rateLimitedProcedure
    .input(
      z.object({
        articleIds: z.array(z.number()).max(500), // Limit to prevent DoS
        read: z.boolean(),
      })
    )
    .output(z.object({ updated: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      if (input.articleIds.length === 0) {
        return { updated: 0 };
      }

      // Get existing states to preserve 'saved' flags
      // Batch the query to avoid exceeding D1's 100-parameter limit
      // Note: WHERE clause has userId (1 param) + inArray (batch.length params)
      // So chunk size must be D1_MAX_PARAMETERS - 1 to stay within limit
      const existingStates: (typeof schema.userArticleStates.$inferSelect)[] =
        [];

      const batches: number[][] = chunkArray<number>(
        input.articleIds,
        D1_MAX_PARAMETERS - 1
      );

      for (const batch of batches) {
        const batchStates = await ctx.db
          .select()
          .from(schema.userArticleStates)
          .where(
            and(
              eq(schema.userArticleStates.userId, userId),
              inArray(schema.userArticleStates.articleId, batch)
            )
          );
        existingStates.push(...batchStates);
      }

      // Create a map for quick lookup
      const stateMap = new Map(
        existingStates.map((s) => [s.articleId, s.saved])
      );

      // Batch operations: D1 supports batch(), better-sqlite3 requires sequential
      const statements = input.articleIds.map((articleId) =>
        ctx.db
          .insert(schema.userArticleStates)
          .values({
            userId,
            articleId,
            read: input.read,
            saved: stateMap.get(articleId) ?? false,
          })
          .onConflictDoUpdate({
            target: [
              schema.userArticleStates.userId,
              schema.userArticleStates.articleId,
            ],
            set: {
              read: input.read,
              updatedAt: new Date(),
            },
          })
      );

      await executeBatch(ctx.db, statements);

      return { updated: input.articleIds.length };
    }),

  /**
   * Mark all articles as read (optionally filter by age)
   * Limited to 1000 articles per operation to prevent performance issues
   */
  markAllRead: rateLimitedProcedure
    .input(
      z.object({
        olderThanDays: z.number().optional(),
      })
    )
    .output(z.object({ updated: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Build query to get all article IDs from user's subscriptions
      let queryBuilder = ctx.db
        .select()
        .from(schema.articles)
        .innerJoin(
          schema.subscriptions,
          and(
            eq(schema.articles.sourceId, schema.subscriptions.sourceId),
            eq(schema.subscriptions.userId, userId)
          )
        )
        .$dynamic();

      // Filter by age if provided
      if (input.olderThanDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - input.olderThanDays);
        queryBuilder = queryBuilder.where(
          lt(schema.articles.publishedAt, cutoffDate)
        );
      }

      // Limit to 1000 articles to prevent performance issues
      const MAX_BULK_UPDATE = 1000;
      const articles = await queryBuilder.limit(MAX_BULK_UPDATE);
      const articleIds = articles.map((a) => a.articles.id);

      if (articleIds.length === 0) {
        return { updated: 0 };
      }

      // Get existing states to preserve 'saved' flags
      // Batch the query to avoid exceeding D1's 100-parameter limit
      // Note: WHERE clause has userId (1 param) + inArray (batch.length params)
      // So chunk size must be D1_MAX_PARAMETERS - 1 to stay within limit
      const existingStates: (typeof schema.userArticleStates.$inferSelect)[] =
        [];

      const batches: number[][] = chunkArray<number>(
        articleIds,
        D1_MAX_PARAMETERS - 1
      );

      for (const batch of batches) {
        const batchStates = await ctx.db
          .select()
          .from(schema.userArticleStates)
          .where(
            and(
              eq(schema.userArticleStates.userId, userId),
              inArray(schema.userArticleStates.articleId, batch)
            )
          );
        existingStates.push(...batchStates);
      }

      // Create a map for quick lookup
      const stateMap = new Map(
        existingStates.map((s) => [s.articleId, s.saved])
      );

      // Batch operations: D1 supports batch(), better-sqlite3 requires sequential
      const statements = articleIds.map((articleId) =>
        ctx.db
          .insert(schema.userArticleStates)
          .values({
            userId,
            articleId,
            read: true,
            saved: stateMap.get(articleId) ?? false,
          })
          .onConflictDoUpdate({
            target: [
              schema.userArticleStates.userId,
              schema.userArticleStates.articleId,
            ],
            set: {
              read: true,
              updatedAt: new Date(),
            },
          })
      );

      await executeBatch(ctx.db, statements);

      return { updated: articleIds.length };
    }),

  /**
   * Manually trigger RSS feed refresh
   */
  refresh: rateLimitedProcedure
    .output(
      z.object({
        message: z.string(),
        triggered: z.boolean(),
      })
    )
    .mutation(async ({ ctx }) => {
      // Import RSS fetcher
      const { fetchAllFeeds } = await import("../services/rss-fetcher");

      // Trigger fetch in background (don't await)
      fetchAllFeeds(ctx.db)
        .then((result) => {
          console.log(
            `Feed refresh completed: ${result.successCount} succeeded, ${result.errorCount} failed`
          );
        })
        .catch((error) => {
          console.error("Feed refresh failed:", error);
        });

      return {
        triggered: true,
        message: "Feed refresh triggered in background",
      };
    }),
});
