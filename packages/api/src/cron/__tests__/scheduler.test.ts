/**
 * Cron Scheduler Tests
 *
 * Tests for Node.js cron scheduler initialization and cron expression conversion
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { initCronJobs } from "../scheduler";
import { createTestDb, cleanupTestDb } from "@/test/setup";
import * as schema from "@/db/schema";
import type { Env } from "@/types";

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(),
  },
}));

// Mock handlers
vi.mock("../handlers", () => ({
  handleRSSFetch: vi.fn(),
  handleArticlePrune: vi.fn(),
}));

// Mock services
vi.mock("@/services/global-settings", () => ({
  getGlobalSettings: vi.fn(),
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
    beforeEach(async () => {
      // Seed global settings
      await db.insert(schema.globalSettings).values({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      });

      // Mock getGlobalSettings to return the settings
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      } as any);
    });

    it("should initialize RSS fetch cron job with correct interval", async () => {
      await initCronJobs(env);

      // Should schedule RSS fetch
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "*/60 * * * *", // Every 60 minutes
        expect.any(Function)
      );
    });

    it("should initialize article prune cron job at 2 AM", async () => {
      await initCronJobs(env);

      // Should schedule prune at 2 AM
      expect(mockCronSchedule).toHaveBeenCalledWith(
        "0 2 * * *",
        expect.any(Function)
      );
    });

    it("should schedule both cron jobs", async () => {
      await initCronJobs(env);

      // Should be called 3 times: RSS fetch, article prune, token cleanup
      expect(mockCronSchedule).toHaveBeenCalledTimes(3);
    });

    it("should use fetchIntervalMinutes from global settings", async () => {
      // Update mock to return new settings
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 30,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "*/30 * * * *", // Every 30 minutes
        expect.any(Function)
      );
    });

    it("should handle RSS fetch errors in cron callback", async () => {
      // Ensure getGlobalSettings mock is set up correctly
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      } as any);

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { handleRSSFetch } = await import("../handlers");
      const error = new Error("RSS fetch failed");
      vi.mocked(handleRSSFetch).mockRejectedValue(error);

      await initCronJobs(env);

      // Get the RSS fetch callback
      const rssFetchCall = mockCronSchedule.mock.calls.find(
        (call) => call[0] === "*/60 * * * *"
      );
      expect(rssFetchCall).toBeDefined();

      // Execute the callback - it should throw but we catch it
      try {
        await rssFetchCall![1]();
      } catch (err) {
        // Expected - the callback throws the error
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "❌ RSS fetch cron job error:",
        error
      );

      consoleErrorSpy.mockRestore();
    });

    it("should handle article prune errors in cron callback", async () => {
      // Ensure getGlobalSettings mock is set up correctly
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      } as any);

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { handleArticlePrune } = await import("../handlers");
      const error = new Error("Prune failed");
      vi.mocked(handleArticlePrune).mockRejectedValue(error);

      await initCronJobs(env);

      // Get the prune callback
      const pruneCall = mockCronSchedule.mock.calls.find(
        (call) => call[0] === "0 2 * * *"
      );
      expect(pruneCall).toBeDefined();

      // Execute the callback - it should throw but we catch it
      try {
        await pruneCall![1]();
      } catch (err) {
        // Expected - the callback throws the error
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "❌ Prune cron job error:",
        error
      );

      consoleErrorSpy.mockRestore();
    });

    it("should log initialization messages", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await initCronJobs(env);

      expect(consoleSpy).toHaveBeenCalledWith("⏰ Initializing cron jobs...");
      expect(consoleSpy).toHaveBeenCalledWith("✅ Cron jobs initialized");
      expect(consoleSpy).toHaveBeenCalledWith(
        "   - RSS fetch: every 60 minutes"
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "   - Article prune: daily at 2 AM"
      );

      consoleSpy.mockRestore();
    });

    it("should throw error when initialization fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { getGlobalSettings } = await import("@/services/global-settings");
      const error = new Error("Database error");
      vi.mocked(getGlobalSettings).mockRejectedValue(error);

      await expect(initCronJobs(env)).rejects.toThrow("Database error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "❌ Failed to initialize cron jobs:",
        error
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("minutesToCronExpression (private function)", () => {
    beforeEach(async () => {
      // Seed global settings for these tests
      await db.insert(schema.globalSettings).values({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      });

      // Reset mock to return default settings
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: null,
        lastPruneAt: null,
        updatedAt: new Date(),
        updatedBy: null,
      } as any);
    });

    // Test the private function indirectly through initCronJobs
    it("should convert 5 minutes to */5 * * * *", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 5,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "*/5 * * * *",
        expect.any(Function)
      );
    });

    it("should convert 15 minutes to */15 * * * *", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 15,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "*/15 * * * *",
        expect.any(Function)
      );
    });

    it("should convert 60 minutes to */60 * * * *", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "*/60 * * * *",
        expect.any(Function)
      );
    });

    it("should convert 120 minutes (2 hours) to 0 */2 * * *", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 120,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "0 */2 * * *",
        expect.any(Function)
      );
    });

    it("should convert 1440 minutes (24 hours) to 0 0 * * *", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 1440,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "0 0 * * *",
        expect.any(Function)
      );
    });

    it("should convert 180 minutes (3 hours) to 0 */3 * * *", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 180,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "0 */3 * * *",
        expect.any(Function)
      );
    });

    it("should handle 1 minute interval", async () => {
      const { getGlobalSettings } = await import("@/services/global-settings");
      vi.mocked(getGlobalSettings).mockResolvedValue({
        id: 1,
        fetchIntervalMinutes: 1,
        pruneDays: 30,
      } as any);

      await initCronJobs(env);

      expect(mockCronSchedule).toHaveBeenCalledWith(
        "*/1 * * * *",
        expect.any(Function)
      );
    });
  });
});
