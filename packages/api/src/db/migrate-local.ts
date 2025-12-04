/**
 * Local Database Migration Script
 *
 * Run migrations for local SQLite database (Docker/Node.js).
 * For Workers, use: wrangler d1 execute
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { Env } from "@/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run migrations for a local SQLite database
 * @param env - Environment configuration (optional, uses process.env if not provided)
 * @returns Promise that resolves when migrations are complete
 */
export async function runMigrationsIfNeeded(
  env?: Pick<Env, "DATABASE_PATH">
): Promise<void> {
  const dbPath =
    env?.DATABASE_PATH ||
    process.env.DATABASE_PATH ||
    resolve(process.cwd(), "./data/tuvix.db");

  // Resolve to absolute path to avoid issues with working directory
  const absoluteDbPath = dbPath.startsWith("/")
    ? dbPath
    : resolve(process.cwd(), dbPath);

  // Ensure data directory exists
  const dataDir = dirname(absoluteDbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created data directory: ${dataDir}`);
  }

  // Resolve migrations folder path
  // Try multiple possible locations:
  // 1. Relative to source file (for dev): src/db/../../drizzle
  // 2. Relative to dist (for production): dist/db/../../drizzle
  // 3. Relative to process.cwd() (fallback): ./drizzle or packages/api/drizzle
  let migrationsFolder = resolve(__dirname, "../../drizzle");

  // If that doesn't exist, try from process.cwd()
  if (!existsSync(migrationsFolder)) {
    const cwdDrizzle = resolve(process.cwd(), "drizzle");
    const apiDrizzle = resolve(process.cwd(), "packages/api/drizzle");

    if (existsSync(cwdDrizzle)) {
      migrationsFolder = cwdDrizzle;
    } else if (existsSync(apiDrizzle)) {
      migrationsFolder = apiDrizzle;
    }
  }

  if (!existsSync(migrationsFolder)) {
    throw new Error(
      `Migrations folder not found. Tried: ${resolve(__dirname, "../../drizzle")}, ${resolve(process.cwd(), "drizzle")}, ${resolve(process.cwd(), "packages/api/drizzle")}`
    );
  }

  console.log(`🔄 Running migrations for database: ${absoluteDbPath}`);
  const sqlite = new Database(absoluteDbPath);

  try {
    // Enable foreign keys
    sqlite.pragma("foreign_keys = ON");

    const db = drizzle(sqlite);

    // Run migrations
    migrate(db, { migrationsFolder });
    console.log("✅ Migrations complete!");
  } catch (error) {
    sqlite.close();
    throw error;
  } finally {
    sqlite.close();
  }
}

// CLI entry point - run migrations if this file is executed directly
// Note: This check is disabled when bundled to prevent double-execution
const isMainModule =
  typeof process !== "undefined" &&
  import.meta.url === `file://${process.argv[1]}` &&
  // Additional check: only run if not bundled (dist/entries would indicate bundled)
  !process.argv[1]?.includes("dist/entries");

if (isMainModule) {
  runMigrationsIfNeeded()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Migration error:", error);
      process.exit(1);
    });
}
