#!/usr/bin/env node
/**
 * CLI: Clear All Articles
 *
 * Deletes all articles from the database.
 * Usage: pnpm clear-articles
 *
 * WARNING: This will delete ALL articles and user article states!
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { resolve } from "path";
import { existsSync } from "fs";

async function main() {
  // Determine database path
  const dbPath =
    process.env.DATABASE_PATH || resolve(process.cwd(), "data/tuvix.db");

  if (!existsSync(dbPath)) {
    console.error(`❌ Error: Database not found at ${dbPath}`);
    console.error("Make sure you're running this from the API directory");
    console.error("and that the database has been initialized.");
    process.exit(1);
  }

  console.log(`📊 Using database: ${dbPath}`);

  try {
    // Connect to database
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    // Count articles before deletion
    const [articleCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.articles);

    const count = articleCount?.count || 0;

    if (count === 0) {
      console.log("ℹ️  No articles to delete");
      sqlite.close();
      process.exit(0);
    }

    console.log(`⚠️  About to delete ${count} articles...`);
    console.log(
      "   This will also delete all user article states (read/saved)."
    );

    // Delete all articles (cascade will auto-delete user_article_states)
    await db.delete(schema.articles);

    console.log(`✅ Successfully deleted ${count} articles`);

    sqlite.close();
    process.exit(0);
  } catch (error) {
    const err = error as { message?: string };
    console.error(
      "❌ Error clearing articles:",
      err.message || "Unknown error"
    );
    process.exit(1);
  }
}

main();
