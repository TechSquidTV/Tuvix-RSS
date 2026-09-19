import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "@api/auth/better-auth";
import * as dbClient from "@api/db/client";
import { initializeAdmin } from "@api/services/admin-init";
import { appRouter } from "@api/trpc/router";
import type { Context } from "@api/trpc/context";
import type { Env } from "@api/types";
import * as schema from "@api/db/schema";
import { createTestDb, seedGlobalSettings } from "@api/test/setup";

vi.mock("@api/services/email", () => ({
  sendWelcomeEmail: vi.fn(async () => ({ success: true })),
  sendVerificationEmail: vi.fn(async () => ({ success: true })),
  sendPasswordResetEmail: vi.fn(async () => ({ success: true })),
}));

describe("Review regression coverage", () => {
  let db: ReturnType<typeof createTestDb>;
  const env: Env = {
    RUNTIME: "nodejs",
    BETTER_AUTH_SECRET: "review-only-secret-at-least-32-characters-long",
    BETTER_AUTH_URL: "http://localhost:3001",
    BASE_URL: "http://localhost:5173",
    CORS_ORIGIN: "http://localhost:5173",
    ALLOW_FIRST_USER_ADMIN: "true",
    SKIP_RATE_LIMIT: "true",
  };

  beforeEach(async () => {
    db = createTestDb();
    await seedGlobalSettings(db);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    db.$client.close();
  });

  function authRequest(path: string, body: Record<string, string>) {
    return createAuth(env, db).handler(
      new Request(`http://localhost:3001/api/auth/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify(body),
      })
    );
  }
  const credentials = {
    email: "review@example.com",
    username: "reviewuser",
    name: "reviewuser",
    password: "ReviewPass123!",
  };

  it("native signup initializes the first administrator and settings", async () => {
    const response = await authRequest("sign-up/email", credentials);
    expect(response.status).toBe(200);
    const [user] = await db.select().from(schema.user);
    expect(user?.role).toBe("admin");
    expect(await db.select().from(schema.userSettings)).toHaveLength(1);
    expect(await db.select().from(schema.usageStats)).toHaveLength(1);
  });

  it("disabled registration returns HTTP 403", async () => {
    await db
      .update(schema.globalSettings)
      .set({ allowRegistration: false })
      .where(eq(schema.globalSettings.id, 1));
    const response = await authRequest("sign-up/email", credentials);
    expect(response.status).toBe(403);
    expect(await db.select().from(schema.user)).toHaveLength(0);
  });

  it("native login enforces persisted attempt limits", async () => {
    await authRequest("sign-up/email", credentials);
    await db
      .update(schema.globalSettings)
      .set({ maxLoginAttempts: 2 })
      .where(eq(schema.globalSettings.id, 1));
    await db.delete(schema.authRateLimits);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      statuses.push(
        (
          await authRequest("sign-in/email", {
            email: credentials.email,
            password: "wrong-password",
          })
        ).status
      );
    }
    expect(statuses).toEqual([401, 401, 429, 429]);
  });

  async function caller() {
    const [user] = await db
      .insert(schema.user)
      .values({
        name: "reader",
        username: "reader",
        email: "reader@example.com",
        emailVerified: true,
      })
      .returning();
    if (!user) throw new Error("Missing fixture user");
    const ctx: Context = {
      db,
      env,
      user: { userId: user.id, username: "reader", role: "user" },
      headers: {},
      req: new Request("http://localhost:3001/trpc"),
      cache: {},
    };
    return { user, api: appRouter.createCaller(ctx) };
  }

  it("public RSS respects subscription filters", async () => {
    const { user, api } = await caller();
    const [source] = await db
      .insert(schema.sources)
      .values({ url: "https://example.com/feed", title: "Fixture" })
      .returning();
    if (!source) throw new Error("Missing fixture source");
    const [subscription] = await db
      .insert(schema.subscriptions)
      .values({
        userId: user.id,
        sourceId: source.id,
        filterEnabled: true,
        filterMode: "exclude",
      })
      .returning();
    if (!subscription) throw new Error("Missing fixture subscription");
    await db.insert(schema.subscriptionFilters).values({
      subscriptionId: subscription.id,
      field: "title",
      matchType: "contains",
      pattern: "Excluded",
      caseSensitive: false,
    });
    await db.insert(schema.articles).values({
      sourceId: source.id,
      guid: "fixture-guid",
      title: "Excluded article",
      link: "https://example.com/article",
    });
    await db.insert(schema.feeds).values({
      userId: user.id,
      slug: "feed",
      title: "Public Feed",
      public: true,
    });
    expect((await api.articles.list({})).items).toHaveLength(0);
    expect(
      await api.feeds.getPublicXml({ username: "reader", slug: "feed" })
    ).not.toContain("Excluded article");
  });

  it("feed preview rejects loopback before fetching", async () => {
    const { api } = await caller();
    const fetchMock = vi.fn(
      async () => new Response("not a feed", { status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      api.subscriptions.preview({ url: "http://127.0.0.1:8080/private" })
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mark-all-read updates all unread articles and is idempotent", async () => {
    const { user, api } = await caller();
    const [source] = await db
      .insert(schema.sources)
      .values({ url: "https://example.com/bulk-feed", title: "Fixture" })
      .returning();
    if (!source) throw new Error("Missing fixture source");
    await db
      .insert(schema.subscriptions)
      .values({ userId: user.id, sourceId: source.id });
    for (let index = 0; index < 1001; index++) {
      await db.insert(schema.articles).values({
        sourceId: source.id,
        guid: `bulk-${index}`,
        title: `Article ${index}`,
      });
    }
    expect(await api.articles.markAllRead({})).toEqual({ updated: 1001 });
    expect(await api.articles.markAllRead({})).toEqual({ updated: 0 });
    const unread = await api.articles.list({ read: false });
    expect(unread.items).toHaveLength(0);
  });

  it("Cloudflare admin initialization uses the supplied database", async () => {
    const createDatabase = vi
      .spyOn(dbClient, "createDatabase")
      .mockReturnValue(db);
    const result = await initializeAdmin(db, {
      ...env,
      RUNTIME: "cloudflare",
      ADMIN_USERNAME: "initialadmin",
      ADMIN_EMAIL: "initialadmin@example.com",
      ADMIN_PASSWORD: "AdminReview123!",
    });
    expect(result.created).toBe(true);
    expect(createDatabase).not.toHaveBeenCalled();
  });
  it("tRPC authentication forwards session cookies", async () => {
    await caller();
    const responseHeaders = new Headers();
    const api = appRouter.createCaller({
      db,
      env,
      user: null,
      headers: {},
      req: new Request("http://localhost:3001/trpc"),
      cache: {},
      responseHeaders,
    });
    await api.auth.register({
      email: "cookie@example.com",
      username: "cookieuser",
      password: "CookiePass123!",
    });
    expect(responseHeaders.get("set-cookie")).toContain("session_token=");
  });

  it("rejects foreign categories before creating a feed", async () => {
    const { api } = await caller();
    const [other] = await db
      .insert(schema.user)
      .values({ name: "other", username: "other", email: "other@example.com" })
      .returning();
    const [category] = await db
      .insert(schema.categories)
      .values({ userId: other!.id, name: "Private", color: "#123456" })
      .returning();
    await expect(
      api.feeds.create({
        slug: "invalid",
        title: "Invalid",
        public: true,
        categoryIds: [category!.id],
      })
    ).rejects.toThrow(/Category/);
    expect(await db.select().from(schema.feeds)).toHaveLength(0);
  });
  it("public XML requests through tRPC cannot bypass the feed rate limit", async () => {
    const { user } = await caller();
    await db.insert(schema.feeds).values({
      userId: user.id,
      slug: "limited",
      title: "Limited",
      public: true,
    });
    const limit = vi.fn(async () => ({ success: false }));
    const api = appRouter.createCaller({
      db,
      env: { ...env, RUNTIME: "cloudflare", FEED_RATE_LIMIT: { limit } },
      user: null,
      headers: {},
      req: new Request("https://api.example.com/trpc"),
      cache: {},
    });
    await expect(
      api.feeds.getPublicXml({ username: "reader", slug: "limited" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(limit).toHaveBeenCalledWith({ key: user.id.toString() });
  });

  it("rejects a stale administrator role after demotion", async () => {
    const { user } = await caller();
    const api = appRouter.createCaller({
      db,
      env,
      user: { userId: user.id, username: "reader", role: "admin" },
      headers: {},
      req: new Request("http://localhost:3001/trpc"),
      cache: {},
    });
    await expect(api.admin.listUsers({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
