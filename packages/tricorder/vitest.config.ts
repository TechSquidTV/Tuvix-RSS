import { defineConfig } from "vitest/config";

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
        // Config files
        "**/*.config.*",
        "**/node_modules/**",
      ],
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },

    // Include/exclude patterns
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],

    // Test timeout
    testTimeout: 10000,
  },
});
