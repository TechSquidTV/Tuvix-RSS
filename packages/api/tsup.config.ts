import { defineConfig } from "tsup";
import path from "path";

export default defineConfig({
  entry: {
    "entries/node": "src/entries/node.ts",
    "db/migrate-local": "src/db/migrate-local.ts",
  },
  format: ["esm"],
  target: "node24",
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
  // BUILD-TIME ALIAS: Route @api/utils/sentry to sentry.node.ts (which wraps @sentry/node)
  // This replaces runtime detection with build-time SDK selection.
  // - Node.js builds: sentry.node.ts → @sentry/node (via this config)
  // - Cloudflare Workers: sentry.cloudflare.ts → @sentry/cloudflare (via wrangler)
  // - Tests: sentry.noop.ts (via vitest.config.ts alias)
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@api/utils/http-transport": path.resolve(
        import.meta.dirname,
        "./src/utils/http-transport.node.ts"
      ),
      "@api/utils/sentry": path.resolve(
        import.meta.dirname,
        "./src/utils/sentry.node.ts"
      ),
    };
  },
});
