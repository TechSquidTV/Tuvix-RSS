import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { ArticleItem } from "../article-item";
import * as useArticlesModule from "@/lib/hooks/useArticles";
import * as useMobileHook from "@/hooks/use-mobile";
import type { RouterOutputs } from "@/lib/api/trpc";

// Mock dependencies
vi.mock("@/lib/hooks/useArticles");
vi.mock("@/hooks/use-mobile");
vi.mock("../article-item-audio", () => ({
  ArticleItemAudio: ({ article }: { article: any }) => (
    <div data-testid="article-item-audio">Audio Item: {article.title}</div>
  ),
}));

type Article = RouterOutputs["articles"]["list"]["items"][number];

describe("ArticleItem (non-audio)", () => {
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
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    author: "Test Author",
    read: false,
    saved: false,
    imageUrl: "https://example.com/image.jpg",
    audioUrl: null, // No audio URL - this is a regular article
    audioProgress: null,
    source: {
      id: 1,
      url: "https://example.com/feed",
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

    vi.mocked(useMobileHook.useIsMobile).mockReturnValue(false);

    global.window.open = vi.fn();
  });

  it("renders non-audio article with title and feed name", () => {
    render(<ArticleItem article={mockArticle} />);

    expect(screen.getByText("Test Article Title")).toBeInTheDocument();
    expect(screen.getByText("Test Source")).toBeInTheDocument();
  });

  it("delegates to ArticleItemAudio when audioUrl is present", () => {
    const audioArticle = {
      ...mockArticle,
      audioUrl: "https://example.com/audio.mp3",
    };
    render(<ArticleItem article={audioArticle} />);

    const audioItem = screen.getByTestId("article-item-audio");
    expect(audioItem).toBeInTheDocument();
    expect(audioItem.textContent).toContain("Test Article Title");
  });

  it("handles mark read button click without throwing", async () => {
    const user = userEvent.setup();
    render(<ArticleItem article={mockArticle} />);

    const markReadButton = screen.getByRole("button", { name: /mark read/i });
    await user.click(markReadButton);

    expect(mockMarkRead).toHaveBeenCalledWith({ id: 1 });
  });

  it("handles save button click without throwing", async () => {
    const user = userEvent.setup();
    render(<ArticleItem article={mockArticle} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await user.click(saveButton);

    expect(mockSaveArticle).toHaveBeenCalledWith({ id: 1 });
  });

  it("handles mark unread when article is read", async () => {
    const user = userEvent.setup();
    const readArticle = { ...mockArticle, read: true };
    render(<ArticleItem article={readArticle} />);

    const markUnreadButton = screen.getByRole("button", {
      name: /mark unread/i,
    });
    await user.click(markUnreadButton);

    expect(mockMarkUnread).toHaveBeenCalledWith({ id: 1 });
  });

  it("handles unsave when article is saved", async () => {
    const user = userEvent.setup();
    const savedArticle = { ...mockArticle, saved: true };
    render(<ArticleItem article={savedArticle} />);

    const savedButton = screen.getByRole("button", { name: /saved/i });
    await user.click(savedButton);

    expect(mockUnsaveArticle).toHaveBeenCalledWith({ id: 1 });
  });

  it("renders description when provided", () => {
    render(<ArticleItem article={mockArticle} />);

    expect(
      screen.getByText("This is a test article description")
    ).toBeInTheDocument();
  });

  it("opens external link correctly on desktop", async () => {
    const user = userEvent.setup();
    render(<ArticleItem article={mockArticle} />);

    const openLinkButton = screen.getByRole("button", { name: /open link/i });
    await user.click(openLinkButton);

    expect(window.open).toHaveBeenCalledWith(
      "https://example.com/article",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
