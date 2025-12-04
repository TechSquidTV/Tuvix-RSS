/**
 * Articles Router
 *
 * Handles article retrieval, read/saved states, and refresh operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, inArray, lt } from "drizzle-orm";
import { router, rateLimitedProcedure } from "@/trpc/init";
import { articleWithSourceSchema } from "@/db/schemas.zod";
import {
  createPaginatedSchema,
  paginationInputSchema,
} from "@/types/pagination";
import {
  buildArticlesBaseQuery,
  applyCategoryFilter,
  buildArticlesWhereConditions,
} from "./articles-helpers";
import { D1_MAX_PARAMETERS, chunkArray } from "@/db/utils";
import * as schema from "@/db/schema";
import { executeBatch } from "@/db/utils";
import { withQueryMetrics } from "@/utils/db-metrics";
import { upsertArticleState } from "@/db/helpers";

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
    commentLink: row.articles.commentLink,
    publishedAt: row.articles.publishedAt,
    createdAt: row.articles.createdAt,
    read: row.user_article_states?.read ?? false,
    saved: row.user_article_states?.saved ?? false,
    // Audio playback progress
    audioProgress: row.user_article_states?.audioPosition
      ? {
          position: row.user_article_states.audioPosition,
          duration: row.user_article_states.audioDuration,
          completedAt: row.user_article_states.audioCompletedAt,
          lastPlayedAt: row.user_article_states.audioLastPlayedAt,
        }
      : null,
    source: {
      id: row.sources.id,
      url: row.sources.url,
      // Use subscription's custom title if set, otherwise use source's title
      title: row.subscriptions.customTitle || row.sources.title,
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

      // Build base query using helper
      let queryBuilder = buildArticlesBaseQuery(ctx.db, userId);

      // Apply category filter if provided
      if (input.categoryId) {
        queryBuilder = applyCategoryFilter(queryBuilder, input.categoryId);
      }

      // Build WHERE conditions using helper
      const conditions = buildArticlesWhereConditions(input);

      // Apply WHERE conditions
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }

      // When subscription filters are enabled, we need a different pagination strategy
      // Check if any subscriptions have filters by querying the subscriptions
      const subscriptionsWithFilters = await withQueryMetrics(
        "articles.list.checkFilters",
        async () =>
          ctx.db
            .select()
            .from(schema.subscriptions)
            .where(
              and(
                eq(schema.subscriptions.userId, userId),
                eq(schema.subscriptions.filterEnabled, true)
              )
            ),
        {
          "db.table": "subscriptions",
          "db.operation": "select",
        }
      );

      const hasSubscriptionFilters = subscriptionsWithFilters.length > 0;

      // Strategy 1: No subscription filters - use database pagination (efficient)
      // Strategy 2: Has subscription filters - fetch more and filter in-memory (necessary evil)
      let paginatedResults;
      let hasMore = false;
      let total: number;

      if (!hasSubscriptionFilters) {
        // EFFICIENT PATH: No subscription filters, use direct database pagination
        // Always order by publishedAt for chronological feed
        let paginationQuery = queryBuilder.orderBy(
          desc(schema.articles.publishedAt)
        );

        // Use cursor OR offset (cursor takes precedence for infinite scroll)
        // Frontend sends cursor as cumulative item count (50, 100, 150...)
        const effectiveOffset = input.cursor ?? input.offset ?? 0;

        if (effectiveOffset > 0) {
          paginationQuery = paginationQuery.offset(effectiveOffset);
        }

        const results = await withQueryMetrics(
          "articles.list",
          async () => paginationQuery.limit(input.limit + 1), // Fetch one extra to check hasMore
          {
            "db.table": "articles",
            "db.operation": "select",
            "db.user_id": userId,
            "db.has_category_filter": !!input.categoryId,
            "db.has_subscription_filter": !!input.subscriptionId,
            "db.has_read_filter": input.read !== undefined,
            "db.has_saved_filter": input.saved !== undefined,
            "db.use_cursor": !!input.cursor,
          }
        );

        // Transform results
        const transformedResults = results.map(transformArticleRow);

        // Remove the internal _subscription field
        const cleanedResults = transformedResults.map(
          ({ _subscription, ...article }) => article
        );

        // Check if we have more results
        hasMore = cleanedResults.length > input.limit;

        // Return only the requested number of items
        paginatedResults = cleanedResults.slice(0, input.limit);

        // Calculate total count (accurate since no subscription filtering)
        // Build COUNT query with same JOINs and WHERE as main query
        let countQuery = ctx.db
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

        // Apply category filter if needed
        if (input.categoryId) {
          countQuery = countQuery.innerJoin(
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

        // Apply same WHERE conditions
        const conditions = buildArticlesWhereConditions(input);
        if (conditions.length > 0) {
          countQuery = countQuery.where(and(...conditions));
        }

        // Execute count query and count unique article IDs
        const countResults = await withQueryMetrics(
          "articles.list.count",
          async () => await countQuery,
          {
            "db.table": "articles",
            "db.operation": "count",
          }
        );

        // Count unique article IDs (needed because JOINs can create duplicates)
        const uniqueArticleIds = new Set(
          countResults.map((r) => r.articles.id)
        );
        total = uniqueArticleIds.size;
      } else {
        // FILTERED PATH: Has subscription filters, must fetch more and filter
        // NOTE: Cursor-based pagination is incompatible with post-query filtering
        // because the cursor represents items seen by frontend (after filtering),
        // but the backend offset operates on items before filtering.
        // We ONLY use offset-based pagination here to avoid skipping articles.
        const fetchLimit = Math.max(input.limit * 3, 100);

        // Always order by publishedAt for chronological feed
        let paginationQuery = queryBuilder.orderBy(
          desc(schema.articles.publishedAt)
        );

        // IMPORTANT: Only use explicit offset parameter, ignore cursor
        // When subscription filters are active, cursor values don't align with database offsets
        if (input.offset > 0) {
          paginationQuery = paginationQuery.offset(input.offset);
        }

        const results = await withQueryMetrics(
          "articles.list",
          async () => paginationQuery.limit(fetchLimit),
          {
            "db.table": "articles",
            "db.operation": "select",
            "db.user_id": userId,
            "db.has_category_filter": !!input.categoryId,
            "db.has_subscription_filter": !!input.subscriptionId,
            "db.has_read_filter": input.read !== undefined,
            "db.has_saved_filter": input.saved !== undefined,
            "db.has_subscription_filters": true,
            "db.use_cursor": !!input.cursor,
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

        // Check if we have more than requested (for hasMore)
        hasMore = cleanedResults.length > input.limit;

        // Return only the requested number of items
        paginatedResults = cleanedResults.slice(0, input.limit);

        // Total is approximate when subscription filters are active
        total = cleanedResults.length + input.offset;
      }

      return {
        items: paginatedResults,
        total,
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
      await upsertArticleState(
        ctx.db,
        userId,
        input.id,
        { read: true },
        { operationName: "articles.markRead" }
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
      await upsertArticleState(ctx.db, userId, input.id, { read: false });
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
      await upsertArticleState(ctx.db, userId, input.id, { saved: true });
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
      await upsertArticleState(ctx.db, userId, input.id, { saved: false });
      return { success: true };
    }),

  /**
   * Update audio playback progress
   * Auto-throttled on client side to prevent excessive writes
   */
  updateAudioProgress: rateLimitedProcedure
    .input(
      z.object({
        articleId: z.number(),
        position: z.number().min(0),
        duration: z.number().min(0).optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state to preserve other flags
      const existing = await withQueryMetrics(
        "articles.updateAudioProgress.getState",
        async () =>
          ctx.db
            .select()
            .from(schema.userArticleStates)
            .where(
              and(
                eq(schema.userArticleStates.userId, userId),
                eq(schema.userArticleStates.articleId, input.articleId)
              )
            )
            .limit(1),
        {
          "db.table": "user_article_states",
          "db.operation": "select",
          "db.user_id": userId,
        }
      );

      // Check if audio is completed (>95% watched or within 30s of end)
      const isCompleted = input.duration
        ? input.position / input.duration > 0.95 ||
          input.duration - input.position < 30
        : false;

      // Upsert with preserved flags
      await withQueryMetrics(
        "articles.updateAudioProgress.upsert",
        async () =>
          ctx.db
            .insert(schema.userArticleStates)
            .values({
              userId,
              articleId: input.articleId,
              read: existing[0]?.read ?? false,
              saved: existing[0]?.saved ?? false,
              audioPosition: input.position,
              audioDuration: input.duration ?? existing[0]?.audioDuration,
              audioCompletedAt: isCompleted
                ? new Date()
                : existing[0]?.audioCompletedAt,
              audioLastPlayedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                schema.userArticleStates.userId,
                schema.userArticleStates.articleId,
              ],
              set: {
                audioPosition: input.position,
                audioDuration: input.duration ?? existing[0]?.audioDuration,
                audioCompletedAt: isCompleted
                  ? new Date()
                  : existing[0]?.audioCompletedAt,
                audioLastPlayedAt: new Date(),
                updatedAt: new Date(),
              },
            }),
        {
          "db.table": "user_article_states",
          "db.operation": "upsert",
          "db.user_id": userId,
          "db.is_completed": isCompleted,
        }
      );

      return { success: true };
    }),

  /**
   * Mark audio as completed
   * Called when user finishes listening
   */
  markAudioCompleted: rateLimitedProcedure
    .input(z.object({ articleId: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state
      const existing = await ctx.db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, userId),
            eq(schema.userArticleStates.articleId, input.articleId)
          )
        )
        .limit(1);

      // Upsert with completed timestamp and mark as read
      await ctx.db
        .insert(schema.userArticleStates)
        .values({
          userId,
          articleId: input.articleId,
          read: true,
          saved: existing[0]?.saved ?? false,
          audioPosition: existing[0]?.audioPosition ?? 0,
          audioDuration: existing[0]?.audioDuration,
          audioCompletedAt: new Date(),
          audioLastPlayedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.userArticleStates.userId,
            schema.userArticleStates.articleId,
          ],
          set: {
            read: true,
            audioCompletedAt: new Date(),
            audioLastPlayedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /**
   * Clear audio progress (restart from beginning)
   */
  clearAudioProgress: rateLimitedProcedure
    .input(z.object({ articleId: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get existing state
      const existing = await ctx.db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, userId),
            eq(schema.userArticleStates.articleId, input.articleId)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        return { success: true };
      }

      // Update to clear progress
      await ctx.db
        .update(schema.userArticleStates)
        .set({
          audioPosition: 0,
          audioCompletedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userArticleStates.userId, userId),
            eq(schema.userArticleStates.articleId, input.articleId)
          )
        );

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

      // Wrap batch execution in Sentry span for monitoring
      await Sentry.startSpan(
        {
          op: "db.batch",
          name: "Mark Articles Read/Unread",
          attributes: {
            "db.batch_size": statements.length,
            "db.operation": input.read ? "mark_read" : "mark_unread",
            "db.user_id": userId,
          },
        },
        async (span) => {
          try {
            await executeBatch(ctx.db, statements);
            span.setStatus({ code: 1, message: "ok" });
          } catch (error) {
            span.setStatus({ code: 2, message: "batch failed" });
            await Sentry.captureException(error, {
              tags: {
                operation: "mark_articles_read",
                batch_size: statements.length.toString(),
              },
              extra: {
                userId,
                articleCount: input.articleIds.length,
                read: input.read,
              },
            });
            throw error;
          }
        }
      );

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

      // Wrap batch execution in Sentry span for monitoring
      await Sentry.startSpan(
        {
          op: "db.batch",
          name: "Mark All Articles Read",
          attributes: {
            "db.batch_size": statements.length,
            "db.operation": "mark_all_read",
            "db.user_id": userId,
            "filter.older_than_days": input.olderThanDays,
          },
        },
        async (span) => {
          try {
            await executeBatch(ctx.db, statements);
            span.setStatus({ code: 1, message: "ok" });
          } catch (error) {
            span.setStatus({ code: 2, message: "batch failed" });
            await Sentry.captureException(error, {
              tags: {
                operation: "mark_all_read",
                batch_size: statements.length.toString(),
              },
              extra: {
                userId,
                articleCount: articleIds.length,
                olderThanDays: input.olderThanDays,
              },
            });
            throw error;
          }
        }
      );

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

      // Trigger fetch in background (don't await)
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
                operation: "articles_refresh",
                context: "background_fetch",
              },
              extra: {
                user_id: ctx.user.userId,
              },
            });
          }
        });

      return {
        triggered: true,
        message: "Feed refresh triggered in background",
      };
    }),

  /**
   * Get article counts for all filter tabs
   * Optimized endpoint that returns ONLY counts without fetching article data
   * This replaces fetching 4 full article queries just to get totals
   */
  getCounts: rateLimitedProcedure
    .input(
      z.object({
        categoryId: z.number().optional(),
        subscriptionId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.userId;

      // Helper to execute count query efficiently
      const executeCount = async (additionalFilters?: {
        read?: boolean;
        saved?: boolean;
      }) => {
        // Use buildArticlesBaseQuery - same JOINs as main query
        let baseQuery = buildArticlesBaseQuery(ctx.db, userId);

        // Apply category filter if provided
        if (input.categoryId) {
          baseQuery = applyCategoryFilter(baseQuery, input.categoryId);
        }

        // Build WHERE conditions
        const conditions = buildArticlesWhereConditions({
          subscriptionId: input.subscriptionId,
          ...additionalFilters,
        });

        if (conditions.length > 0) {
          baseQuery = baseQuery.where(and(...conditions));
        }

        // Execute and count unique article IDs
        const results = await baseQuery;
        return new Set(results.map((r) => r.articles.id)).size;
      };

      // Execute all counts in parallel
      const [allCount, unreadCount, readCount, savedCount] = await Promise.all([
        withQueryMetrics("articles.counts.all", () => executeCount(), {
          "db.operation": "count",
          "db.user_id": userId,
        }),
        withQueryMetrics(
          "articles.counts.unread",
          () => executeCount({ read: false }),
          { "db.operation": "count", "db.user_id": userId }
        ),
        withQueryMetrics(
          "articles.counts.read",
          () => executeCount({ read: true }),
          { "db.operation": "count", "db.user_id": userId }
        ),
        withQueryMetrics(
          "articles.counts.saved",
          () => executeCount({ saved: true }),
          { "db.operation": "count", "db.user_id": userId }
        ),
      ]);

      return {
        all: allCount,
        unread: unreadCount,
        read: readCount,
        saved: savedCount,
      };
    }),
});
