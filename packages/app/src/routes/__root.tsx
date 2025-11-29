import {
  createRootRouteWithContext,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { ThemeProvider } from "@/components/provider/theme-provider";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useMediaQuery } from "@/hooks/use-media-query";
import { authClient } from "@/lib/auth-client";
import type { RouterContext } from "@/lib/types/router-context";
import * as Sentry from "@sentry/react";

const RootLayout = () => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="grain-overlay" />
      <OfflineIndicator />
      <Outlet />
      <Toaster position={isDesktop ? "bottom-right" : "top-center"} />
      <PWAInstallPrompt />
    </ThemeProvider>
  );
};

function RootErrorComponent({ error }: { error: Error }) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="grain-overlay" />
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Something went wrong</CardTitle>
            </div>
            <CardDescription>
              An unexpected error occurred while rendering this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-mono text-muted-foreground break-all">
                {error.message}
              </p>
            </div>
            {import.meta.env.DEV && error.stack && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  View stack trace
                </summary>
                <pre className="mt-2 overflow-auto rounded-lg bg-muted p-2 text-xs">
                  {error.stack}
                </pre>
              </details>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              onClick={() => router.invalidate()}
              variant="default"
              className="flex-1"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button
              onClick={() => router.navigate({ to: "/" })}
              variant="outline"
              className="flex-1"
            >
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </CardFooter>
        </Card>
      </div>
      <Toaster position={isDesktop ? "bottom-right" : "top-center"} />
    </ThemeProvider>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    // Fetch session once at root level
    try {
      const sessionResult = await authClient.getSession();

      // Set Sentry user context for Session Replay identification (non-PII)
      if (sessionResult?.data?.user?.id) {
        Sentry.setUser({
          id: sessionResult.data.user.id.toString(),
        });
      } else {
        // Clear user context when no session
        Sentry.setUser(null);
      }

      return {
        auth: {
          session: sessionResult?.data || null,
        },
      };
    } catch (error) {
      // Clear user context on error
      Sentry.setUser(null);

      // Log session fetch errors to Sentry
      Sentry.captureException(error, {
        tags: {
          component: "root-route",
          operation: "session-fetch",
        },
        level: "warning",
      });

      // Fail open - allow navigation without session
      // The individual route guards will handle redirects
      console.warn("Failed to fetch session at root level:", error);
      return {
        auth: {
          session: null,
        },
      };
    }
  },
  component: RootLayout,
  errorComponent: RootErrorComponent,
});
