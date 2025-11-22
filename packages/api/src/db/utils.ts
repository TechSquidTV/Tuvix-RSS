/**
 * Database Utility Functions
 *
 * Helpers for database operations that need to work across different database drivers.
 */

import type { Database } from "./client";

/**
 * Type guard to check if database supports batch operations
 * D1 supports batch(), better-sqlite3 does not
 */
type DatabaseWithBatch = Database & {
  batch: (
    statements: Array<{ execute: () => Promise<unknown> }>
  ) => Promise<unknown[]>;
};

export function supportsBatch(db: Database): db is DatabaseWithBatch {
  return "batch" in db && typeof (db as DatabaseWithBatch).batch === "function";
}

/**
 * Execute statements in batch if supported, otherwise sequentially
 * This handles the difference between D1 (has batch) and better-sqlite3 (no batch)
 */
export async function executeBatch<
  T extends { execute: () => Promise<unknown> },
>(db: Database, statements: T[]): Promise<void> {
  if (statements.length === 0) {
    return;
  }

  if (supportsBatch(db)) {
    // D1: Use batch API for better performance
    await db.batch(statements);
  } else {
    // better-sqlite3: Execute sequentially
    for (const stmt of statements) {
      await stmt;
    }
  }
}
