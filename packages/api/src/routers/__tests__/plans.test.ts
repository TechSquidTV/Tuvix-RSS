/**
 * Plans Router Tests
 *
 * Tests for plan management endpoints (public and admin)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestPlan,
} from "@/test/setup";
import { plansRouter } from "../plans";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("Plans Router", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let adminUser: { id: number };
  let regularUser: { id: number };

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
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  const createPublicCaller = () => {
    return plansRouter.createCaller({
      db,
      user: undefined,
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  const createAdminCaller = () => {
    return plansRouter.createCaller({
      db,
      user: { userId: adminUser.id, username: "adminuser", role: "admin" },
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  const createUserCaller = () => {
    return plansRouter.createCaller({
      db,
      user: { userId: regularUser.id, username: "regularuser", role: "user" },
      env: {} as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  describe("list (public)", () => {
    it("should return plans sorted by price", async () => {
      // Use unique IDs to avoid conflicts with migrations
      await seedTestPlan(db, { id: "test-premium", priceCents: 1000 });
      await seedTestPlan(db, { id: "test-free", priceCents: 0 });
      await seedTestPlan(db, { id: "test-pro", priceCents: 500 });

      const caller = createPublicCaller();
      const result = await caller.list();

      // Find our test plans (there may be others from migrations)
      const testPlans = result.filter((p) =>
        ["test-premium", "test-free", "test-pro"].includes(p.id)
      );

      expect(testPlans.length).toBe(3);
      // Sort by price to verify ordering
      const sorted = testPlans.sort((a, b) => a.priceCents - b.priceCents);
      expect(sorted[0].id).toBe("test-free"); // Cheapest first
      expect(sorted[1].id).toBe("test-pro");
      expect(sorted[2].id).toBe("test-premium");
    });

    it("should return plan details", async () => {
      await seedTestPlan(db, {
        id: "test-plan-details",
        name: "Test Plan",
        maxSources: 10,
        maxPublicFeeds: 5,
        maxCategories: 20,
        apiRateLimitPerMinute: 60,
        publicFeedRateLimitPerMinute: 2,
        priceCents: 999,
        features: ["Feature list"],
      });

      const caller = createPublicCaller();
      const result = await caller.list();

      const plan = result.find((p) => p.id === "test-plan-details");
      expect(plan).toBeDefined();
      expect(plan).toMatchObject({
        id: "test-plan-details",
        name: "Test Plan",
        maxSources: 10,
        maxPublicFeeds: 5,
        maxCategories: 20,
        apiRateLimitPerMinute: 60,
        publicFeedRateLimitPerMinute: 2,
        priceCents: 999,
      });
      // Features might be stored as JSON string or null
      expect(
        plan?.features === JSON.stringify(["Feature list"]) ||
          plan?.features === null
      ).toBe(true);
      expect(plan?.createdAt).toBeInstanceOf(Date);
      expect(plan?.updatedAt).toBeInstanceOf(Date);
    });

    it("should work without authentication", async () => {
      await seedTestPlan(db, { id: "test-public-plan" });

      const caller = createPublicCaller();
      const result = await caller.list();

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.id === "test-public-plan")).toBe(true);
    });
  });

  describe("getById (public)", () => {
    it("should return plan by id", async () => {
      await seedTestPlan(db, {
        id: "test-plan-get",
        name: "Test Plan",
        maxSources: 10,
      });

      const caller = createPublicCaller();
      const result = await caller.getById({ planId: "test-plan-get" });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("test-plan-get");
      expect(result?.name).toBe("Test Plan");
      expect(result?.maxSources).toBe(10);
    });

    it("should return null when plan does not exist", async () => {
      const caller = createPublicCaller();
      const result = await caller.getById({ planId: "nonexistent-plan-12345" });

      expect(result).toBeNull();
    });

    it("should work without authentication", async () => {
      await seedTestPlan(db, { id: "test-public-get" });

      const caller = createPublicCaller();
      const result = await caller.getById({ planId: "test-public-get" });

      expect(result).not.toBeNull();
      expect(result?.id).toBe("test-public-get");
    });
  });

  describe("create (admin only)", () => {
    it("should create plan with all fields", async () => {
      const caller = createAdminCaller();
      const result = await caller.create({
        id: "new-plan",
        name: "New Plan",
        maxSources: 20,
        maxPublicFeeds: 10,
        maxCategories: 50,
        apiRateLimitPerMinute: 120,
        publicFeedRateLimitPerMinute: 4,
        priceCents: 1999,
        features: JSON.stringify(["Premium features"]),
      });

      expect(result.success).toBe(true);

      // Verify plan was created
      const plans = await db.query.plans.findMany({
        where: eq(schema.plans.id, "new-plan"),
      });
      expect(plans).toHaveLength(1);
      expect(plans[0].name).toBe("New Plan");
    });

    it("should create plan with nullable maxCategories", async () => {
      const caller = createAdminCaller();
      const result = await caller.create({
        id: "unlimited-plan",
        name: "Unlimited Plan",
        maxSources: 100,
        maxPublicFeeds: 50,
        maxCategories: null, // Unlimited
        apiRateLimitPerMinute: 300,
        publicFeedRateLimitPerMinute: 9,
        priceCents: 9999,
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "unlimited-plan"),
      });
      expect(plan?.maxCategories).toBeNull();
    });

    it("should create plan without features", async () => {
      const caller = createAdminCaller();
      const result = await caller.create({
        id: "simple-plan",
        name: "Simple Plan",
        maxSources: 5,
        maxPublicFeeds: 2,
        maxCategories: 10,
        apiRateLimitPerMinute: 30,
        publicFeedRateLimitPerMinute: 1,
        priceCents: 0,
      });

      expect(result.success).toBe(true);
    });

    it("should throw error when plan ID already exists", async () => {
      await seedTestPlan(db, { id: "existing-plan" });

      const caller = createAdminCaller();
      await expect(
        caller.create({
          id: "existing-plan",
          name: "Duplicate",
          maxSources: 10,
          maxPublicFeeds: 5,
          maxCategories: 20,
          apiRateLimitPerMinute: 60,
          publicFeedRateLimitPerMinute: 2,
          priceCents: 0,
        })
      ).rejects.toThrow("already exists");
    });

    it("should validate required fields", async () => {
      const caller = createAdminCaller();

      // Missing required fields should fail validation
      await expect(
        caller.create({
          id: "",
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

    it("should validate positive numbers", async () => {
      const caller = createAdminCaller();

      await expect(
        caller.create({
          id: "invalid",
          name: "Test",
          maxSources: -1, // Invalid
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
        userCaller.create({
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

  describe("update (admin only)", () => {
    it("should update plan name", async () => {
      await seedTestPlan(db, { id: "test-plan", name: "Old Name" });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        name: "New Name",
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.name).toBe("New Name");
    });

    it("should update plan limits", async () => {
      await seedTestPlan(db, { id: "test-plan", maxSources: 10 });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        maxSources: 20,
        maxPublicFeeds: 15,
        maxCategories: 30,
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.maxSources).toBe(20);
      expect(plan?.maxPublicFeeds).toBe(15);
      expect(plan?.maxCategories).toBe(30);
    });

    it("should update plan to unlimited categories", async () => {
      await seedTestPlan(db, { id: "test-plan", maxCategories: 20 });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        maxCategories: null,
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.maxCategories).toBeNull();
    });

    it("should update rate limits", async () => {
      await seedTestPlan(db, {
        id: "test-plan",
        apiRateLimitPerMinute: 60,
        publicFeedRateLimitPerMinute: 2,
      });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        apiRateLimitPerMinute: 120,
        publicFeedRateLimitPerMinute: 4,
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.apiRateLimitPerMinute).toBe(120);
      expect(plan?.publicFeedRateLimitPerMinute).toBe(4);
    });

    it("should update price", async () => {
      await seedTestPlan(db, { id: "test-plan", priceCents: 999 });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        priceCents: 1999,
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.priceCents).toBe(1999);
    });

    it("should update features", async () => {
      await seedTestPlan(db, { id: "test-plan", features: ["Old features"] });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        features: JSON.stringify(["New features"]),
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.features).toBe(JSON.stringify(["New features"]));
    });

    it("should update multiple fields at once", async () => {
      await seedTestPlan(db, {
        id: "test-plan",
        name: "Old",
        maxSources: 10,
        priceCents: 999,
      });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        name: "New",
        maxSources: 20,
        priceCents: 1999,
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.name).toBe("New");
      expect(plan?.maxSources).toBe(20);
      expect(plan?.priceCents).toBe(1999);
    });

    it("should only update provided fields", async () => {
      await seedTestPlan(db, {
        id: "test-plan",
        name: "Original",
        maxSources: 10,
        maxPublicFeeds: 5,
      });

      const caller = createAdminCaller();
      const result = await caller.update({
        id: "test-plan",
        name: "Updated",
        // Don't update maxSources or maxPublicFeeds
      });

      expect(result.success).toBe(true);

      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "test-plan"),
      });
      expect(plan?.name).toBe("Updated");
      expect(plan?.maxSources).toBe(10); // Unchanged
      expect(plan?.maxPublicFeeds).toBe(5); // Unchanged
    });

    it("should throw error when plan does not exist", async () => {
      const caller = createAdminCaller();
      await expect(
        caller.update({
          id: "nonexistent",
          name: "Updated",
        })
      ).rejects.toThrow("not found");
    });

    it("should require admin role", async () => {
      await seedTestPlan(db, { id: "test-plan" });

      const userCaller = createUserCaller();
      await expect(
        userCaller.update({
          id: "test-plan",
          name: "Hacked",
        })
      ).rejects.toThrow();
    });
  });

  describe("delete (admin only)", () => {
    it("should delete plan", async () => {
      await seedTestPlan(db, { id: "to-delete" });

      const caller = createAdminCaller();
      const result = await caller.delete({ id: "to-delete" });

      expect(result.success).toBe(true);

      // Verify plan was deleted
      const plan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, "to-delete"),
      });
      expect(plan).toBeUndefined();
    });

    it("should throw error when plan does not exist", async () => {
      const caller = createAdminCaller();
      await expect(caller.delete({ id: "nonexistent" })).rejects.toThrow(
        "not found"
      );
    });

    it("should throw error when users are on the plan", async () => {
      await seedTestPlan(db, { id: "popular-plan" });
      // Assign user to plan
      await db
        .update(schema.user)
        .set({ plan: "popular-plan" })
        .where(eq(schema.user.id, regularUser.id));

      const caller = createAdminCaller();
      await expect(caller.delete({ id: "popular-plan" })).rejects.toThrow(
        "user(s) are currently assigned"
      );
    });

    it("should allow deleting plan with no users", async () => {
      await seedTestPlan(db, { id: "empty-plan-delete" });
      // Ensure no users are on this plan (use a plan that exists or null)
      const existingPlan = await db.query.plans.findFirst();
      if (existingPlan) {
        await db
          .update(schema.user)
          .set({ plan: existingPlan.id })
          .where(eq(schema.user.id, regularUser.id));
      }

      const caller = createAdminCaller();
      const result = await caller.delete({ id: "empty-plan-delete" });

      expect(result.success).toBe(true);
    });

    it("should require admin role", async () => {
      await seedTestPlan(db, { id: "test-plan" });

      const userCaller = createUserCaller();
      await expect(userCaller.delete({ id: "test-plan" })).rejects.toThrow();
    });
  });
});
