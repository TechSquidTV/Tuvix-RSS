/**
 * OfflineIndicator Component Tests
 *
 * Tests for the offline status toast notifications
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { OfflineIndicator } from "../offline-indicator";
import * as useNetworkStatusModule from "@/hooks/use-network-status";
import { toast } from "sonner";

// Mock the useNetworkStatus hook
vi.mock("@/hooks/use-network-status");

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(() => "offline-toast-id"),
    success: vi.fn(() => "online-toast-id"),
    dismiss: vi.fn(),
  },
}));

describe("OfflineIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("when online", () => {
    it("should not show toast when online from start", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
      });

      render(<OfflineIndicator />);

      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("should not show toast when online", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });

      render(<OfflineIndicator />);

      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("when offline", () => {
    it("should show error toast when offline", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });

      render(<OfflineIndicator />);

      expect(toast.error).toHaveBeenCalledWith("You're offline", {
        description: "Some features may be unavailable",
        icon: expect.anything(),
        duration: Infinity,
      });
    });

    it("should show toast with infinite duration", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });

      render(<OfflineIndicator />);

      const callArgs = vi.mocked(toast.error).mock.calls[0];
      expect(callArgs[1]?.duration).toBe(Infinity);
    });

    it("should include WifiOff icon in offline toast", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });

      render(<OfflineIndicator />);

      const callArgs = vi.mocked(toast.error).mock.calls[0];
      expect(callArgs[1]?.icon).toBeDefined();
    });
  });

  describe("reconnection behavior", () => {
    it("should dismiss offline toast and show success toast when coming back online", () => {
      const { rerender } = render(<OfflineIndicator />);

      // Start offline
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });
      rerender(<OfflineIndicator />);

      expect(toast.error).toHaveBeenCalled();
      vi.clearAllMocks();

      // Go back online
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });
      rerender(<OfflineIndicator />);

      expect(toast.dismiss).toHaveBeenCalledWith("offline-toast-id");
      expect(toast.success).toHaveBeenCalledWith("Back online!", {
        description: "Syncing your data...",
        icon: expect.anything(),
        duration: 3000,
      });
    });

    it("should show success toast with 3 second duration", () => {
      const { rerender } = render(<OfflineIndicator />);

      // Start offline
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });
      rerender(<OfflineIndicator />);

      vi.clearAllMocks();

      // Go back online
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });
      rerender(<OfflineIndicator />);

      const callArgs = vi.mocked(toast.success).mock.calls[0];
      expect(callArgs[1]?.duration).toBe(3000);
    });

    it("should not show success toast if never went offline", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });

      render(<OfflineIndicator />);

      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.dismiss).not.toHaveBeenCalled();
    });

    it("should include Wifi icon in success toast", () => {
      const { rerender } = render(<OfflineIndicator />);

      // Start offline
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });
      rerender(<OfflineIndicator />);

      vi.clearAllMocks();

      // Go back online
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });
      rerender(<OfflineIndicator />);

      const callArgs = vi.mocked(toast.success).mock.calls[0];
      expect(callArgs[1]?.icon).toBeDefined();
    });
  });

  describe("transition states", () => {
    it("should handle offline -> online -> offline transitions", () => {
      const { rerender } = render(<OfflineIndicator />);

      // Online initially
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });
      rerender(<OfflineIndicator />);
      expect(toast.error).not.toHaveBeenCalled();

      // Go offline
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });
      rerender(<OfflineIndicator />);
      expect(toast.error).toHaveBeenCalled();

      vi.clearAllMocks();

      // Go online
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });
      rerender(<OfflineIndicator />);
      expect(toast.dismiss).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();

      vi.clearAllMocks();

      // Go offline again
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });
      rerender(<OfflineIndicator />);
      expect(toast.error).toHaveBeenCalled();
    });

    it("should dismiss offline toast on unmount", () => {
      const { unmount } = render(<OfflineIndicator />);

      // Start offline
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });

      unmount();

      expect(toast.dismiss).toHaveBeenCalledWith("offline-toast-id");
    });
  });

  describe("toast content", () => {
    it("should show appropriate offline message", () => {
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });

      render(<OfflineIndicator />);

      expect(toast.error).toHaveBeenCalledWith(
        "You're offline",
        expect.objectContaining({
          description: "Some features may be unavailable",
        })
      );
    });

    it("should show appropriate online message", () => {
      const { rerender } = render(<OfflineIndicator />);

      // Start offline
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: false,
      });
      rerender(<OfflineIndicator />);

      vi.clearAllMocks();

      // Go online
      vi.mocked(useNetworkStatusModule.useNetworkStatus).mockReturnValue({
        isOnline: true,
      });
      rerender(<OfflineIndicator />);

      expect(toast.success).toHaveBeenCalledWith(
        "Back online!",
        expect.objectContaining({
          description: "Syncing your data...",
        })
      );
    });
  });
});
