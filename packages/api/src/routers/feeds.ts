/**
 * Feeds Router
 *
 * Handles user-generated public RSS feeds (aggregated from categories).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { router, publicProcedure, rateLimitedProcedure } from "@/trpc/init";
import { slugValidator } from "@/types";
import { selectFeedSchema } from "@/db/schemas.zod";
import {
  checkPublicFeedLimit,
  incrementPublicFeedCount,
  decrementPublicFeedCount,
} from "@/services/limits";
import {
  createPaginatedSchema,
  paginationInputSchema,
  createPaginatedResponse,
} from "@/types/pagination";
import * as schema from "@/db/schema";
import { requireOwnership, slugExists, updateManyToMany } from "@/db/helpers";
import { fetchFeedCategories } from "@/db/transformers";
import { generateRSS } from "@/services/xml-generator";

// Feed list response schema (includes extra fields not in database)
const feedListItemSchema = z.object({
  id: z.number(),
  userId: z.number(),
  username: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  public: z.boolean(),
  categoryIds: z.array(z.number()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const feedsRouter = router({
  /**
   * List user's public feeds with pagination
   */
  list: rateLimitedProcedure
    .input(paginationInputSchema)
    .output(createPaginatedSchema(feedListItemSchema))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get user's username
      const [user] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Get all feeds for user (fetch one extra for pagination)
      const feeds = await ctx.db
        .select()
        .from(schema.feeds)
        .where(eq(schema.feeds.userId, userId))
        .orderBy(schema.feeds.createdAt)
        .limit(input.limit + 1)
        .offset(input.offset);

      // Bulk fetch all categories (prevents N+1 query)
      // Only fetch for feeds we'll return (not the extra one)
      const feedIds = feeds.slice(0, input.limit).map((f) => f.id);
      const categoriesMap = await fetchFeedCategories(ctx.db, feedIds);

      // Build result with categories and username
      const allResults = feeds.map((feed) => ({
        id: feed.id,
        userId: feed.userId,
        username: user.username || user.name || "",
        slug: feed.slug,
        title: feed.title,
        description: feed.description,
        public: feed.public,
        categoryIds: categoriesMap.get(feed.id) || [],
        createdAt: feed.createdAt,
        updatedAt: feed.updatedAt,
      }));

      return createPaginatedResponse(allResults, input.limit, input.offset);
    }),

  /**
   * Get single feed by ID
   */
  getById: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(selectFeedSchema)
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify ownership
      const feed = await requireOwnership<typeof schema.feeds.$inferSelect>(
        ctx.db,
        schema.feeds,
        input.id,
        userId,
        "Feed"
      );

      // Get category IDs
      const categoryLinks = await ctx.db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.feedId, feed.id));

      const categoryIds = categoryLinks.map((link) => link.categoryId);

      return {
        id: feed.id,
        userId: feed.userId,
        slug: feed.slug,
        title: feed.title,
        description: feed.description,
        public: feed.public,
        categoryIds,
        createdAt: feed.createdAt,
        updatedAt: feed.updatedAt,
      };
    }),

  /**
   * Get feed for a specific category (single-category feeds)
   * Returns the feed if it exists and has exactly this one category
   */
  getByCategoryId: rateLimitedProcedure
    .input(z.object({ categoryId: z.number() }))
    .output(selectFeedSchema.nullable())
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Find feeds that have this category
      const feedCategoryLinks = await ctx.db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.categoryId, input.categoryId));

      // Check each feed to see if it has only this one category
      for (const link of feedCategoryLinks) {
        const feed = await ctx.db.query.feeds.findFirst({
          where: and(
            eq(schema.feeds.id, link.feedId),
            eq(schema.feeds.userId, userId)
          ),
        });

        if (!feed) continue;

        // Get all categories for this feed
        const allCategories = await ctx.db
          .select()
          .from(schema.feedCategories)
          .where(eq(schema.feedCategories.feedId, feed.id));

        // If this feed has exactly one category and it matches our input
        if (allCategories.length === 1) {
          return {
            id: feed.id,
            userId: feed.userId,
            slug: feed.slug,
            title: feed.title,
            description: feed.description,
            public: feed.public,
            categoryIds: [input.categoryId],
            createdAt: feed.createdAt,
            updatedAt: feed.updatedAt,
          };
        }
      }

      // No single-category feed found
      return null;
    }),

  /**
   * Create new public feed
   */
  create: rateLimitedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        slug: slugValidator,
        description: z.string().optional(),
        public: z.boolean().default(true),
        categoryIds: z.array(z.number()).optional(),
      })
    )
    .output(selectFeedSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Check if slug already exists for this user
      const exists = await slugExists(ctx.db, schema.feeds, userId, input.slug);

      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A feed with this slug already exists",
        });
      }

      // Check public feed limit if creating a public feed
      if (input.public) {
        const limitCheck = await checkPublicFeedLimit(ctx.db, userId);
        if (!limitCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your limit of ${limitCheck.limit} public feeds. Please upgrade your plan.`,
          });
        }
      }

      // Create feed
      const newFeed = await ctx.db
        .insert(schema.feeds)
        .values({
          userId,
          slug: input.slug,
          title: input.title,
          description: input.description || null,
          public: input.public,
        })
        .returning();

      const feed = newFeed[0];

      // Update usage stats if public feed
      if (feed.public) {
        await incrementPublicFeedCount(ctx.db, userId);
      }

      // Link categories if provided
      if (input.categoryIds && input.categoryIds.length > 0) {
        const categoryLinks = input.categoryIds.map((categoryId) => ({
          feedId: feed.id,
          categoryId,
        }));

        await ctx.db.insert(schema.feedCategories).values(categoryLinks);
      }

      return {
        id: feed.id,
        userId: feed.userId,
        slug: feed.slug,
        title: feed.title,
        description: feed.description,
        public: feed.public,
        categoryIds: input.categoryIds || [],
        createdAt: feed.createdAt,
        updatedAt: feed.updatedAt,
      };
    }),

  /**
   * Update feed
   */
  update: rateLimitedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        slug: slugValidator.optional(),
        description: z.string().optional(),
        public: z.boolean().optional(),
        categoryIds: z.array(z.number()).optional(),
      })
    )
    .output(selectFeedSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify feed exists and belongs to user
      const existingFeed = await requireOwnership<
        typeof schema.feeds.$inferSelect
      >(ctx.db, schema.feeds, input.id, userId, "Feed");

      // Check if new slug conflicts
      if (input.slug && input.slug !== existingFeed.slug) {
        const exists = await slugExists(
          ctx.db,
          schema.feeds,
          userId,
          input.slug,
          input.id // Exclude current feed from check
        );

        if (exists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A feed with this slug already exists",
          });
        }
      }

      // Check if changing public status
      const wasPublic = existingFeed.public;
      const willBePublic =
        input.public !== undefined ? input.public : wasPublic;

      // Check limit if changing from private to public
      if (!wasPublic && willBePublic) {
        const limitCheck = await checkPublicFeedLimit(ctx.db, userId);
        if (!limitCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your limit of ${limitCheck.limit} public feeds. Please upgrade your plan.`,
          });
        }
      }

      // Build update object
      const updates: Partial<typeof schema.feeds.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.title !== undefined) updates.title = input.title;
      if (input.slug !== undefined) updates.slug = input.slug;
      if (input.description !== undefined)
        updates.description = input.description || null;
      if (input.public !== undefined) updates.public = input.public;

      // Update feed
      const updatedFeeds = await ctx.db
        .update(schema.feeds)
        .set(updates)
        .where(eq(schema.feeds.id, input.id))
        .returning();

      const updatedFeed = updatedFeeds[0];

      // Update usage stats based on public status change
      if (wasPublic && !willBePublic) {
        // Changed from public to private
        await decrementPublicFeedCount(ctx.db, userId);
      } else if (!wasPublic && willBePublic) {
        // Changed from private to public
        await incrementPublicFeedCount(ctx.db, userId);
      }

      // Update categories if provided
      let categoryIds: number[] = [];
      if (input.categoryIds !== undefined) {
        await updateManyToMany(
          ctx.db,
          schema.feedCategories,
          schema.feedCategories.feedId,
          input.id,
          schema.feedCategories.categoryId,
          input.categoryIds
        );
        categoryIds = input.categoryIds;
      } else {
        // Get existing category IDs
        const categoryLinks = await ctx.db
          .select()
          .from(schema.feedCategories)
          .where(eq(schema.feedCategories.feedId, input.id));
        categoryIds = categoryLinks.map((link) => link.categoryId);
      }

      return {
        id: updatedFeed.id,
        userId: updatedFeed.userId,
        slug: updatedFeed.slug,
        title: updatedFeed.title,
        description: updatedFeed.description,
        public: updatedFeed.public,
        categoryIds,
        createdAt: updatedFeed.createdAt,
        updatedAt: updatedFeed.updatedAt,
      };
    }),

  /**
   * Delete feed
   */
  delete: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify feed exists and belongs to user
      const feed = await requireOwnership<typeof schema.feeds.$inferSelect>(
        ctx.db,
        schema.feeds,
        input.id,
        userId,
        "Feed"
      );

      const wasPublic = feed.public;

      // Delete feed (cascade will delete feed_categories links)
      await ctx.db.delete(schema.feeds).where(eq(schema.feeds.id, input.id));

      // Update usage stats if was a public feed
      if (wasPublic) {
        await decrementPublicFeedCount(ctx.db, userId);
      }

      return { success: true };
    }),

  /**
   * Get public feed as RSS 2.0 XML (unauthenticated)
   */
  getPublicXml: publicProcedure
    .input(
      z.object({
        username: z.string(),
        slug: z.string(),
      })
    )
    .output(z.string()) // RSS 2.0 XML
    .query(async ({ ctx, input }) => {
      // Step 1: Find user by username
      const users = await ctx.db
        .select()
        .from(schema.user)
        .where(
          sql`COALESCE(${schema.user.username}, ${schema.user.name}) = ${input.username}`
        )
        .limit(1);

      if (!users.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const user = users[0];

      // Step 2: Find feed by user ID and slug
      const feeds = await ctx.db
        .select()
        .from(schema.feeds)
        .where(
          and(
            eq(schema.feeds.userId, user.id),
            eq(schema.feeds.slug, input.slug)
          )
        )
        .limit(1);

      if (!feeds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feed not found",
        });
      }

      const feed = feeds[0];

      // Step 3: Verify feed is public
      if (!feed.public) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feed not found",
        });
      }

      // Step 4: Get category IDs for this feed
      const categoryLinks = await ctx.db
        .select()
        .from(schema.feedCategories)
        .where(eq(schema.feedCategories.feedId, feed.id));

      const categoryIds = categoryLinks.map((link) => link.categoryId);

      // Step 5: Get articles from these categories
      let articles: Array<{
        title: string;
        link: string | null;
        description: string | null;
        author: string | null;
        publishedAt: Date | null;
        guid: string;
      }> = [];

      if (categoryIds.length > 0) {
        // Get subscription IDs that match these categories
        const subscriptionLinks = await ctx.db
          .select()
          .from(schema.subscriptionCategories)
          .where(
            inArray(schema.subscriptionCategories.categoryId, categoryIds)
          );

        const subscriptionIds = subscriptionLinks.map(
          (link) => link.subscriptionId
        );

        if (subscriptionIds.length > 0) {
          // Get subscriptions for this user
          const subscriptions = await ctx.db
            .select()
            .from(schema.subscriptions)
            .where(
              and(
                eq(schema.subscriptions.userId, user.id),
                inArray(schema.subscriptions.id, subscriptionIds)
              )
            );

          const sourceIds = subscriptions.map((sub) => sub.sourceId);

          if (sourceIds.length > 0) {
            // Get articles from these sources
            const articlesResult = await ctx.db
              .select()
              .from(schema.articles)
              .where(inArray(schema.articles.sourceId, sourceIds))
              .orderBy(desc(schema.articles.publishedAt))
              .limit(50);

            articles = articlesResult.map((article) => ({
              title: article.title,
              link: article.link,
              description: article.description,
              author: article.author,
              publishedAt: article.publishedAt,
              guid: article.guid,
            }));
          }
        }
      } else {
        // No category filter - get all articles from user's subscriptions
        const subscriptions = await ctx.db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.userId, user.id));

        const sourceIds = subscriptions.map((sub) => sub.sourceId);

        if (sourceIds.length > 0) {
          const articlesResult = await ctx.db
            .select()
            .from(schema.articles)
            .where(inArray(schema.articles.sourceId, sourceIds))
            .orderBy(desc(schema.articles.publishedAt))
            .limit(50);

          articles = articlesResult.map((article) => ({
            title: article.title,
            link: article.link,
            description: article.description,
            author: article.author,
            publishedAt: article.publishedAt,
            guid: article.guid,
          }));
        }
      }

      // Step 6: Generate RSS 2.0 XML
      const feedUrl = `${ctx.env.BASE_URL || "http://localhost:3000"}/public/${input.username}/${input.slug}`;

      const xml = generateRSS({
        title: feed.title,
        link: feedUrl,
        description: feed.description || feed.title,
        items: articles.map((article) => ({
          title: article.title,
          link: article.link || feedUrl,
          description: article.description,
          author: article.author,
          pubDate: article.publishedAt,
          guid: article.guid,
        })),
      });

      return xml;
    }),
});
