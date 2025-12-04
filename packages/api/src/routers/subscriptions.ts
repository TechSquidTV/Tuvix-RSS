/**
 * Subscriptions Router
 *
 * Handles RSS feed subscriptions, OPML import/export, filters, and discovery.
 */

import * as Sentry from "@/utils/sentry";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, rateLimitedProcedure } from "@/trpc/init";
import { withQueryMetrics } from "@/utils/db-metrics";
import type { Opml } from "@/types/feed";
import {
  urlValidator,
  customTitleValidator,
  categoryNamesArrayValidator,
  idArrayValidator,
  STRING_LIMITS,
} from "@/types/validators";
import {
  extractDomain,
  isDomainBlocked,
  getBlockedDomainReason,
  getBlockedDomains,
} from "@/utils/domain-checker";
import {
  checkSourceLimit,
  incrementSourceCount,
  decrementSourceCount,
  recalculateUsage,
} from "@/services/limits";
import { CategorySuggestionSchema, ImportJobSchema } from "@/types";
import {
  subscriptionResponseSchema,
  selectSubscriptionFilterSchema,
} from "@/db/schemas.zod";
import {
  createPaginatedSchema,
  paginationInputSchema,
  createPaginatedResponse,
} from "@/types/pagination";
import * as schema from "@/db/schema";
import { generateColorFromString } from "@/utils/color-generator";
import { requireOwnership, findOrCreateCategory } from "@/db/helpers";
import {
  transformSubscriptionFilter,
  fetchSubscriptionCategories,
  fetchSubscriptionFilters,
  buildSubscriptionResponse,
} from "@/db/transformers";
import { fetchAndDiscoverCategories } from "@/services/category-discovery";
import { stripHtml } from "@/utils/text-sanitizer";
import { discoverFavicon } from "@/services/favicon-fetcher";
import {
  parseFiltersJson,
  parseCategoriesJson,
  parseBoolean,
  type FilterData,
} from "@/utils/opml-parser";
import { extractItunesImage } from "@/utils/feed-utils";

/**
 * Normalize Reddit feed URLs to use old.reddit.com for consistency.
 * This prevents duplicate subscriptions when users provide different domains
 * (www.reddit.com, reddit.com, old.reddit.com) that serve the same content.
 *
 * @param url - The URL to normalize
 * @returns Normalized URL with old.reddit.com domain, or original URL if not Reddit
 */
function normalizeRedditUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Check if this is a Reddit domain with an RSS feed
    if (
      parsedUrl.hostname.includes("reddit.com") &&
      parsedUrl.pathname.endsWith(".rss")
    ) {
      // Normalize to old.reddit.com (matches RedditDiscoveryService)
      parsedUrl.hostname = "old.reddit.com";
      return parsedUrl.toString();
    }
  } catch {
    // Invalid URL, return as-is
  }
  return url;
}

