import { usePWAInstall } from "@/hooks/use-pwa-install";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Download, Info, Smartphone, Share } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export function PWAInstallCard() {
  const { installationStatus, promptInstall, isInstalled } = usePWAInstall();
  const [isInstalling, setIsInstalling] = useState(false);
  const prevInstalledRef = useRef(isInstalled);

  // Show success toast only when installation status changes to installed
  useEffect(() => {
    if (isInstalled && !prevInstalledRef.current && isInstalling) {
      toast.success("App installed successfully!");
    }
    prevInstalledRef.current = isInstalled;
  }, [isInstalled, isInstalling]);

  // Derive loading state: installing is done when installed
  const showLoading = isInstalling && !isInstalled;

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const outcome = await promptInstall();
      // If user dismissed the prompt, reset installing state
      if (outcome === "dismissed") {
        setIsInstalling(false);
      }
      // If accepted, useEffect will handle success toast when isInstalled changes
    } catch {
      toast.error("Failed to show install prompt. Please try again.");
      // Reset installing state on error
      setIsInstalling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Progressive Web App</CardTitle>
            <CardDescription>
              Install TuvixRSS for the best experience
            </CardDescription>
          </div>
          {installationStatus === "installed" && (
            <Badge className="flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700">
              <Check className="h-3 w-3" />
              Installed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {installationStatus === "installed" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <Check className="h-5 w-5 text-green-600 dark:text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">TuvixRSS is installed as an app</p>
                <p className="text-muted-foreground mt-1">
                  You're enjoying the full app experience with:
                </p>
              </div>
            </div>
            <ul className="ml-8 space-y-2 text-sm text-muted-foreground">
              <li>• Offline access to saved articles</li>
              <li>• Faster loading and app-like performance</li>
              <li>
                • System integration - RSS links open directly in TuvixRSS
              </li>
              <li>• Quick access from your home screen or dock</li>
            </ul>
          </div>
        )}

        {installationStatus === "installable" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-sm">
              <Download className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Install for the best experience</p>
                <p className="text-muted-foreground mt-1">
                  Get these benefits:
                </p>
              </div>
            </div>
            <ul className="ml-8 space-y-2 text-sm text-muted-foreground">
              <li>• Read saved articles offline, anytime</li>
              <li>• Native app-like speed and instant loading</li>
              <li>
                • Become your default RSS reader - all RSS links open in
                TuvixRSS
              </li>
              <li>• Launch directly from your device</li>
            </ul>
            <Button
              onClick={handleInstall}
              disabled={showLoading}
              className="w-full sm:w-auto"
            >
              <Download className="h-4 w-4 mr-2" />
              {showLoading ? "Installing..." : "Install App"}
            </Button>
          </div>
        )}

        {installationStatus === "ios-instructions" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 text-sm">
              <Smartphone className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Install on iOS</p>
                <p className="text-muted-foreground mt-1">
                  Follow these steps to install TuvixRSS:
                </p>
              </div>
            </div>
            <ol className="ml-8 space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="font-semibold min-w-[1.5rem]">1.</span>
                <span>
                  Tap the <Share className="inline h-4 w-4 mx-1" /> Share button
                  in Safari's toolbar
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold min-w-[1.5rem]">2.</span>
                <span>Scroll down and tap "Add to Home Screen"</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold min-w-[1.5rem]">3.</span>
                <span>Tap "Add" in the top right corner</span>
              </li>
            </ol>
            <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
              Once installed, you'll enjoy offline access, faster performance,
              and system integration with RSS links.
            </div>
          </div>
        )}

        {installationStatus === "not-supported" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm">
              <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  PWA installation not available in this browser
                </p>
                <p className="text-muted-foreground mt-1">
                  To install TuvixRSS as an app, please use one of these
                  browsers:
                </p>
              </div>
            </div>
            <ul className="ml-8 space-y-1 text-sm text-muted-foreground">
              <li>• Chrome or Edge on desktop</li>
              <li>• Safari on iOS/macOS</li>
              <li>• Chrome on Android</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
