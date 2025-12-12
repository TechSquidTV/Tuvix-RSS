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
  // BUILD-TIME ALIAS: Use no-op Sentry for Node.js builds
  // This replaces runtime detection with build-time SDK selection.
  // Cloudflare Workers builds use @sentry/cloudflare directly (not via this config).
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@/utils/sentry": path.resolve(__dirname, "./src/utils/sentry.noop.ts"),
    };
  },
});
