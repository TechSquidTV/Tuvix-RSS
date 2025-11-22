/**
 * Global Settings Service Tests
 *
 * Tests for global settings retrieval and validation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, seedTestUser } from "@/test/setup";
import { getGlobalSettings } from "../global-settings";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Global Settings Service", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  describe("getGlobalSettings", () => {
    it("should return global settings when they exist", async () => {
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
      });

      const settings = await getGlobalSettings(db);

      expect(settings.maxLoginAttempts).toBe(5);
      expect(settings.loginAttemptWindowMinutes).toBe(15);
      expect(settings.lockoutDurationMinutes).toBe(30);
      expect(settings.allowRegistration).toBe(true);
      expect(settings.requireEmailVerification).toBe(false);
      expect(settings.passwordResetTokenExpiryHours).toBe(1);
      expect(settings.fetchIntervalMinutes).toBe(60);
      expect(settings.pruneDays).toBe(30);
      expect(settings.lastRssFetchAt).toBeNull();
      expect(settings.lastPruneAt).toBeNull();
      expect(settings.updatedAt).toBeInstanceOf(Date);
    });

    it("should return settings with timestamps when set", async () => {
      const now = new Date();
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 30,
        lastRssFetchAt: now,
        lastPruneAt: now,
      });

      const settings = await getGlobalSettings(db);

      expect(settings.lastRssFetchAt).toBeInstanceOf(Date);
      expect(settings.lastPruneAt).toBeInstanceOf(Date);
    });

    it("should create default settings when they do not exist", async () => {
      // getGlobalSettings now creates default settings if they don't exist
      const settings = await getGlobalSettings(db);

      expect(settings).toBeDefined();
      expect(settings.maxLoginAttempts).toBe(5);
      expect(settings.loginAttemptWindowMinutes).toBe(15);
      expect(settings.lockoutDurationMinutes).toBe(30);
      expect(settings.allowRegistration).toBe(true);
      expect(settings.requireEmailVerification).toBe(false);
      expect(settings.passwordResetTokenExpiryHours).toBe(1);
      expect(settings.fetchIntervalMinutes).toBe(60);
      expect(settings.pruneDays).toBe(30);
    });

    it("should validate fetchIntervalMinutes range", async () => {
      // Test below minimum
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 4, // Below minimum (5)
        pruneDays: 30,
      });

      await expect(getGlobalSettings(db)).rejects.toThrow(
        "fetchIntervalMinutes must be between 5-1440"
      );

      // Clean up
      await db
        .delete(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));

      // Test above maximum
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 1441, // Above maximum (1440)
        pruneDays: 30,
      });

      await expect(getGlobalSettings(db)).rejects.toThrow(
        "fetchIntervalMinutes must be between 5-1440"
      );
    });

    it("should validate pruneDays range", async () => {
      // Test below minimum
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: -1, // Below minimum (0)
      });

      await expect(getGlobalSettings(db)).rejects.toThrow(
        "pruneDays must be between 0-365"
      );

      // Clean up
      await db
        .delete(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));

      // Test above maximum
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 5,
        loginAttemptWindowMinutes: 15,
        lockoutDurationMinutes: 30,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 60,
        pruneDays: 366, // Above maximum (365)
      });

      await expect(getGlobalSettings(db)).rejects.toThrow(
        "pruneDays must be between 0-365"
      );
    });

    it("should return all required fields", async () => {
      // Create a user first for updatedBy foreign key
      const { user } = await seedTestUser(db, {
        username: "settings-updater",
        email: "updater@example.com",
      });

      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 10,
        loginAttemptWindowMinutes: 20,
        lockoutDurationMinutes: 45,
        allowRegistration: false,
        requireEmailVerification: true,
        passwordResetTokenExpiryHours: 2,
        fetchIntervalMinutes: 30,
        pruneDays: 60,
        updatedBy: user.id,
      });

      const settings = await getGlobalSettings(db);

      expect(settings).toHaveProperty("id");
      expect(settings).toHaveProperty("maxLoginAttempts");
      expect(settings).toHaveProperty("loginAttemptWindowMinutes");
      expect(settings).toHaveProperty("lockoutDurationMinutes");
      expect(settings).toHaveProperty("allowRegistration");
      expect(settings).toHaveProperty("requireEmailVerification");
      expect(settings).toHaveProperty("passwordResetTokenExpiryHours");
      expect(settings).toHaveProperty("fetchIntervalMinutes");
      expect(settings).toHaveProperty("pruneDays");
      expect(settings).toHaveProperty("lastRssFetchAt");
      expect(settings).toHaveProperty("lastPruneAt");
      expect(settings).toHaveProperty("updatedAt");
      expect(settings).toHaveProperty("updatedBy");
    });

    it("should handle edge case values correctly", async () => {
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 1,
        loginAttemptWindowMinutes: 1,
        lockoutDurationMinutes: 1,
        allowRegistration: false,
        requireEmailVerification: true,
        passwordResetTokenExpiryHours: 1,
        fetchIntervalMinutes: 5, // Minimum valid
        pruneDays: 0, // Minimum valid
      });

      const settings = await getGlobalSettings(db);

      expect(settings.fetchIntervalMinutes).toBe(5);
      expect(settings.pruneDays).toBe(0);
    });

    it("should handle maximum valid values", async () => {
      await db.insert(schema.globalSettings).values({
        maxLoginAttempts: 100,
        loginAttemptWindowMinutes: 1440,
        lockoutDurationMinutes: 10080,
        allowRegistration: true,
        requireEmailVerification: false,
        passwordResetTokenExpiryHours: 72,
        fetchIntervalMinutes: 1440, // Maximum valid
        pruneDays: 365, // Maximum valid
      });

      const settings = await getGlobalSettings(db);

      expect(settings.fetchIntervalMinutes).toBe(1440);
      expect(settings.pruneDays).toBe(365);
    });
  });
});
