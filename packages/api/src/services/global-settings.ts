/**
 * Global Settings Service
 *
 * Centralized helper for reading global settings from the database.
 * Used by cron schedulers, handlers, and adapters.
 */

import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// Generic database type that works with both D1 and better-sqlite3
type Database =
  | DrizzleD1Database<typeof schema>
  | BetterSQLite3Database<typeof schema>;

/**
 * Global settings type
 */
export interface GlobalSettings {
  id: number;
  maxLoginAttempts: number;
  loginAttemptWindowMinutes: number;
  lockoutDurationMinutes: number;
  allowRegistration: boolean;
  requireEmailVerification: boolean;
  adminBypassEmailVerification: boolean;
  passwordResetTokenExpiryHours: number;
  fetchIntervalMinutes: number;
  pruneDays: number;
  lastRssFetchAt: Date | null;
  lastPruneAt: Date | null;
  lastTokenCleanupAt: Date | null;
  aiEnabled: boolean;
  updatedAt: Date;
  updatedBy: number | null;
}

/**
 * Get global settings from database
 * Creates default settings if they don't exist
 *
 * @param db Database connection
 * @returns Global settings object
 * @throws Error if settings are invalid
 */
export async function getGlobalSettings(db: Database): Promise<GlobalSettings> {
  let [settings] = await db
    .select()
    .from(schema.globalSettings)
    .where(eq(schema.globalSettings.id, 1))
    .limit(1);

  // If no settings exist, create defaults
  if (!settings) {
    await db.insert(schema.globalSettings).values({
      id: 1,
      maxLoginAttempts: 5,
      loginAttemptWindowMinutes: 15,
      lockoutDurationMinutes: 30,
      allowRegistration: true,
      requireEmailVerification: false,
      adminBypassEmailVerification: true,
      passwordResetTokenExpiryHours: 1,
      fetchIntervalMinutes: 60,
      pruneDays: 30,
      updatedAt: new Date(),
    });

    // Fetch the newly created settings
    [settings] = await db
      .select()
      .from(schema.globalSettings)
      .where(eq(schema.globalSettings.id, 1))
      .limit(1);

    if (!settings) {
      throw new Error("Failed to create default global settings");
    }
  }

  // Validate critical settings
  if (
    settings.fetchIntervalMinutes < 5 ||
    settings.fetchIntervalMinutes > 1440
  ) {
    throw new Error(
      `Invalid global setting: fetchIntervalMinutes must be between 5-1440, got ${settings.fetchIntervalMinutes}`
    );
  }

  if (settings.pruneDays < 0 || settings.pruneDays > 365) {
    throw new Error(
      `Invalid global setting: pruneDays must be between 0-365, got ${settings.pruneDays}`
    );
  }

  return {
    id: settings.id,
    maxLoginAttempts: settings.maxLoginAttempts,
    loginAttemptWindowMinutes: settings.loginAttemptWindowMinutes,
    lockoutDurationMinutes: settings.lockoutDurationMinutes,
    allowRegistration: settings.allowRegistration,
    requireEmailVerification: settings.requireEmailVerification,
    adminBypassEmailVerification: settings.adminBypassEmailVerification ?? true,
    passwordResetTokenExpiryHours: settings.passwordResetTokenExpiryHours,
    fetchIntervalMinutes: settings.fetchIntervalMinutes,
    pruneDays: settings.pruneDays,
    lastRssFetchAt: settings.lastRssFetchAt,
    lastPruneAt: settings.lastPruneAt,
    lastTokenCleanupAt: settings.lastTokenCleanupAt,
    aiEnabled: settings.aiEnabled,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}
