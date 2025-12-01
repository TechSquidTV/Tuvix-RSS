import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const config = {
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["tuvixrss.svg", "grain.gif", "icons/*.png"],
        manifest: false, // Using external manifest.webmanifest
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/trpc/, /^\/public/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/api\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-cache",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 5, // 5 minutes
                },
                networkTimeoutSeconds: 10,
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/i,
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Match route chunks with query parameters like ?tsr-split=component
              urlPattern: ({ url }) => {
                return (
                  url.pathname.startsWith("/src/") &&
                  /\.(tsx?|jsx?)$/.test(url.pathname)
                );
              },
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "route-chunks-cache",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: false, // Disable PWA in dev to avoid service worker caching issues with code splitting
          type: "module",
          navigateFallback: "index.html",
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@tuvix/api": path.resolve(__dirname, "../api/src/index.ts"),
      },
    },
    server: {
      proxy: {
        // Proxy public RSS feed requests to the API server
        "/public": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      exclude: ["class-variance-authority"],
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true,
      // Disable watch mode by default (use --watch flag to enable)
      watch: false,
      coverage: {
        provider: "v8" as const,
        reporter: ["text", "json", "html", "lcov"],
        exclude: [
          // Exclude shadcn/ui components
          "src/components/ui/**",
          // Exclude third-party radix primitives
          "**/node_modules/**",
          "**/@radix-ui/**",
          "**/primitives/**",
          // Exclude test files
          "**/*.test.{ts,tsx}",
          "**/*.spec.{ts,tsx}",
          // Exclude config files
          "vite.config.ts",
          "tailwind.config.ts",
          "*.config.{js,ts}",
          // Exclude generated files
          "src/routeTree.gen.ts",
          // Exclude setup and test utilities
          "src/test/**",
          // Standard exclusions
          "dist/**",
          // Exclude tRPC hooks - these are mostly mutation wrappers with toast callbacks
          // that require full tRPC integration testing rather than unit tests.
          // Core logic is tested, but mutation callbacks (onSuccess/onError) are not.
          "src/lib/hooks/useArticles.ts",
          "src/lib/hooks/useData.ts",
        ],
        thresholds: {
          lines: 60,
          branches: 60,
          functions: 60,
          statements: 60,
        },
      },
    },
  };

  // Only define test environment variables when running tests
  // For production builds, rely on environment variables set by CI/CD
  if (mode === "test") {
    return {
      ...config,
      define: {
        "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(
          "https://test@test.ingest.sentry.io/123",
        ),
        "import.meta.env.VITE_API_URL": JSON.stringify(
          "http://localhost:3001/trpc",
        ),
        "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify("test"),
      },
    };
  }

  return config;
});
