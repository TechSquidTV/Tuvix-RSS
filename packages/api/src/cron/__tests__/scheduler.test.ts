/**
 * Cron Scheduler Tests
 *
 * Tests for Node.js cron scheduler initialization.
 * The scheduler now uses a 1-minute poll pattern with the shared executor.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initCronJobs } from "../scheduler";
import { createTestDb, cleanupTestDb } from "@/test/setup";
import type { Env } from "@/types";

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(),
  },
}));

// Mock the executor
vi.mock("../executor", () => ({
  executeScheduledTasks: vi.fn().mockResolvedValue({
    rssFetch: { executed: false },
    articlePrune: { executed: false },
    tokenCleanup: { executed: false },
  }),
}));

vi.mock("@/db/client", () => ({
  createDatabase: vi.fn(),
}));

describe("Cron Scheduler", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let env: Env;
  let mockCronSchedule: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = createTestDb();
    env = {
      BETTER_AUTH_SECRET: "test-secret",
      RUNTIME: "nodejs",
    } as Env;

    // Mock createDatabase to return our test db
    const { createDatabase } = await import("@/db/client");
    vi.mocked(createDatabase).mockReturnValue(db as any);

    // Get the mocked cron schedule function
    const cronModule = await import("node-cron");
    mockCronSchedule = (cronModule.default as any).schedule as ReturnType<
      typeof vi.fn
    >;
    mockCronSchedule.mockClear();
  });

  afterEach(() => {
    cleanupTestDb(db);
    vi.clearAllMocks();
  });

  describe("initCronJobs", () => {
    it("should schedule a single cron job polling every minute", async () => {
      await initCronJobs(env);

      // Should be called exactly once with every-minute pattern
      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "* * * * *",
        expect.any(Function)
      );
    });

    it("should call executeScheduledTasks when cron triggers", async () => {
      const { executeScheduledTasks } = await import("../executor");

      await initCronJobs(env);

      // Get the cron callback
      const cronCallback = mockCronSchedule.mock
        .calls[0]![1] as () => Promise<void>;

      // Execute the callback
      await cronCallback();

      expect(executeScheduledTasks).toHaveBeenCalledWith(env, db);
    });

    it("should handle errors without crashing the scheduler", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { executeScheduledTasks } = await import("../executor");
      const error = new Error("Test error");
      vi.mocked(executeScheduledTasks).mockRejectedValueOnce(error);

      await initCronJobs(env);

      // Get the cron callback
      const cronCallback = mockCronSchedule.mock
        .calls[0]![1] as () => Promise<void>;

      // Execute the callback - should not throw
      await expect(cronCallback()).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Cron job error:", error);

      consoleErrorSpy.mockRestore();
    });

    it("should log when tasks are executed", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { executeScheduledTasks } = await import("../executor");
      vi.mocked(executeScheduledTasks).mockResolvedValueOnce({
        rssFetch: { executed: true },
        articlePrune: { executed: false },
        tokenCleanup: { executed: false },
      });

      await initCronJobs(env);

      // Get and execute the cron callback
      const cronCallback = mockCronSchedule.mock
        .calls[0]![1] as () => Promise<void>;
      await cronCallback();

      expect(consoleSpy).toHaveBeenCalledWith("✅ Cron executed: RSS fetch");

      consoleSpy.mockRestore();
    });

    it("should log multiple executed tasks", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { executeScheduledTasks } = await import("../executor");
      vi.mocked(executeScheduledTasks).mockResolvedValueOnce({
        rssFetch: { executed: true },
        articlePrune: { executed: true, deletedCount: 10 },
        tokenCleanup: { executed: false },
      });

      await initCronJobs(env);

      // Get and execute the cron callback
      const cronCallback = mockCronSchedule.mock
        .calls[0]![1] as () => Promise<void>;
      await cronCallback();

      expect(consoleSpy).toHaveBeenCalledWith(
        "✅ Cron executed: RSS fetch, article prune"
      );

      consoleSpy.mockRestore();
    });

    it("should not log when no tasks are executed", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { executeScheduledTasks } = await import("../executor");
      vi.mocked(executeScheduledTasks).mockResolvedValueOnce({
        rssFetch: { executed: false },
        articlePrune: { executed: false },
        tokenCleanup: { executed: false },
      });

      await initCronJobs(env);

      // Clear initialization logs
      consoleSpy.mockClear();

      // Get and execute the cron callback
      const cronCallback = mockCronSchedule.mock
        .calls[0]![1] as () => Promise<void>;
      await cronCallback();

      // Should not log "Cron executed" when nothing ran
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("✅ Cron executed:")
      );

      consoleSpy.mockRestore();
    });

    it("should log initialization messages", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await initCronJobs(env);

      expect(consoleSpy).toHaveBeenCalledWith("⏰ Initializing cron jobs...");
      expect(consoleSpy).toHaveBeenCalledWith(
        "✅ Cron scheduler initialized (polling every minute)"
      );

      consoleSpy.mockRestore();
    });
  });
});
