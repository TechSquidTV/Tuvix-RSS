/**
 * Test Helpers
 *
 * Common utilities for testing
 */

import { vi } from "vitest";
import { eq } from "drizzle-orm";
import type { SQLiteTable, SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Generate a unique email for testing
 */
export function generateTestEmail(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate a unique username for testing
 */
export function generateTestUsername(prefix = "user"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Wait for a specific amount of time (for async testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert that an error was thrown
 */
export async function expectError(
  fn: () => Promise<any>,
  expectedMessage?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error("Expected function to throw an error, but it did not");
  } catch (error) {
    if (error instanceof Error) {
      if (expectedMessage) {
        if (typeof expectedMessage === "string") {
          if (!error.message.includes(expectedMessage)) {
            throw new Error(
              `Expected error message to include "${expectedMessage}", but got "${error.message}"`
            );
          }
        } else {
          if (!expectedMessage.test(error.message)) {
            throw new Error(
              `Expected error message to match ${expectedMessage}, but got "${error.message}"`
            );
          }
        }
      }
      return error;
    }
    throw new Error(`Expected Error instance, got ${typeof error}`);
  }
}

/**
 * Mock fetch response for testing
 */
export function createMockResponse(
  body: string,
  options?: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  }
): Response {
  return new Response(body, {
    status: options?.status || 200,
    statusText: options?.statusText || "OK",
    headers: options?.headers || {},
  });
}

import type { Database } from "@/db/client";

/**
 * Get count of records in a table
 */
export async function getTableCount(
  db: Database,
  table: SQLiteTable
): Promise<number> {
  const result = await db.select().from(table);
  return result.length;
}

/**
 * Assert database record exists
 */
export async function assertRecordExists(
  db: Database,
  table: SQLiteTable & { id: SQLiteColumn },
  id: number
): Promise<void> {
  const result = await db.select().from(table).where(eq(table.id, id));
  if (result.length === 0) {
    throw new Error(`Expected record with id ${id} to exist in table`);
  }
}

/**
 * Assert database record does not exist
 */
export async function assertRecordNotExists(
  db: any,
  table: any,
  id: number
): Promise<void> {
  const result = await db.select().from(table).where(eq(table.id, id));
  if (result.length > 0) {
    throw new Error(`Expected record with id ${id} to not exist in table`);
  }
}

/**
 * Get current timestamp for testing
 */
export function getTestTimestamp(): Date {
  return new Date("2024-01-01T00:00:00.000Z");
}

/**
 * Mock console methods to avoid cluttering test output
 */
export function mockConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  console.info = vi.fn();

  return {
    restore: () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
    },
  };
}
