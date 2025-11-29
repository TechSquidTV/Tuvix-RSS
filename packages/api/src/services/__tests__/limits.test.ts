/**
 * User Limits Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getUserLimits,
  getUserUsage,
  checkSourceLimit,
  checkPublicFeedLimit,
  checkCategoryLimit,
  checkLimit,
  incrementSourceCount,
  decrementSourceCount,
  incrementPublicFeedCount,
  decrementPublicFeedCount,
  incrementCategoryCount,
  decrementCategoryCount,
  recalculateUsage,
} from "../limits";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
  seedTestCategory,
} from "@/test/setup";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("User Limits Service", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    db = createTestDb();
    // Note: Plans are seeded by migrations (free, pro, enterprise)
    // free: maxSources=100, maxPublicFeeds=2, maxCategories=50
    // pro: maxSources=500, maxPublicFeeds=25, maxCategories=100
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  describe("getUserLimits", () => {
    it("should return plan limits for user", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const limits = await getUserLimits(db, user.id);

      expect(limits.maxSources).toBe(100); // From migration
      expect(limits.maxPublicFeeds).toBe(2);
      expect(limits.maxCategories).toBe(50);
    });

    it("should return different limits for different plans", async () => {
      const { user: freeUser } = await seedTestUser(db, {
        username: "free",
        email: "free@example.com",
        plan: "free",
      });
      const { user: proUser } = await seedTestUser(db, {
        username: "pro",
        email: "pro@example.com",
        plan: "pro",
      });

      const freeLimits = await getUserLimits(db, freeUser.id);
      const proLimits = await getUserLimits(db, proUser.id);

      expect(freeLimits.maxSources).toBe(100); // From migration
      expect(proLimits.maxSources).toBe(500); // From migration
    });

    it("should return null for unlimited categories", async () => {
      const { user } = await seedTestUser(db, { plan: "enterprise" });

      const limits = await getUserLimits(db, user.id);

      expect(limits.maxCategories).toBeNull(); // Enterprise plan has unlimited categories
    });

    it("should override with custom user limits", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      // Add custom limits for user
      await db.insert(schema.userLimits).values({
        userId: user.id,
        maxSources: 100,
        maxPublicFeeds: 50,
        maxCategories: 200,
        apiRateLimitPerMinute: 120,
        publicFeedRateLimitPerMinute: 9,
      });

      const limits = await getUserLimits(db, user.id);

      expect(limits.maxSources).toBe(100);
      expect(limits.maxPublicFeeds).toBe(50);
      expect(limits.maxCategories).toBe(200);
    });

    it("should throw error for non-existent user", async () => {
      await expect(getUserLimits(db, 9999)).rejects.toThrow("User not found");
    });
  });

  describe("getUserUsage", () => {
    it("should return usage stats for user", async () => {
      const { user } = await seedTestUser(db);

      const usage = await getUserUsage(db, user.id);

      expect(usage).toBeDefined();
      expect(usage.sourceCount).toBe(0);
      expect(usage.publicFeedCount).toBe(0);
      expect(usage.categoryCount).toBe(0);
      expect(usage.articleCount).toBe(0);
    });

    it("should throw error for non-existent user (FK constraint)", async () => {
      // getUserUsage tries to auto-create missing stats, but fails due to FK constraint
      // because the user doesn't exist
      await expect(getUserUsage(db, 9999)).rejects.toThrow(
        "FOREIGN KEY constraint failed"
      );
    });
  });

  describe("checkSourceLimit", () => {
    it("should allow when under limit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const result = await checkSourceLimit(db, user.id);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100); // From migration
      expect(result.current).toBe(0);
      expect(result.remaining).toBe(100);
    });

    it("should deny when at limit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      // Update usage to be at limit
      await db
        .update(schema.usageStats)
        .set({ sourceCount: 100 })
        .where(eq(schema.usageStats.userId, user.id));

      const result = await checkSourceLimit(db, user.id);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100); // From migration
      expect(result.current).toBe(100);
      expect(result.remaining).toBe(0);
    });

    it("should deny when over limit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      await db
        .update(schema.usageStats)
        .set({ sourceCount: 101 })
        .where(eq(schema.usageStats.userId, user.id));

      const result = await checkSourceLimit(db, user.id);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(-1);
    });
  });

  describe("checkPublicFeedLimit", () => {
    it("should allow when under limit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const result = await checkPublicFeedLimit(db, user.id);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(2);
      expect(result.remaining).toBe(2);
    });

    it("should deny when at limit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      await db
        .update(schema.usageStats)
        .set({ publicFeedCount: 2 })
        .where(eq(schema.usageStats.userId, user.id));

      const result = await checkPublicFeedLimit(db, user.id);

      expect(result.allowed).toBe(false);
    });
  });

  describe("checkCategoryLimit", () => {
    it("should allow when under limit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const result = await checkCategoryLimit(db, user.id);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(50); // From migration
      expect(result.remaining).toBe(50);
    });

    it("should always allow for unlimited plans", async () => {
      const { user } = await seedTestUser(db, { plan: "enterprise" });

      // Set usage very high
      await db
        .update(schema.usageStats)
        .set({ categoryCount: 1000 })
        .where(eq(schema.usageStats.userId, user.id));

      const result = await checkCategoryLimit(db, user.id);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull(); // Enterprise has unlimited categories
      expect(result.remaining).toBeNull();
    });
  });

  describe("checkLimit", () => {
    it("should delegate to checkSourceLimit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const result = await checkLimit(db, user.id, "sources");

      expect(result.limit).toBe(100); // From migration
    });

    it("should delegate to checkPublicFeedLimit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const result = await checkLimit(db, user.id, "publicFeeds");

      expect(result.limit).toBe(2);
    });

    it("should delegate to checkCategoryLimit", async () => {
      const { user } = await seedTestUser(db, { plan: "free" });

      const result = await checkLimit(db, user.id, "categories");

      expect(result.limit).toBe(50);
    });
  });

  describe("incrementSourceCount", () => {
    it("should increment source count", async () => {
      const { user } = await seedTestUser(db);

      await incrementSourceCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.sourceCount).toBe(1);
    });

    it("should increment multiple times", async () => {
      const { user } = await seedTestUser(db);

      await incrementSourceCount(db, user.id);
      await incrementSourceCount(db, user.id);
      await incrementSourceCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.sourceCount).toBe(3);
    });
  });

  describe("decrementSourceCount", () => {
    it("should decrement source count", async () => {
      const { user } = await seedTestUser(db);

      await db
        .update(schema.usageStats)
        .set({ sourceCount: 5 })
        .where(eq(schema.usageStats.userId, user.id));

      await decrementSourceCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.sourceCount).toBe(4);
    });

    it("should not go below zero", async () => {
      const { user } = await seedTestUser(db);

      await decrementSourceCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.sourceCount).toBe(0);
    });
  });

  describe("incrementPublicFeedCount", () => {
    it("should increment public feed count", async () => {
      const { user } = await seedTestUser(db);

      await incrementPublicFeedCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.publicFeedCount).toBe(1);
    });
  });

  describe("decrementPublicFeedCount", () => {
    it("should decrement public feed count", async () => {
      const { user } = await seedTestUser(db);

      await db
        .update(schema.usageStats)
        .set({ publicFeedCount: 3 })
        .where(eq(schema.usageStats.userId, user.id));

      await decrementPublicFeedCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.publicFeedCount).toBe(2);
    });

    it("should not go below zero", async () => {
      const { user } = await seedTestUser(db);

      await decrementPublicFeedCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.publicFeedCount).toBe(0);
    });
  });

  describe("incrementCategoryCount", () => {
    it("should increment category count", async () => {
      const { user } = await seedTestUser(db);

      await incrementCategoryCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.categoryCount).toBe(1);
    });
  });

  describe("decrementCategoryCount", () => {
    it("should decrement category count", async () => {
      const { user } = await seedTestUser(db);

      await db
        .update(schema.usageStats)
        .set({ categoryCount: 5 })
        .where(eq(schema.usageStats.userId, user.id));

      await decrementCategoryCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.categoryCount).toBe(4);
    });

    it("should not go below zero", async () => {
      const { user } = await seedTestUser(db);

      await decrementCategoryCount(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.categoryCount).toBe(0);
    });
  });

  describe("recalculateUsage", () => {
    it("should calculate correct source count", async () => {
      const { user } = await seedTestUser(db);

      // Create 3 sources and subscriptions
      for (let i = 0; i < 3; i++) {
        const source = await seedTestSource(db, {
          url: `https://example.com/feed${i}.xml`,
        });
        await seedTestSubscription(db, user.id, source.id);
      }

      // Manually set wrong count
      await db
        .update(schema.usageStats)
        .set({ sourceCount: 99 })
        .where(eq(schema.usageStats.userId, user.id));

      await recalculateUsage(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.sourceCount).toBe(3);
    });

    it("should calculate correct public feed count", async () => {
      const { user } = await seedTestUser(db);

      // Create 2 public feeds
      await db.insert(schema.feeds).values([
        {
          userId: user.id,
          slug: "feed1",
          title: "Feed 1",
          description: "Test",
          public: true,
        },
        {
          userId: user.id,
          slug: "feed2",
          title: "Feed 2",
          description: "Test",
          public: true,
        },
        {
          userId: user.id,
          slug: "feed3",
          title: "Feed 3",
          description: "Test",
          public: false, // Not public
        },
      ]);

      await recalculateUsage(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.publicFeedCount).toBe(2);
    });

    it("should calculate correct category count", async () => {
      const { user } = await seedTestUser(db);

      await seedTestCategory(db, user.id, { name: "Cat1" });
      await seedTestCategory(db, user.id, { name: "Cat2" });
      await seedTestCategory(db, user.id, { name: "Cat3" });

      await recalculateUsage(db, user.id);

      const usage = await getUserUsage(db, user.id);
      expect(usage.categoryCount).toBe(3);
    });

    it("should handle duplicate source subscriptions correctly", async () => {
      const { user } = await seedTestUser(db);
      const source = await seedTestSource(db);

      // Subscribe to same source multiple times (edge case but possible)
      await seedTestSubscription(db, user.id, source.id);
      await seedTestSubscription(db, user.id, source.id);

      await recalculateUsage(db, user.id);

      const usage = await getUserUsage(db, user.id);
      // Should count unique sources only
      expect(usage.sourceCount).toBe(1);
    });
  });
});