export const subscriptionsRouter = router({
  /**
   * List all user's subscriptions with pagination
   */
  list: rateLimitedProcedure
    .input(paginationInputSchema)
    .output(createPaginatedSchema(subscriptionResponseSchema))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get all subscriptions with sources (fetch one extra for pagination)
      const subscriptionsWithSources = await withQueryMetrics(
        "subscriptions.list",
        async () =>
          ctx.db
            .select()
            .from(schema.subscriptions)
            .innerJoin(
              schema.sources,
              eq(schema.subscriptions.sourceId, schema.sources.id)
            )
            .where(eq(schema.subscriptions.userId, userId))
            .limit(input.limit + 1)
            .offset(input.offset),
        {
          "db.table": "subscriptions",
          "db.operation": "select",
          "db.user_id": userId,
          "db.limit": input.limit,
        }
      );

      // Bulk fetch categories and filters (prevents N+1 query)
      // Only fetch for the subscriptions we'll return (not the extra one)
      const subscriptionIds = subscriptionsWithSources
        .slice(0, input.limit)
        .map((row) => row.subscriptions.id);

      const categoriesMap = await fetchSubscriptionCategories(
        ctx.db,
        subscriptionIds
      );
      const filtersMap = await fetchSubscriptionFilters(
        ctx.db,
        subscriptionIds
      );

      // Build results with categories and filters
      const allResults = subscriptionsWithSources.map((row) => {
        const subscription = row.subscriptions;
        const source = row.sources;

        return buildSubscriptionResponse(
          subscription,
          source,
          categoriesMap.get(subscription.id) || [],
          filtersMap.get(subscription.id) || []
        );
      });

      return createPaginatedResponse(allResults, input.limit, input.offset);
    }),

  /**
   * Get single subscription by ID
   */
  getById: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(subscriptionResponseSchema)
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify ownership and get subscription with source
      const result = await ctx.db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(
          and(
            eq(schema.subscriptions.id, input.id),
            eq(schema.subscriptions.userId, userId)
          )
        )
        .limit(1);

      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Subscription not found or not accessible",
        });
      }

      const subscription = result[0].subscriptions;
      const source = result[0].sources;

      // Fetch categories and filters
      const categoriesMap = await fetchSubscriptionCategories(ctx.db, [
        subscription.id,
      ]);
      const filtersMap = await fetchSubscriptionFilters(ctx.db, [
        subscription.id,
      ]);

      return buildSubscriptionResponse(
        subscription,
        source,
        categoriesMap.get(subscription.id) || [],
        filtersMap.get(subscription.id) || []
      );
    }),

  /**
   * Create new subscription (subscribe to feed)
   */
  create: rateLimitedProcedure
    .input(
      z.object({
        url: urlValidator,
        customTitle: customTitleValidator,
        categoryIds: idArrayValidator(100).optional(),
        newCategoryNames: categoryNamesArrayValidator.optional(),
        iconUrl: urlValidator.optional(),
        iconType: z.enum(["auto", "custom", "none"]).optional(),
      })
    )
    .output(subscriptionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Set user context for Sentry
      await Sentry.setUser({ id: userId.toString() });

      const domain = extractDomain(input.url);

      await Sentry.addBreadcrumb({
        category: "subscription",
        message: `Creating subscription for ${input.url}`,
        level: "info",
        data: {
          url: input.url,
          domain: domain || "unknown",
          user_id: userId,
        },
      });

      // Step 1: Check if domain is blocked (before fetching feed)
      if (domain) {
        // Get user's plan for enterprise bypass
        const users = await ctx.db
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);
        const user = users[0];

        const userPlan = user?.plan || "free";

        // Get blocked domains and check
        const blockedDomainsList = await getBlockedDomains(ctx.db);
        const blockedDomains = blockedDomainsList.map((b) => b.domain);
        const blockedDomainsWithReason = blockedDomainsList;

        if (isDomainBlocked(domain, blockedDomains, userPlan)) {
          const { reason } = getBlockedDomainReason(
            domain,
            blockedDomainsWithReason,
            userPlan
          );

          const reasonMap: Record<string, string> = {
            illegal_content: "Illegal Content",
            excessive_automation: "Excessive Automation",
            spam: "Spam",
            malware: "Malware",
            copyright_violation: "Copyright Violation",
            other: "Other",
          };

          const reasonDisplayName = reason ? reasonMap[reason] || reason : null;

          await Sentry.captureException(
            new Error("Subscription blocked - domain blocked"),
            {
              level: "info",
              tags: {
                operation: "subscription_create",
                domain: domain,
                user_plan: userPlan,
                block_reason: reason || "unknown",
              },
              extra: {
                url: input.url,
                user_id: userId,
              },
            }
          );

          throw new TRPCError({
            code: "FORBIDDEN",
            message: `This domain has been blocked by administrators.${
              reasonDisplayName ? ` Reason: ${reasonDisplayName}` : ""
            }`,
          });
        }
      }

      // Step 2: Fetch and parse the feed to validate it
      const { parseFeed } = await import("feedsmith");

      let feedUrl = input.url;
      let feedData;
      let feedContent: string | undefined;

      // Retry logic for transient failures
      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 1000;
      const TRANSIENT_STATUS_CODES = [502, 503, 504, 429];

      let lastError: Error | undefined;
      let lastStatusCode: number | undefined;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            // Add delay between retries with exponential backoff
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));

            await Sentry.addBreadcrumb({
              category: "subscription",
              message: `Retrying feed fetch (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
              level: "info",
              data: {
                attempt: attempt + 1,
                delay_ms: delay,
              },
            });
          } else {
            await Sentry.addBreadcrumb({
              category: "subscription",
              message: `Fetching feed from ${feedUrl}`,
              level: "info",
            });
          }

          const response = await fetch(feedUrl, {
            headers: {
              "User-Agent": "TuvixRSS/1.0",
              Accept:
                "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            },
            signal: AbortSignal.timeout(30000),
          });

          lastStatusCode = response.status;

          if (!response.ok) {
            const errorMessage = `HTTP ${response.status}: ${response.statusText}`;

            // Check if this is a transient error that should be retried
            if (
              TRANSIENT_STATUS_CODES.includes(response.status) &&
              attempt < MAX_RETRIES
            ) {
              lastError = new Error(errorMessage);
              continue; // Retry
            }

            // Non-transient error or max retries reached
            throw new Error(errorMessage);
          }

          feedContent = await response.text();
          const result = parseFeed(feedContent);
          feedData = result.feed;

          await Sentry.addBreadcrumb({
            category: "subscription",
            message: `Successfully parsed feed as ${result.format}`,
            level: "info",
            data: {
              feed_format: result.format,
              attempts: attempt + 1,
            },
          });

          // Success - break out of retry loop
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is the last attempt or not a transient error, throw
          if (attempt === MAX_RETRIES) {
            // Extract HTTP status if this is an HTTP error
            const errorMessage = lastError.message;
            const httpStatusMatch = errorMessage.match(/HTTP (\d+):/);
            const httpStatus = httpStatusMatch
              ? httpStatusMatch[1]
              : lastStatusCode?.toString();

            await Sentry.captureException(lastError, {
              level: "error",
              tags: {
                operation: "subscription_feed_parse",
                domain: domain || "unknown",
                ...(httpStatus && { http_status: httpStatus }),
                attempts: (attempt + 1).toString(),
              },
              extra: {
                url: input.url,
                user_id: userId,
                error_message: errorMessage,
                final_attempt: attempt + 1,
                last_status_code: lastStatusCode,
              },
            });

            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to fetch or parse feed: ${errorMessage}`,
            });
          }

          // Check if we should retry this error
          const errorMessage = lastError.message;
          const httpStatusMatch = errorMessage.match(/HTTP (\d+):/);
          const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1]) : 0;

          if (!TRANSIENT_STATUS_CODES.includes(httpStatus)) {
            // Non-transient error - don't retry
            await Sentry.captureException(lastError, {
              level: "error",
              tags: {
                operation: "subscription_feed_parse",
                domain: domain || "unknown",
                http_status: httpStatus.toString(),
                attempts: (attempt + 1).toString(),
              },
              extra: {
                url: input.url,
                user_id: userId,
                error_message: errorMessage,
              },
            });

            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to fetch or parse feed: ${errorMessage}`,
            });
          }
        }
      }

      // If we get here, feedData should be defined from successful parse
      if (!feedData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Feed parsing failed unexpectedly",
        });
      }

      // Step 3: Extract metadata from feed
      const feedTitle =
        "title" in feedData && feedData.title
          ? feedData.title
          : "Untitled Feed";
      const feedDescription =
        "description" in feedData && feedData.description
          ? stripHtml(feedData.description)
          : "subtitle" in feedData && feedData.subtitle
            ? stripHtml(feedData.subtitle)
            : undefined;
      const siteUrl =
        "link" in feedData && feedData.link
          ? feedData.link
          : "links" in feedData &&
              Array.isArray(feedData.links) &&
              feedData.links[0]?.href
            ? feedData.links[0].href
            : undefined;

      // Step 3.5: Extract icon URL from feed
      let feedIconUrl: string | undefined;
      try {
        // First, try platform-specific discovery for the original input URL
        // This handles Apple Podcasts, Reddit, etc. with high-quality icons
        if (!input.iconUrl && (!input.iconType || input.iconType === "auto")) {
          const { discoverFeeds } = await import("@/services/feed-discovery");
          try {
            const discoveredFeeds = await discoverFeeds(input.url);
            // Use iconUrl from discovery if available (platform-specific high-quality icons)
            if (discoveredFeeds.length > 0 && discoveredFeeds[0].iconUrl) {
              feedIconUrl = discoveredFeeds[0].iconUrl;

              await Sentry.addBreadcrumb({
                category: "subscription",
                message: `Using icon from discovery service`,
                level: "info",
                data: {
                  icon_url: feedIconUrl,
                  discovery_service: "platform_specific",
                },
              });
            }
          } catch (discoveryError) {
            // Discovery failed, fall through to feed metadata
            console.log(
              "[create] Discovery failed, falling back to feed metadata:",
              discoveryError
            );
          }
        }

        // Fall back to feed metadata if no discovery icon found
        if (!feedIconUrl) {
          // Priority: itunes:image > image.url > icon
          const itunesImage = extractItunesImage(feedData, feedContent);

          feedIconUrl =
            itunesImage ||
            ("image" in feedData &&
            typeof feedData.image === "object" &&
            feedData.image !== null &&
            "url" in feedData.image &&
            typeof feedData.image.url === "string"
              ? feedData.image.url
              : "icon" in feedData && typeof feedData.icon === "string"
                ? feedData.icon
                : undefined);

          // Discover generic favicon if still no icon found
          if (
            !input.iconUrl &&
            (!input.iconType || input.iconType === "auto") &&
            feedIconUrl
          ) {
            const faviconResult = await discoverFavicon(feedUrl, feedIconUrl);
            feedIconUrl = faviconResult.iconUrl || feedIconUrl;
          }
        }
      } catch (error) {
        console.error("[create] Failed to discover favicon:", error);
        // Failed to discover favicon, continue without it
      }

      // Step 4: Check if source exists, create if not
      // Normalize Reddit URLs to prevent duplicates across different domains
      const normalizedFeedUrl = normalizeRedditUrl(feedUrl);

      const existingSources = await ctx.db
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.url, normalizedFeedUrl))
        .limit(1);

      let sourceId: number;

      if (existingSources.length > 0) {
        sourceId = existingSources[0].id;

        // Update source metadata if we have new info
        await ctx.db
          .update(schema.sources)
          .set({
            title: feedTitle,
            description: feedDescription,
            siteUrl,
            // Update icon if we have a better one (and iconType is auto)
            ...((!input.iconType || input.iconType === "auto") && feedIconUrl
              ? { iconUrl: input.iconUrl || feedIconUrl }
              : {}),
            lastFetched: new Date(),
          })
          .where(eq(schema.sources.id, sourceId));
      } else {
        // Create new source with normalized URL
        const newSource = await ctx.db
          .insert(schema.sources)
          .values({
            url: normalizedFeedUrl,
            title: feedTitle,
            description: feedDescription,
            siteUrl,
            iconUrl: input.iconUrl || feedIconUrl || null,
            iconType: input.iconType || "auto",
            lastFetched: new Date(),
          })
          .returning();

        sourceId = newSource[0].id;
      }

      // Step 4: Check if user is already subscribed
      const existingSubscription = await ctx.db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            eq(schema.subscriptions.sourceId, sourceId)
          )
        )
        .limit(1);

      if (existingSubscription.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Already subscribed to this feed",
        });
      }

      // Step 5: Check source limit (this is a new unique source for the user)
      const limitCheck = await checkSourceLimit(ctx.db, userId);
      if (!limitCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You have reached your limit of ${limitCheck.limit} RSS sources. Please upgrade your plan.`,
        });
      }

      // Step 6: Create subscription
      const newSubscription = await ctx.db
        .insert(schema.subscriptions)
        .values({
          userId,
          sourceId,
          customTitle: input.customTitle || null,
          filterEnabled: false,
          filterMode: "include",
        })
        .returning();

      const subscriptionId = newSubscription[0].id;

      // Step 7: Update usage stats (increment source count)
      await incrementSourceCount(ctx.db, userId);

      // Step 8: Link existing categories
      if (input.categoryIds && input.categoryIds.length > 0) {
        const categoryLinks = input.categoryIds.map((categoryId) => ({
          subscriptionId,
          categoryId,
        }));

        await ctx.db
          .insert(schema.subscriptionCategories)
          .values(categoryLinks);
      }

      // Step 7: Create and link new categories (with normalization)
      if (input.newCategoryNames && input.newCategoryNames.length > 0) {
        const categoryIds: number[] = [];
        for (const name of input.newCategoryNames) {
          // Find or create category (normalizes by name)
          const categoryId = await findOrCreateCategory(
            ctx.db,
            schema.categories,
            userId,
            name,
            generateColorFromString
          );
          categoryIds.push(categoryId);
        }

        // Link all categories to subscription
        if (categoryIds.length > 0) {
          const categoryLinks = categoryIds.map((categoryId) => ({
            subscriptionId,
            categoryId,
          }));

          await ctx.db
            .insert(schema.subscriptionCategories)
            .values(categoryLinks);
        }
      }

      // Step 8: Fetch the complete subscription to return
      const result = await ctx.db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(eq(schema.subscriptions.id, subscriptionId))
        .limit(1);

      const subscription = result[0].subscriptions;
      const source = result[0].sources;

      // Get categories
      const categoriesMap = await fetchSubscriptionCategories(ctx.db, [
        subscriptionId,
      ]);

      return buildSubscriptionResponse(
        subscription,
        source,
        categoriesMap.get(subscriptionId) || [],
        [] // New subscriptions have no filters
      );
    }),

  /**
   * Update subscription (title, categories, filters)
   */
  update: rateLimitedProcedure
    .input(
      z.object({
        id: z.number(),
        customTitle: customTitleValidator,
        categoryIds: idArrayValidator(100).optional(),
        newCategoryNames: categoryNamesArrayValidator.optional(),
        filterEnabled: z.boolean().optional(),
        filterMode: z.enum(["include", "exclude"]).optional(),
      })
    )
    .output(subscriptionResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify ownership
      await requireOwnership<typeof schema.subscriptions.$inferSelect>(
        ctx.db,
        schema.subscriptions,
        input.id,
        userId,
        "Subscription"
      );

      // Build update object for subscription fields
      const updates: Partial<typeof schema.subscriptions.$inferInsert> = {};
      let hasUpdates = false;

      if (input.customTitle !== undefined) {
        updates.customTitle = input.customTitle || null;
        hasUpdates = true;
      }
      if (input.filterEnabled !== undefined) {
        updates.filterEnabled = input.filterEnabled;
        hasUpdates = true;
      }
      if (input.filterMode !== undefined) {
        updates.filterMode = input.filterMode;
        hasUpdates = true;
      }

      // Update subscription fields if any updates provided
      if (hasUpdates) {
        updates.updatedAt = new Date();
        await ctx.db
          .update(schema.subscriptions)
          .set(updates)
          .where(eq(schema.subscriptions.id, input.id));
      }

      // Create and link new categories (with normalization)
      const allCategoryIds = [...(input.categoryIds || [])];

      if (input.newCategoryNames && input.newCategoryNames.length > 0) {
        for (const name of input.newCategoryNames) {
          // Find or create category (normalizes by name)
          const categoryId = await findOrCreateCategory(
            ctx.db,
            schema.categories,
            userId,
            name,
            generateColorFromString
          );
          allCategoryIds.push(categoryId);
        }
      }

      // Update categories (both existing and newly created)
      if (
        input.categoryIds !== undefined ||
        input.newCategoryNames !== undefined
      ) {
        // Delete all existing category links
        await ctx.db
          .delete(schema.subscriptionCategories)
          .where(eq(schema.subscriptionCategories.subscriptionId, input.id));

        // Insert new links if any
        if (allCategoryIds.length > 0) {
          const categoryLinks = allCategoryIds.map((categoryId) => ({
            subscriptionId: input.id,
            categoryId,
          }));

          await ctx.db
            .insert(schema.subscriptionCategories)
            .values(categoryLinks);
        }
      }

      // Fetch complete subscription to return
      const result = await ctx.db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(eq(schema.subscriptions.id, input.id))
        .limit(1);

      const subscription = result[0].subscriptions;
      const source = result[0].sources;

      // Fetch categories and filters
      const categoriesMap = await fetchSubscriptionCategories(ctx.db, [
        input.id,
      ]);
      const filtersMap = await fetchSubscriptionFilters(ctx.db, [input.id]);

      return buildSubscriptionResponse(
        subscription,
        source,
        categoriesMap.get(input.id) || [],
        filtersMap.get(input.id) || []
      );
    }),

  /**
   * Delete subscription (unsubscribe)
   */
  delete: rateLimitedProcedure
    .input(z.object({ id: z.number() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify ownership and get subscription data
      const subscription = await requireOwnership<
        typeof schema.subscriptions.$inferSelect
      >(ctx.db, schema.subscriptions, input.id, userId, "Subscription");

      const sourceId = subscription.sourceId;

      // Delete subscription (cascade will delete categories and filters)
      await ctx.db
        .delete(schema.subscriptions)
        .where(eq(schema.subscriptions.id, input.id));

      // Check if user has any other subscriptions to this source
      const remainingSubscriptions = await ctx.db
        .select()
        .from(schema.subscriptions)
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            eq(schema.subscriptions.sourceId, sourceId)
          )
        )
        .limit(1);

      // If no other subscriptions to this source, decrement source count
      if (remainingSubscriptions.length === 0) {
        await decrementSourceCount(ctx.db, userId);
      }

      return { success: true };
    }),

  /**
   * Discover feeds on a website
   */
  discover: rateLimitedProcedure
    .input(z.object({ url: urlValidator }))
    .output(
      z.array(
        z.object({
          url: z.string(),
          title: z.string(),
          type: z.enum(["rss", "atom"]),
          description: z.string().optional(),
          iconUrl: z.string().optional(),
        })
      )
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const {
        discoverFeeds,
        NoFeedsFoundError,
        FeedValidationError,
        FeedDiscoveryError,
      } = await import("@tuvixrss/tricorder");
      const { sentryTelemetryAdapter } = await import(
        "@/adapters/sentry-telemetry"
      );

      // Use the extensible discovery system with Sentry telemetry
      let discoveredFeeds;
      try {
        discoveredFeeds = await discoverFeeds(input.url, {
          telemetry: sentryTelemetryAdapter,
        });
      } catch (error) {
        // Convert tricorder errors to TRPC errors
        if (error instanceof NoFeedsFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        if (
          error instanceof FeedValidationError ||
          error instanceof FeedDiscoveryError
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        // Unknown error - wrap it
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred during feed discovery",
          cause: error,
        });
      }

      // Filter to only rss/atom types to match output schema (maintain backward compatibility)
      // rdf and json feeds are converted to rss for compatibility
      return discoveredFeeds
        .filter((feed) => feed.type === "rss" || feed.type === "atom")
        .map((feed) => ({
          url: feed.url,
          title: feed.title,
          type: feed.type as "rss" | "atom",
          description: feed.description,
          iconUrl: feed.iconUrl,
        }));
    }),

  /**
   * Preview feed before subscribing
   */
  preview: rateLimitedProcedure
    .input(z.object({ url: urlValidator }))
    .output(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        siteUrl: z.string().optional(),
        iconUrl: z.string().optional(),
        suggestedCategories: z.array(CategorySuggestionSchema),
      })
    )
    .query(async ({ ctx: _ctx, input }) => {
      const { parseFeed } = await import("feedsmith");

      const domain = extractDomain(input.url);

      await Sentry.addBreadcrumb({
        category: "subscription",
        message: `Previewing feed ${input.url}`,
        level: "info",
        data: {
          url: input.url,
          domain: domain || "unknown",
        },
      });

      // Step 1: Fetch and parse the feed
      let feedData;
      let feedUrl = input.url;
      let feedContent: string | undefined;

      // Retry logic for transient failures
      const MAX_RETRIES = 2;
      const RETRY_DELAY_MS = 1000;
      const TRANSIENT_STATUS_CODES = [502, 503, 504, 429];

      let lastError: Error | undefined;
      let lastStatusCode: number | undefined;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            // Add delay between retries with exponential backoff
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));

            await Sentry.addBreadcrumb({
              category: "subscription",
              message: `Retrying feed preview (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
              level: "info",
              data: {
                attempt: attempt + 1,
                delay_ms: delay,
              },
            });
          }

          const response = await fetch(feedUrl, {
            headers: {
              "User-Agent": "TuvixRSS/1.0",
              Accept:
                "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            },
            signal: AbortSignal.timeout(30000),
          });

          lastStatusCode = response.status;

          if (!response.ok) {
            const errorMessage = `HTTP ${response.status}: ${response.statusText}`;

            // Check if this is a transient error that should be retried
            if (
              TRANSIENT_STATUS_CODES.includes(response.status) &&
              attempt < MAX_RETRIES
            ) {
              lastError = new Error(errorMessage);
              continue; // Retry
            }

            // Non-transient error or max retries reached
            throw new Error(errorMessage);
          }

          feedContent = await response.text();
          const result = parseFeed(feedContent);
          feedData = result.feed;

          await Sentry.addBreadcrumb({
            category: "subscription",
            message: `Preview parsed feed as ${result.format}`,
            level: "info",
            data: {
              feed_format: result.format,
              attempts: attempt + 1,
            },
          });

          // Success - break out of retry loop
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is the last attempt or not a transient error, throw
          if (attempt === MAX_RETRIES) {
            // Extract HTTP status if this is an HTTP error
            const errorMessage = lastError.message;
            const httpStatusMatch = errorMessage.match(/HTTP (\d+):/);
            const httpStatus = httpStatusMatch
              ? httpStatusMatch[1]
              : lastStatusCode?.toString();

            await Sentry.captureException(lastError, {
              level: "error",
              tags: {
                operation: "subscription_preview_parse",
                domain: domain || "unknown",
                ...(httpStatus && { http_status: httpStatus }),
                attempts: (attempt + 1).toString(),
              },
              extra: {
                url: input.url,
                error_message: errorMessage,
                final_attempt: attempt + 1,
                last_status_code: lastStatusCode,
              },
            });

            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to fetch or parse feed: ${errorMessage}`,
            });
          }

          // Check if we should retry this error
          const errorMessage = lastError.message;
          const httpStatusMatch = errorMessage.match(/HTTP (\d+):/);
          const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1]) : 0;

          if (!TRANSIENT_STATUS_CODES.includes(httpStatus)) {
            // Non-transient error - don't retry
            await Sentry.captureException(lastError, {
              level: "error",
              tags: {
                operation: "subscription_preview_parse",
                domain: domain || "unknown",
                http_status: httpStatus.toString(),
                attempts: (attempt + 1).toString(),
              },
              extra: {
                url: input.url,
                error_message: errorMessage,
              },
            });

            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Failed to fetch or parse feed: ${errorMessage}`,
            });
          }
        }
      }

      // If we get here, feedData should be defined from successful parse
      if (!feedData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Feed parsing failed unexpectedly",
        });
      }

      // Step 2: Extract metadata
      const title =
        "title" in feedData && feedData.title
          ? feedData.title
          : "Untitled Feed";
      const description =
        "description" in feedData && feedData.description
          ? stripHtml(feedData.description)
          : "subtitle" in feedData && feedData.subtitle
            ? stripHtml(feedData.subtitle)
            : undefined;
      const siteUrl =
        "link" in feedData && feedData.link
          ? feedData.link
          : "links" in feedData &&
              Array.isArray(feedData.links) &&
              feedData.links[0]?.href
            ? feedData.links[0].href
            : undefined;

      // Step 3: Try to get favicon URL
      let iconUrl: string | undefined;
      try {
        // First, try platform-specific discovery (Apple Podcasts, Reddit, etc.)
        const { discoverFeeds } = await import("@/services/feed-discovery");
        try {
          const discoveredFeeds = await discoverFeeds(input.url);
          // Use iconUrl from discovery if available (platform-specific high-quality icons)
          if (discoveredFeeds.length > 0 && discoveredFeeds[0].iconUrl) {
            iconUrl = discoveredFeeds[0].iconUrl;

            await Sentry.addBreadcrumb({
              category: "subscription",
              message: `Icon discovery succeeded (platform-specific)`,
              level: "info",
              data: {
                icon_url: iconUrl,
                discovery_service: "platform_specific",
              },
            });
          }
        } catch (discoveryError) {
          // Discovery failed, fall through to feed metadata
          console.log(
            "[preview] Discovery failed, falling back to feed metadata:",
            discoveryError
          );
        }

        // Fall back to feed metadata + generic favicon if no discovery icon found
        if (!iconUrl) {
          // Priority: itunes:image > image.url > icon
          const itunesImage = extractItunesImage(feedData, feedContent);

          const feedIconUrl =
            itunesImage ||
            ("image" in feedData &&
            typeof feedData.image === "object" &&
            feedData.image !== null &&
            "url" in feedData.image &&
            typeof feedData.image.url === "string"
              ? feedData.image.url
              : "icon" in feedData && typeof feedData.icon === "string"
                ? feedData.icon
                : undefined);

          const faviconResult = await discoverFavicon(input.url, feedIconUrl);
          iconUrl = faviconResult.iconUrl || undefined;

          await Sentry.addBreadcrumb({
            category: "subscription",
            message: `Icon discovery ${iconUrl ? "succeeded" : "failed"} (generic)`,
            level: iconUrl ? "info" : "warning",
            data: {
              itunes_image: !!itunesImage,
              feed_icon_url: !!feedIconUrl,
              final_icon_url: !!iconUrl,
            },
          });
        }
      } catch (error) {
        console.error("[preview] Failed to discover favicon:", error);
        await Sentry.captureException(error, {
          level: "warning",
          tags: {
            operation: "favicon_discovery",
            domain: domain || "unknown",
          },
          extra: {
            url: input.url,
          },
        });
        // Failed to discover favicon, continue without it
      }

      // Step 4: Extract category suggestions from feed
      const suggestedCategories: {
        name: string;
        count: number;
        color: string;
      }[] = [];
      const categoryMap = new Map<string, number>();

      // Helper to extract category name from various formats
      const extractCategoryName = (cat: unknown): string | null => {
        if (typeof cat === "string") return cat;
        if (typeof cat === "object" && cat !== null) {
          const obj = cat as Record<string, unknown>;
          return (
            (obj.term as string) ||
            (obj.label as string) ||
            (obj.name as string) ||
            null
          );
        }
        return null;
      };

      // Extract categories from feed metadata
      if ("categories" in feedData && Array.isArray(feedData.categories)) {
        for (const cat of feedData.categories) {
          const catName = extractCategoryName(cat);
          if (catName) {
            categoryMap.set(catName, (categoryMap.get(catName) || 0) + 1);
          }
        }
      }

      // Extract categories from first few entries
      if ("entries" in feedData && Array.isArray(feedData.entries)) {
        for (const entry of feedData.entries.slice(0, 10)) {
          if (entry.categories && Array.isArray(entry.categories)) {
            for (const cat of entry.categories) {
              const catName = extractCategoryName(cat);
              if (catName) {
                categoryMap.set(catName, (categoryMap.get(catName) || 0) + 1);
              }
            }
          }
        }
      }

      // Convert to array and sort by count
      for (const [name, count] of categoryMap.entries()) {
        suggestedCategories.push({
          name,
          count,
          color: generateColorFromString(name),
        });
      }

      suggestedCategories.sort((a, b) => b.count - a.count);

      return {
        title,
        description,
        siteUrl,
        iconUrl,
        suggestedCategories: suggestedCategories.slice(0, 10), // Top 10 suggestions
      };
    }),

  /**
   * Export subscriptions as OPML
   */
  export: rateLimitedProcedure.output(z.string()).query(async ({ ctx }) => {
    const { userId } = ctx.user;
    const { generateOpml } = await import("feedsmith");

    // Get all subscriptions with sources
    const subscriptionsWithData = await ctx.db
      .select()
      .from(schema.subscriptions)
      .innerJoin(
        schema.sources,
        eq(schema.subscriptions.sourceId, schema.sources.id)
      )
      .where(eq(schema.subscriptions.userId, userId));

    // Bulk fetch categories and filters for all subscriptions (prevents N+1 query)
    const subscriptionIds = subscriptionsWithData.map(
      (row) => row.subscriptions.id
    );
    const categoriesMap = await fetchSubscriptionCategories(
      ctx.db,
      subscriptionIds
    );
    const filtersMap = await fetchSubscriptionFilters(ctx.db, subscriptionIds);

    // Build category name map: subscription ID -> category names
    const categoryNameMap = new Map<number, string[]>();
    for (const [subscriptionId, categories] of categoriesMap.entries()) {
      categoryNameMap.set(
        subscriptionId,
        categories.map((cat) => cat.name)
      );
    }

    // Group subscriptions by category
    const categorizedSubs = new Map<string, typeof subscriptionsWithData>();
    const uncategorizedSubs: typeof subscriptionsWithData = [];

    for (const row of subscriptionsWithData) {
      const categories = categoryNameMap.get(row.subscriptions.id) || [];

      if (categories.length === 0) {
        uncategorizedSubs.push(row);
      } else {
        for (const category of categories) {
          if (!categorizedSubs.has(category)) {
            categorizedSubs.set(category, []);
          }
          categorizedSubs.get(category)!.push(row);
        }
      }
    }

    // Build OPML outline structure
    const outlines: Opml.Outline<Date>[] = [];

    // Add categorized subscriptions
    for (const [category, subs] of categorizedSubs.entries()) {
      const feedOutlines: Opml.Outline<Date>[] = [];

      for (const row of subs) {
        const source = row.sources;
        const subscription = row.subscriptions;
        const title = subscription.customTitle || source.title;
        const filters = filtersMap.get(subscription.id) || [];

        // Build filter data for custom attributes
        const filterData: Record<string, unknown> = {
          tuvixFilterEnabled: subscription.filterEnabled ? "true" : "false",
          tuvixFilterMode: subscription.filterMode,
        };

        // Only include filters attribute if filters exist
        if (filters.length > 0) {
          filterData.tuvixFilters = JSON.stringify(
            filters.map((f) => ({
              field: f.field,
              matchType: f.matchType,
              pattern: f.pattern,
              caseSensitive: f.caseSensitive,
            }))
          );
        }

        // Add category names as attribute (in addition to folder structure)
        const categoryNames = categoryNameMap.get(subscription.id) || [];
        if (categoryNames.length > 0) {
          filterData.tuvixCategories = JSON.stringify(categoryNames);
        }

        feedOutlines.push({
          type: "rss",
          text: title,
          title: title,
          xmlUrl: source.url,
          htmlUrl: source.siteUrl || undefined,
          ...filterData,
        });
      }

      outlines.push({
        text: category,
        title: category,
        outlines: feedOutlines,
      });
    }

    // Add uncategorized subscriptions
    for (const row of uncategorizedSubs) {
      const source = row.sources;
      const subscription = row.subscriptions;
      const title = subscription.customTitle || source.title;
      const filters = filtersMap.get(subscription.id) || [];

      // Build filter data for custom attributes
      const filterData: Record<string, unknown> = {
        tuvixFilterEnabled: subscription.filterEnabled ? "true" : "false",
        tuvixFilterMode: subscription.filterMode,
      };

      // Only include filters attribute if filters exist
      if (filters.length > 0) {
        filterData.tuvixFilters = JSON.stringify(
          filters.map((f) => ({
            field: f.field,
            matchType: f.matchType,
            pattern: f.pattern,
            caseSensitive: f.caseSensitive,
          }))
        );
      }

      // Add category names as attribute (in addition to folder structure)
      const categoryNames = categoryNameMap.get(subscription.id) || [];
      if (categoryNames.length > 0) {
        filterData.tuvixCategories = JSON.stringify(categoryNames);
      }

      outlines.push({
        type: "rss",
        text: title,
        title: title,
        xmlUrl: source.url,
        htmlUrl: source.siteUrl || undefined,
        ...filterData,
      });
    }

    // Build OPML document structure
    const opmlDoc: Opml.Document<Date> = {
      head: {
        title: "TuvixRSS Subscriptions",
        dateCreated: new Date(),
      },
      body: {
        outlines,
      },
    };

    // Generate OPML XML using feedsmith
    return generateOpml(opmlDoc, {
      extraOutlineAttributes: [
        "tuvixFilterEnabled",
        "tuvixFilterMode",
        "tuvixFilters",
        "tuvixCategories",
      ],
    });
  }),

  /**
   * Parse OPML file (preview before import)
   */
  parseOpml: rateLimitedProcedure
    .input(
      z.object({
        opmlContent: z
          .string()
          .min(1)
          .max(STRING_LIMITS.OPML_CONTENT.max, {
            message: `OPML file is too large (max ${STRING_LIMITS.OPML_CONTENT.max / 1000000}MB)`,
          }),
      })
    )
    .output(
      z.object({
        feeds: z.array(
          z.object({
            url: z.string(),
            title: z.string(),
            categories: z.array(z.string()),
            filters: z
              .array(
                z.object({
                  field: z.enum([
                    "title",
                    "content",
                    "description",
                    "author",
                    "any",
                  ]),
                  matchType: z.enum(["contains", "regex", "exact"]),
                  pattern: z.string(),
                  caseSensitive: z.boolean(),
                })
              )
              .optional(),
            filterEnabled: z.boolean().optional(),
            filterMode: z.enum(["include", "exclude"]).optional(),
          })
        ),
        totalCount: z.number(),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const { parseOpml } = await import("feedsmith");

      // Type for OPML outline structure with custom Tuvix attributes
      // This extends the feedsmith Opml.Outline type with our custom attributes
      type OPMLOutlineWithExtensions = Opml.Outline<string> & {
        // Custom Tuvix attributes (parsed as strings from XML)
        tuvixFilterEnabled?: string;
        tuvixFilterMode?: string;
        tuvixFilters?: string;
        tuvixCategories?: string;
        // Legacy attribute names (for compatibility)
        filterEnabled?: string;
        filterMode?: string;
        filters?: string;
        categories?: string;
        // Recursive outlines
        outlines?: OPMLOutlineWithExtensions[];
      };

      // Parse OPML using feedsmith with extra attributes for filters and categories
      // The extraOutlineAttributes option adds these attributes to the parsed outlines,
      // but TypeScript doesn't know about them, so we need to assert the type
      let opmlData: Opml.Document<string> & {
        body: { outlines: OPMLOutlineWithExtensions[] };
      };
      try {
        const parsed = parseOpml(input.opmlContent, {
          extraOutlineAttributes: [
            "tuvixFilterEnabled",
            "tuvixFilterMode",
            "tuvixFilters",
            "tuvixCategories",
            "filterEnabled",
            "filterMode",
            "filters",
            "categories",
          ],
        });
        // Type assertion: parseOpml with extraOutlineAttributes returns outlines
        // with those attributes, but TypeScript doesn't track this
        opmlData = parsed as typeof opmlData;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to parse OPML: ${error instanceof Error ? error.message : "Invalid OPML format"}`,
        });
      }

      // Extract feeds from OPML structure
      const feeds: {
        url: string;
        title: string;
        categories: string[];
        filters?: FilterData[];
        filterEnabled?: boolean;
        filterMode?: "include" | "exclude";
      }[] = [];

      // Recursive function to traverse OPML outlines
      const traverseOutlines = (
        outlines: OPMLOutlineWithExtensions[],
        parentCategories: string[] = []
      ) => {
        for (const outline of outlines) {
          // Check if this is a feed or a category
          if (outline.xmlUrl) {
            // This is a feed - extract filter data
            const filterEnabledStr =
              outline.tuvixFilterEnabled ?? outline.filterEnabled;
            const filterModeStr = outline.tuvixFilterMode ?? outline.filterMode;
            const filtersJson = outline.tuvixFilters ?? outline.filters;
            const categoriesJson =
              outline.tuvixCategories ?? outline.categories;

            const filters = parseFiltersJson(filtersJson);
            const filterEnabled = filterEnabledStr
              ? parseBoolean(filterEnabledStr)
              : undefined;
            const filterMode = filterModeStr
              ? (filterModeStr as "include" | "exclude")
              : undefined;

            // Parse categories from attribute, merge with folder-based categories
            const attributeCategories =
              parseCategoriesJson(categoriesJson) || [];
            // Merge: folder-based categories come first, then attribute categories
            // Remove duplicates while preserving order (case-insensitive)
            const seenLower = new Set<string>();
            const allCategories: string[] = [];
            for (const cat of [...parentCategories, ...attributeCategories]) {
              const lower = cat.toLowerCase();
              if (!seenLower.has(lower)) {
                seenLower.add(lower);
                allCategories.push(cat);
              }
            }

            feeds.push({
              url: outline.xmlUrl,
              title: outline.title || outline.text || "Untitled Feed",
              categories: allCategories,
              // Include filters if they exist (even if empty array after filtering invalid ones)
              ...(filters !== null ? { filters } : {}),
              ...(filterEnabled !== undefined ? { filterEnabled } : {}),
              ...(filterMode ? { filterMode } : {}),
            });
          } else if (outline.outlines && outline.outlines.length > 0) {
            // This is a category folder
            const categoryName =
              outline.title || outline.text || "Uncategorized";
            traverseOutlines(outline.outlines, [
              ...parentCategories,
              categoryName,
            ]);
          }
        }
      };

      // Start traversal from body outlines
      if (opmlData.body && opmlData.body.outlines) {
        traverseOutlines(opmlData.body.outlines);
      }

      return {
        feeds,
        totalCount: feeds.length,
      };
    }),

  /**
   * Start OPML import (synchronous for now)
   */
  import: rateLimitedProcedure
    .input(
      z.object({
        opmlContent: z
          .string()
          .min(1)
          .max(STRING_LIMITS.OPML_CONTENT.max, {
            message: `OPML file is too large (max ${STRING_LIMITS.OPML_CONTENT.max / 1000000}MB)`,
          }),
        selectedUrls: z.array(urlValidator).max(1000).optional(),
      })
    )
    .output(
      z.object({
        successCount: z.number(),
        errorCount: z.number(),
        errors: z.array(z.object({ url: z.string(), error: z.string() })),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;
      const { parseOpml, parseFeed } = await import("feedsmith");

      // Type for OPML outline structure with custom Tuvix attributes
      // This extends the feedsmith Opml.Outline type with our custom attributes
      type OPMLOutlineWithExtensions = Opml.Outline<string> & {
        // Custom Tuvix attributes (parsed as strings from XML)
        tuvixFilterEnabled?: string | boolean;
        tuvixFilterMode?: string;
        tuvixFilters?: string;
        tuvixCategories?: string;
        // Legacy attribute names (for compatibility)
        filterEnabled?: string | boolean;
        filterMode?: string;
        filters?: string;
        categories?: string;
        // Recursive outlines
        outlines?: OPMLOutlineWithExtensions[];
      };

      // Parse OPML with extra attributes for filters and categories
      // The extraOutlineAttributes option adds these attributes to the parsed outlines,
      // but TypeScript doesn't know about them, so we need to assert the type
      let opmlData: Opml.Document<string> & {
        body: { outlines: OPMLOutlineWithExtensions[] };
      };
      try {
        const parsed = parseOpml(input.opmlContent, {
          extraOutlineAttributes: [
            "tuvixFilterEnabled",
            "tuvixFilterMode",
            "tuvixFilters",
            "tuvixCategories",
            "filterEnabled",
            "filterMode",
            "filters",
            "categories",
          ],
        });
        // Type assertion: parseOpml with extraOutlineAttributes returns outlines
        // with those attributes, but TypeScript doesn't track this
        opmlData = parsed as typeof opmlData;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to parse OPML: ${error instanceof Error ? error.message : "Invalid OPML format"}`,
        });
      }

      // Extract feeds from OPML
      const feedsToImport: {
        url: string;
        title: string;
        categories: string[];
        filters?: FilterData[];
        filterEnabled?: boolean;
        filterMode?: "include" | "exclude";
      }[] = [];

      const traverseOutlines = (
        outlines: OPMLOutlineWithExtensions[],
        parentCategories: string[] = []
      ) => {
        for (const outline of outlines) {
          if (outline.xmlUrl) {
            // Extract filter data
            const filterEnabledStr =
              outline.tuvixFilterEnabled ?? outline.filterEnabled;
            const filterModeStr = outline.tuvixFilterMode ?? outline.filterMode;
            const filtersJson = outline.tuvixFilters ?? outline.filters;
            const categoriesJson =
              outline.tuvixCategories ?? outline.categories;

            const filters = parseFiltersJson(filtersJson);
            const filterEnabled = filterEnabledStr
              ? parseBoolean(filterEnabledStr)
              : undefined;
            const filterMode = filterModeStr
              ? (filterModeStr as "include" | "exclude")
              : undefined;

            // Parse categories from attribute, merge with folder-based categories
            const attributeCategories =
              parseCategoriesJson(categoriesJson) || [];
            // Merge: folder-based categories come first, then attribute categories
            // Remove duplicates while preserving order (case-insensitive)
            const seenLower = new Set<string>();
            const allCategories: string[] = [];
            for (const cat of [...parentCategories, ...attributeCategories]) {
              const lower = cat.toLowerCase();
              if (!seenLower.has(lower)) {
                seenLower.add(lower);
                allCategories.push(cat);
              }
            }

            feedsToImport.push({
              url: outline.xmlUrl,
              title: outline.title || outline.text || "Untitled Feed",
              categories: allCategories,
              ...(filters && filters.length > 0 ? { filters } : {}),
              ...(filterEnabled !== undefined ? { filterEnabled } : {}),
              ...(filterMode ? { filterMode } : {}),
            });
          } else if (outline.outlines && outline.outlines.length > 0) {
            const categoryName =
              outline.title || outline.text || "Uncategorized";
            traverseOutlines(outline.outlines, [
              ...parentCategories,
              categoryName,
            ]);
          }
        }
      };

      if (opmlData.body && opmlData.body.outlines) {
        traverseOutlines(opmlData.body.outlines);
      }

      // Filter by selected URLs if provided
      const feedsToProcess = input.selectedUrls
        ? feedsToImport.filter((f) => input.selectedUrls!.includes(f.url))
        : feedsToImport;

      let successCount = 0;
      let errorCount = 0;
      const errors: { url: string; error: string }[] = [];

      // Wrap entire OPML import in Sentry transaction for monitoring
      await Sentry.startSpan(
        {
          op: "opml.import",
          name: "OPML Import",
          attributes: {
            "opml.total_feeds": feedsToProcess.length,
            "opml.user_id": userId,
          },
        },
        async (importSpan) => {
          // Process each feed
          let shouldStopImporting = false;
          for (const feedInfo of feedsToProcess) {
            if (shouldStopImporting) {
              break; // Stop processing remaining feeds if limit reached
            }

            // Create a span for each feed import
            await Sentry.startSpan(
              {
                op: "opml.import_feed",
                name: `Import Feed: ${feedInfo.title}`,
                attributes: {
                  "feed.url": feedInfo.url,
                  "feed.title": feedInfo.title,
                  "feed.domain": extractDomain(feedInfo.url) || "unknown",
                  "feed.has_filters": feedInfo.filters
                    ? feedInfo.filters.length > 0
                    : false,
                  "feed.categories_count": feedInfo.categories.length,
                },
              },
              async (feedSpan) => {
                try {
                  // Fetch and validate feed
                  const response = await fetch(feedInfo.url, {
                    headers: {
                      "User-Agent": "TuvixRSS/1.0",
                      Accept:
                        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
                    },
                    signal: AbortSignal.timeout(15000),
                  });

                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                  }

                  const feedContent = await response.text();
                  const feedResult = parseFeed(feedContent);
                  const feedData = feedResult.feed;

                  // Extract metadata
                  const feedTitle =
                    "title" in feedData && feedData.title
                      ? feedData.title
                      : feedInfo.title;
                  const feedDescription =
                    "description" in feedData && feedData.description
                      ? stripHtml(feedData.description)
                      : "subtitle" in feedData && feedData.subtitle
                        ? stripHtml(feedData.subtitle)
                        : undefined;
                  const siteUrl =
                    "link" in feedData && feedData.link
                      ? feedData.link
                      : "links" in feedData &&
                          Array.isArray(feedData.links) &&
                          feedData.links[0]?.href
                        ? feedData.links[0].href
                        : undefined;

                  // Check if source exists
                  // Normalize Reddit URLs to prevent duplicates across different domains
                  const normalizedFeedUrl = normalizeRedditUrl(feedInfo.url);

                  const existingSources = await ctx.db
                    .select()
                    .from(schema.sources)
                    .where(eq(schema.sources.url, normalizedFeedUrl))
                    .limit(1);

                  let sourceId: number;

                  if (existingSources.length > 0) {
                    sourceId = existingSources[0].id;
                    await ctx.db
                      .update(schema.sources)
                      .set({
                        title: feedTitle,
                        description: feedDescription,
                        siteUrl,
                        lastFetched: new Date(),
                      })
                      .where(eq(schema.sources.id, sourceId));
                  } else {
                    const newSource = await ctx.db
                      .insert(schema.sources)
                      .values({
                        url: normalizedFeedUrl,
                        title: feedTitle,
                        description: feedDescription,
                        siteUrl,
                        iconType: "auto",
                        lastFetched: new Date(),
                      })
                      .returning();
                    sourceId = newSource[0].id;
                  }

                  // Check if already subscribed
                  const existingSubscription = await ctx.db
                    .select()
                    .from(schema.subscriptions)
                    .where(
                      and(
                        eq(schema.subscriptions.userId, userId),
                        eq(schema.subscriptions.sourceId, sourceId)
                      )
                    )
                    .limit(1);

                  if (existingSubscription.length > 0) {
                    // Already subscribed, skip
                    successCount++;

                    // Mark span as successful (already exists)
                    feedSpan.setAttribute("feed.status", "already_exists");
                    feedSpan.setStatus({
                      code: 1,
                      message: "already subscribed",
                    });
                    return; // Return from span callback (equivalent to continue)
                  }

                  // Check source limit before creating subscription
                  const limitCheck = await checkSourceLimit(ctx.db, userId);
                  if (!limitCheck.allowed) {
                    // Limit reached, stop importing
                    errorCount++;
                    errors.push({
                      url: feedInfo.url,
                      error: `Source limit reached (${limitCheck.limit}/${limitCheck.limit}). Remaining feeds not imported.`,
                    });

                    // Mark span as failed due to limit
                    feedSpan.setAttribute("feed.status", "limit_reached");
                    feedSpan.setStatus({
                      code: 2,
                      message: "source limit reached",
                    });

                    shouldStopImporting = true; // Signal to stop processing remaining feeds
                    return; // Return from span callback
                  }

                  // Determine filter settings from OPML data
                  const filterEnabled =
                    feedInfo.filterEnabled !== undefined
                      ? feedInfo.filterEnabled
                      : feedInfo.filters && feedInfo.filters.length > 0
                        ? true
                        : false;
                  const filterMode = feedInfo.filterMode || "include";

                  // Create subscription
                  const newSubscription = await ctx.db
                    .insert(schema.subscriptions)
                    .values({
                      userId,
                      sourceId,
                      customTitle: null,
                      filterEnabled,
                      filterMode,
                    })
                    .returning();

                  const subscriptionId = newSubscription[0].id;

                  // Create/link categories (using normalization helper to prevent duplicates)
                  if (feedInfo.categories.length > 0) {
                    // Track category IDs to prevent duplicate links
                    const linkedCategoryIds = new Set<number>();

                    for (const categoryName of feedInfo.categories) {
                      // Use findOrCreateCategory for case-insensitive normalization
                      const categoryId = await findOrCreateCategory(
                        ctx.db,
                        schema.categories,
                        userId,
                        categoryName,
                        generateColorFromString
                      );

                      // Only link if we haven't already linked this category
                      if (!linkedCategoryIds.has(categoryId)) {
                        linkedCategoryIds.add(categoryId);
                        await ctx.db
                          .insert(schema.subscriptionCategories)
                          .values({
                            subscriptionId,
                            categoryId,
                          });
                      }
                    }
                  }

                  // Create filters if provided
                  if (feedInfo.filters && feedInfo.filters.length > 0) {
                    for (const filter of feedInfo.filters) {
                      try {
                        // Validate regex pattern if matchType is 'regex'
                        if (filter.matchType === "regex") {
                          try {
                            new RegExp(filter.pattern);
                          } catch (regexError) {
                            // Invalid regex - skip this filter but continue
                            errors.push({
                              url: feedInfo.url,
                              error: `Invalid regex pattern in filter: ${regexError instanceof Error ? regexError.message : "Unknown error"}`,
                            });
                            continue;
                          }
                        }

                        // Insert filter directly (more efficient than API call)
                        await ctx.db.insert(schema.subscriptionFilters).values({
                          subscriptionId,
                          field: filter.field,
                          matchType: filter.matchType,
                          pattern: filter.pattern,
                          caseSensitive: filter.caseSensitive,
                        });
                      } catch (filterError) {
                        // Filter creation failed - log error but continue
                        errors.push({
                          url: feedInfo.url,
                          error: `Failed to create filter: ${filterError instanceof Error ? filterError.message : "Unknown error"}`,
                        });
                        // Continue with next filter
                      }
                    }
                  }

                  successCount++;

                  // Mark span as successful
                  feedSpan.setAttribute("feed.status", "success");
                  feedSpan.setStatus({ code: 1, message: "ok" });
                } catch (error) {
                  errorCount++;
                  const errorMessage =
                    error instanceof Error ? error.message : "Unknown error";

                  errors.push({
                    url: feedInfo.url,
                    error: errorMessage,
                  });

                  // Mark span as failed
                  feedSpan.setAttribute("feed.status", "error");
                  feedSpan.setAttribute("feed.error", errorMessage);
                  feedSpan.setStatus({
                    code: 2,
                    message: "feed import failed",
                  });

                  // Capture exception for this specific feed
                  await Sentry.captureException(error, {
                    level: "warning",
                    tags: {
                      operation: "opml_import_feed",
                      domain: extractDomain(feedInfo.url) || "unknown",
                    },
                    extra: {
                      feed_url: feedInfo.url,
                      feed_title: feedInfo.title,
                      user_id: userId,
                    },
                  });
                }
              }
            );
          }

          // Set final status on import span
          importSpan.setAttribute("opml.success_count", successCount);
          importSpan.setAttribute("opml.error_count", errorCount);
          importSpan.setAttribute(
            "opml.success_rate",
            feedsToProcess.length > 0 ? successCount / feedsToProcess.length : 0
          );

          if (errorCount === 0) {
            importSpan.setStatus({ code: 1, message: "ok" });
          } else if (successCount === 0) {
            importSpan.setStatus({ code: 2, message: "all feeds failed" });
          } else {
            importSpan.setStatus({ code: 1, message: "partial success" });
          }
        }
      );

      // Recalculate usage stats to ensure accuracy after bulk import
      await recalculateUsage(ctx.db, userId);

      return {
        successCount,
        errorCount,
        errors,
      };
    }),

  /**
   * Get import job status (not needed for synchronous imports)
   */
  importStatus: rateLimitedProcedure
    .input(z.object({ jobId: z.string() }))
    .output(ImportJobSchema)
    .query(async ({ ctx: _ctx, input: _input }) => {
      // Since we're doing synchronous imports, this is not used
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Import jobs are processed synchronously",
      });
    }),

  /**
   * List filters for a subscription
   */
  listFilters: rateLimitedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .output(z.array(selectSubscriptionFilterSchema))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify subscription belongs to user
      await requireOwnership<typeof schema.subscriptions.$inferSelect>(
        ctx.db,
        schema.subscriptions,
        input.subscriptionId,
        userId,
        "Subscription"
      );

      // Get filters
      const filters = await ctx.db
        .select()
        .from(schema.subscriptionFilters)
        .where(
          eq(schema.subscriptionFilters.subscriptionId, input.subscriptionId)
        );

      return filters.map(transformSubscriptionFilter);
    }),

  /**
   * Create content filter for subscription
   */
  createFilter: rateLimitedProcedure
    .input(
      z.object({
        subscriptionId: z.number(),
        field: z.enum(["title", "content", "description", "author", "any"]),
        matchType: z.enum(["contains", "regex", "exact"]),
        pattern: z
          .string()
          .min(1)
          .max(STRING_LIMITS.FILTER_PATTERN.max, {
            message: `Pattern must not exceed ${STRING_LIMITS.FILTER_PATTERN.max} characters`,
          }),
        caseSensitive: z.boolean().default(false),
      })
    )
    .output(selectSubscriptionFilterSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify subscription belongs to user
      const subscription = await requireOwnership<
        typeof schema.subscriptions.$inferSelect
      >(
        ctx.db,
        schema.subscriptions,
        input.subscriptionId,
        userId,
        "Subscription"
      );

      // Validate regex if matchType is 'regex'
      if (input.matchType === "regex") {
        try {
          new RegExp(input.pattern);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid regex pattern: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
      }

      // Insert filter
      const newFilter = await ctx.db
        .insert(schema.subscriptionFilters)
        .values({
          subscriptionId: input.subscriptionId,
          field: input.field,
          matchType: input.matchType,
          pattern: input.pattern,
          caseSensitive: input.caseSensitive,
        })
        .returning();

      // Enable filters on subscription if not already
      if (!subscription.filterEnabled) {
        await ctx.db
          .update(schema.subscriptions)
          .set({ filterEnabled: true })
          .where(eq(schema.subscriptions.id, input.subscriptionId));
      }

      return transformSubscriptionFilter(newFilter[0]);
    }),

  /**
   * Update content filter
   */
  updateFilter: rateLimitedProcedure
    .input(
      z.object({
        subscriptionId: z.number(),
        filterId: z.number(),
        field: z
          .enum(["title", "content", "description", "author", "any"])
          .optional(),
        matchType: z.enum(["contains", "regex", "exact"]).optional(),
        pattern: z
          .string()
          .max(STRING_LIMITS.FILTER_PATTERN.max, {
            message: `Pattern must not exceed ${STRING_LIMITS.FILTER_PATTERN.max} characters`,
          })
          .optional(),
        caseSensitive: z.boolean().optional(),
      })
    )
    .output(selectSubscriptionFilterSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify subscription belongs to user
      await requireOwnership<typeof schema.subscriptions.$inferSelect>(
        ctx.db,
        schema.subscriptions,
        input.subscriptionId,
        userId,
        "Subscription"
      );

      // Verify filter exists and belongs to subscription
      const existingFilter = await ctx.db
        .select()
        .from(schema.subscriptionFilters)
        .where(
          and(
            eq(schema.subscriptionFilters.id, input.filterId),
            eq(schema.subscriptionFilters.subscriptionId, input.subscriptionId)
          )
        )
        .limit(1);

      if (!existingFilter.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Filter not found",
        });
      }

      // Build update object
      const updates: Partial<typeof schema.subscriptionFilters.$inferInsert> =
        {};
      if (input.field !== undefined) updates.field = input.field;
      if (input.matchType !== undefined) updates.matchType = input.matchType;
      if (input.pattern !== undefined) updates.pattern = input.pattern;
      if (input.caseSensitive !== undefined)
        updates.caseSensitive = input.caseSensitive;

      // Validate regex if updating to regex matchType
      const finalMatchType = input.matchType || existingFilter[0].matchType;
      const finalPattern = input.pattern || existingFilter[0].pattern;

      if (finalMatchType === "regex") {
        try {
          new RegExp(finalPattern);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid regex pattern: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
      }

      // Update filter
      const updatedFilter = await ctx.db
        .update(schema.subscriptionFilters)
        .set(updates)
        .where(eq(schema.subscriptionFilters.id, input.filterId))
        .returning();

      return transformSubscriptionFilter(updatedFilter[0]);
    }),

  /**
   * Delete content filter
   */
  deleteFilter: rateLimitedProcedure
    .input(
      z.object({
        subscriptionId: z.number(),
        filterId: z.number(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Verify subscription belongs to user
      await requireOwnership<typeof schema.subscriptions.$inferSelect>(
        ctx.db,
        schema.subscriptions,
        input.subscriptionId,
        userId,
        "Subscription"
      );

      // Delete filter
      await ctx.db
        .delete(schema.subscriptionFilters)
        .where(
          and(
            eq(schema.subscriptionFilters.id, input.filterId),
            eq(schema.subscriptionFilters.subscriptionId, input.subscriptionId)
          )
        );

      return { success: true };
    }),

  /**
   * Get suggested categories from RSS feed data
   */
  getSuggestedCategories: rateLimitedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .output(z.array(CategorySuggestionSchema))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx.user;

      // Get subscription and source
      const result = await ctx.db
        .select()
        .from(schema.subscriptions)
        .innerJoin(
          schema.sources,
          eq(schema.subscriptions.sourceId, schema.sources.id)
        )
        .where(
          and(
            eq(schema.subscriptions.id, input.subscriptionId),
            eq(schema.subscriptions.userId, userId)
          )
        )
        .limit(1);

      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Subscription not found or not accessible",
        });
      }

      const source = result[0].sources;

      // Use category discovery service
      try {
        const categorySuggestions = await fetchAndDiscoverCategories(
          source.url
        );

        // Convert to expected format with colors
        const suggestions = categorySuggestions.map((cat) => ({
          name: cat.name,
          count: Math.round(cat.confidence * 100), // Convert confidence to count-like number
          color: generateColorFromString(cat.name),
        }));

        return suggestions.slice(0, 10); // Top 10
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to fetch feed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});
