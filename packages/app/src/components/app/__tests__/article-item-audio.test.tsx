import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { ArticleItemAudio } from "../article-item-audio";
import * as useArticlesModule from "@/lib/hooks/useArticles";
import * as useMobileHook from "@/hooks/use-mobile";
import type { RouterOutputs } from "@/lib/api/trpc";

// Mock dependencies
vi.mock("@/lib/hooks/useArticles");
vi.mock("@/hooks/use-mobile");
vi.mock("../audio-player", () => ({
  AudioPlayer: ({ audioUrl, title }: { audioUrl: string; title?: string }) => (
    <div data-testid="audio-player">
      Audio Player: {title || "Audio"} ({audioUrl})
    </div>
  ),
}));

type Article = RouterOutputs["articles"]["list"]["items"][number];

describe("ArticleItemAudio", () => {
  const mockMarkRead = vi.fn();
  const mockMarkUnread = vi.fn();
  const mockSaveArticle = vi.fn();
  const mockUnsaveArticle = vi.fn();

  const mockArticle: Article = {
    id: 1,
    sourceId: 1,
    guid: "test-guid",
    title: "Test Audio Episode",
    description: "This is a test audio episode description",
    link: "https://example.com/episode",
    content: null,
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    author: "Test Author",
    read: false,
    saved: false,
    imageUrl: "https://example.com/artwork.jpg",
    audioUrl: "https://example.com/audio.mp3",
    audioProgress: null,
    source: {
      id: 1,
      url: "https://example.com/feed",
      title: "Test Podcast",
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

  it("renders audio article with title and feed name", () => {
    render(<ArticleItemAudio article={mockArticle} />);

    expect(screen.getByText("Test Audio Episode")).toBeInTheDocument();
    expect(screen.getByText("Test Podcast")).toBeInTheDocument();
  });

  it("renders AudioPlayer component with correct props", () => {
    render(<ArticleItemAudio article={mockArticle} />);

    const audioPlayer = screen.getByTestId("audio-player");
    expect(audioPlayer).toBeInTheDocument();
    expect(audioPlayer.textContent).toContain("Test Audio Episode");
    expect(audioPlayer.textContent).toContain("https://example.com/audio.mp3");
  });

  it("handles mark read button click without throwing", async () => {
    const user = userEvent.setup();
    render(<ArticleItemAudio article={mockArticle} />);

    const markReadButton = screen.getByRole("button", { name: /mark read/i });
    await user.click(markReadButton);

    expect(mockMarkRead).toHaveBeenCalledWith({ id: 1 });
  });

  it("handles save button click without throwing", async () => {
    const user = userEvent.setup();
    render(<ArticleItemAudio article={mockArticle} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await user.click(saveButton);

    expect(mockSaveArticle).toHaveBeenCalledWith({ id: 1 });
  });

  it("handles mark unread when article is read", async () => {
    const user = userEvent.setup();
    const readArticle = { ...mockArticle, read: true };
    render(<ArticleItemAudio article={readArticle} />);

    const markUnreadButton = screen.getByRole("button", {
      name: /mark unread/i,
    });
    await user.click(markUnreadButton);

    expect(mockMarkUnread).toHaveBeenCalledWith({ id: 1 });
  });

  it("handles unsave when article is saved", async () => {
    const user = userEvent.setup();
    const savedArticle = { ...mockArticle, saved: true };
    render(<ArticleItemAudio article={savedArticle} />);

    const savedButton = screen.getByRole("button", { name: /saved/i });
    await user.click(savedButton);

    expect(mockUnsaveArticle).toHaveBeenCalledWith({ id: 1 });
  });

  it("renders description when provided", () => {
    render(<ArticleItemAudio article={mockArticle} />);

    expect(
      screen.getByText("This is a test audio episode description")
    ).toBeInTheDocument();
  });

  it("displays podcast artwork when imageUrl is provided", () => {
    const { container } = render(<ArticleItemAudio article={mockArticle} />);

    const image = container.querySelector('img[alt*="Artwork"]');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "https://example.com/artwork.jpg");
  });
});
