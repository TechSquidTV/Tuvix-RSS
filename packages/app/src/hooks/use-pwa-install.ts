import { useState, useEffect, useMemo, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type InstallationStatus =
  | "not-supported"
  | "installable"
  | "installed"
  | "ios-instructions";

interface UsePWAInstallReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isIOSInstalled: boolean;
  installationStatus: InstallationStatus;
  promptInstall: () => Promise<"accepted" | "dismissed" | void>;
  dismissPrompt: () => void;
}

// Extend window interface for iOS detection
interface ExtendedWindow extends Window {
  MSStream?: unknown;
}

// Extend navigator interface for iOS standalone detection and getInstalledRelatedApps
interface ExtendedNavigator extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<RelatedApplication[]>;
}

interface RelatedApplication {
  platform: string;
  url?: string;
  id?: string;
}

// Detect if running on iOS
function detectiOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as ExtendedWindow).MSStream
  );
}

// Detect if installed on iOS (standalone mode)
function detectIOSInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (navigator as ExtendedNavigator).standalone === true;
}

// Detect if running in standalone mode (any platform)
function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalledViaAPI, setIsInstalledViaAPI] = useState(false);

  // Platform detection (memoized to avoid unnecessary re-computation)
  const isIOS = useMemo(() => detectiOS(), []);
  const isIOSInstalled = useMemo(() => detectIOSInstalled(), []);
  const isStandalone = useMemo(() => detectStandalone(), []);

  // Combined installed state
  const isInstalled = isStandalone || isIOSInstalled || isInstalledViaAPI;

  // Check installation status using getInstalledRelatedApps API
  useEffect(() => {
    async function checkInstallation() {
      const extNavigator = navigator as ExtendedNavigator;
      if (extNavigator.getInstalledRelatedApps) {
        try {
          const relatedApps = await extNavigator.getInstalledRelatedApps();
          setIsInstalledViaAPI(relatedApps.length > 0);
        } catch (error) {
          console.warn("Error checking installed apps:", error);
        }
      }
    }

    // Only check if not already detected as installed via other methods
    if (!isStandalone && !isIOSInstalled && !isInstalledViaAPI) {
      checkInstallation();
    }
  }, [isStandalone, isIOSInstalled, isInstalledViaAPI]);

  useEffect(() => {
    // Skip if already installed
    if (isInstalled) {
      return;
    }

    // Listen for the beforeinstallprompt event (Chromium only)
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the default mini-infobar from appearing
      e.preventDefault();
      // Store the event for later use
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // Listen for successful installation
    const handleAppInstalled = () => {
      setIsInstalledViaAPI(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log("PWA was installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isInstalled]);

  // Determine installation status (memoized to prevent unnecessary re-computation)
  const getInstallationStatus = useCallback((): InstallationStatus => {
    if (isInstalled) {
      return "installed";
    }
    if (isIOS && !isIOSInstalled) {
      return "ios-instructions";
    }
    if (isInstallable) {
      return "installable";
    }
    return "not-supported";
  }, [isInstalled, isIOS, isIOSInstalled, isInstallable]);

  const promptInstall = async (): Promise<"accepted" | "dismissed" | void> => {
    if (!deferredPrompt) {
      return;
    }

    try {
      // Show the install prompt
      await deferredPrompt.prompt();

      // Wait for the user's response
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        console.log("User accepted the install prompt");
      } else {
        console.log("User dismissed the install prompt");
      }

      // Clear the deferred prompt
      setDeferredPrompt(null);
      setIsInstallable(false);

      // Return the outcome so component can handle it
      return outcome;
    } catch (error) {
      // Handle prompt errors (e.g., called more than once)
      console.error("Error showing install prompt:", error);
      // Reset state to prevent stuck state
      setDeferredPrompt(null);
      setIsInstallable(false);
      // Re-throw so component can handle it
      throw error;
    }
  };

  const dismissPrompt = () => {
    setIsInstallable(false);
  };

  return {
    isInstallable,
    isInstalled,
    isStandalone,
    isIOS,
    isIOSInstalled,
    installationStatus: getInstallationStatus(),
    promptInstall,
    dismissPrompt,
  };
}
