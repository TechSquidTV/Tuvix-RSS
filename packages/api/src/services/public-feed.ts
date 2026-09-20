import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "@api/db/schema";
import type { Context } from "@api/trpc/context";
import { fetchSubscriptionFilters } from "@api/db/transformers";
import { matchesSubscriptionFilters } from "./article-filters";
import { getUserLimits } from "./limits";
import { checkPublicFeedRateLimit } from "./rate-limiter";
import { generateRSS } from "./xml-generator";

/** Both HTTP and tRPC use this path, including limits, filters and access logs. */
export async function generatePublicFeed(
  ctx: Context,
  input: { username: string; slug: string }
): Promise<string> {
  const [user] = await ctx.db
    .select()
    .from(schema.user)
    .where(eq(schema.user.username, input.username))
    .limit(1);
  if (!user)
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  const [feed] = await ctx.db
    .select()
    .from(schema.feeds)
    .where(
      and(
        eq(schema.feeds.userId, user.id),
        eq(schema.feeds.slug, input.slug),
        eq(schema.feeds.public, true)
      )
    )
    .limit(1);
  if (!feed)
    throw new TRPCError({ code: "NOT_FOUND", message: "Feed not found" });

  const limits = await getUserLimits(ctx.db, user.id);
  const limit = await checkPublicFeedRateLimit(
    ctx.env,
    user.id,
    user.plan ?? "free",
    limits.publicFeedRateLimitPerMinute
  );
  if (!limit.allowed)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded",
    });

  const categoryCondition = sql`(NOT EXISTS (SELECT 1 FROM feed_categories WHERE feed_id = ${feed.id})
    OR EXISTS (SELECT 1 FROM subscription_categories sc
      JOIN feed_categories fc ON fc.category_id = sc.category_id
      WHERE fc.feed_id = ${feed.id} AND sc.subscription_id = ${schema.subscriptions.id}))`;
  const subscriptions = await ctx.db
    .select()
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, user.id), categoryCondition));
  const bySource = new Map(
    subscriptions.map((subscription) => [subscription.sourceId, subscription])
  );
  const filters = await fetchSubscriptionFilters(
    ctx.db,
    subscriptions.filter((s) => s.filterEnabled).map((s) => s.id)
  );
  const articles: (typeof schema.articles.$inferSelect)[] = [];
  let offset = 0;
  while (subscriptions.length > 0 && articles.length < 50) {
    const rows = await ctx.db
      .select()
      .from(schema.articles)
      .innerJoin(
        schema.subscriptions,
        and(
          eq(schema.subscriptions.sourceId, schema.articles.sourceId),
          eq(schema.subscriptions.userId, user.id)
        )
      )
      .where(categoryCondition)
      .orderBy(desc(schema.articles.publishedAt), desc(schema.articles.id))
      .limit(200)
      .offset(offset);
    for (const { articles: article } of rows) {
      const subscription = bySource.get(article.sourceId);
      if (
        subscription &&
        (!subscription.filterEnabled ||
          matchesSubscriptionFilters(
            article,
            filters.get(subscription.id) ?? [],
            subscription.filterMode
          ))
      ) {
        articles.push(article);
        if (articles.length === 50) break;
      }
    }
    if (rows.length < 200) break;
    offset += rows.length;
  }
  const baseUrl = (
    ctx.env.API_URL ||
    ctx.env.BETTER_AUTH_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
  const feedUrl = `${baseUrl}/public/${encodeURIComponent(input.username)}/${encodeURIComponent(input.slug)}`;
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
  try {
    await ctx.db.insert(schema.publicFeedAccessLog).values({
      feedId: feed.id,
      ipAddress:
        ctx.headers["cf-connecting-ip"] ||
        ctx.headers["x-forwarded-for"]?.split(",")[0] ||
        "unknown",
      userAgent: ctx.headers["user-agent"] || null,
      accessedAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to log feed access:", error);
  }
  return xml;
}
