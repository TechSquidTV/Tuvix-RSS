/**
 * Categories Router Tests
 *
 * Tests for category management endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestCategory,
} from "@/test/setup";
import { categoriesRouter } from "../categories";

describe("Categories Router", () => {
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
    return categoriesRouter.createCaller({
      db,
      user: { userId, username: "testuser", role: "user" },
      env: {
        SKIP_RATE_LIMIT: "true",
        BASE_URL: "http://localhost:3000",
      } as any,
      headers: {} as any,
      req: {} as any,
    } as any);
  };

  describe("list", () => {
    it("should return empty array when user has no categories", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.list();
      expect(result).toEqual([]);
    });

    it("should return user's categories sorted by name", async () => {
      await seedTestCategory(db, testUser.id, { name: "Zebra" });
      await seedTestCategory(db, testUser.id, { name: "Alpha" });
      await seedTestCategory(db, testUser.id, { name: "Beta" });
      // Create category for other user (should not appear)
      await seedTestCategory(db, otherUser.id, { name: "Other Category" });

      const caller = createCaller(testUser.id);
      const result = await caller.list();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Alpha");
      expect(result[1].name).toBe("Beta");
      expect(result[2].name).toBe("Zebra");
      expect(result.every((cat) => cat.userId === testUser.id)).toBe(true);
    });
  });

  describe("getById", () => {
    it("should return category by id", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Test Category",
        color: "#FF0000",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.getById({ id: category.id });

      expect(result.id).toBe(category.id);
      expect(result.name).toBe("Test Category");
      expect(result.color).toBe("#FF0000");
      expect(result.userId).toBe(testUser.id);
    });

    it("should throw error when category does not exist", async () => {
      const caller = createCaller(testUser.id);
      await expect(caller.getById({ id: 99999 })).rejects.toThrow("Category");
    });

    it("should throw error when accessing other user's category", async () => {
      const otherCategory = await seedTestCategory(db, otherUser.id, {
        name: "Other Category",
      });

      const caller = createCaller(testUser.id);
      await expect(caller.getById({ id: otherCategory.id })).rejects.toThrow(
        "Category"
      );
    });
  });

  describe("create", () => {
    it("should create category with name only", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.create({ name: "New Category" });

      expect(result.name).toBe("New Category");
      expect(result.userId).toBe(testUser.id);
      expect(result.color).toBeDefined(); // Auto-generated
      expect(result.icon).toBeNull();
    });

    it("should create category with name and color", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.create({
        name: "Colored Category",
        color: "#00FF00",
      });

      expect(result.name).toBe("Colored Category");
      expect(result.color).toBe("#00FF00");
    });

    it("should create category with name, color, and icon", async () => {
      const caller = createCaller(testUser.id);
      const result = await caller.create({
        name: "Icon Category",
        color: "#0000FF",
        icon: "star",
      });

      expect(result.name).toBe("Icon Category");
      expect(result.color).toBe("#0000FF");
      expect(result.icon).toBe("star");
    });

    it("should throw error when category name already exists", async () => {
      await seedTestCategory(db, testUser.id, { name: "Existing" });

      const caller = createCaller(testUser.id);
      await expect(caller.create({ name: "Existing" })).rejects.toThrow(
        "already exists"
      );
    });

    it("should throw error when category name already exists (case-insensitive)", async () => {
      await seedTestCategory(db, testUser.id, { name: "Existing" });

      const caller = createCaller(testUser.id);
      await expect(caller.create({ name: "EXISTING" })).rejects.toThrow(
        "already exists"
      );
    });

    it("should allow same name for different users", async () => {
      await seedTestCategory(db, testUser.id, { name: "Shared Name" });

      const otherCaller = createCaller(otherUser.id);
      const result = await otherCaller.create({ name: "Shared Name" });

      expect(result.name).toBe("Shared Name");
      expect(result.userId).toBe(otherUser.id);
    });

    it("should validate name length", async () => {
      const caller = createCaller(testUser.id);

      await expect(caller.create({ name: "" })).rejects.toThrow();

      await expect(caller.create({ name: "a".repeat(51) })).rejects.toThrow();
    });

    it("should validate hex color format", async () => {
      const caller = createCaller(testUser.id);

      await expect(
        caller.create({ name: "Test", color: "invalid" })
      ).rejects.toThrow();

      await expect(
        caller.create({ name: "Test", color: "#GGGGGG" })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("should update category name", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Old Name",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: category.id,
        name: "New Name",
      });

      expect(result.name).toBe("New Name");
      expect(result.id).toBe(category.id);
    });

    it("should update category color", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Test",
        color: "#FF0000",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: category.id,
        color: "#00FF00",
      });

      expect(result.color).toBe("#00FF00");
      expect(result.name).toBe("Test"); // Unchanged
    });

    it("should update category icon", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Test",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: category.id,
        icon: "star",
      });

      expect(result.icon).toBe("star");
    });

    it("should update multiple fields at once", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Old",
        color: "#FF0000",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: category.id,
        name: "New",
        color: "#00FF00",
        icon: "heart",
      });

      expect(result.name).toBe("New");
      expect(result.color).toBe("#00FF00");
      expect(result.icon).toBe("heart");
    });

    it("should throw error when updating to duplicate name", async () => {
      await seedTestCategory(db, testUser.id, { name: "Existing" });
      const category = await seedTestCategory(db, testUser.id, {
        name: "Current",
      });

      const caller = createCaller(testUser.id);
      await expect(
        caller.update({ id: category.id, name: "Existing" })
      ).rejects.toThrow("already exists");
    });

    it("should allow keeping same name", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "Current",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.update({
        id: category.id,
        name: "Current", // Same name
        color: "#FF0000",
      });

      expect(result.name).toBe("Current");
      expect(result.color).toBe("#FF0000");
    });

    it("should throw error when updating other user's category", async () => {
      const otherCategory = await seedTestCategory(db, otherUser.id, {
        name: "Other",
      });

      const caller = createCaller(testUser.id);
      await expect(
        caller.update({ id: otherCategory.id, name: "Hacked" })
      ).rejects.toThrow("Category");
    });
  });

  describe("delete", () => {
    it("should delete category", async () => {
      const category = await seedTestCategory(db, testUser.id, {
        name: "To Delete",
      });

      const caller = createCaller(testUser.id);
      const result = await caller.delete({ id: category.id });

      expect(result.success).toBe(true);

      // Verify it's deleted
      await expect(caller.getById({ id: category.id })).rejects.toThrow(
        "Category"
      );
    });

    it("should throw error when deleting other user's category", async () => {
      const otherCategory = await seedTestCategory(db, otherUser.id, {
        name: "Other",
      });

      const caller = createCaller(testUser.id);
      await expect(caller.delete({ id: otherCategory.id })).rejects.toThrow(
        "Category"
      );
    });

    it("should throw error when category does not exist", async () => {
      const caller = createCaller(testUser.id);
      await expect(caller.delete({ id: 99999 })).rejects.toThrow("Category");
    });
  });

  describe("suggestions", () => {
    it("should return categories matching query prefix", async () => {
      await seedTestCategory(db, testUser.id, { name: "Alpha" });
      await seedTestCategory(db, testUser.id, { name: "Beta" });
      await seedTestCategory(db, testUser.id, { name: "Gamma" });
      await seedTestCategory(db, testUser.id, { name: "Zebra" });

      const caller = createCaller(testUser.id);
      const result = await caller.suggestions({ query: "a" });

      expect(result.length).toBeGreaterThan(0);
      expect(
        result.every((cat) => cat.name.toLowerCase().startsWith("a"))
      ).toBe(true);
    });

    it("should be case-insensitive", async () => {
      await seedTestCategory(db, testUser.id, { name: "Alpha" });
      await seedTestCategory(db, testUser.id, { name: "Beta" });

      const caller = createCaller(testUser.id);
      const result = await caller.suggestions({ query: "A" });

      expect(result.some((cat) => cat.name === "Alpha")).toBe(true);
    });

    it("should limit results to 10", async () => {
      // Create 15 categories
      for (let i = 0; i < 15; i++) {
        await seedTestCategory(db, testUser.id, { name: `Alpha${i}` });
      }

      const caller = createCaller(testUser.id);
      const result = await caller.suggestions({ query: "Alpha" });

      expect(result.length).toBeLessThanOrEqual(10);
    });

    it("should only return user's own categories", async () => {
      await seedTestCategory(db, testUser.id, { name: "My Category" });
      await seedTestCategory(db, otherUser.id, { name: "Other Category" });

      const caller = createCaller(testUser.id);
      const result = await caller.suggestions({ query: "My" });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("My Category");
      expect(result[0].userId).toBe(testUser.id);
    });

    it("should return empty array when no matches", async () => {
      await seedTestCategory(db, testUser.id, { name: "Alpha" });

      const caller = createCaller(testUser.id);
      const result = await caller.suggestions({ query: "Zebra" });

      expect(result).toEqual([]);
    });
  });
});
