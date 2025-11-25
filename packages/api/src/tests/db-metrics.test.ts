/**
 * Database Metrics Utility Tests
 *
 * Verifies that database query wrappers work correctly in both runtimes
 */

import { describe, it, expect } from "vitest";
import {
  withQueryMetrics,
  getRowCount,
  emitRowCountMetric,
} from "../utils/db-metrics";

describe("Database Metrics Utilities", () => {
  it("withQueryMetrics should execute query and return result", async () => {
    const mockQuery = async () => {
      return [{ id: 1 }, { id: 2 }, { id: 3 }];
    };

    const result = await withQueryMetrics("test.query", mockQuery, {
      "db.table": "test_table",
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 1 });
  });

  it("withQueryMetrics should rethrow query errors", async () => {
    const mockQuery = async () => {
      throw new Error("Database error");
    };

    await expect(
      withQueryMetrics("test.query_error", mockQuery)
    ).rejects.toThrow("Database error");
  });

  it("getRowCount should extract count from array results", () => {
    const result = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(getRowCount(result)).toBe(3);
  });

  it("getRowCount should extract count from Drizzle batch results", () => {
    const result = { rows: [{ id: 1 }, { id: 2 }] };
    expect(getRowCount(result)).toBe(2);
  });

  it("getRowCount should extract rowsAffected from mutation results", () => {
    const result = { rowsAffected: 5 };
    expect(getRowCount(result)).toBe(5);
  });

  it("getRowCount should return undefined for non-countable results", () => {
    expect(getRowCount(null)).toBeUndefined();
    expect(getRowCount(undefined)).toBeUndefined();
    expect(getRowCount("string")).toBeUndefined();
    expect(getRowCount(123)).toBeUndefined();
  });

  it("emitRowCountMetric should not throw when called", () => {
    const result = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(() => {
      emitRowCountMetric("test.query", result, "test_table");
    }).not.toThrow();
  });

  it("emitRowCountMetric should handle non-countable results gracefully", () => {
    expect(() => {
      emitRowCountMetric("test.query", null);
    }).not.toThrow();
  });
});
