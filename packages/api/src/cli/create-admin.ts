#!/usr/bin/env node
/**
 * CLI: Create Admin User
 *
 * Promotes an existing user to admin role.
 * Usage: pnpm create-admin <username>
 *
 * Example:
 *   pnpm create-admin johndoe
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { promoteToAdmin } from "@/services/admin-init";
import { resolve } from "path";
import { existsSync } from "fs";

async function main() {
  // Get username from command line args
  const username = process.argv[2];

  if (!username) {
    console.error("❌ Error: Username is required");
    console.log("\nUsage: pnpm create-admin <username>");
    console.log("Example: pnpm create-admin johndoe");
    process.exit(1);
  }

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

    // Find user (Better Auth uses user table)
    const [user] = await db
      .select()
      .from(schema.user)
      .where(
        sql`COALESCE(${schema.user.username}, ${schema.user.name}) = ${username}`
      )
      .limit(1);

    if (!user) {
      console.error(`❌ Error: User '${username}' not found`);
      sqlite.close();
      process.exit(1);
    }

    // Check if already admin
    if (user.role === "admin") {
      console.log(`ℹ️  User '${username}' is already an admin`);
      sqlite.close();
      process.exit(0);
    }

    // Promote to admin
    await promoteToAdmin(db, user.id, "cli_promotion");

    // Fetch updated user to show current plan
    const [updatedUser] = await db
      .select({ plan: schema.user.plan })
      .from(schema.user)
      .where(eq(schema.user.id, user.id))
      .limit(1);

    console.log(`✅ Successfully promoted '${username}' to admin`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Plan: ${updatedUser?.plan ?? "unknown"}`);

    sqlite.close();
    process.exit(0);
  } catch (error) {
    const err = error as { message?: string };
    console.error(
      "❌ Error promoting user to admin:",
      err.message || "Unknown error"
    );
    process.exit(1);
  }
}

void main();
