import { defineConfig } from "tsup";
import path from "path";

export default defineConfig({
  entry: {
    "entries/node": "src/entries/node.ts",
    "db/migrate-local": "src/db/migrate-local.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  minify: false,
  bundle: true,
  external: [
    // External packages that shouldn't be bundled
    "better-sqlite3",
    "bcrypt",
  ],
  noExternal: [
    // Bundle everything else including workspace packages
    "@tuvixrss/tricorder",
  ],
  splitting: false,
  treeshake: true,
  // BUILD-TIME ALIAS: Route @/utils/sentry to sentry.node.ts (which wraps @sentry/node)
  // This replaces runtime detection with build-time SDK selection.
  // - Node.js builds: sentry.node.ts → @sentry/node (via this config)
  // - Cloudflare Workers: sentry.cloudflare.ts → @sentry/cloudflare (via wrangler)
  // - Tests: sentry.noop.ts (via vitest.config.ts alias)
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@/utils/sentry": path.resolve(__dirname, "./src/utils/sentry.node.ts"),
    };
  },
});
