/**
 * Database Client Factory
 *
 * Creates a Drizzle ORM instance based on the runtime environment.
 * - Node.js/Docker: Uses better-sqlite3
 * - Cloudflare Workers: Uses D1
 */

import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as schema from "./schema";
import type { Env } from "@/types";

export function createDatabase(env: Env) {
  const runtime = env.RUNTIME || "nodejs";

  if (runtime === "cloudflare") {
    // Cloudflare Workers with D1
    if (!env.DB) {
      throw new Error("D1 database binding (DB) not found");
    }

    // Note: D1 instrumentation with Sentry happens at the adapter level
    // (in cloudflare.ts) after Sentry is initialized via withSentry.
    // The env.DB passed here may already be instrumented if Sentry is configured.
    return drizzleD1(env.DB, { schema });
  } else {
    // Node.js/Docker with better-sqlite3
    const dbPath = env.DATABASE_PATH || "./data/tuvix.db";

    // Resolve to absolute path to ensure consistency regardless of working directory
    const absoluteDbPath = dbPath.startsWith("/")
      ? dbPath
      : path.resolve(process.cwd(), dbPath);

    // Ensure data directory exists
    const dataDir = path.dirname(absoluteDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const sqlite = new Database(absoluteDbPath);

    // Enable WAL mode for better concurrency
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    return drizzleSqlite(sqlite, { schema });
  }
}

export type Database = ReturnType<typeof createDatabase>;
