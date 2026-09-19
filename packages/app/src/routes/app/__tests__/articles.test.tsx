import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { RouterOutputs } from "@/lib/api/trpc";
import { createArticle } from "@/test/fixtures";

type ArticlePage = RouterOutputs["articles"]["list"];
const state = vi.hoisted(() => ({
  data: undefined as { pages: ArticlePage[] } | undefined,
  counts: undefined as RouterOutputs["articles"]["getCounts"] | undefined,
  isError: false,
  isFetchNextPageError: false,
  hasNextPage: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/hooks/useArticles", () => ({
  useInfiniteArticles: () => ({
    ...state,
    isLoading: false,
    isFetchingNextPage: false,
    isRefetching: false,
  }),
  useArticleCounts: () => ({ data: state.counts }),
  useMarkAllRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/useUserSettings", () => ({
  useUserSettings: () => ({ data: undefined }),
}));
vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));
vi.mock("@/components/app/animated-article-list", () => ({
  AnimatedArticleList: ({
    articles,
    children,
  }: {
    articles: ArticlePage["items"];
    children: ReactNode;
  }) => (
    <div>
      {articles.map((article) => (
        <p key={article.id}>{article.title}</p>
      ))}
      {children}
    </div>
  ),
}));
import { Route } from "../articles";
const ArticlesPage = Route.options.component!;

describe("Article reading states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Route, "useSearch").mockReturnValue({
      category_id: undefined,
      subscription_id: undefined,
    });
    state.data = {
      pages: [
        {
          items: [createArticle()],
          total: 1,
          hasMore: false,
          nextCursor: null,
        },
      ],
    };
    state.counts = undefined;
    state.isError = false;
    state.isFetchNextPageError = false;
    state.hasNextPage = false;
  });

  it("keeps loaded articles visible while counts are unavailable", () => {
    render(<ArticlesPage />);
    expect(
      within(
        screen
          .getAllByRole("tabpanel")
          .find((panel) => !panel.hasAttribute("inert"))!
      ).getByText("Test Article")
    ).toBeVisible();
    expect(screen.queryByText("No articles yet")).not.toBeInTheDocument();
    expect(screen.getAllByText("Test Article")).toHaveLength(1);
  });

  it("offers an actionable retry after the initial request fails", async () => {
    state.data = undefined;
    state.isError = true;
    render(<ArticlesPage />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("retains existing articles after a pagination failure and lets readers retry", async () => {
    state.isError = true;
    state.isFetchNextPageError = true;
    state.hasNextPage = true;
    render(<ArticlesPage />);
    expect(
      within(
        screen
          .getAllByRole("tabpanel")
          .find((panel) => !panel.hasAttribute("inert"))!
      ).getByText("Test Article")
    ).toBeVisible();
    await userEvent.click(
      within(
        screen
          .getAllByRole("tabpanel")
          .find((panel) => !panel.hasAttribute("inert"))!
      ).getByRole("button", { name: "Retry loading more articles" })
    );
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
  });
});
