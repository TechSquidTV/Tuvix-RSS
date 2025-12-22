/**
 * Admin Router Tests
 *
 * Tests for admin-only endpoints (user management, global settings, plans, stats)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestPlan,
  seedTestSource,
  seedTestSubscription,
} from "@/test/setup";
import { adminRouter } from "../admin";
import * as schema from "@/db/schema";

// Mock Better Auth
vi.mock("@/auth/better-auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      sendVerificationEmail: vi.fn().mockResolvedValue({ status: true }),
    },
  })),
}));

describe("Admin Router", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let adminUser: { id: number; username: string | null };
  let regularUser: { id: number; username: string | null };
  let otherUser: { id: number; username: string | null };

  beforeEach(async () => {
    db = createTestDb();
    const { user: admin } = await seedTestUser(db, {
      username: "adminuser",
      email: "admin@example.com",
      role: "admin",
    });
    adminUser = admin;

    const { user: regular } = await seedTestUser(db, {
      username: "regularuser",
      email: "regular@example.com",
      role: "user",
    });
    regularUser = regular;

    const { user: other } = await seedTestUser(db, {
      username: "otheruser",
      email: "other@example.com",
      role: "user",
    });
    otherUser = other;
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  const createAdminCaller = () => {
    return adminRouter.createCaller({
      db,
      user: { userId: adminUser.id, username: "adminuser", role: "admin" },
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  const createUserCaller = () => {
    return adminRouter.createCaller({
      db,
      user: { userId: regularUser.id, username: "regularuser", role: "user" },
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  describe("listUsers", () => {
    it("should list all users with pagination", async () => {
      const caller = createAdminCaller();
      const result = await caller.listUsers({ limit: 10, offset: 0 });

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.hasMore).toBe(false);
    });

    it("should filter users by role", async () => {
      const caller = createAdminCaller();
      const result = await caller.listUsers({
        limit: 10,
        offset: 0,
        role: "user",
      });

      expect(result.items.every((u) => u.role === "user")).toBe(true);
    });

    it("should filter users by plan", async () => {
      const plan = await seedTestPlan(db, { id: "test-plan" });
      await db
        .update(schema.user)
        .set({ plan: plan.id })
        .where(eq(schema.user.id, regularUser.id));

      const caller = createAdminCaller();
      const result = await caller.listUsers({
        limit: 10,
        offset: 0,
        plan: plan.id,
      });

      expect(result.items.every((u) => u.plan === plan.id)).toBe(true);
    });

    it("should filter users by banned status", async () => {
      await db
        .update(schema.user)
        .set({ banned: true })
        .where(eq(schema.user.id, regularUser.id));

      const caller = createAdminCaller();
      const result = await caller.listUsers({
        limit: 10,
        offset: 0,
        banned: true,
      });

      expect(result.items.every((u) => u.banned === true)).toBe(true);
    });

    it("should search users by username", async () => {
      const caller = createAdminCaller();
      const result = await caller.listUsers({
        limit: 10,
        offset: 0,
        search: "regular",
      });

      expect(result.items.some((u) => u.username.includes("regular"))).toBe(
        true
      );
    });

    it("should search users by email", async () => {
      const caller = createAdminCaller();
      const result = await caller.listUsers({
        limit: 10,
        offset: 0,
        search: "regular@example.com",
      });

      expect(result.items.some((u) => u.email.includes("regular"))).toBe(true);
    });

    it("should include usage and limits for each user", async () => {
      const caller = createAdminCaller();
      const result = await caller.listUsers({ limit: 10, offset: 0 });

      expect(result.items[0].usage).toBeDefined();
      expect(result.items[0].limits).toBeDefined();
      expect(result.items[0].usage.sourceCount).toBeGreaterThanOrEqual(0);
      expect(result.items[0].limits.maxSources).toBeGreaterThanOrEqual(0);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.listUsers({ limit: 10, offset: 0 })
      ).rejects.toThrow();
    });
  });

  describe("getUser", () => {
    it("should get user details with usage and limits", async () => {
      const caller = createAdminCaller();
      const result = await caller.getUser({ userId: regularUser.id });

      expect(result.id).toBe(regularUser.id);
      expect(result.username).toBe("regularuser");
      expect(result.usage).toBeDefined();
      expect(result.limits).toBeDefined();
      expect(result.customLimits).toBeDefined();
    });

    it("should throw error when user not found", async () => {
      const caller = createAdminCaller();
      await expect(caller.getUser({ userId: 99999 })).rejects.toThrow(
        "User not found"
      );
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.getUser({ userId: regularUser.id })
      ).rejects.toThrow();
    });
  });

  describe("banUser", () => {
    it("should ban a user", async () => {
      const caller = createAdminCaller();
      const result = await caller.banUser({
        userId: regularUser.id,
        banned: true,
        reason: "Test ban",
      });

      expect(result.success).toBe(true);

      const [user] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, regularUser.id));
      expect(user?.banned).toBe(true);
    });

    it("should unban a user", async () => {
      await db
        .update(schema.user)
        .set({ banned: true })
        .where(eq(schema.user.id, regularUser.id));

      const caller = createAdminCaller();
      const result = await caller.banUser({
        userId: regularUser.id,
        banned: false,
      });

      expect(result.success).toBe(true);

      const [user] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, regularUser.id));
      expect(user?.banned).toBe(false);
    });

    it("should prevent banning yourself", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.banUser({
          userId: adminUser.id,
          banned: true,
        })
      ).rejects.toThrow("Cannot ban your own account");
    });

    it("should log suspension action", async () => {
      const caller = createAdminCaller();
      await caller.banUser({
        userId: regularUser.id,
        banned: true,
        reason: "Test",
      });

      const logs = await db
        .select()
        .from(schema.securityAuditLog)
        .where(eq(schema.securityAuditLog.userId, regularUser.id));
      expect(logs.some((log) => log.action === "account_locked")).toBe(true);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.banUser({
          userId: otherUser.id,
          banned: true,
        })
      ).rejects.toThrow();
    });
  });

  describe("changePlan", () => {
    it("should change user plan", async () => {
      const plan = await seedTestPlan(db, { id: "new-plan" });

      const caller = createAdminCaller();
      const result = await caller.changePlan({
        userId: regularUser.id,
        plan: plan.id,
      });

      expect(result.success).toBe(true);

      const [user] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, regularUser.id));
      expect(user?.plan).toBe(plan.id);
    });

    it("should throw error when plan does not exist", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.changePlan({
          userId: regularUser.id,
          plan: "nonexistent-plan",
        })
      ).rejects.toThrow("does not exist");
    });

    it("should require admin role", async () => {
      const plan = await seedTestPlan(db, { id: "test-plan" });
      const userCaller = createUserCaller();
      await expect(
        userCaller.changePlan({
          userId: regularUser.id,
          plan: plan.id,
        })
      ).rejects.toThrow();
    });
  });

  describe("setCustomLimits", () => {
    it("should create custom limits for user", async () => {
      const caller = createAdminCaller();
      const result = await caller.setCustomLimits({
        userId: regularUser.id,
        maxSources: 100,
        maxPublicFeeds: 50,
        notes: "Test limits",
      });

      expect(result.success).toBe(true);

      const [limits] = await db
        .select()
        .from(schema.userLimits)
        .where(eq(schema.userLimits.userId, regularUser.id));
      expect(limits?.maxSources).toBe(100);
      expect(limits?.maxPublicFeeds).toBe(50);
      expect(limits?.notes).toBe("Test limits");
    });

    it("should update existing custom limits", async () => {
      await db.insert(schema.userLimits).values({
        userId: regularUser.id,
        maxSources: 50,
      });

      const caller = createAdminCaller();
      const result = await caller.setCustomLimits({
        userId: regularUser.id,
        maxSources: 200,
      });

      expect(result.success).toBe(true);

      const [limits] = await db
        .select()
        .from(schema.userLimits)
        .where(eq(schema.userLimits.userId, regularUser.id));
      expect(limits?.maxSources).toBe(200);
    });

    it("should allow null values to reset limits", async () => {
      await db.insert(schema.userLimits).values({
        userId: regularUser.id,
        maxSources: 50,
      });

      const caller = createAdminCaller();
      const result = await caller.setCustomLimits({
        userId: regularUser.id,
        maxSources: null,
      });

      expect(result.success).toBe(true);

      const [limits] = await db
        .select()
        .from(schema.userLimits)
        .where(eq(schema.userLimits.userId, regularUser.id));
      expect(limits?.maxSources).toBeNull();
    });

    it("should throw error when user not found", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.setCustomLimits({
          userId: 99999,
          maxSources: 100,
        })
      ).rejects.toThrow("User not found");
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.setCustomLimits({
          userId: regularUser.id,
          maxSources: 100,
        })
      ).rejects.toThrow();
    });
  });

  describe("removeCustomLimits", () => {
    it("should remove custom limits", async () => {
      await db.insert(schema.userLimits).values({
        userId: regularUser.id,
        maxSources: 100,
      });

      const caller = createAdminCaller();
      const result = await caller.removeCustomLimits({
        userId: regularUser.id,
      });

      expect(result.success).toBe(true);

      const limits = await db
        .select()
        .from(schema.userLimits)
        .where(eq(schema.userLimits.userId, regularUser.id));
      expect(limits.length).toBe(0);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.removeCustomLimits({ userId: regularUser.id })
      ).rejects.toThrow();
    });
  });

  describe("recalculateUsage", () => {
    it("should recalculate usage for user", async () => {
      const caller = createAdminCaller();
      const result = await caller.recalculateUsage({
        userId: regularUser.id,
      });

      expect(result.success).toBe(true);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.recalculateUsage({ userId: regularUser.id })
      ).rejects.toThrow();
    });
  });

  describe("resendVerificationEmail", () => {
    it("should successfully resend verification email to unverified user", async () => {
      // Create an unverified user
      const { user: unverifiedUser } = await seedTestUser(db, {
        username: "unverified",
        email: "unverified@example.com",
        emailVerified: false,
        role: "user",
      });

      // Enable email verification
      await db
        .update(schema.globalSettings)
        .set({ requireEmailVerification: true })
        .where(eq(schema.globalSettings.id, 1));

      const caller = createAdminCaller();
      const result = await caller.resendVerificationEmail({
        userId: unverifiedUser.id,
      });

      // Debug output
      if (!result.success) {
        console.log("TEST DEBUG - Result:", result);
      }

      expect(result.success).toBe(true);
      expect(result.message).toBe("Verification email sent successfully");
    });

    it("should return error when user is already verified", async () => {
      // regularUser is verified by default
      await db
        .update(schema.globalSettings)
        .set({ requireEmailVerification: true })
        .where(eq(schema.globalSettings.id, 1));

      const caller = createAdminCaller();
      const result = await caller.resendVerificationEmail({
        userId: regularUser.id,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("User email is already verified");
    });

    it("should return error when email verification is disabled", async () => {
      const { user: unverifiedUser } = await seedTestUser(db, {
        username: "unverified2",
        email: "unverified2@example.com",
        emailVerified: false,
        role: "user",
      });

      // Disable email verification (it's false by default, but explicitly set it)
      await db
        .update(schema.globalSettings)
        .set({ requireEmailVerification: false })
        .where(eq(schema.globalSettings.id, 1));

      const caller = createAdminCaller();
      const result = await caller.resendVerificationEmail({
        userId: unverifiedUser.id,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Email verification is not enabled");
    });

    it("should throw error when user not found", async () => {
      await db
        .update(schema.globalSettings)
        .set({ requireEmailVerification: true })
        .where(eq(schema.globalSettings.id, 1));

      const caller = createAdminCaller();
      await expect(
        caller.resendVerificationEmail({ userId: 99999 })
      ).rejects.toThrow("User not found");
    });

    it("should log security event on success", async () => {
      const { user: unverifiedUser } = await seedTestUser(db, {
        username: "unverified3",
        email: "unverified3@example.com",
        emailVerified: false,
        role: "user",
      });

      await db
        .update(schema.globalSettings)
        .set({ requireEmailVerification: true })
        .where(eq(schema.globalSettings.id, 1));

      const caller = createAdminCaller();
      await caller.resendVerificationEmail({ userId: unverifiedUser.id });

      const logs = await db
        .select()
        .from(schema.securityAuditLog)
        .where(eq(schema.securityAuditLog.action, "admin_resend_verification"));

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[logs.length - 1];
      expect(latestLog.success).toBe(true);
      expect(latestLog.userId).toBe(adminUser.id);
    });

    it("should require admin role", async () => {
      const { user: unverifiedUser } = await seedTestUser(db, {
        username: "unverified4",
        email: "unverified4@example.com",
        emailVerified: false,
        role: "user",
      });

      await db
        .update(schema.globalSettings)
        .set({ requireEmailVerification: true })
        .where(eq(schema.globalSettings.id, 1));

      const userCaller = createUserCaller();
      await expect(
        userCaller.resendVerificationEmail({ userId: unverifiedUser.id })
      ).rejects.toThrow();
    });
  });

  describe("deleteUser", () => {
    it("should delete a user", async () => {
      const caller = createAdminCaller();
      const result = await caller.deleteUser({ userId: otherUser.id });

      expect(result.success).toBe(true);

      const users = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, otherUser.id));
      expect(users.length).toBe(0);
    });

    it("should prevent deleting yourself", async () => {
      const caller = createAdminCaller();
      await expect(caller.deleteUser({ userId: adminUser.id })).rejects.toThrow(
        "Cannot delete your own account"
      );
    });

    it("should throw error when user not found", async () => {
      const caller = createAdminCaller();
      await expect(caller.deleteUser({ userId: 99999 })).rejects.toThrow(
        "User not found"
      );
    });

    it("should log deletion", async () => {
      const caller = createAdminCaller();
      await caller.deleteUser({ userId: otherUser.id });

      const logs = await db
        .select()
        .from(schema.securityAuditLog)
        .where(eq(schema.securityAuditLog.action, "account_locked"));
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.deleteUser({ userId: otherUser.id })
      ).rejects.toThrow();
    });
  });

  describe("getGlobalSettings", () => {
    it("should return global settings", async () => {
      // Delete migration-seeded row first (migration creates id=1)
      await db
        .delete(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));

      // Ensure settings exist
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

      const caller = createAdminCaller();
      const result = await caller.getGlobalSettings();

      expect(result.maxLoginAttempts).toBe(5);
      expect(result.fetchIntervalMinutes).toBe(60);
      expect(result.pruneDays).toBe(30);
    });

    it("should create default settings if none exist", async () => {
      const caller = createAdminCaller();
      const result = await caller.getGlobalSettings();

      expect(result.maxLoginAttempts).toBe(5);
      expect(result.allowRegistration).toBe(true);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(userCaller.getGlobalSettings()).rejects.toThrow();
    });
  });

  describe("updateGlobalSettings", () => {
    it("should update global settings", async () => {
      // Delete migration-seeded row first (migration creates id=1)
      await db
        .delete(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));

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

      const caller = createAdminCaller();
      const result = await caller.updateGlobalSettings({
        maxLoginAttempts: 10,
        fetchIntervalMinutes: 120,
      });

      expect(result.success).toBe(true);

      const [settings] = await db
        .select()
        .from(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));
      expect(settings?.maxLoginAttempts).toBe(10);
      expect(settings?.fetchIntervalMinutes).toBe(120);
    });

    it("should create settings if none exist", async () => {
      const caller = createAdminCaller();
      const result = await caller.updateGlobalSettings({
        maxLoginAttempts: 10,
      });

      expect(result.success).toBe(true);

      const [settings] = await db
        .select()
        .from(schema.globalSettings)
        .where(eq(schema.globalSettings.id, 1));
      expect(settings?.maxLoginAttempts).toBe(10);
    });

    it("should validate input ranges", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.updateGlobalSettings({
          maxLoginAttempts: 0, // Below minimum
        })
      ).rejects.toThrow();
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.updateGlobalSettings({ maxLoginAttempts: 10 })
      ).rejects.toThrow();
    });
  });

  describe("listPlans", () => {
    it("should list all plans", async () => {
      await seedTestPlan(db, { id: "plan1" });
      await seedTestPlan(db, { id: "plan2" });

      const caller = createAdminCaller();
      const result = await caller.listPlans();

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(userCaller.listPlans()).rejects.toThrow();
    });
  });

  describe("getPlan", () => {
    it("should get plan by id", async () => {
      await seedTestPlan(db, { id: "test-plan", name: "Test Plan" });

      const caller = createAdminCaller();
      const result = await caller.getPlan({ planId: "test-plan" });

      expect(result.id).toBe("test-plan");
      expect(result.name).toBe("Test Plan");
    });

    it("should throw error when plan not found", async () => {
      const caller = createAdminCaller();
      await expect(caller.getPlan({ planId: "nonexistent" })).rejects.toThrow(
        "Plan not found"
      );
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.getPlan({ planId: "test-plan" })
      ).rejects.toThrow();
    });
  });

  describe("createPlan", () => {
    it("should create a new plan", async () => {
      const caller = createAdminCaller();
      const result = await caller.createPlan({
        id: "new-admin-plan",
        name: "New Plan",
        maxSources: 100,
        maxPublicFeeds: 50,
        maxCategories: 200,
        apiRateLimitPerMinute: 120,
        publicFeedRateLimitPerMinute: 17,
        priceCents: 999,
        features: "Test features",
      });

      expect(result.success).toBe(true);

      const [plan] = await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, "new-admin-plan"));
      expect(plan?.name).toBe("New Plan");
    });

    it("should throw error when plan ID already exists", async () => {
      await seedTestPlan(db, { id: "existing-plan" });

      const caller = createAdminCaller();
      await expect(
        caller.createPlan({
          id: "existing-plan",
          name: "Duplicate",
          maxSources: 10,
          maxPublicFeeds: 5,
          maxCategories: 20,
          apiRateLimitPerMinute: 60,
          publicFeedRateLimitPerMinute: 2,
          priceCents: 0,
          features: "Test features",
        })
      ).rejects.toThrow("already exists");
    });

    it("should validate plan ID format", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.createPlan({
          id: "Invalid Plan ID", // Contains spaces
          name: "Test",
          maxSources: 10,
          maxPublicFeeds: 5,
          maxCategories: 20,
          apiRateLimitPerMinute: 60,
          publicFeedRateLimitPerMinute: 2,
          priceCents: 0,
        })
      ).rejects.toThrow();
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(
        userCaller.createPlan({
          id: "user-plan",
          name: "User Plan",
          maxSources: 10,
          maxPublicFeeds: 5,
          maxCategories: 20,
          apiRateLimitPerMinute: 60,
          publicFeedRateLimitPerMinute: 2,
          priceCents: 0,
        })
      ).rejects.toThrow();
    });
  });

  describe("updatePlan", () => {
    it("should update plan", async () => {
      await seedTestPlan(db, { id: "update-plan", name: "Old Name" });

      const caller = createAdminCaller();
      const result = await caller.updatePlan({
        id: "update-plan",
        name: "New Name",
        maxSources: 200,
      });

      expect(result.success).toBe(true);

      const [plan] = await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, "update-plan"));
      expect(plan?.name).toBe("New Name");
      expect(plan?.maxSources).toBe(200);
    });

    it("should throw error when plan not found", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.updatePlan({
          id: "nonexistent",
          name: "Updated",
        })
      ).rejects.toThrow("not found");
    });

    it("should require admin role", async () => {
      await seedTestPlan(db, { id: "test-plan" });
      const userCaller = createUserCaller();
      await expect(
        userCaller.updatePlan({
          id: "test-plan",
          name: "Hacked",
        })
      ).rejects.toThrow();
    });
  });

  describe("deletePlan", () => {
    it("should delete plan with no users", async () => {
      await seedTestPlan(db, { id: "delete-plan" });

      const caller = createAdminCaller();
      const result = await caller.deletePlan({ planId: "delete-plan" });

      expect(result.success).toBe(true);

      const plans = await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, "delete-plan"));
      expect(plans.length).toBe(0);
    });

    it("should throw error when users are assigned to plan", async () => {
      const plan = await seedTestPlan(db, { id: "popular-plan" });
      await db
        .update(schema.user)
        .set({ plan: plan.id })
        .where(eq(schema.user.id, regularUser.id));

      const caller = createAdminCaller();
      await expect(caller.deletePlan({ planId: plan.id })).rejects.toThrow(
        "users are assigned"
      );
    });

    it("should require admin role", async () => {
      await seedTestPlan(db, { id: "test-plan" });
      const userCaller = createUserCaller();
      await expect(
        userCaller.deletePlan({ planId: "test-plan" })
      ).rejects.toThrow();
    });
  });

  describe("getStats", () => {
    it("should return platform statistics", async () => {
      const caller = createAdminCaller();
      const result = await caller.getStats();

      expect(result.totalUsers).toBeGreaterThanOrEqual(3);
      expect(result.activeUsers).toBeGreaterThanOrEqual(0);
      expect(result.adminUsers).toBeGreaterThanOrEqual(1);
      expect(result.bannedUsers).toBeGreaterThanOrEqual(0);
      expect(result.usersByPlan).toBeDefined();
      expect(result.totalSources).toBeGreaterThanOrEqual(0);
      expect(result.totalPublicFeeds).toBeGreaterThanOrEqual(0);
      expect(result.totalCategories).toBeGreaterThanOrEqual(0);
      expect(result.totalArticles).toBeGreaterThanOrEqual(0);
    });

    it("should count users by plan correctly", async () => {
      const plan = await seedTestPlan(db, { id: "stats-plan" });
      // Update both tables to ensure consistency
      await db
        .update(schema.user)
        .set({ plan: plan.id })
        .where(eq(schema.user.id, regularUser.id));

      const caller = createAdminCaller();
      const result = await caller.getStats();

      expect(result.usersByPlan[plan.id]).toBeGreaterThanOrEqual(1);
    });

    it("should require admin role", async () => {
      const userCaller = createUserCaller();
      await expect(userCaller.getStats()).rejects.toThrow();
    });
  });

  describe("Rate Limit Monitoring", () => {
    describe("getRateLimitStats", () => {
      it("should return system-wide rate limit statistics", async () => {
        const caller = createAdminCaller();
        const result = await caller.getRateLimitStats();

        expect(result).toHaveProperty("totalPublicFeedAccessLast24h");
        expect(result).toHaveProperty("rateLimitEnabled");
        expect(typeof result.totalPublicFeedAccessLast24h).toBe("number");
        expect(typeof result.rateLimitEnabled).toBe("boolean");
      });

      it("should require admin role", async () => {
        const userCaller = createUserCaller();
        await expect(userCaller.getRateLimitStats()).rejects.toThrow();
      });
    });

    describe("getPublicFeedAccessLog", () => {
      beforeEach(async () => {
        // Seed a test feed
        const [feed] = await db
          .insert(schema.feeds)
          .values({
            userId: regularUser.id,
            slug: "test-feed",
            title: "Test Feed",
            public: true,
          })
          .returning();

        // Seed some access logs
        await db.insert(schema.publicFeedAccessLog).values([
          {
            feedId: feed.id,
            ipAddress: "192.168.1.1",
            userAgent: "Mozilla/5.0",
            accessedAt: new Date(),
          },
          {
            feedId: feed.id,
            ipAddress: "192.168.1.2",
            userAgent: "curl/7.68.0",
            accessedAt: new Date(Date.now() - 1000 * 60),
          },
        ]);
      });

      it("should return public feed access logs", async () => {
        const caller = createAdminCaller();
        const result = await caller.getPublicFeedAccessLog({
          limit: 10,
          offset: 0,
        });

        expect(result).toHaveProperty("items");
        expect(result).toHaveProperty("total");
        expect(Array.isArray(result.items)).toBe(true);
        expect(typeof result.total).toBe("number");
      });

      it("should include all required fields in log items", async () => {
        const caller = createAdminCaller();
        const result = await caller.getPublicFeedAccessLog({
          limit: 10,
          offset: 0,
        });

        if (result.items.length > 0) {
          const log = result.items[0];
          expect(log).toHaveProperty("id");
          expect(log).toHaveProperty("feedId");
          expect(log).toHaveProperty("feedSlug");
          expect(log).toHaveProperty("ownerUsername");
          expect(log).toHaveProperty("ipAddress");
          expect(log).toHaveProperty("accessedAt");
          expect(log.feedSlug).toBe("test-feed");
          expect(log.ownerUsername).toBe("regularuser");
        }
      });

      it("should support pagination", async () => {
        const caller = createAdminCaller();

        const page1 = await caller.getPublicFeedAccessLog({
          limit: 1,
          offset: 0,
        });

        const page2 = await caller.getPublicFeedAccessLog({
          limit: 1,
          offset: 1,
        });

        expect(page1.items.length).toBeLessThanOrEqual(1);
        expect(page2.items.length).toBeLessThanOrEqual(1);

        if (page1.items.length > 0 && page2.items.length > 0) {
          expect(page1.items[0].id).not.toBe(page2.items[0].id);
        }
      });

      it("should filter by feedId if provided", async () => {
        const [feed] = await db
          .select()
          .from(schema.feeds)
          .where(eq(schema.feeds.slug, "test-feed"))
          .limit(1);

        const caller = createAdminCaller();
        const result = await caller.getPublicFeedAccessLog({
          limit: 10,
          offset: 0,
          feedId: feed.id,
        });

        result.items.forEach((log) => {
          expect(log.feedId).toBe(feed.id);
        });
      });

      it("should order by accessedAt descending (most recent first)", async () => {
        const caller = createAdminCaller();
        const result = await caller.getPublicFeedAccessLog({
          limit: 10,
          offset: 0,
        });

        if (result.items.length > 1) {
          for (let i = 1; i < result.items.length; i++) {
            const prev = new Date(result.items[i - 1].accessedAt).getTime();
            const curr = new Date(result.items[i].accessedAt).getTime();
            expect(prev).toBeGreaterThanOrEqual(curr);
          }
        }
      });

      it("should require admin role", async () => {
        const userCaller = createUserCaller();
        await expect(
          userCaller.getPublicFeedAccessLog({ limit: 10, offset: 0 })
        ).rejects.toThrow();
      });
    });

    describe("listUsers with rate limit enabled flag", () => {
      it("should include rateLimitEnabled flag for all users", async () => {
        const caller = createAdminCaller();
        const result = await caller.listUsers({ limit: 10, offset: 0 });

        expect(result.items.length).toBeGreaterThan(0);

        result.items.forEach((user) => {
          expect(user).toHaveProperty("rateLimitEnabled");
          expect(typeof user.rateLimitEnabled).toBe("boolean");
        });
      });
    });

    describe("getUser with rate limit enabled flag", () => {
      it("should include rateLimitEnabled flag for the user", async () => {
        const caller = createAdminCaller();
        const result = await caller.getUser({ userId: regularUser.id });

        expect(result).toHaveProperty("rateLimitEnabled");
        expect(typeof result.rateLimitEnabled).toBe("boolean");
      });
    });
  });

  describe("Analytics Endpoints", () => {
    describe("getUserGrowth", () => {
      it("should return user growth data grouped by day", async () => {
        // Create users with different dates
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        await seedTestUser(db, {
          username: "user1",
          email: "user1@example.com",
        });
        await db
          .update(schema.user)
          .set({ createdAt: twoDaysAgo })
          .where(eq(schema.user.username, "user1"));

        await seedTestUser(db, {
          username: "user2",
          email: "user2@example.com",
        });
        await db
          .update(schema.user)
          .set({ createdAt: oneDayAgo })
          .where(eq(schema.user.username, "user2"));

        const caller = createAdminCaller();
        const result = await caller.getUserGrowth({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
        expect(
          result.data.every((d) => d.date && typeof d.count === "number")
        ).toBe(true);
      });

      it("should fill in missing days with zero counts", async () => {
        const caller = createAdminCaller();
        const result = await caller.getUserGrowth({ days: 5 });

        expect(result.data.length).toBe(5);
        // All days should be present, even if count is 0
        const dates = result.data.map((d) => d.date);
        const uniqueDates = new Set(dates);
        expect(uniqueDates.size).toBe(5);
      });

      it("should respect days parameter", async () => {
        const caller = createAdminCaller();
        const result7 = await caller.getUserGrowth({ days: 7 });
        const result30 = await caller.getUserGrowth({ days: 30 });

        expect(result7.data.length).toBe(7);
        expect(result30.data.length).toBe(30);
      });

      it("should require admin role", async () => {
        const userCaller = createUserCaller();
        await expect(userCaller.getUserGrowth({ days: 7 })).rejects.toThrow();
      });
    });

    describe("getSourceGrowth", () => {
      it("should return source growth data grouped by day", async () => {
        const source1 = await seedTestSource(db, {
          url: "https://example.com/feed1.xml",
        });
        await seedTestSource(db, {
          url: "https://example.com/feed2.xml",
        });

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        await db
          .update(schema.sources)
          .set({ createdAt: oneDayAgo })
          .where(eq(schema.sources.id, source1.id));

        const caller = createAdminCaller();
        const result = await caller.getSourceGrowth({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
      });

      it("should handle empty data", async () => {
        // Create a fresh DB with no sources
        cleanupTestDb(db);
        db = createTestDb();
        const { user: admin } = await seedTestUser(db, {
          username: "adminuser",
          email: "admin@example.com",
          role: "admin",
        });
        adminUser = admin;

        const caller = createAdminCaller();
        const result = await caller.getSourceGrowth({ days: 7 });

        expect(result.data.length).toBe(7);
        expect(result.data.every((d) => d.count === 0)).toBe(true);
      });
    });

    describe("getArticleActivity", () => {
      it("should return article activity grouped by day", async () => {
        const source = await seedTestSource(db);

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        // Create articles with publishedAt
        await db.insert(schema.articles).values([
          {
            sourceId: source.id,
            guid: "article-1",
            title: "Article 1",
            publishedAt: oneDayAgo,
          },
          {
            sourceId: source.id,
            guid: "article-2",
            title: "Article 2",
            publishedAt: now,
          },
          {
            sourceId: source.id,
            guid: "article-3",
            title: "Article 3",
            // No publishedAt, should use createdAt
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getArticleActivity({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
      });

      it("should use createdAt when publishedAt is null", async () => {
        const source = await seedTestSource(db);
        // Use a date that's definitely within the 7-day window
        const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
        const oneDayAgoStr = oneDayAgo.toISOString().split("T")[0];

        await db.insert(schema.articles).values({
          sourceId: source.id,
          guid: "article-no-pub",
          title: "Article without publishedAt",
          publishedAt: null,
          createdAt: oneDayAgo,
        });

        const caller = createAdminCaller();
        const result = await caller.getArticleActivity({ days: 7 });

        // Should still count the article - check if any day has count > 0
        const totalCount = result.data.reduce((sum, d) => sum + d.count, 0);
        expect(totalCount).toBeGreaterThan(0);

        // Verify the date is in the result set
        const hasDate = result.data.some((d) => d.date === oneDayAgoStr);
        expect(hasDate).toBe(true);
      });
    });

    describe("getPublicFeedAccess", () => {
      it("should return public feed access grouped by day", async () => {
        await seedTestSource(db);
        const feed = await db
          .insert(schema.feeds)
          .values({
            userId: regularUser.id,
            slug: "test-feed",
            title: "Test Feed",
            public: true,
          })
          .returning()
          .then((r) => r[0]);

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        await db.insert(schema.publicFeedAccessLog).values([
          {
            feedId: feed.id,
            ipAddress: "192.168.1.1",
            accessedAt: oneDayAgo,
          },
          {
            feedId: feed.id,
            ipAddress: "192.168.1.2",
            accessedAt: now,
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getPublicFeedAccess({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
      });

      it("should filter by date range", async () => {
        await seedTestSource(db);
        const feed = await db
          .insert(schema.feeds)
          .values({
            userId: regularUser.id,
            slug: "test-feed",
            title: "Test Feed",
            public: true,
          })
          .returning()
          .then((r) => r[0]);

        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

        await db.insert(schema.publicFeedAccessLog).values({
          feedId: feed.id,
          ipAddress: "192.168.1.1",
          accessedAt: tenDaysAgo,
        });

        const caller = createAdminCaller();
        const result = await caller.getPublicFeedAccess({ days: 7 });

        // Should not include the 10-day-old access
        const totalCount = result.data.reduce((sum, d) => sum + d.count, 0);
        expect(totalCount).toBe(0);
      });
    });

    describe("getApiUsage", () => {
      it("should return API usage grouped by endpoint and time", async () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        await db.insert(schema.apiUsageLog).values([
          {
            userId: regularUser.id,
            endpoint: "/api/articles.list",
            method: "GET",
            statusCode: 200,
            createdAt: oneDayAgo,
          },
          {
            userId: regularUser.id,
            endpoint: "/api/articles.list",
            method: "GET",
            statusCode: 200,
            createdAt: now,
          },
          {
            userId: regularUser.id,
            endpoint: "/api/categories.list",
            method: "GET",
            statusCode: 200,
            createdAt: now,
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getApiUsage({ days: 7 });

        expect(result.byEndpoint).toBeDefined();
        expect(result.overTime).toBeDefined();
        expect(Array.isArray(result.byEndpoint)).toBe(true);
        expect(Array.isArray(result.overTime)).toBe(true);
        expect(result.overTime.length).toBe(7);

        // Should have endpoint counts
        const articlesEndpoint = result.byEndpoint.find(
          (e) => e.endpoint === "/api/articles.list"
        );
        expect(articlesEndpoint).toBeDefined();
        expect(articlesEndpoint!.count).toBe(2);
      });

      it("should limit to top 10 endpoints", async () => {
        // Create 15 different endpoints
        for (let i = 0; i < 15; i++) {
          await db.insert(schema.apiUsageLog).values({
            userId: regularUser.id,
            endpoint: `/api/endpoint-${i}`,
            method: "GET",
            statusCode: 200,
            createdAt: new Date(),
          });
        }

        const caller = createAdminCaller();
        const result = await caller.getApiUsage({ days: 7 });

        expect(result.byEndpoint.length).toBeLessThanOrEqual(10);
      });

      it("should sort endpoints by count descending", async () => {
        await db.insert(schema.apiUsageLog).values([
          {
            userId: regularUser.id,
            endpoint: "/api/low",
            method: "GET",
            statusCode: 200,
            createdAt: new Date(),
          },
          {
            userId: regularUser.id,
            endpoint: "/api/high",
            method: "GET",
            statusCode: 200,
            createdAt: new Date(),
          },
          {
            userId: regularUser.id,
            endpoint: "/api/high",
            method: "GET",
            statusCode: 200,
            createdAt: new Date(),
          },
          {
            userId: regularUser.id,
            endpoint: "/api/high",
            method: "GET",
            statusCode: 200,
            createdAt: new Date(),
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getApiUsage({ days: 7 });

        expect(result.byEndpoint[0].count).toBeGreaterThanOrEqual(
          result.byEndpoint[1]?.count || 0
        );
      });
    });

    describe("getSecurityEvents", () => {
      it("should return security events grouped by day", async () => {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        await db.insert(schema.securityAuditLog).values([
          {
            userId: regularUser.id,
            action: "login",
            success: true,
            createdAt: oneDayAgo,
          },
          {
            userId: regularUser.id,
            action: "login",
            success: false,
            createdAt: now,
          },
          {
            userId: regularUser.id,
            action: "login",
            success: true,
            createdAt: now,
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getSecurityEvents({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
        expect(
          result.data.every(
            (d) =>
              typeof d.logins === "number" && typeof d.failedLogins === "number"
          )
        ).toBe(true);
      });

      it("should separate successful and failed logins", async () => {
        // Use a date that's definitely within the 7-day window
        const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
        const oneDayAgoStr = oneDayAgo.toISOString().split("T")[0];

        await db.insert(schema.securityAuditLog).values([
          {
            userId: regularUser.id,
            action: "login",
            success: true,
            createdAt: oneDayAgo,
          },
          {
            userId: regularUser.id,
            action: "login",
            success: true,
            createdAt: oneDayAgo,
          },
          {
            userId: regularUser.id,
            action: "login",
            success: false,
            createdAt: oneDayAgo,
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getSecurityEvents({ days: 7 });

        // Find the day's data
        const dayData = result.data.find((d) => d.date === oneDayAgoStr);
        expect(dayData).toBeDefined();
        expect(dayData!.logins).toBe(2);
        expect(dayData!.failedLogins).toBe(1);
      });

      it("should ignore non-login actions", async () => {
        const now = new Date();
        const nowDateStr = now.toISOString().split("T")[0];

        await db.insert(schema.securityAuditLog).values([
          {
            userId: regularUser.id,
            action: "password_change",
            success: true,
            createdAt: now,
          },
          {
            userId: regularUser.id,
            action: "logout",
            success: true,
            createdAt: now,
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getSecurityEvents({ days: 7 });

        // Find today's data - check all dates in case of timezone issues
        const todayData =
          result.data.find((d) => {
            const dataDate = new Date(d.date + "T00:00:00Z");
            const nowDate = new Date(nowDateStr + "T00:00:00Z");
            return dataDate.getTime() === nowDate.getTime();
          }) || result.data[result.data.length - 1]; // Fallback to last day if exact match fails

        expect(todayData).toBeDefined();
        // Non-login actions should not be counted
        expect(todayData!.logins).toBe(0);
        expect(todayData!.failedLogins).toBe(0);
      });
    });

    describe("getSubscriptionGrowth", () => {
      it("should return subscription growth grouped by day", async () => {
        const source = await seedTestSource(db);
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        const sub1 = await seedTestSubscription(db, regularUser.id, source.id);
        await db
          .update(schema.subscriptions)
          .set({ createdAt: oneDayAgo })
          .where(eq(schema.subscriptions.id, sub1.id));

        await seedTestSubscription(db, otherUser.id, source.id);

        const caller = createAdminCaller();
        const result = await caller.getSubscriptionGrowth({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
      });
    });

    describe("getArticlesRead", () => {
      it("should return articles read grouped by day", async () => {
        const source = await seedTestSource(db);
        const article1 = await db
          .insert(schema.articles)
          .values({
            sourceId: source.id,
            guid: "article-1",
            title: "Article 1",
          })
          .returning()
          .then((r) => r[0]);

        const article2 = await db
          .insert(schema.articles)
          .values({
            sourceId: source.id,
            guid: "article-2",
            title: "Article 2",
          })
          .returning()
          .then((r) => r[0]);

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

        await db.insert(schema.userArticleStates).values([
          {
            userId: regularUser.id,
            articleId: article1.id,
            read: true,
            updatedAt: oneDayAgo,
          },
          {
            userId: regularUser.id,
            articleId: article2.id,
            read: true,
            updatedAt: now,
          },
        ]);

        const caller = createAdminCaller();
        const result = await caller.getArticlesRead({ days: 7 });

        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(7);
      });

      it("should only count read articles", async () => {
        const source = await seedTestSource(db);
        const article = await db
          .insert(schema.articles)
          .values({
            sourceId: source.id,
            guid: "article-unread",
            title: "Unread Article",
          })
          .returning()
          .then((r) => r[0]);

        await db.insert(schema.userArticleStates).values({
          userId: regularUser.id,
          articleId: article.id,
          read: false,
          updatedAt: new Date(),
        });

        const caller = createAdminCaller();
        const result = await caller.getArticlesRead({ days: 7 });

        const totalCount = result.data.reduce((sum, d) => sum + d.count, 0);
        expect(totalCount).toBe(0);
      });

      it("should filter by date range", async () => {
        const source = await seedTestSource(db);
        const article = await db
          .insert(schema.articles)
          .values({
            sourceId: source.id,
            guid: "article-old",
            title: "Old Article",
          })
          .returning()
          .then((r) => r[0]);

        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

        await db.insert(schema.userArticleStates).values({
          userId: regularUser.id,
          articleId: article.id,
          read: true,
          updatedAt: tenDaysAgo,
        });

        const caller = createAdminCaller();
        const result = await caller.getArticlesRead({ days: 7 });

        const totalCount = result.data.reduce((sum, d) => sum + d.count, 0);
        expect(totalCount).toBe(0);
      });
    });
  });

  describe("Blocked Domains", () => {
    describe("listBlockedDomains", () => {
      it("should list all blocked domains with pagination", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        await db.insert(schema.blockedDomains).values([
          {
            domain: "example.com",
            reason: "spam",
            createdBy: user.id,
          },
          {
            domain: "spam.net",
            reason: "spam",
            createdBy: user.id,
          },
        ]);

        const result = await caller.listBlockedDomains({
          limit: 10,
          offset: 0,
        });

        expect(result.items.length).toBeGreaterThanOrEqual(2);
        expect(result.items.some((d) => d.domain === "example.com")).toBe(true);
      });

      it("should filter by search term", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        await db.insert(schema.blockedDomains).values([
          {
            domain: "example.com",
            reason: "spam",
            createdBy: user.id,
          },
          {
            domain: "spam.net",
            reason: "spam",
            createdBy: user.id,
          },
        ]);

        const result = await caller.listBlockedDomains({
          limit: 10,
          offset: 0,
          search: "example",
        });

        expect(result.items.every((d) => d.domain.includes("example"))).toBe(
          true
        );
      });

      it("should filter by reason", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        await db.insert(schema.blockedDomains).values([
          {
            domain: "spam.com",
            reason: "spam",
            createdBy: user.id,
          },
          {
            domain: "malware.net",
            reason: "malware",
            createdBy: user.id,
          },
        ]);

        const result = await caller.listBlockedDomains({
          limit: 10,
          offset: 0,
          reason: "spam",
        });

        expect(result.items.every((d) => d.reason === "spam")).toBe(true);
      });
    });

    describe("addBlockedDomain", () => {
      it("should add a blocked domain", async () => {
        const caller = createAdminCaller();

        const result = await caller.addBlockedDomain({
          domain: "example.com",
          reason: "spam",
          notes: "Test notes",
        });

        expect(result.domain).toBe("example.com");
        expect(result.reason).toBe("spam");
        expect(result.notes).toBe("Test notes");
        expect(result.id).toBeDefined();
      });

      it("should normalize domain (lowercase, remove www)", async () => {
        const caller = createAdminCaller();

        const result = await caller.addBlockedDomain({
          domain: "WWW.EXAMPLE.COM",
        });

        expect(result.domain).toBe("example.com");
      });

      it("should reject duplicate domains", async () => {
        const caller = createAdminCaller();

        await caller.addBlockedDomain({
          domain: "example.com",
        });

        await expect(
          caller.addBlockedDomain({
            domain: "example.com",
          })
        ).rejects.toThrow();
      });

      it("should accept wildcard patterns", async () => {
        const caller = createAdminCaller();

        const result = await caller.addBlockedDomain({
          domain: "*.example.com",
          reason: "malware",
        });

        expect(result.domain).toBe("*.example.com");
      });
    });

    describe("updateBlockedDomain", () => {
      it("should update reason and notes", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        const [blocked] = await db
          .insert(schema.blockedDomains)
          .values({
            domain: "example.com",
            reason: "spam",
            notes: "Old notes",
            createdBy: user.id,
          })
          .returning();

        const result = await caller.updateBlockedDomain({
          id: blocked.id,
          reason: "malware",
          notes: "New notes",
        });

        expect(result.reason).toBe("malware");
        expect(result.notes).toBe("New notes");
      });

      it("should reject updates to non-existent domain", async () => {
        const caller = createAdminCaller();

        await expect(
          caller.updateBlockedDomain({
            id: 99999,
            reason: "spam",
          })
        ).rejects.toThrow();
      });
    });

    describe("removeBlockedDomain", () => {
      it("should remove a blocked domain", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        const [blocked] = await db
          .insert(schema.blockedDomains)
          .values({
            domain: "example.com",
            reason: "spam",
            createdBy: user.id,
          })
          .returning();

        const result = await caller.removeBlockedDomain({ id: blocked.id });

        expect(result.success).toBe(true);

        // Verify it's gone
        const remaining = await db
          .select()
          .from(schema.blockedDomains)
          .where(eq(schema.blockedDomains.id, blocked.id));
        expect(remaining.length).toBe(0);
      });
    });

    describe("bulkAddBlockedDomains", () => {
      it("should add multiple domains", async () => {
        const caller = createAdminCaller();

        const result = await caller.bulkAddBlockedDomains({
          domains: "example.com\nspam.net\nmalware.org",
          reason: "spam",
        });

        expect(result.added).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.errors).toEqual([]);
      });

      it("should skip duplicate domains", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        await db.insert(schema.blockedDomains).values({
          domain: "example.com",
          reason: "spam",
          createdBy: user.id,
        });

        const result = await caller.bulkAddBlockedDomains({
          domains: "example.com\nspam.net",
        });

        expect(result.added).toBe(1);
        expect(result.skipped).toBe(1);
      });

      it("should handle comma-separated domains", async () => {
        const caller = createAdminCaller();

        const result = await caller.bulkAddBlockedDomains({
          domains: "example.com, spam.net, malware.org",
        });

        expect(result.added).toBe(3);
      });

      it("should report validation errors", async () => {
        const caller = createAdminCaller();

        const result = await caller.bulkAddBlockedDomains({
          domains: "example.com\nnot a valid domain\nspam.net",
        });

        expect(result.added).toBe(2);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(
          result.errors.some((e) => e.domain === "not a valid domain")
        ).toBe(true);
      });

      it("should handle large bulk inserts within parameter limits", async () => {
        const caller = createAdminCaller();

        // Create 30 domains (exceeds single chunk limit of 25)
        // Each domain insert uses 4 parameters, so 25 domains = 100 parameters (at limit)
        const domains = Array.from(
          { length: 30 },
          (_, i) => `domain${i}.com`
        ).join("\n");

        const result = await caller.bulkAddBlockedDomains({
          domains,
        });

        // Should successfully add all 30 domains (split into 2 chunks: 25 + 5)
        expect(result.added).toBe(30);
        expect(result.skipped).toBe(0);
        expect(result.errors).toEqual([]);
      });
    });

    describe("bulkRemoveBlockedDomains", () => {
      it("should remove multiple domains", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        const domains = await db
          .insert(schema.blockedDomains)
          .values([
            {
              domain: "example.com",
              reason: "spam",
              createdBy: user.id,
            },
            {
              domain: "spam.net",
              reason: "spam",
              createdBy: user.id,
            },
            {
              domain: "malware.org",
              reason: "malware",
              createdBy: user.id,
            },
          ])
          .returning();

        const result = await caller.bulkRemoveBlockedDomains({
          ids: domains.map((d) => d.id),
        });

        expect(result.removed).toBe(3);
      });

      it("should handle empty array", async () => {
        const caller = createAdminCaller();

        const result = await caller.bulkRemoveBlockedDomains({ ids: [] });

        expect(result.removed).toBe(0);
      });
    });

    describe("exportBlockedDomains", () => {
      it("should export domains as CSV", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        await db.insert(schema.blockedDomains).values({
          domain: "example.com",
          reason: "spam",
          notes: "Test notes",
          createdBy: user.id,
        });

        const csv = await caller.exportBlockedDomains();

        expect(csv).toContain("domain,reason,notes");
        expect(csv).toContain("example.com");
        expect(csv).toContain("spam");
      });

      it("should filter by reason when provided", async () => {
        const caller = createAdminCaller();
        const { user } = await seedTestUser(db, { role: "admin" });

        await db.insert(schema.blockedDomains).values([
          {
            domain: "spam.com",
            reason: "spam",
            createdBy: user.id,
          },
          {
            domain: "malware.net",
            reason: "malware",
            createdBy: user.id,
          },
        ]);

        const csv = await caller.exportBlockedDomains({ reason: "spam" });

        expect(csv).toContain("spam.com");
        expect(csv).not.toContain("malware.net");
      });
    });
  });
});
