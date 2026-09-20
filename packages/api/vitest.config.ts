import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Test environment
    environment: "node",

    // Disable watch mode by default (use --watch flag to enable)
    watch: false,

    // Global test setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        // Test files
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        // Test utilities
        "**/test/**",
        // Build output
        "**/dist/**",
        // Database migrations
        "**/drizzle/**",
        // CLI scripts
        "**/cli/**",
        // Adapters (integration layer)
        "**/adapters/**",
        // Config files
        "**/*.config.*",
        "**/node_modules/**",
      ],
      // Initial coverage thresholds (currently aspirational)
      thresholds: {
        lines: 0, // TODO: Increase as test coverage improves
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },

    // Include/exclude patterns
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "drizzle"],

    // Test timeout
    testTimeout: 10000,
  },

  // Path resolution - match tsconfig.json
  resolve: {
    alias: {
      // IMPORTANT: Sentry no-op alias must come BEFORE the general @api/utils alias
      // to ensure @api/utils/sentry resolves to the no-op implementation in tests
      "@api/utils/http-transport": path.resolve(
        import.meta.dirname,
        "./src/utils/http-transport.cloudflare.ts"
      ),
      "@api/utils/sentry": path.resolve(
        import.meta.dirname,
        "./src/utils/sentry.noop.ts"
      ),
      "@api/utils": path.resolve(import.meta.dirname, "./src/utils"),
      "@api/db": path.resolve(import.meta.dirname, "./src/db"),
      "@api/services": path.resolve(import.meta.dirname, "./src/services"),
      "@api/routers": path.resolve(import.meta.dirname, "./src/routers"),
      "@api/trpc": path.resolve(import.meta.dirname, "./src/trpc"),
      "@api/adapters": path.resolve(import.meta.dirname, "./src/adapters"),
      "@api/auth": path.resolve(import.meta.dirname, "./src/auth"),
      "@api/cron": path.resolve(import.meta.dirname, "./src/cron"),
      "@api/config": path.resolve(import.meta.dirname, "./src/config"),
      "@api/types": path.resolve(import.meta.dirname, "./src/types"),
      "@api": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
