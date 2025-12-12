/**
 * Drizzle Kit Configuration
 *
 * This config is ONLY used for local development (Node.js environment).
 * It generates migration SQL files that work for both better-sqlite3 AND D1.
 *
 * Workflow:
 * 1. Local Dev: Generate migrations here → Apply with Drizzle Kit
 * 2. Cloudflare D1: Generate migrations here → Apply with Wrangler CLI
 *
 * Commands:
 * - Generate: pnpm db:generate
 * - Apply Local: pnpm db:migrate (or run migrations in code)
 * - Apply D1: wrangler d1 migrations apply DB --remote
 */

import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    // Relative to packages/api/ - points to project root /data/
    url: process.env.DATABASE_PATH || "../data/tuvix.db",
  },
} satisfies Config;
