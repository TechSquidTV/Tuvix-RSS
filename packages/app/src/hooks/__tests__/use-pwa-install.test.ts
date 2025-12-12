import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePWAInstall } from "../use-pwa-install";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface ExtendedNavigator extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<
    Array<{ platform: string; url?: string; id?: string }>
  >;
}

interface ExtendedWindow extends Window {
  MSStream?: unknown;
}

describe("usePWAInstall", () => {
  let mockMatchMedia: ReturnType<typeof vi.fn>;
  let mockGetInstalledRelatedApps: ReturnType<typeof vi.fn>;
  let originalNavigator: Navigator;
  let originalWindow: Window & typeof globalThis;

  beforeEach(() => {
    // Store originals
    originalNavigator = global.navigator;
    originalWindow = global.window;

    // Mock matchMedia
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

    // Mock getInstalledRelatedApps
    mockGetInstalledRelatedApps = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, "getInstalledRelatedApps", {
      writable: true,
      configurable: true,
      value: mockGetInstalledRelatedApps,
    });

    // Mock navigator.standalone (iOS)
    Object.defineProperty(navigator, "standalone", {
      writable: true,
      configurable: true,
      value: false,
    });

    // Reset user agent
    Object.defineProperty(navigator, "userAgent", {
      writable: true,
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Desktop browser (not installed)", () => {
    it("should return not-supported status by default", () => {
      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.installationStatus).toBe("not-supported");
      expect(result.current.isInstalled).toBe(false);
      expect(result.current.isInstallable).toBe(false);
      expect(result.current.isiOS).toBe(false);
    });

    it("should detect installable state when beforeinstallprompt fires", async () => {
      const { result } = renderHook(() => usePWAInstall());

      const mockPrompt = vi.fn().mockResolvedValue(undefined);
      const mockUserChoice = Promise.resolve({
        outcome: "accepted" as const,
        platform: "web",
      });

      const promptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(promptEvent, {
        prompt: mockPrompt,
        userChoice: mockUserChoice,
      });

      act(() => {
        window.dispatchEvent(promptEvent);
      });

      await waitFor(() => {
        expect(result.current.isInstallable).toBe(true);
        expect(result.current.installationStatus).toBe("installable");
      });
    });

    it("should handle installation prompt acceptance", async () => {
      const { result } = renderHook(() => usePWAInstall());

      const mockPrompt = vi.fn().mockResolvedValue(undefined);
      const mockUserChoice = Promise.resolve({
        outcome: "accepted" as const,
        platform: "web",
      });

      const promptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(promptEvent, {
        prompt: mockPrompt,
        userChoice: mockUserChoice,
      });

      act(() => {
        window.dispatchEvent(promptEvent);
      });

      await waitFor(() => {
        expect(result.current.isInstallable).toBe(true);
      });

      await act(async () => {
        await result.current.promptInstall();
      });

      expect(mockPrompt).toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.isInstallable).toBe(false);
      });
    });

    it("should handle installation prompt dismissal", async () => {
      const { result } = renderHook(() => usePWAInstall());

      const mockPrompt = vi.fn().mockResolvedValue(undefined);
      const mockUserChoice = Promise.resolve({
        outcome: "dismissed" as const,
        platform: "web",
      });

      const promptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(promptEvent, {
        prompt: mockPrompt,
        userChoice: mockUserChoice,
      });

      act(() => {
        window.dispatchEvent(promptEvent);
      });

      await waitFor(() => {
        expect(result.current.isInstallable).toBe(true);
      });

      await act(async () => {
        await result.current.promptInstall();
      });

      expect(mockPrompt).toHaveBeenCalled();
    });

    it("should detect installed state when appinstalled event fires", async () => {
      const { result } = renderHook(() => usePWAInstall());

      act(() => {
        window.dispatchEvent(new Event("appinstalled"));
      });

      await waitFor(() => {
        expect(result.current.isInstalled).toBe(true);
        expect(result.current.installationStatus).toBe("installed");
      });
    });

    it("should allow dismissing the prompt", () => {
      const { result } = renderHook(() => usePWAInstall());

      const promptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(promptEvent, {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      });

      act(() => {
        window.dispatchEvent(promptEvent);
      });

      act(() => {
        result.current.dismissPrompt();
      });

      expect(result.current.isInstallable).toBe(false);
    });
  });

  describe("Standalone mode detection", () => {
    it("should detect installed when running in standalone mode", () => {
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

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isStandalone).toBe(true);
      expect(result.current.isInstalled).toBe(true);
      expect(result.current.installationStatus).toBe("installed");
    });
  });

  describe("getInstalledRelatedApps API", () => {
    it("should detect installed state via getInstalledRelatedApps API", async () => {
      mockGetInstalledRelatedApps.mockResolvedValue([
        {
          platform: "webapp",
          url: "https://feedsmith.dev/manifest.webmanifest",
        },
      ]);

      const { result } = renderHook(() => usePWAInstall());

      await waitFor(() => {
        expect(result.current.isInstalled).toBe(true);
        expect(result.current.installationStatus).toBe("installed");
      });
    });

    it("should handle getInstalledRelatedApps API errors gracefully", async () => {
      mockGetInstalledRelatedApps.mockRejectedValue(
        new Error("API not supported"),
      );

      const consoleSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const { result } = renderHook(() => usePWAInstall());

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Error checking installed apps:",
          expect.any(Error),
        );
      });

      expect(result.current.isInstalled).toBe(false);

      consoleSpy.mockRestore();
    });

    it("should not check getInstalledRelatedApps if already installed", async () => {
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

      renderHook(() => usePWAInstall());

      await waitFor(() => {
        expect(mockGetInstalledRelatedApps).not.toHaveBeenCalled();
      });
    });
  });

  describe("iOS detection", () => {
    it("should detect iOS devices", () => {
      Object.defineProperty(navigator, "userAgent", {
        writable: true,
        configurable: true,
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      });

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isiOS).toBe(true);
      expect(result.current.installationStatus).toBe("ios-instructions");
    });

    it("should detect iOS standalone mode", () => {
      Object.defineProperty(navigator, "userAgent", {
        writable: true,
        configurable: true,
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      });

      Object.defineProperty(navigator, "standalone", {
        writable: true,
        configurable: true,
        value: true,
      });

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isiOS).toBe(true);
      expect(result.current.isIOSInstalled).toBe(true);
      expect(result.current.isInstalled).toBe(true);
      expect(result.current.installationStatus).toBe("installed");
    });

    it("should detect iPad devices", () => {
      Object.defineProperty(navigator, "userAgent", {
        writable: true,
        configurable: true,
        value:
          "Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      });

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isiOS).toBe(true);
      expect(result.current.installationStatus).toBe("ios-instructions");
    });

    it("should not detect iOS for Windows with MSStream", () => {
      Object.defineProperty(navigator, "userAgent", {
        writable: true,
        configurable: true,
        value: "Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko",
      });

      (window as ExtendedWindow).MSStream = {};

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.isiOS).toBe(false);
    });
  });

  describe("Installation status priority", () => {
    it("should prioritize installed over installable", async () => {
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

      const { result } = renderHook(() => usePWAInstall());

      const promptEvent = new Event(
        "beforeinstallprompt",
      ) as BeforeInstallPromptEvent;
      Object.assign(promptEvent, {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      });

      act(() => {
        window.dispatchEvent(promptEvent);
      });

      // Should remain installed, not become installable
      expect(result.current.installationStatus).toBe("installed");
      expect(result.current.isInstalled).toBe(true);
    });

    it("should prioritize installed over iOS instructions", () => {
      Object.defineProperty(navigator, "userAgent", {
        writable: true,
        configurable: true,
        value:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      });

      Object.defineProperty(navigator, "standalone", {
        writable: true,
        configurable: true,
        value: true,
      });

      const { result } = renderHook(() => usePWAInstall());

      expect(result.current.installationStatus).toBe("installed");
    });
  });

  describe("promptInstall edge cases", () => {
    it("should handle promptInstall when no deferred prompt exists", async () => {
      const { result } = renderHook(() => usePWAInstall());

      await act(async () => {
        await result.current.promptInstall();
      });

      // Should not throw and should be a no-op
      expect(result.current.isInstallable).toBe(false);
    });
  });
});
