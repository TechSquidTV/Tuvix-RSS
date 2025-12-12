import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PWAInstallCard } from "../pwa-install-card";
import { toast } from "sonner";

// Only mock sonner, not the hook - we want to test real integration
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

describe("PWAInstallCard Integration Tests", () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let mockGetInstalledRelatedApps: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear toast mocks
    vi.clearAllMocks();

    // Mock matchMedia (not standalone by default)
    mockMatchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "(display-mode: standalone)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: mockMatchMedia,
    });

    // Mock getInstalledRelatedApps (not installed by default)
    mockGetInstalledRelatedApps = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      writable: true,
      configurable: true,
      value: mockGetInstalledRelatedApps,
    });

    // Mock navigator.standalone (not iOS standalone)
    Object.defineProperty(navigator, "standalone", {
      writable: true,
      configurable: true,
      value: false,
    });

    // Reset user agent to desktop
    Object.defineProperty(navigator, "userAgent", {
      writable: true,
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Full installation flow with real hook", () => {
    it("should complete full installation flow from installable to installed", async () => {
      const user = userEvent.setup();

      // Render component with real hook (not mocked)
      render(<PWAInstallCard />);

      // Initially should show "not supported" since no beforeinstallprompt yet
      expect(
        screen.getByText(/PWA installation not available in this browser/i),
      ).toBeInTheDocument();

      // Simulate browser firing beforeinstallprompt event
      let resolvePrompt: (() => void) | undefined;
      let resolveUserChoice:
        | ((value: { outcome: "accepted"; platform: string }) => void)
        | undefined;

      const mockPrompt = vi.fn().mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        });
      });

      const mockUserChoice = new Promise<{
        outcome: "accepted";
        platform: string;
      }>((resolve) => {
        resolveUserChoice = resolve;
      });

      const beforeInstallPromptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(beforeInstallPromptEvent, {
        prompt: mockPrompt,
        userChoice: mockUserChoice,
      });

      // Fire the event - this should make the component show install button
      window.dispatchEvent(beforeInstallPromptEvent);

      // Wait for component to update to installable state
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /install app/i }),
        ).toBeInTheDocument();
      });

      // Verify we're now in installable state with benefits list
      expect(
        screen.getByText(/Read saved articles offline, anytime/i),
      ).toBeInTheDocument();

      // User clicks install button
      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      // Verify loading state is shown
      await waitFor(() => {
        expect(screen.getByText("Installing...")).toBeInTheDocument();
      });
      expect(installButton).toBeDisabled();

      // Verify prompt() was called
      expect(mockPrompt).toHaveBeenCalledTimes(1);

      // Simulate user accepting the prompt
      resolvePrompt!();
      resolveUserChoice!({ outcome: "accepted", platform: "web" });

      // Wait for prompt to resolve and loading state to clear
      await waitFor(() => {
        expect(screen.queryByText("Installing...")).not.toBeInTheDocument();
      });

      // Simulate browser completing installation by firing appinstalled event
      window.dispatchEvent(new Event("appinstalled"));

      // Wait for component to show installed state
      await waitFor(() => {
        expect(screen.getByText("Installed")).toBeInTheDocument();
      });

      // Verify success toast was shown
      expect(toast.success).toHaveBeenCalledWith("App installed successfully!");

      // Verify installed state UI
      expect(
        screen.getByText("TuvixRSS is installed as an app"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Offline access to saved articles/i),
      ).toBeInTheDocument();

      // Install button should no longer be present
      expect(
        screen.queryByRole("button", { name: /install app/i }),
      ).not.toBeInTheDocument();
    });

    it("should handle user dismissing the install prompt", async () => {
      const user = userEvent.setup();

      render(<PWAInstallCard />);

      // Simulate browser firing beforeinstallprompt event
      let resolvePrompt: (() => void) | undefined;
      let resolveUserChoice:
        | ((value: { outcome: "dismissed"; platform: string }) => void)
        | undefined;

      const mockPrompt = vi.fn().mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        });
      });

      const mockUserChoice = new Promise<{
        outcome: "dismissed";
        platform: string;
      }>((resolve) => {
        resolveUserChoice = resolve;
      });

      const beforeInstallPromptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(beforeInstallPromptEvent, {
        prompt: mockPrompt,
        userChoice: mockUserChoice,
      });

      window.dispatchEvent(beforeInstallPromptEvent);

      // Wait for install button
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /install app/i }),
        ).toBeInTheDocument();
      });

      // Click install button
      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      // Verify loading state
      await waitFor(() => {
        expect(screen.getByText("Installing...")).toBeInTheDocument();
      });

      // Simulate user dismissing the prompt
      resolvePrompt!();
      resolveUserChoice!({ outcome: "dismissed", platform: "web" });

      // Wait for dismissal to be processed
      await waitFor(() => {
        expect(screen.queryByText("Installing...")).not.toBeInTheDocument();
      });

      // Should show "not supported" since beforeinstallprompt won't fire again
      await waitFor(() => {
        expect(
          screen.getByText(/PWA installation not available in this browser/i),
        ).toBeInTheDocument();
      });

      // Success toast should NOT be shown
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("should handle errors during prompt.prompt()", async () => {
      const user = userEvent.setup();

      render(<PWAInstallCard />);

      // Simulate browser firing beforeinstallprompt event
      const mockPrompt = vi
        .fn()
        .mockRejectedValue(new Error("Prompt already called"));

      const beforeInstallPromptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(beforeInstallPromptEvent, {
        prompt: mockPrompt,
        userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
      });

      window.dispatchEvent(beforeInstallPromptEvent);

      // Wait for install button
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /install app/i }),
        ).toBeInTheDocument();
      });

      // Click install button
      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      // Wait for error toast
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Failed to show install prompt. Please try again.",
        );
      });

      // After error, hook clears state and button is removed (status becomes "not-supported")
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /install app/i }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByText(/PWA installation not available in this browser/i),
        ).toBeInTheDocument();
      });
    });

    it("should detect standalone mode on initial load", () => {
      // Mock standalone mode
      mockMatchMedia.mockReturnValue({
        matches: true,
        media: "(display-mode: standalone)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });

      render(<PWAInstallCard />);

      // Should immediately show installed state
      expect(screen.getByText("Installed")).toBeInTheDocument();
      expect(
        screen.getByText("TuvixRSS is installed as an app"),
      ).toBeInTheDocument();

      // Should not show install button
      expect(
        screen.queryByRole("button", { name: /install app/i }),
      ).not.toBeInTheDocument();
    });

    it("should show iOS instructions on iOS devices", () => {
      // Mock iOS user agent
      Object.defineProperty(navigator, "userAgent", {
        writable: true,
        configurable: true,
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      });

      render(<PWAInstallCard />);

      // Should show iOS instructions
      expect(screen.getByText("Install on iOS")).toBeInTheDocument();
      expect(
        screen.getByText(/Tap the.*Share button in Safari's toolbar/i),
      ).toBeInTheDocument();

      // Should not show install button (iOS doesn't support programmatic install)
      expect(
        screen.queryByRole("button", { name: /install app/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Event listener cleanup", () => {
    it("should clean up event listeners on unmount", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = render(<PWAInstallCard />);

      // Should have added event listeners
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "beforeinstallprompt",
        expect.any(Function),
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "appinstalled",
        expect.any(Function),
      );

      // Unmount component
      unmount();

      // Should have removed event listeners
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "beforeinstallprompt",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "appinstalled",
        expect.any(Function),
      );

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });
});
