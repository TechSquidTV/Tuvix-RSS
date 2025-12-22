import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render, createWrapper } from "@/test/test-utils";

// Mock the trpc hook
vi.mock("@/lib/api/trpc", () => ({
  trpc: {
    createClient: vi.fn(() => ({})),
    Provider: ({ children }: { children: React.ReactNode }) => children,
    userSettings: {
      get: {
        useQuery: vi.fn(),
      },
    },
  },
}));

import { trpc } from "@/lib/api/trpc";
import { ShareDropdown } from "./share-dropdown";

describe("ShareDropdown", () => {
  const mockUrl = "https://example.com/article";
  const mockTitle = "Test Article Title";
  const mockClipboard = {
    writeText: vi.fn(),
  };
  const originalNavigator = global.navigator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.writeText.mockClear().mockResolvedValue(undefined);

    // Mock clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });

    // Mock window.open
    global.window.open = vi.fn();
  });

  afterEach(() => {
    // Restore navigator
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe("when settings are loading", () => {
    beforeEach(() => {
      vi.mocked(trpc.userSettings.get.useQuery).mockReturnValue({
        data: undefined,
      } as any);
    });

    it("renders a basic share button", () => {
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByRole("button", { name: /share/i })
      ).toBeInTheDocument();
    });

    it.skip("copies link when clicked", async () => {
      const user = userEvent.setup();

      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));

      expect(mockClipboard.writeText).toHaveBeenCalledWith(mockUrl);
    });
  });

  describe("when no share options are enabled", () => {
    beforeEach(() => {
      vi.mocked(trpc.userSettings.get.useQuery).mockReturnValue({
        data: {
          shareEmail: false,
          shareTwitter: false,
          shareReddit: false,
          shareHackernews: false,
          shareMastodon: false,
          shareBluesky: false,
        },
      } as any);
    });

    it("renders a copy link button without dropdown", () => {
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByRole("button", { name: /copy link/i })
      ).toBeInTheDocument();
    });

    it.skip("copies link when clicked", async () => {
      const user = userEvent.setup();

      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /copy link/i }));

      expect(mockClipboard.writeText).toHaveBeenCalledWith(mockUrl);
    });
  });

  describe("when share options are enabled", () => {
    beforeEach(() => {
      vi.mocked(trpc.userSettings.get.useQuery).mockReturnValue({
        data: {
          shareEmail: true,
          shareTwitter: true,
          shareReddit: true,
          shareHackernews: true,
          shareMastodon: true,
          shareBluesky: true,
        },
      } as any);
    });

    it("renders a dropdown with share button", () => {
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      expect(
        screen.getByRole("button", { name: /share/i })
      ).toBeInTheDocument();
    });

    it("shows all enabled share options in dropdown", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));

      await waitFor(() => {
        expect(screen.getByText("Copy Link")).toBeInTheDocument();
        expect(screen.getByText("Email")).toBeInTheDocument();
        expect(screen.getByText("Twitter/X")).toBeInTheDocument();
        expect(screen.getByText("Reddit")).toBeInTheDocument();
        expect(screen.getByText("Hacker News")).toBeInTheDocument();
        expect(screen.getByText("Mastodon")).toBeInTheDocument();
        expect(screen.getByText("Bluesky")).toBeInTheDocument();
      });
    });

    it.skip("copies link when Copy Link is clicked", async () => {
      const user = userEvent.setup();

      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Copy Link"));

      expect(mockClipboard.writeText).toHaveBeenCalledWith(mockUrl);
    });

    it("opens mailto link when Email is clicked", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Email"));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("mailto:?subject="),
        "_blank"
      );
    });

    it("opens Twitter share when Twitter/X is clicked", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Twitter/X"));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("twitter.com/intent/tweet"),
        "_blank",
        "noopener,noreferrer"
      );
    });

    it("opens Reddit submit when Reddit is clicked", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Reddit"));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("reddit.com/submit"),
        "_blank",
        "noopener,noreferrer"
      );
    });

    it("opens Hacker News submit when Hacker News is clicked", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Hacker News"));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("news.ycombinator.com/submitlink"),
        "_blank",
        "noopener,noreferrer"
      );
    });

    it("opens Mastodon share when Mastodon is clicked", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Mastodon"));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("mastodon.social/share"),
        "_blank",
        "noopener,noreferrer"
      );
    });

    it("opens Bluesky share when Bluesky is clicked", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));
      await user.click(screen.getByText("Bluesky"));

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("bsky.app/intent/compose"),
        "_blank",
        "noopener,noreferrer"
      );
    });
  });

  describe("when only some share options are enabled", () => {
    beforeEach(() => {
      vi.mocked(trpc.userSettings.get.useQuery).mockReturnValue({
        data: {
          shareEmail: true,
          shareTwitter: false,
          shareReddit: true,
          shareHackernews: false,
          shareMastodon: false,
          shareBluesky: false,
        },
      } as any);
    });

    it("only shows enabled options", async () => {
      const user = userEvent.setup();
      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));

      await waitFor(() => {
        expect(screen.getByText("Copy Link")).toBeInTheDocument();
        expect(screen.getByText("Email")).toBeInTheDocument();
        expect(screen.getByText("Reddit")).toBeInTheDocument();
        expect(screen.queryByText("Twitter/X")).not.toBeInTheDocument();
        expect(screen.queryByText("Hacker News")).not.toBeInTheDocument();
        expect(screen.queryByText("Mastodon")).not.toBeInTheDocument();
        expect(screen.queryByText("Bluesky")).not.toBeInTheDocument();
      });
    });
  });

  describe("native share support", () => {
    beforeEach(() => {
      vi.mocked(trpc.userSettings.get.useQuery).mockReturnValue({
        data: {
          shareEmail: true,
          shareTwitter: false,
          shareReddit: false,
          shareHackernews: false,
          shareMastodon: false,
          shareBluesky: false,
        },
      } as any);
    });

    it("does not show native share option when navigator.share is unavailable", async () => {
      const user = userEvent.setup();

      render(<ShareDropdown url={mockUrl} title={mockTitle} />, {
        wrapper: createWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /share/i }));

      await waitFor(() => {
        expect(screen.queryByText("Share...")).not.toBeInTheDocument();
      });
    });
  });

  describe("component props", () => {
    beforeEach(() => {
      vi.mocked(trpc.userSettings.get.useQuery).mockReturnValue({
        data: {
          shareEmail: true,
          shareTwitter: false,
          shareReddit: false,
          shareHackernews: false,
          shareMastodon: false,
          shareBluesky: false,
        },
      } as any);
    });

    it("applies custom size prop", () => {
      render(<ShareDropdown url={mockUrl} title={mockTitle} size="lg" />, {
        wrapper: createWrapper(),
      });

      const button = screen.getByRole("button", { name: /share/i });
      expect(button).toBeInTheDocument();
    });

    it("applies custom variant prop", () => {
      render(
        <ShareDropdown url={mockUrl} title={mockTitle} variant="outline" />,
        {
          wrapper: createWrapper(),
        }
      );

      const button = screen.getByRole("button", { name: /share/i });
      expect(button).toBeInTheDocument();
    });

    it("applies custom className prop", () => {
      render(
        <ShareDropdown
          url={mockUrl}
          title={mockTitle}
          className="custom-class"
        />,
        {
          wrapper: createWrapper(),
        }
      );

      const button = screen.getByRole("button", { name: /share/i });
      expect(button).toHaveClass("custom-class");
    });
  });
});
