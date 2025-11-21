/**
 * Local Database Reset Script
 *
 * WARNING: This will DELETE your local database and recreate it!
 * Only use this for local development when your database is out of sync.
 *
 * Usage: pnpm db:reset
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { dirname } from "path";

const dbPath = process.env.DATABASE_PATH || "./data/tuvix.db";

// Check if database exists
if (existsSync(dbPath)) {
  console.log(`⚠️  WARNING: This will DELETE your database at: ${dbPath}`);
  console.log("   All data will be lost!");
  console.log("");

  // Close any existing connections by deleting the file
  try {
    // Also delete WAL and SHM files if they exist
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    if (existsSync(walPath)) {
      unlinkSync(walPath);
      console.log(`   Deleted WAL file: ${walPath}`);
    }
    if (existsSync(shmPath)) {
      unlinkSync(shmPath);
      console.log(`   Deleted SHM file: ${shmPath}`);
    }

    unlinkSync(dbPath);
    console.log(`✅ Deleted existing database: ${dbPath}`);
  } catch (error) {
    console.error("❌ Error deleting database:", error);
    console.error("   Make sure no other process is using the database.");
    process.exit(1);
  }
} else {
  console.log(`ℹ️  No existing database found at: ${dbPath}`);
}

// Ensure data directory exists
const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.log(`✅ Created data directory: ${dataDir}`);
}

console.log(`\n📊 Creating new database: ${dbPath}`);
const sqlite = new Database(dbPath);

// Enable foreign keys
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

console.log("🔄 Running migrations...");
try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrations complete!");
  console.log(`\n🎉 Database reset complete! You can now start the app.`);
} catch (error) {
  console.error("❌ Migration error:", error);
  sqlite.close();
  process.exit(1);
}

sqlite.close();
