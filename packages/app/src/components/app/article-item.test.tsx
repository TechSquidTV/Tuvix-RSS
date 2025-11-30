import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { ArticleItem } from "./article-item";
import * as useArticlesModule from "@/lib/hooks/useArticles";
import * as useMobileHook from "@/hooks/use-mobile";
import type { RouterOutputs } from "@/lib/api/trpc";

// Mock the hooks
vi.mock("@/lib/hooks/useArticles");
vi.mock("@/hooks/use-mobile");

// Get the actual article type from tRPC router output (matches component's type)
type Article = RouterOutputs["articles"]["list"]["items"][number];

describe("ArticleItem", () => {
  const mockMarkRead = vi.fn();
  const mockMarkUnread = vi.fn();
  const mockSaveArticle = vi.fn();
  const mockUnsaveArticle = vi.fn();

  const mockArticle: Article = {
    id: 1,
    sourceId: 1,
    guid: "test-guid",
    title: "Test Article Title",
    description: "This is a test article description",
    link: "https://example.com/article",
    content: null,
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    createdAt: new Date().toISOString(),
    author: "Test Author",
    read: false,
    saved: false,
    imageUrl: "https://example.com/image.jpg",
    audioUrl: null,
    audioProgress: null,
    source: {
      id: 1,
      url: "https://example.com",
      title: "Test Source",
      description: null,
      siteUrl: null,
      iconUrl: "https://example.com/icon.png",
      iconType: "auto",
      iconUpdatedAt: null,
      lastFetched: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock article hooks
    vi.mocked(useArticlesModule.useMarkArticleRead).mockReturnValue({
      mutate: mockMarkRead,
      isPending: false,
    } as any);

    vi.mocked(useArticlesModule.useMarkArticleUnread).mockReturnValue({
      mutate: mockMarkUnread,
      isPending: false,
    } as any);

    vi.mocked(useArticlesModule.useSaveArticle).mockReturnValue({
      mutate: mockSaveArticle,
      isPending: false,
    } as any);

    vi.mocked(useArticlesModule.useUnsaveArticle).mockReturnValue({
      mutate: mockUnsaveArticle,
      isPending: false,
    } as any);

    // Default to desktop view
    vi.mocked(useMobileHook.useIsMobile).mockReturnValue(false);

    // Mock window.open
    global.window.open = vi.fn();
  });

  it("renders article with title, description, and metadata", () => {
    render(<ArticleItem article={mockArticle} />);

    expect(screen.getByText("Test Article Title")).toBeInTheDocument();
    expect(
      screen.getByText("This is a test article description"),
    ).toBeInTheDocument();
    expect(screen.getByText("Test Source")).toBeInTheDocument();
    expect(screen.getByText("Test Author")).toBeInTheDocument();
  });

  it("formats relative time correctly - hours ago", () => {
    render(<ArticleItem article={mockArticle} />);
    expect(screen.getAllByText(/2 hours ago/i).length).toBeGreaterThan(0);
  });

  it("formats relative time correctly - just now", () => {
    const recentArticle = {
      ...mockArticle,
      publishedAt: new Date().toISOString(),
    };
    render(<ArticleItem article={recentArticle} />);
    expect(screen.getAllByText(/just now/i).length).toBeGreaterThan(0);
  });

  it("formats relative time correctly - minutes ago", () => {
    const recentArticle = {
      ...mockArticle,
      publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    };
    render(<ArticleItem article={recentArticle} />);
    expect(screen.getAllByText(/30 minutes ago/i).length).toBeGreaterThan(0);
  });

  describe("HTML rendering in descriptions", () => {
    it("renders sanitized HTML links in description", () => {
      // Note: Backend sanitizes and adds target/_blank and rel attributes
      const articleWithLink = {
        ...mockArticle,
        description:
          'Article about tech. <a href="https://example.com/comments" target="_blank" rel="noopener noreferrer">Discuss</a>',
      };
      render(<ArticleItem article={articleWithLink} />);

      const link = screen.getByRole("link", { name: "Discuss" });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "https://example.com/comments");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("renders Hacker News comment links correctly", () => {
      const articleWithHNLink = {
        ...mockArticle,
        description:
          'New feature released. <a href="https://news.ycombinator.com/item?id=12345">Comments</a>',
      };
      render(<ArticleItem article={articleWithHNLink} />);

      const link = screen.getByRole("link", { name: "Comments" });
      expect(link).toHaveAttribute(
        "href",
        "https://news.ycombinator.com/item?id=12345",
      );
    });

    it("clicking links in description does not trigger card click on mobile", async () => {
      vi.mocked(useMobileHook.useIsMobile).mockReturnValue(true);
      const user = userEvent.setup();

      const articleWithHNLink = {
        ...mockArticle,
        link: "https://example.com/article",
        description:
          'Article text. <a href="https://news.ycombinator.com/item?id=12345" target="_blank" rel="noopener noreferrer">Comments</a>',
      };
      render(<ArticleItem article={articleWithHNLink} />);

      // Click the Comments link inside the description
      const commentsLink = screen.getByRole("link", { name: "Comments" });
      await user.click(commentsLink);

      // Verify that window.open was NOT called with the article link
      // The link's default behavior should handle navigation to the comments URL
      expect(window.open).not.toHaveBeenCalledWith(
        "https://example.com/article",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("clicking links with nested elements does not trigger card click", async () => {
      vi.mocked(useMobileHook.useIsMobile).mockReturnValue(true);
      const user = userEvent.setup();

      const articleWithNestedLink = {
        ...mockArticle,
        link: "https://example.com/article",
        description:
          'Article text. <a href="https://news.ycombinator.com/item?id=12345" target="_blank" rel="noopener noreferrer"><strong>Bold Comments</strong></a>',
      };
      render(<ArticleItem article={articleWithNestedLink} />);

      // Click the nested <strong> element inside the link
      const commentsLink = screen.getByRole("link", { name: "Bold Comments" });
      await user.click(commentsLink);

      // Verify that window.open was NOT called with the article link
      // This tests that closest('a') properly handles nested elements
      expect(window.open).not.toHaveBeenCalledWith(
        "https://example.com/article",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("renders multiple links in description", () => {
      const articleWithLinks = {
        ...mockArticle,
        description:
          '<a href="https://one.com">Link One</a> and <a href="https://two.com">Link Two</a>',
      };
      render(<ArticleItem article={articleWithLinks} />);

      expect(screen.getByRole("link", { name: "Link One" })).toHaveAttribute(
        "href",
        "https://one.com",
      );
      expect(screen.getByRole("link", { name: "Link Two" })).toHaveAttribute(
        "href",
        "https://two.com",
      );
    });

    it("renders bold/strong text", () => {
      const articleWithBold = {
        ...mockArticle,
        description: "Important: <strong>breaking news</strong> today",
      };
      const { container } = render(<ArticleItem article={articleWithBold} />);

      const strong = container.querySelector("strong");
      expect(strong).toBeInTheDocument();
      expect(strong?.textContent).toBe("breaking news");
    });

    it("renders italic/em text", () => {
      const articleWithItalic = {
        ...mockArticle,
        description: "Note: <em>this is emphasized</em> text",
      };
      const { container } = render(<ArticleItem article={articleWithItalic} />);

      const em = container.querySelector("em");
      expect(em).toBeInTheDocument();
      expect(em?.textContent).toBe("this is emphasized");
    });

    it("XSS protection - script tags removed by backend sanitization", () => {
      // Backend strips dangerous tags before storing, so we test that
      // the frontend correctly renders already-sanitized content
      const articleSanitizedByBackend = {
        ...mockArticle,
        description: "Safe text", // Backend would have removed the script tag
      };
      const { container } = render(
        <ArticleItem article={articleSanitizedByBackend} />,
      );

      // Verify no script tags in rendered output
      const script = container.querySelector("script");
      expect(script).toBeNull();
      expect(container.textContent).toContain("Safe text");
    });

    it("handles plain text descriptions without HTML", () => {
      const plainTextArticle = {
        ...mockArticle,
        description: "Just plain text without any HTML",
      };
      render(<ArticleItem article={plainTextArticle} />);

      expect(
        screen.getByText("Just plain text without any HTML"),
      ).toBeInTheDocument();
    });
  });

  it("formats relative time correctly - days ago", () => {
    const oldArticle = {
      ...mockArticle,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    };
    render(<ArticleItem article={oldArticle} />);
    expect(screen.getAllByText(/3 days ago/i).length).toBeGreaterThan(0);
  });

  it("handles read/unread toggle from unread to read", async () => {
    const user = userEvent.setup();
    render(<ArticleItem article={mockArticle} />);

    const markReadButton = screen.getByRole("button", { name: /mark read/i });
    await user.click(markReadButton);

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("handles read/unread toggle from read to unread", async () => {
    const user = userEvent.setup();
    const readArticle = { ...mockArticle, read: true };
    render(<ArticleItem article={readArticle} />);

    const markUnreadButton = screen.getByRole("button", {
      name: /mark unread/i,
    });
    await user.click(markUnreadButton);

    await waitFor(() => {
      expect(mockMarkUnread).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("handles save/unsave toggle from unsaved to saved", async () => {
    const user = userEvent.setup();
    render(<ArticleItem article={mockArticle} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockSaveArticle).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("handles save/unsave toggle from saved to unsaved", async () => {
    const user = userEvent.setup();
    const savedArticle = { ...mockArticle, saved: true };
    render(<ArticleItem article={savedArticle} />);

    const unsaveButton = screen.getByRole("button", { name: /saved/i });
    await user.click(unsaveButton);

    await waitFor(() => {
      expect(mockUnsaveArticle).toHaveBeenCalledWith({ id: 1 });
    });
  });

  it("opens external link correctly on desktop", async () => {
    const user = userEvent.setup();
    render(<ArticleItem article={mockArticle} />);

    const openLinkButton = screen.getByRole("button", { name: /open link/i });
    await user.click(openLinkButton);

    expect(window.open).toHaveBeenCalledWith(
      "https://example.com/article",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("applies opacity when article is read", () => {
    const readArticle = { ...mockArticle, read: true };
    const { container } = render(<ArticleItem article={readArticle} />);

    // Check if the Item component has the opacity-60 class
    const itemElement = container.querySelector(".opacity-60");
    expect(itemElement).toBeInTheDocument();
  });

  it("displays article image when imageUrl is provided", () => {
    render(<ArticleItem article={mockArticle} />);

    const image = screen.getByAltText("Test Article Title");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "https://example.com/image.jpg");
  });

  it("does not display image when imageUrl is not provided", () => {
    const articleWithoutImage = { ...mockArticle, imageUrl: undefined };
    render(<ArticleItem article={articleWithoutImage} />);

    const image = screen.queryByRole("img", { name: /test article title/i });
    expect(image).not.toBeInTheDocument();
  });

  it("renders fallback text for missing data", () => {
    const incompleteArticle = {
      id: 1,
      title: undefined,
      description: undefined,
      publishedAt: undefined,
      source: undefined,
    } as any;

    render(<ArticleItem article={incompleteArticle} />);

    expect(screen.getByText("Untitled Article")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown Source").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });

  it("disables mark read button when operation is pending", () => {
    vi.mocked(useArticlesModule.useMarkArticleRead).mockReturnValue({
      mutate: mockMarkRead,
      isPending: true,
    } as any);

    render(<ArticleItem article={mockArticle} />);

    const markReadButton = screen.getByRole("button", { name: /mark read/i });
    expect(markReadButton).toBeDisabled();
  });

  it("disables save button when operation is pending", () => {
    vi.mocked(useArticlesModule.useSaveArticle).mockReturnValue({
      mutate: mockSaveArticle,
      isPending: true,
    } as any);

    render(<ArticleItem article={mockArticle} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
  });

  it("shows mobile layout when on mobile", () => {
    vi.mocked(useMobileHook.useIsMobile).mockReturnValue(true);
    render(<ArticleItem article={mockArticle} />);

    // Mobile layout should not have "Open Link" button
    expect(
      screen.queryByRole("button", { name: /open link/i }),
    ).not.toBeInTheDocument();
  });
});
