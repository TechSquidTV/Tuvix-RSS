/**
 * Admin Metrics Utilities Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  aggregateByDay,
  calculateStartDate,
  type TimeSeriesDataPoint,
} from "../admin-metrics";

describe("Admin Metrics Utilities", () => {
  describe("aggregateByDay", () => {
    it("should return empty array for 0 days", () => {
      const records = [{ createdAt: new Date("2024-01-15") }];
      const result = aggregateByDay(
        records,
        (r) => r.createdAt,
        0,
        new Date("2024-01-15")
      );

      expect(result).toEqual([]);
    });

    it("should aggregate records by day", () => {
      const records = [
        { createdAt: new Date("2024-01-15T10:00:00Z") },
        { createdAt: new Date("2024-01-15T15:00:00Z") },
        { createdAt: new Date("2024-01-16T12:00:00Z") },
      ];

      const result = aggregateByDay(
        records,
        (r) => r.createdAt,
        3,
        new Date("2024-01-15T00:00:00Z")
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: "2024-01-15", count: 2 });
      expect(result[1]).toEqual({ date: "2024-01-16", count: 1 });
      expect(result[2]).toEqual({ date: "2024-01-17", count: 0 });
    });

    it("should fill in missing days with count 0", () => {
      const records = [{ createdAt: new Date("2024-01-17T12:00:00Z") }];

      const result = aggregateByDay(
        records,
        (r) => r.createdAt,
        5,
        new Date("2024-01-15T00:00:00Z")
      );

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({ date: "2024-01-15", count: 0 });
      expect(result[1]).toEqual({ date: "2024-01-16", count: 0 });
      expect(result[2]).toEqual({ date: "2024-01-17", count: 1 });
      expect(result[3]).toEqual({ date: "2024-01-18", count: 0 });
      expect(result[4]).toEqual({ date: "2024-01-19", count: 0 });
    });

    it("should handle empty records array", () => {
      const result = aggregateByDay(
        [],
        (r: { createdAt: Date }) => r.createdAt,
        3,
        new Date("2024-01-15T00:00:00Z")
      );

      expect(result).toHaveLength(3);
      expect(result.every((d) => d.count === 0)).toBe(true);
    });

    it("should work with custom date extractor", () => {
      const records = [
        { accessedAt: new Date("2024-01-15T10:00:00Z") },
        { accessedAt: new Date("2024-01-15T12:00:00Z") },
      ];

      const result = aggregateByDay(
        records,
        (r) => r.accessedAt,
        2,
        new Date("2024-01-15T00:00:00Z")
      );

      expect(result[0]).toEqual({ date: "2024-01-15", count: 2 });
      expect(result[1]).toEqual({ date: "2024-01-16", count: 0 });
    });

    it("should handle records outside the date range", () => {
      const records = [
        { createdAt: new Date("2024-01-14T12:00:00Z") }, // Before range
        { createdAt: new Date("2024-01-15T12:00:00Z") }, // In range
        { createdAt: new Date("2024-01-20T12:00:00Z") }, // After range
      ];

      const result = aggregateByDay(
        records,
        (r) => r.createdAt,
        3,
        new Date("2024-01-15T00:00:00Z")
      );

      // Records outside range are grouped but won't appear in output
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: "2024-01-15", count: 1 });
    });

    it("should handle large number of records efficiently", () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        createdAt: new Date(
          "2024-01-15T00:00:00Z"
        ).getTime() + Math.floor(i / 100) * 24 * 60 * 60 * 1000,
      })).map((r) => ({ createdAt: new Date(r.createdAt) }));

      const result = aggregateByDay(
        records,
        (r) => r.createdAt,
        10,
        new Date("2024-01-15T00:00:00Z")
      );

      expect(result).toHaveLength(10);
      // Each of first 10 days should have 100 records
      expect(result[0].count).toBe(100);
    });
  });

  describe("calculateStartDate", () => {
    beforeEach(() => {
      // Mock Date.now() to return a fixed timestamp
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-20T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return date 1 day ago for days=1", () => {
      const result = calculateStartDate(1);

      expect(result.toISOString().split("T")[0]).toBe("2024-01-19");
    });

    it("should return date 7 days ago for days=7", () => {
      const result = calculateStartDate(7);

      expect(result.toISOString().split("T")[0]).toBe("2024-01-13");
    });

    it("should return date 30 days ago for days=30", () => {
      const result = calculateStartDate(30);

      expect(result.toISOString().split("T")[0]).toBe("2023-12-21");
    });

    it("should throw error for days=0", () => {
      expect(() => calculateStartDate(0)).toThrow(
        "calculateStartDate: 'days' must be a positive number (>= 1)"
      );
    });

    it("should throw error for negative days", () => {
      expect(() => calculateStartDate(-1)).toThrow(
        "calculateStartDate: 'days' must be a positive number (>= 1)"
      );
    });

    it("should throw error for non-finite days", () => {
      expect(() => calculateStartDate(Infinity)).toThrow(
        "calculateStartDate: 'days' must be a positive number (>= 1)"
      );
      expect(() => calculateStartDate(NaN)).toThrow(
        "calculateStartDate: 'days' must be a positive number (>= 1)"
      );
    });

    it("should handle large day values", () => {
      const result = calculateStartDate(365);

      expect(result.toISOString().split("T")[0]).toBe("2023-01-20");
    });

    it("should handle fractional days", () => {
      // 1.5 days = 36 hours
      const result = calculateStartDate(1.5);

      // Should be valid date approximately 1.5 days ago
      expect(result instanceof Date).toBe(true);
      expect(result.getTime()).toBeLessThan(Date.now());
    });
  });
});
