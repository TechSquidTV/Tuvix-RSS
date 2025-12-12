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
      // IMPORTANT: Sentry no-op alias must come BEFORE the general @/utils alias
      // to ensure @/utils/sentry resolves to the no-op implementation in tests
      "@/utils/sentry": path.resolve(__dirname, "./src/utils/sentry.noop.ts"),
      "@/utils": path.resolve(__dirname, "./src/utils"),
      "@/db": path.resolve(__dirname, "./src/db"),
      "@/services": path.resolve(__dirname, "./src/services"),
      "@/routers": path.resolve(__dirname, "./src/routers"),
      "@/trpc": path.resolve(__dirname, "./src/trpc"),
      "@/adapters": path.resolve(__dirname, "./src/adapters"),
      "@/auth": path.resolve(__dirname, "./src/auth"),
      "@/cron": path.resolve(__dirname, "./src/cron"),
      "@/config": path.resolve(__dirname, "./src/config"),
      "@/types": path.resolve(__dirname, "./src/types"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
