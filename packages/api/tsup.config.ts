import { defineConfig } from "tsup";

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
});
