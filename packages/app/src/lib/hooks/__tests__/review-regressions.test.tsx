import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";
import type { PropsWithChildren } from "react";
import { trpc } from "@/lib/api/trpc";
import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "@tuvixrss/api";
type RouterInputs = inferRouterInputs<AppRouter>;
type ArticleListInput = Exclude<RouterInputs["articles"]["list"], void>;
import { useSubscriptions } from "../useData";
import { useMarkArticleRead, useInfiniteArticles } from "../useArticles";
import { createArticle, createSubscriptionsResult } from "@/test/fixtures";

function setup() {
  const offsets: number[] = [];
  const articleCursors: Array<ArticleListInput["cursor"]> = [];
  const all = createSubscriptionsResult(
    Array.from({ length: 201 }, (_, i) => ({ id: i + 1 }))
  ).data!.items;
  const client = trpc.createClient({
    links: [
      () =>
        ({ op }) =>
          observable((observer) => {
            if (op.path === "subscriptions.list") {
              const { offset = 0, limit = 100 } = op.input as {
                offset?: number;
                limit?: number;
              };
              offsets.push(offset);
              observer.next({
                result: {
                  data: {
                    items: all.slice(offset, offset + limit),
                    total: Math.min(offset + limit + 1, all.length),
                    hasMore: offset + limit < all.length,
                  },
                },
              });
            } else if (op.path === "articles.list") {
              const input = op.input as ArticleListInput;
              articleCursors.push(input.cursor);
              observer.next({
                result: {
                  data: {
                    items: [createArticle({ id: input.cursor ? 2 : 1 })],
                    total: 2,
                    hasMore: !input.cursor,
                    nextCursor: input.cursor
                      ? null
                      : {
                          id: 1,
                          publishedAt: new Date("2026-01-01T00:00:00Z"),
                        },
                  },
                },
              });
            } else {
              observer.next({ result: { data: { success: true } } });
            }
            observer.complete();
          }),
    ],
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function wrapper({ children }: PropsWithChildren) {
    return (
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  return { queryClient, wrapper, offsets, articleCursors };
}

describe("review regressions", () => {
  it("uses the server ordering cursor for infinite articles", async () => {
    const { wrapper, queryClient, articleCursors } = setup();
    const { result, unmount } = renderHook(() => useInfiniteArticles(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(articleCursors).toEqual([
      undefined,
      { id: 1, publishedAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(
      result.current.data?.pages.flatMap((page) =>
        page.items.map((item) => item.id)
      )
    ).toEqual([1, 2]);
    expect(result.current.hasNextPage).toBe(false);
    unmount();
    queryClient.clear();
  });

  it("loads subscriptions beyond the first 100", async () => {
    const { wrapper, offsets, queryClient } = setup();
    const { result, unmount } = renderHook(useSubscriptions, { wrapper });
    await waitFor(() => expect(result.current.data?.items).toHaveLength(201));
    expect(offsets).toEqual([0, 100, 200]);
    expect(result.current.data?.total).toBe(201);
    expect(result.current.data?.items.at(-1)?.id).toBe(201);
    unmount();
    queryClient.clear();
  });

  it("updates article state using the real tRPC cache key", async () => {
    const { wrapper, queryClient } = setup();
    const key = getQueryKey(trpc.articles.list, { read: false }, "infinite");
    const data = {
      pages: [{ items: [createArticle({ id: 42 })], total: 1, hasMore: false }],
      pageParams: [0],
    };
    queryClient.setQueryData(key, data);
    const { result, unmount } = renderHook(useMarkArticleRead, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 42 });
    });
    expect(
      queryClient.getQueryData<typeof data>(key)?.pages[0]?.items[0]?.read
    ).toBe(true);
    unmount();
    queryClient.clear();
  });
});
