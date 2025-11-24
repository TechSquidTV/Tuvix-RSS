import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { TRPCProvider } from "./components/provider/trpc-provider";
import { AudioContextProvider } from "./contexts/audio-context";
import * as Sentry from "@sentry/react";

// Import styles
import "./index.css";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import { registerPWA } from "./pwa-register";

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultStaleTime: 5000,
  scrollRestoration: true,
  // Enable view transitions by default for all navigation
  defaultViewTransition: true,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Initialize Sentry AFTER router is created (so we can include router integration)
// Vite replaces import.meta.env.VITE_* variables at BUILD TIME
// If VITE_SENTRY_DSN is not set during build, it will be undefined in the bundle
const dsn = import.meta.env.VITE_SENTRY_DSN;
// Check for both undefined and empty string (defensive check)
if (dsn && typeof dsn === "string" && dsn.trim().length > 0) {
  const environment =
    import.meta.env.VITE_SENTRY_ENVIRONMENT ||
    import.meta.env.MODE ||
    "development";
  const release = import.meta.env.VITE_APP_VERSION;

  // Debug logging in development
  if (import.meta.env.DEV) {
    console.log("🔧 Sentry Configuration:", {
      dsn: dsn.substring(0, 20) + "...", // Log partial DSN for debugging
      environment,
      release,
      hasApiUrl: !!import.meta.env.VITE_API_URL,
    });
  }

  Sentry.init({
    dsn,
    environment,
    release,
    enableLogs: true, // Enable Sentry logs for better debugging

    // Performance monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.tanstackRouterBrowserTracingIntegration(router), // Router integration
      Sentry.replayIntegration({
        // Session replay configuration
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.feedbackIntegration({
        // User feedback widget (optional)
        autoInject: false, // We'll control when to show it
      }),
    ],

    // Performance tracing
    tracesSampleRate: 0.1, // 10% sampling

    // Session replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    // Trace propagation for distributed tracing
    // This enables tracing from frontend → backend tRPC calls
    // Uses VITE_API_URL to determine the API origin, with fallbacks for common patterns
    tracePropagationTargets: (() => {
      const targets: (string | RegExp)[] = [];

      // Add API URL from environment (extract origin from VITE_API_URL)
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl) {
        try {
          const url = new URL(apiUrl);
          targets.push(url.origin);
        } catch {
          // Invalid URL, skip
        }
      }

      // Add custom trace propagation targets from environment (comma-separated)
      const customTargets = import.meta.env
        .VITE_SENTRY_TRACE_PROPAGATION_TARGETS;
      if (customTargets) {
        customTargets.split(",").forEach((target: string) => {
          const trimmed = target.trim();
          if (trimmed) {
            // Support regex patterns (if starts with /^ and ends with $/)
            if (trimmed.startsWith("/^") && trimmed.endsWith("$/")) {
              try {
                const regexStr = trimmed.slice(1, -1); // Remove leading / and trailing $/
                targets.push(new RegExp(regexStr));
              } catch {
                // Invalid regex, add as string
                targets.push(trimmed);
              }
            } else {
              targets.push(trimmed);
            }
          }
        });
      }

      // No fallback defaults - require explicit configuration for security
      // Overly broad patterns could leak trace headers to unintended services
      if (targets.length === 0) {
        // Warn that configuration is required
        if (import.meta.env.DEV) {
          console.warn(
            "⚠️ No Sentry trace propagation targets configured. " +
              "Set VITE_API_URL or VITE_SENTRY_TRACE_PROPAGATION_TARGETS for distributed tracing. " +
              "Without this, distributed tracing between frontend and backend will not work.",
          );
        }
      }

      return targets;
    })(),

    // Filter out noise
    beforeSend(event) {
      // Only filter out actual API requests to health/debug endpoints, not page URLs
      // Check if this is an API request (not a page navigation)
      const requestUrl = event.request?.url;
      if (requestUrl) {
        // Filter out API health check requests
        if (requestUrl.includes("/health")) {
          return null;
        }
        // Only filter /debug-sentry if it's an API request (contains /api/ or /trpc/)
        // Don't filter if it's just the page URL
        if (
          requestUrl.includes("/debug-sentry") &&
          (requestUrl.includes("/api/") || requestUrl.includes("/trpc/"))
        ) {
          return null;
        }
      }
      return event;
    },
  });

  // Debug logging in development
  if (import.meta.env.DEV) {
    console.log("✅ Sentry initialized for frontend");
  }

  // Test Sentry is working (only in development)
  if (import.meta.env.DEV) {
    Sentry.captureMessage(
      "Sentry test message - initialization complete",
      "info",
    );
  }
} else {
  // Log more details in production to help debug
  const dsnValue = import.meta.env.VITE_SENTRY_DSN;
  console.warn(
    "⚠️ Sentry DSN not configured. Set VITE_SENTRY_DSN to enable error tracking.",
    {
      dsnType: typeof dsnValue,
      dsnValue: dsnValue ? `${dsnValue.substring(0, 20)}...` : dsnValue,
      isUndefined: dsnValue === undefined,
      isEmpty: dsnValue === "",
      buildTime: "VITE_* env vars must be set during build (CI/CD)",
    },
  );
}

// Register PWA service worker
registerPWA();

// Configure React 19 error hooks for Sentry (if Sentry is initialized)
if (dsn && typeof window !== "undefined") {
  // React 19 error handling hooks
  // onUncaughtError - for uncaught errors
  window.addEventListener("error", (event) => {
    Sentry.captureException(event.error || new Error(event.message), {
      contexts: {
        react: {
          componentStack: event.error?.stack,
        },
      },
    });
  });

  // onUnhandledRejection - for unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(event.reason, {
      contexts: {
        react: {
          type: "unhandledrejection",
        },
      },
    });
  });
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <TRPCProvider>
        <AudioContextProvider>
          <RouterProvider router={router} />
        </AudioContextProvider>
      </TRPCProvider>
    </StrictMode>,
  );
}
