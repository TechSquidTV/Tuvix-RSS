/**
 * Database Utility Functions
 *
 * Helpers for database operations that need to work across different database drivers.
 */

import type { Database } from "./client";

/**
 * Cloudflare D1's maximum number of bound parameters per query
 * SQLite typically supports 999, but D1 enforces a stricter limit of 100
 */
export const D1_MAX_PARAMETERS = 100;

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
      await stmt.execute();
    }
  }
}

/**
 * Split an array into chunks of a specified size
 * Useful for batching database operations that have parameter limits
 *
 * @param array The array to chunk
 * @param chunkSize Maximum size of each chunk
 * @returns Array of chunks
 *
 * @example
 * chunkArray([1, 2, 3, 4, 5], 2) // Returns [[1, 2], [3, 4], [5]]
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
