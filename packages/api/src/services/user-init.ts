/**
 * User Initialization Service
 *
 * Handles atomic user initialization after Better Auth creates the user:
 * - Set user role and plan
 * - Create default user settings
 * - Initialize usage stats
 *
 * Uses D1 batch for atomic operations when available.
 */

import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { executeBatch } from "@/db/utils";
import type { Database } from "@/db/client";

// ============================================================================
// TYPES
// ============================================================================

export interface InitializeUserOptions {
  role: "user" | "admin";
  plan: string;
}

// ============================================================================
// INITIALIZE NEW USER
// ============================================================================

/**
 * Initialize a new user with role, settings, and usage stats.
 *
 * Uses D1 batch for atomic operations - all succeed or all fail together.
 * On better-sqlite3 (tests/Docker), executes sequentially.
 *
 * @param db Database connection
 * @param userId User ID (from Better Auth)
 * @param options Role and plan to assign
 * @throws Error if any initialization step fails
 */
export async function initializeNewUser(
  db: Database,
  userId: number,
  options: InitializeUserOptions
): Promise<void> {
  // Build all initialization statements
  const roleUpdate = db
    .update(schema.user)
    .set({ role: options.role, plan: options.plan })
    .where(eq(schema.user.id, userId));

  const settingsInsert = db.insert(schema.userSettings).values({ userId });

  const usageInsert = db.insert(schema.usageStats).values({
    userId,
    sourceCount: 0,
    publicFeedCount: 0,
    categoryCount: 0,
    articleCount: 0,
    lastUpdated: new Date(),
  });

  // Execute atomically via executeBatch
  // D1: Uses db.batch() - all succeed or all roll back
  // better-sqlite3: Executes sequentially
  await executeBatch(db, [roleUpdate, settingsInsert, usageInsert]);
}
