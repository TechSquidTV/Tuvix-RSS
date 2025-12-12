import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PWAInstallCard } from "../pwa-install-card";
import * as usePWAInstallModule from "@/hooks/use-pwa-install";
import { toast } from "sonner";

// Mock dependencies
vi.mock("@/hooks/use-pwa-install");
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("PWAInstallCard", () => {
  const mockPromptInstall = vi.fn();
  const mockDismissPrompt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Installed state", () => {
    beforeEach(() => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: false,
        isInstalled: true,
        isStandalone: true,
        isiOS: false,
        isIOSInstalled: false,
        installationStatus: "installed",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });
    });

    it("should render installed state with success badge", () => {
      render(<PWAInstallCard />);

      expect(screen.getByText("Installed")).toBeInTheDocument();
      expect(
        screen.getByText("TuvixRSS is installed as an app"),
      ).toBeInTheDocument();
    });

    it("should display benefits list when installed", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByText(/Offline access to saved articles/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Faster loading and app-like performance/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/System integration - RSS links open directly/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Quick access from your home screen or dock/i),
      ).toBeInTheDocument();
    });

    it("should not show install button when installed", () => {
      render(<PWAInstallCard />);

      expect(
        screen.queryByRole("button", { name: /install app/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Installable state (Chromium)", () => {
    beforeEach(() => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: true,
        isInstalled: false,
        isStandalone: false,
        isiOS: false,
        isIOSInstalled: false,
        installationStatus: "installable",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });
    });

    it("should render install button", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByRole("button", { name: /install app/i }),
      ).toBeInTheDocument();
    });

    it("should display benefits list for installable state", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByText(/Read saved articles offline/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Native app-like speed and instant loading/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Become your default RSS reader/i),
      ).toBeInTheDocument();
    });

    it("should call promptInstall when install button is clicked", async () => {
      const user = userEvent.setup();
      mockPromptInstall.mockResolvedValue(undefined);

      render(<PWAInstallCard />);

      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      expect(mockPromptInstall).toHaveBeenCalledTimes(1);
    });

    it("should show success toast on successful installation", async () => {
      const user = userEvent.setup();
      mockPromptInstall.mockResolvedValue(undefined);

      render(<PWAInstallCard />);

      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "App installed successfully!",
        );
      });
    });

    it("should show error toast on installation failure", async () => {
      const user = userEvent.setup();
      mockPromptInstall.mockRejectedValue(new Error("Installation failed"));

      render(<PWAInstallCard />);

      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "Failed to install app. Please try again.",
        );
      });
    });

    it("should disable button and show loading state during installation", async () => {
      const user = userEvent.setup();
      let resolveInstall: () => void;
      mockPromptInstall.mockReturnValue(
        new Promise((resolve) => {
          resolveInstall = resolve as () => void;
        }),
      );

      render(<PWAInstallCard />);

      const installButton = screen.getByRole("button", {
        name: /install app/i,
      });
      await user.click(installButton);

      // Button should be disabled and show loading text
      expect(installButton).toBeDisabled();
      expect(screen.getByText("Installing...")).toBeInTheDocument();

      // Resolve the promise
      resolveInstall!();

      await waitFor(() => {
        expect(screen.getByText("Install App")).toBeInTheDocument();
      });
    });
  });

  describe("iOS instructions state", () => {
    beforeEach(() => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: false,
        isInstalled: false,
        isStandalone: false,
        isiOS: true,
        isIOSInstalled: false,
        installationStatus: "ios-instructions",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });
    });

    it("should render iOS installation instructions", () => {
      render(<PWAInstallCard />);

      expect(screen.getByText("Install on iOS")).toBeInTheDocument();
      expect(
        screen.getByText(/Follow these steps to install TuvixRSS/i),
      ).toBeInTheDocument();
    });

    it("should display step-by-step iOS instructions", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByText(/Tap the.*Share button in Safari's toolbar/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Scroll down and tap "Add to Home Screen"/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Tap "Add" in the top right corner/i),
      ).toBeInTheDocument();
    });

    it("should not show install button for iOS", () => {
      render(<PWAInstallCard />);

      expect(
        screen.queryByRole("button", { name: /install app/i }),
      ).not.toBeInTheDocument();
    });

    it("should show benefits in info box", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByText(
          /Once installed, you'll enjoy offline access, faster performance/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Not supported state", () => {
    beforeEach(() => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: false,
        isInstalled: false,
        isStandalone: false,
        isiOS: false,
        isIOSInstalled: false,
        installationStatus: "not-supported",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });
    });

    it("should render not supported message", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByText(/PWA installation not available in this browser/i),
      ).toBeInTheDocument();
    });

    it("should display supported browsers list", () => {
      render(<PWAInstallCard />);

      expect(
        screen.getByText(/Chrome or Edge on desktop/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Safari on iOS\/macOS/i)).toBeInTheDocument();
      expect(screen.getByText(/Chrome on Android/i)).toBeInTheDocument();
    });

    it("should not show install button", () => {
      render(<PWAInstallCard />);

      expect(
        screen.queryByRole("button", { name: /install app/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Card structure", () => {
    beforeEach(() => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: false,
        isInstalled: false,
        isStandalone: false,
        isiOS: false,
        isIOSInstalled: false,
        installationStatus: "not-supported",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });
    });

    it("should always render card title and description", () => {
      render(<PWAInstallCard />);

      expect(screen.getByText("Progressive Web App")).toBeInTheDocument();
      expect(
        screen.getByText("Install TuvixRSS for the best experience"),
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper button labels in installable state", () => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: true,
        isInstalled: false,
        isStandalone: false,
        isiOS: false,
        isIOSInstalled: false,
        installationStatus: "installable",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });

      render(<PWAInstallCard />);

      const button = screen.getByRole("button", { name: /install app/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAccessibleName();
    });

    it("should use semantic list elements for instructions", () => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: false,
        isInstalled: false,
        isStandalone: false,
        isiOS: true,
        isIOSInstalled: false,
        installationStatus: "ios-instructions",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });

      const { container } = render(<PWAInstallCard />);

      // Should have an ordered list for iOS instructions
      const orderedList = container.querySelector("ol");
      expect(orderedList).toBeInTheDocument();
      expect(orderedList?.children).toHaveLength(3); // 3 steps
    });

    it("should use semantic list elements for benefits", () => {
      vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
        isInstallable: true,
        isInstalled: false,
        isStandalone: false,
        isiOS: false,
        isIOSInstalled: false,
        installationStatus: "installable",
        promptInstall: mockPromptInstall,
        dismissPrompt: mockDismissPrompt,
      });

      const { container } = render(<PWAInstallCard />);

      // Should have an unordered list for benefits
      const unorderedList = container.querySelector("ul");
      expect(unorderedList).toBeInTheDocument();
    });
  });
});
