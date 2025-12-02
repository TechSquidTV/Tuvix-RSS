/**
 * Refresh Reddit Icons CLI
 *
 * Updates icon URLs for all Reddit feed sources by fetching from Reddit's about.json API.
 * This is useful after adding Reddit-specific icon discovery to ensure existing feeds get proper icons.
 *
 * Usage: tsx src/cli/refresh-reddit-icons.ts
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../db/schema";
import { discoverFavicon } from "../services/favicon-fetcher";
import { eq } from "drizzle-orm";

async function main() {
  const dbPath = process.env.DATABASE_PATH || "./data/tuvix.db";
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  console.log("🔍 Finding Reddit feed sources...");

  // Find all sources with reddit.com in the URL
  const allSources = await db.select().from(schema.sources);
  const redditSources = allSources.filter((source) =>
    source.url.includes("reddit.com")
  );

  console.log(`Found ${redditSources.length} Reddit feeds\n`);

  if (redditSources.length === 0) {
    console.log("No Reddit feeds found. Exiting.");
    sqlite.close();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const source of redditSources) {
    console.log(`Processing: ${source.title || source.url}`);
    console.log(`  Current icon: ${source.iconUrl || "(none)"}`);

    try {
      // Discover favicon (will use Reddit about.json API)
      const result = await discoverFavicon(source.url);

      if (result.iconUrl && result.iconUrl !== source.iconUrl) {
        // Update source with new icon URL
        await db
          .update(schema.sources)
          .set({
            iconUrl: result.iconUrl,
            updatedAt: new Date(),
          })
          .where(eq(schema.sources.id, source.id));

        console.log(`  ✅ Updated icon: ${result.iconUrl}`);
        updated++;
      } else if (result.iconUrl === source.iconUrl) {
        console.log(`  ℹ️  Icon unchanged`);
      } else {
        console.log(`  ⚠️  No icon found`);
      }
    } catch (error) {
      console.error(`  ❌ Failed: ${error}`);
      failed++;
    }

    console.log();
  }

  console.log("\n📊 Summary:");
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Unchanged: ${redditSources.length - updated - failed}`);

  sqlite.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
