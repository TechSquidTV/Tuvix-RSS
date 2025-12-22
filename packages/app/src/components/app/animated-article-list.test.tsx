import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@/test/test-utils";
import { AnimatedArticleList } from "./animated-article-list";
import type { RouterOutputs } from "@/lib/api/trpc";

// Mock Motion components to test logic without animation implementation
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} data-testid="motion-div" {...props}>
        {children}
      </div>
    ),
  },
}));

// Mock ArticleItem
vi.mock("./article-item", () => ({
  ArticleItem: ({ article }: any) => (
    <div data-testid="article-item" data-article-id={article.id}>
      {article.title}
    </div>
  ),
}));

type Article = RouterOutputs["articles"]["list"]["items"][number];

describe("AnimatedArticleList", () => {
  const mockArticles: Article[] = [
    {
      id: 1,
      title: "Article 1",
      description: "Description 1",
      link: "https://example.com/1",
      publishedAt: new Date().toISOString(),
      read: false,
      saved: false,
      source: {
        id: 1,
        title: "Source 1",
        url: "https://example.com",
      },
    },
    {
      id: 2,
      title: "Article 2",
      description: "Description 2",
      link: "https://example.com/2",
      publishedAt: new Date().toISOString(),
      read: false,
      saved: false,
      source: {
        id: 2,
        title: "Source 2",
        url: "https://example.com",
      },
    },
    {
      id: 3,
      title: "Article 3",
      description: "Description 3",
      link: "https://example.com/3",
      publishedAt: new Date().toISOString(),
      read: false,
      saved: false,
      source: {
        id: 3,
        title: "Source 3",
        url: "https://example.com",
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders articles correctly", () => {
    render(<AnimatedArticleList articles={mockArticles} />);

    expect(screen.getByText("Article 1")).toBeInTheDocument();
    expect(screen.getByText("Article 2")).toBeInTheDocument();
    expect(screen.getByText("Article 3")).toBeInTheDocument();
  });

  it("uses article.id as key (not prefixed)", () => {
    render(<AnimatedArticleList articles={mockArticles} />);

    const articleItems = screen.getAllByTestId("article-item");
    expect(articleItems[0]).toHaveAttribute("data-article-id", "1");
    expect(articleItems[1]).toHaveAttribute("data-article-id", "2");
    expect(articleItems[2]).toHaveAttribute("data-article-id", "3");
  });

  it("handles empty articles array", () => {
    render(<AnimatedArticleList articles={[]} />);

    const articleItems = screen.queryAllByTestId("article-item");
    expect(articleItems).toHaveLength(0);
  });

  it("preserves children (infinite scroll trigger)", () => {
    const trigger = <div data-testid="infinite-trigger">Loading...</div>;
    render(
      <AnimatedArticleList articles={mockArticles}>
        {trigger}
      </AnimatedArticleList>
    );

    expect(screen.getByTestId("infinite-trigger")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("applies className prop correctly", () => {
    render(
      <AnimatedArticleList articles={mockArticles} className="custom-class" />
    );

    // Get the container (first motion-div, which is the wrapper)
    const containers = screen.getAllByTestId("motion-div");
    const container = containers[0]; // First one is the wrapper
    expect(container).toHaveClass("custom-class");
    expect(container).toHaveClass("flex", "flex-col", "gap-4");
  });

  it("handles newArticleIds prop", () => {
    const newArticleIds = new Set([2]);
    render(
      <AnimatedArticleList
        articles={mockArticles}
        newArticleIds={newArticleIds}
      />
    );

    // All articles should still render
    expect(screen.getByText("Article 1")).toBeInTheDocument();
    expect(screen.getByText("Article 2")).toBeInTheDocument();
    expect(screen.getByText("Article 3")).toBeInTheDocument();
  });

  it("handles undefined newArticleIds", () => {
    render(<AnimatedArticleList articles={mockArticles} />);

    // Should render without errors
    expect(screen.getByText("Article 1")).toBeInTheDocument();
  });
});
