import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { vi } from "vitest";
import type { RouterOutputs } from "@/lib/api/trpc";
import type { useCurrentUser } from "@/lib/hooks/useAuth";

type Article = RouterOutputs["articles"]["list"]["items"][number];
type Subscription = RouterOutputs["subscriptions"]["list"]["items"][number];
const date = new Date("2026-01-01T00:00:00Z");
const source: Article["source"] = {
  id: 1,
  title: "Test Source",
  url: "https://example.com/feed",
  description: null,
  siteUrl: null,
  iconUrl: null,
  iconType: "auto",
  iconUpdatedAt: null,
  lastFetched: null,
  createdAt: date,
  updatedAt: date,
};

export function createArticle(
  overrides: Omit<Partial<Article>, "source"> & {
    source?: Partial<Article["source"]>;
  } = {}
): Article {
  return {
    id: 1,
    sourceId: 1,
    guid: "test-guid",
    title: "Test Article",
    link: "https://example.com/article",
    description: null,
    content: null,
    author: null,
    imageUrl: null,
    audioUrl: null,
    commentLink: null,
    publishedAt: date,
    createdAt: date,
    read: false,
    saved: false,
    audioProgress: null,
    ...overrides,
    source: { ...source, ...overrides.source },
  };
}

export function createSubscriptionsResult(
  items: (Omit<Partial<Subscription>, "source"> & {
    source?: Partial<Subscription["source"]>;
  })[]
) {
  const data: RouterOutputs["subscriptions"]["list"] = {
    items: items.map((item) => ({
      id: 1,
      userId: 1,
      sourceId: 1,
      customTitle: null,
      filterEnabled: false,
      filterMode: "include",
      createdAt: date,
      updatedAt: date,
      categories: [],
      filters: [],
      ...item,
      source: {
        ...source,
        fetchHealth: {
          lastFetchAttemptAt: null,
          nextFetchAt: null,
          lastFetchError: null,
          consecutiveFetchFailures: 0,
        },
        ...item.source,
      },
    })),
    total: items.length,
    hasMore: false,
  };
  return new QueryObserver<typeof data>(new QueryClient(), {
    queryKey: ["fixture"],
    initialData: data,
  }).getCurrentResult();
}

type SessionResult = ReturnType<typeof useCurrentUser>;
type SessionUser = NonNullable<SessionResult["data"]>["user"];
export function createSessionResult(user: Partial<SessionUser>): SessionResult {
  return {
    data: {
      user: {
        id: "1",
        name: "Test User",
        username: "testuser",
        email: "test@example.com",
        emailVerified: true,
        role: "user",
        plan: "free",
        banned: false,
        createdAt: date,
        updatedAt: date,
        ...user,
      },
      session: {
        id: "1",
        userId: "1",
        token: "test-session",
        expiresAt: date,
        createdAt: date,
        updatedAt: date,
      },
    },
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(async () => {}),
  };
}
