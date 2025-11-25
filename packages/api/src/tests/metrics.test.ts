/**
 * Metrics Utility Tests
 *
 * Verifies that metrics utilities work correctly in both Node.js and Cloudflare runtimes
 */

import { describe, it, expect } from "vitest";
import {
  emitCounter,
  emitGauge,
  emitDistribution,
  withTiming,
  emitMetrics,
} from "../utils/metrics";

describe("Metrics Utilities", () => {
  it("emitCounter should not throw in Node.js runtime", () => {
    expect(() => {
      emitCounter("test.counter", 1, { test: "true" });
    }).not.toThrow();
  });

  it("emitGauge should not throw in Node.js runtime", () => {
    expect(() => {
      emitGauge("test.gauge", 100, { test: "true" });
    }).not.toThrow();
  });

  it("emitDistribution should not throw in Node.js runtime", () => {
    expect(() => {
      emitDistribution("test.distribution", 150, "millisecond", {
        test: "true",
      });
    }).not.toThrow();
  });

  it("withTiming should execute function and measure time", async () => {
    const result = await withTiming(
      "test.timing",
      async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "success";
      },
      { test: "true" }
    );

    expect(result).toBe("success");
  });

  it("withTiming should rethrow errors and still emit metrics", async () => {
    await expect(
      withTiming(
        "test.timing_error",
        async () => {
          throw new Error("Test error");
        },
        { test: "true" }
      )
    ).rejects.toThrow("Test error");
  });

  it("emitMetrics should not throw with multiple metrics", () => {
    expect(() => {
      emitMetrics([
        {
          type: "counter",
          name: "test.multi_counter",
          value: 1,
          attributes: { test: "true" },
        },
        {
          type: "gauge",
          name: "test.multi_gauge",
          value: 50,
          attributes: { test: "true" },
        },
        {
          type: "distribution",
          name: "test.multi_distribution",
          value: 200,
          unit: "millisecond",
          attributes: { test: "true" },
        },
      ]);
    }).not.toThrow();
  });
});
