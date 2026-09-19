/**
 * Articles Router
 *
 * Handles article retrieval, read/saved states, and refresh operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql } from "drizzle-orm";
import { router, rateLimitedProcedure } from "@api/trpc/init";
import { articleWithSourceSchema } from "@api/db/schemas.zod";
import {
  createPaginatedSchema,
  articleCursorSchema,
  type ArticleCursor,
  paginationInputSchema,
  withUndefinedAsEmpty,
} from "@api/types/pagination";
import {
  buildArticlesBaseQuery,
  afterArticleCursor,
  applyCategoryFilter,
  buildArticlesWhereConditions,
} from "./articles-helpers";
import * as schema from "@api/db/schema";
import { executeBatch } from "@api/db/utils";
import { upsertArticleState } from "@api/db/helpers";
import { matchesSubscriptionFilters } from "@api/services/article-filters";
import { fetchSubscriptionFilters } from "@api/db/transformers";
import { withQueryMetrics } from "@api/utils/db-metrics";
import * as Sentry from "@api/utils/sentry";

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

export const articlesRouter = router({
  /**
   * List articles from user's subscriptions with filters
   */
  list: rateLimitedProcedure
    .input(
      withUndefinedAsEmpty(
        paginationInputSchema.omit({ cursor: true }).extend({
          cursor: articleCursorSchema.optional(),
          categoryId: z.number().optional(),
          subscriptionId: z.number().optional(),
          read: z.boolean().optional(),
          saved: z.boolean().optional(),
        })
      )
    )
    .output(
      createPaginatedSchema(articleWithSourceSchema).extend({
        nextCursor: articleCursorSchema.nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Extract pagination params with defaults (TypeScript loses track of Zod defaults with withUndefinedAsEmpty)
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const cursor = input.cursor;

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
        let paginationQuery = queryBuilder
          .where(
            and(...conditions, cursor ? afterArticleCursor(cursor) : undefined)
          )
          .orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id));

        // Explicit offsets serve numbered pages; infinite scrolling uses a
        // stable ordering key so changes to earlier rows cannot shift pages.
        const effectiveOffset = cursor ? 0 : offset;

        if (effectiveOffset > 0) {
          paginationQuery = paginationQuery.offset(effectiveOffset);
        }

        const results = await withQueryMetrics(
          "articles.list",
          async () => paginationQuery.limit(limit + 1), // Fetch one extra to check hasMore
          {
            "db.table": "articles",
            "db.operation": "select",
            "db.user_id": userId,
            "db.has_category_filter": !!input.categoryId,
            "db.has_subscription_filter": !!input.subscriptionId,
            "db.has_read_filter": input.read !== undefined,
            "db.has_saved_filter": input.saved !== undefined,
            "db.use_cursor": !!cursor,
          }
        );

        // Transform results
        const transformedResults = results.map(transformArticleRow);

        // Remove the internal _subscription field
        const cleanedResults = transformedResults.map(
          ({ _subscription, ...article }) => article
        );

        // Check if we have more results
        hasMore = cleanedResults.length > limit;

        // Return only the requested number of items
        paginatedResults = cleanedResults.slice(0, limit);

        // Calculate total count (accurate since no subscription filtering)
        // Build COUNT query with same JOINs and WHERE as main query
        let countQuery = buildArticlesBaseQuery(ctx.db, userId);

        // Apply category filter if needed
        if (input.categoryId) {
          countQuery = applyCategoryFilter(countQuery, input.categoryId);
        }

        // Apply same WHERE conditions
        if (conditions.length > 0) {
          countQuery = countQuery.where(and(...conditions));
        }

        // Execute count query and count unique article IDs
        const countResults = await withQueryMetrics(
          "articles.list.count",
          async () =>
            await ctx.db.all<{ total: number }>(
              sql`SELECT COUNT(DISTINCT id) AS total FROM (${countQuery})`
            ),
          {
            "db.table": "articles",
            "db.operation": "count",
          }
        );

        total = countResults[0]?.total ?? 0;
      } else {
        // FILTERED PATH: Has subscription filters, must scan in bounded
        // database chunks and apply the cursor after in-memory filtering.
        // Aggressive filters can reject most rows, so a one-shot fetch limit
        // can falsely produce an empty later page even when matches exist.
        const filteredOffset = cursor ? 0 : offset;
        const targetVisibleCount = filteredOffset + limit + 1;
        const chunkSize = Math.max(limit * 3, 100);
        const filteredResults: ArticleWithSubscription[] = [];
        let scannedRowCount = 0;
        let scanCursor: ArticleCursor | undefined = cursor;

        // Always order by publishedAt for chronological feed
        const paginationQuery = queryBuilder.orderBy(
          desc(schema.articles.publishedAt),
          desc(schema.articles.id)
        );

        const filtersBySubscription = await fetchSubscriptionFilters(
          ctx.db,
          subscriptionsWithFilters.map((subscription) => subscription.id)
        );

        while (filteredResults.length < targetVisibleCount) {
          const chunkQuery = paginationQuery.where(
            and(
              ...conditions,
              scanCursor ? afterArticleCursor(scanCursor) : undefined
            )
          );

          const results = await withQueryMetrics(
            "articles.list.filteredChunk",
            async () => chunkQuery.limit(chunkSize),
            {
              "db.table": "articles",
              "db.operation": "select",
              "db.user_id": userId,
              "db.has_category_filter": !!input.categoryId,
              "db.has_subscription_filter": !!input.subscriptionId,
              "db.has_read_filter": input.read !== undefined,
              "db.has_saved_filter": input.saved !== undefined,
              "db.has_subscription_filters": true,
              "db.use_cursor": !!cursor,
              "db.filtered_offset": filteredOffset,
              "db.chunk_offset": scannedRowCount,
              "db.chunk_size": chunkSize,
            }
          );

          if (results.length === 0) {
            break;
          }

          const transformedResults = results.map(transformArticleRow);
          const matchingResults = transformedResults.filter((article) => {
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

          filteredResults.push(...matchingResults);
          scannedRowCount += results.length;
          const lastScanned = results.at(-1)?.articles;
          if (lastScanned)
            scanCursor = {
              publishedAt: lastScanned.publishedAt,
              id: lastScanned.id,
            };

          if (results.length < chunkSize) {
            break;
          }
        }

        // Remove the internal _subscription field before returning
        const cleanedResults = filteredResults.map(
          ({ _subscription, ...article }) => article
        );

        const visibleResults = cleanedResults.slice(filteredOffset);

        // Check if we have more than requested (for hasMore)
        hasMore = visibleResults.length > limit;

        // Return only the requested number of items
        paginatedResults = visibleResults.slice(0, limit);

        // Total is approximate when subscription filters are active
        total = filteredOffset + visibleResults.length;
      }

      const lastArticle = paginatedResults.at(-1);
      return {
        items: paginatedResults,
        total,
        hasMore,
        nextCursor:
          hasMore && lastArticle
            ? { publishedAt: lastArticle.publishedAt, id: lastArticle.id }
            : null,
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

      const article = transformArticleRow(results[0]!);
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

      const articleIds = [...new Set(input.articleIds)];
      // Conflicts update only read; SQLite retains saved and audio fields.
      const statements = articleIds.map((articleId) =>
        ctx.db
          .insert(schema.userArticleStates)
          .values({
            userId,
            articleId,
            read: input.read,
            saved: false,
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
            Sentry.captureException(error, {
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

      return { updated: articleIds.length };
    }),

  /**
   * Mark all articles as read (optionally filter by age)
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

      const cutoff =
        input.olderThanDays !== undefined
          ? sql`AND a.published_at < ${Math.floor((Date.now() - input.olderThanDays * 86_400_000) / 1000)}`
          : sql``;
      const result = await ctx.db.all<{ articleId: number }>(sql`
        INSERT INTO user_article_states (user_id, article_id, read, updated_at)
        SELECT DISTINCT ${userId}, a.id, 1, ${Math.floor(Date.now() / 1000)}
        FROM articles a JOIN subscriptions s ON s.source_id = a.source_id
        WHERE s.user_id = ${userId} ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM user_article_states state
            WHERE state.user_id = ${userId} AND state.article_id = a.id AND state.read = 1)
        ON CONFLICT (user_id, article_id) DO UPDATE SET read = 1, updated_at = excluded.updated_at
        RETURNING article_id AS articleId
      `);
      return { updated: result.length };
    }),

  /**
   * Get article counts for all filter tabs
   * Optimized endpoint that returns ONLY counts without fetching article data
   * This replaces fetching 4 full article queries just to get totals
   */
  getCounts: rateLimitedProcedure
    .input(
      withUndefinedAsEmpty(
        z.object({
          categoryId: z.number().optional(),
          subscriptionId: z.number().optional(),
        })
      )
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.userId;

      const subscriptionsWithFilters = await ctx.db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            eq(schema.subscriptions.filterEnabled, true),
            input.subscriptionId === undefined
              ? undefined
              : eq(schema.subscriptions.id, input.subscriptionId)
          )
        );

      let query = buildArticlesBaseQuery(ctx.db, userId);
      if (input.categoryId)
        query = applyCategoryFilter(query, input.categoryId);
      const conditions = buildArticlesWhereConditions(input);
      if (conditions.length > 0) query = query.where(and(...conditions));

      if (subscriptionsWithFilters.length === 0) {
        // Aggregate inside SQLite/D1 rather than transferring article bodies.
        const [counts] = await withQueryMetrics(
          "articles.counts",
          async () =>
            ctx.db.all<{
              all: number;
              unread: number;
              read: number;
              saved: number;
            }>(sql`
            SELECT COUNT(DISTINCT id) AS "all",
              COUNT(DISTINCT CASE WHEN COALESCE(read, 0) = 0 THEN id END) AS unread,
              COUNT(DISTINCT CASE WHEN read = 1 THEN id END) AS read,
              COUNT(DISTINCT CASE WHEN saved = 1 THEN id END) AS saved
            FROM (${query})
          `),
          { "db.operation": "count", "db.user_id": userId }
        );
        return counts ?? { all: 0, unread: 0, read: 0, saved: 0 };
      }

      // Regex/content filters must use the same matcher as the article list.
      // Scan once in bounded chunks instead of loading the feed four times.
      const filters = await fetchSubscriptionFilters(
        ctx.db,
        subscriptionsWithFilters.map(({ id }) => id)
      );
      const counts = { all: 0, unread: 0, read: 0, saved: 0 };
      const seen = new Set<number>();
      const chunkSize = 200;
      for (let offset = 0; ; offset += chunkSize) {
        const rows = await query
          .orderBy(desc(schema.articles.id))
          .limit(chunkSize)
          .offset(offset);
        for (const row of rows) {
          if (seen.has(row.articles.id)) continue;
          if (
            row.subscriptions.filterEnabled &&
            !matchesSubscriptionFilters(
              row.articles,
              filters.get(row.subscriptions.id) ?? [],
              row.subscriptions.filterMode
            )
          )
            continue;
          seen.add(row.articles.id);
          counts.all++;
          if (row.user_article_states?.read) counts.read++;
          else counts.unread++;
          if (row.user_article_states?.saved) counts.saved++;
        }
        if (rows.length < chunkSize) break;
      }
      return counts;
    }),
});
