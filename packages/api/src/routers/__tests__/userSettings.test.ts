/**
 * User Settings Router Tests
 *
 * Tests for user settings management endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestCategory,
} from "@/test/setup";
import { userSettingsRouter } from "../userSettings";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("User Settings Router", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };
  let otherUser: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db, {
      username: "testuser",
      email: "test@example.com",
    });
    testUser = user;

    const { user: other } = await seedTestUser(db, {
      username: "otheruser",
      email: "other@example.com",
    });
    otherUser = other;
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  const createCaller = (userId: number) => {
    return userSettingsRouter.createCaller({
      db,
      user: { userId, username: "testuser", role: "user" },
      env: { SKIP_RATE_LIMIT: "true" } as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  describe("get", () => {
    it("should create default settings if they don't exist", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.get();

      expect(result.userId).toBe(testUser.id);
      expect(result.theme).toBe("system");
      expect(result.autoAgeDays).toBe(7);
      expect(result.defaultFilter).toBe("all");
      expect(result.shareEmail).toBe(true);
      expect(result.shareHackernews).toBe(false);
      expect(result.shareReddit).toBe(false);
      expect(result.shareTwitter).toBe(false);
      expect(result.shareBluesky).toBe(false);
      expect(result.shareMastodon).toBe(false);
    });

    it("should return existing settings if they exist", async () => {
      // Create custom settings
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        theme: "dark",
        autoAgeDays: 14,
        defaultFilter: "unread",
        shareEmail: false,
      });

      const caller = createCaller(testUser.id);
      const result = await caller.get();

      expect(result.userId).toBe(testUser.id);
      expect(result.theme).toBe("dark");
      expect(result.autoAgeDays).toBe(14);
      expect(result.defaultFilter).toBe("unread");
      expect(result.shareEmail).toBe(false);
    });

    it("should return settings for correct user", async () => {
      // Create settings for both users
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        theme: "dark",
      });
      await db.insert(schema.userSettings).values({
        userId: otherUser.id,
        theme: "light",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.get();

      expect(result.userId).toBe(testUser.id);
      expect(result.theme).toBe("dark");
    });
  });

  describe("update", () => {
    it("should create default settings if they don't exist before updating", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.update({
        theme: "dark",
      });

      expect(result.userId).toBe(testUser.id);
      expect(result.theme).toBe("dark");
      // Other fields should have defaults
      expect(result.autoAgeDays).toBe(7);
      expect(result.defaultFilter).toBe("all");
    });

    it("should update theme", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        theme: "system",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        theme: "dark",
      });

      expect(result.theme).toBe("dark");
    });

    it("should update autoAgeDays", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        autoAgeDays: 7,
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        autoAgeDays: 30,
      });

      expect(result.autoAgeDays).toBe(30);
    });

    it("should update defaultFilter", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        defaultFilter: "all",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        defaultFilter: "unread",
      });

      expect(result.defaultFilter).toBe("unread");
    });

    it("should update share settings", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        shareEmail: false,
        shareHackernews: false,
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        shareEmail: true,
        shareHackernews: true,
        shareReddit: true,
      });

      expect(result.shareEmail).toBe(true);
      expect(result.shareHackernews).toBe(true);
      expect(result.shareReddit).toBe(true);
    });

    it("should update multiple fields at once", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        theme: "system",
        autoAgeDays: 7,
        defaultFilter: "all",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        theme: "light",
        autoAgeDays: 14,
        defaultFilter: "saved",
        shareEmail: false,
      });

      expect(result.theme).toBe("light");
      expect(result.autoAgeDays).toBe(14);
      expect(result.defaultFilter).toBe("saved");
      expect(result.shareEmail).toBe(false);
    });

    it("should only update provided fields", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        theme: "system",
        autoAgeDays: 7,
        defaultFilter: "all",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        theme: "dark",
        // Don't update autoAgeDays or defaultFilter
      });

      expect(result.theme).toBe("dark");
      expect(result.autoAgeDays).toBe(7); // Unchanged
      expect(result.defaultFilter).toBe("all"); // Unchanged
    });

    it("should update updatedAt timestamp", async () => {
      const oldDate = new Date("2024-01-01");
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        updatedAt: oldDate,
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        theme: "dark",
      });

      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it("should update settings for correct user only", async () => {
      await db.insert(schema.userSettings).values({
        userId: testUser.id,
        theme: "system",
      });
      await db.insert(schema.userSettings).values({
        userId: otherUser.id,
        theme: "light",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        theme: "dark",
      });

      expect(result.userId).toBe(testUser.id);
      expect(result.theme).toBe("dark");

      // Verify other user's settings unchanged
      const otherSettings = await db
        .select()
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, otherUser.id))
        .limit(1);
      expect(otherSettings[0].theme).toBe("light");
    });

    it("should validate theme values", async () => {
      const caller = createCaller(testUser.id);

      // Valid themes
      await expect(caller.update({ theme: "system" })).resolves.toBeDefined();
      await expect(caller.update({ theme: "light" })).resolves.toBeDefined();
      await expect(caller.update({ theme: "dark" })).resolves.toBeDefined();
    });

    it("should validate defaultFilter values", async () => {
      const caller = createCaller(testUser.id);

      // Valid filters
      await expect(
        caller.update({ defaultFilter: "all" })
      ).resolves.toBeDefined();
      await expect(
        caller.update({ defaultFilter: "unread" })
      ).resolves.toBeDefined();
      await expect(
        caller.update({ defaultFilter: "read" })
      ).resolves.toBeDefined();
      await expect(
        caller.update({ defaultFilter: "saved" })
      ).resolves.toBeDefined();
    });
  });

  describe("getUsage", () => {
    it("should return usage stats and limits", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.usage).toBeDefined();
      expect(result.limits).toBeDefined();

      // Check usage stats structure
      expect(result.usage.sourceCount).toBe(0);
      expect(result.usage.publicFeedCount).toBe(0);
      expect(result.usage.categoryCount).toBe(0);
      expect(result.usage.articleCount).toBe(0);
      expect(result.usage.lastUpdated).toBeInstanceOf(Date);

      // Check limits structure (from free plan)
      expect(result.limits.maxSources).toBeDefined();
      expect(result.limits.maxPublicFeeds).toBeDefined();
      expect(result.limits.maxCategories).toBeDefined();
    });

    it("should return correct category count", async () => {
      // Create some categories
      await seedTestCategory(db, testUser.id, { name: "Tech" });
      await seedTestCategory(db, testUser.id, { name: "Science" });
      await seedTestCategory(db, testUser.id, { name: "Sports" });

      // Update usage stats
      await db
        .update(schema.usageStats)
        .set({ categoryCount: 3 })
        .where(eq(schema.usageStats.userId, testUser.id));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.usage.categoryCount).toBe(3);
    });

    it("should return only current user's stats", async () => {
      // Set different stats for each user
      await db
        .update(schema.usageStats)
        .set({ categoryCount: 5 })
        .where(eq(schema.usageStats.userId, testUser.id));

      await db
        .update(schema.usageStats)
        .set({ categoryCount: 10 })
        .where(eq(schema.usageStats.userId, otherUser.id));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.usage.categoryCount).toBe(5);
    });

    it("should handle user with upgraded plan", async () => {
      // Update user to pro plan
      await db
        .update(schema.user)
        .set({ plan: "pro" })
        .where(eq(schema.user.id, testUser.id));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      // Pro plan should have higher limits (assuming pro plan exists)
      expect(result.limits).toBeDefined();
    });

    it("should return user details", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.user.username).toBe("testuser");
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.role).toBe("user");
      expect(result.user.plan).toBe("free");
      expect(result.user.banned).toBe(false);
      expect(result.user.createdAt).toBeInstanceOf(Date);
    });

    it("should return plan details", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.plan).toBeDefined();
      expect(result.plan.id).toBe("free");
      expect(result.plan.name).toBe("Free");
      expect(result.plan.priceCents).toBe(0);
      expect(result.plan.apiRateLimitPerMinute).toBeDefined();
      expect(result.plan.publicFeedRateLimitPerMinute).toBeDefined();
    });

    it("should parse plan features correctly when they are an array", async () => {
      // Update plan to have features as JSON array
      await db
        .update(schema.plans)
        .set({
          features: JSON.stringify(["Feature 1", "Feature 2", "Feature 3"]),
        })
        .where(eq(schema.plans.id, "free"));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.plan.features).toBeInstanceOf(Array);
      expect(result.plan.features).toHaveLength(3);
      expect(result.plan.features).toContain("Feature 1");
    });

    it("should handle plan features as null when not an array", async () => {
      // Update plan to have features as JSON object (invalid)
      await db
        .update(schema.plans)
        .set({
          features: JSON.stringify({ feature1: "value" }),
        })
        .where(eq(schema.plans.id, "free"));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.plan.features).toBeNull();
    });

    it("should handle plan features as null when field is null", async () => {
      // Update plan to have null features
      await db
        .update(schema.plans)
        .set({ features: null })
        .where(eq(schema.plans.id, "free"));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.plan.features).toBeNull();
    });

    it("should return null for custom limits when none are set", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.customLimits).toBeNull();
    });

    it("should return custom limits when they are set", async () => {
      // Set custom limits for the user
      await db.insert(schema.userLimits).values({
        userId: testUser.id,
        maxSources: 1000,
        maxPublicFeeds: 50,
        maxCategories: null, // unlimited
        apiRateLimitPerMinute: 500,
        publicFeedRateLimitPerMinute: 17,
        notes: "Beta tester limits",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.customLimits).toBeDefined();
      expect(result.customLimits?.maxSources).toBe(1000);
      expect(result.customLimits?.maxPublicFeeds).toBe(50);
      expect(result.customLimits?.maxCategories).toBeNull();
      // Rate limits are not customizable - they come from plan-specific bindings
      expect(result.customLimits?.notes).toBe("Beta tester limits");
    });

    it("should return rate limit status", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      // Rate limiting is now a simple boolean flag
      expect(result.rateLimitEnabled).toBeDefined();
      expect(typeof result.rateLimitEnabled).toBe("boolean");
    });

    it("should throw error for banned users", async () => {
      // Ban the user (Better Auth uses user table)
      await db
        .update(schema.user)
        .set({ banned: true })
        .where(eq(schema.user.id, testUser.id));

      const caller = createCaller(testUser.id);

      // Banned users are blocked by auth middleware
      await expect(caller.getUsage()).rejects.toThrow(
        "Account banned. Please contact support."
      );
    });

    it("should show admin role correctly", async () => {
      // Make user an admin
      await db
        .update(schema.user)
        .set({ role: "admin" })
        .where(eq(schema.user.id, testUser.id));

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      expect(result.user.role).toBe("admin");
    });

    it("should reflect custom limits in effective limits", async () => {
      // Set custom limits
      await db.insert(schema.userLimits).values({
        userId: testUser.id,
        maxSources: 2000,
        maxPublicFeeds: 100,
        maxCategories: null, // null = use plan default
      });

      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      // Custom limits should override plan limits
      expect(result.limits.maxSources).toBe(2000);
      expect(result.limits.maxPublicFeeds).toBe(100);
      // null in custom limits means "use plan default", so we get the plan's 10
      expect(result.limits.maxCategories).toBe(10);
    });

    it("should use plan limits when no custom limits are set", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.getUsage();

      // Should use free plan limits (from migration: 25, 2, 10)
      expect(result.limits.maxSources).toBe(25);
      expect(result.limits.maxPublicFeeds).toBe(2);
      expect(result.limits.maxCategories).toBe(10);
    });
  });
});
