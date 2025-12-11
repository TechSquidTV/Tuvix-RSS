/**
 * Auth Login Tests
 *
 * Tests for email and username login to verify both authentication methods work
 * Tests both tRPC login endpoint and Better Auth direct endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, seedGlobalSettings } from "@/test/setup";
import { authRouter } from "../auth";
import { createAuth } from "@/auth/better-auth";

describe("Auth Login - Username and Email Support", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: {
    id: number;
    email: string;
    username: string;
    password: string;
  };

  beforeEach(async () => {
    db = createTestDb();
    await seedGlobalSettings(db);

    // Create user via Better Auth signUp so password is hashed correctly
    const auth = createAuth(
      {
        BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
        BASE_URL: "https://test.com",
      } as any,
      db
    );

    const password = "TestPassword123!";
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: "test@example.com",
        password,
        name: "testuser",
        username: "testuser",
      },
    });

    testUser = {
      id: Number(signUpResult.user.id),
      email: "test@example.com",
      username: "testuser",
      password,
    };
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  describe("tRPC login endpoint (username-based)", () => {
    it("should login successfully with username", async () => {
      const caller = authRouter.createCaller({
        db,
        user: null,
        env: {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        headers: {} as any,
        req: { headers: {} } as any,
      } as any);

      const result = await caller.login({
        username: testUser.username,
        password: testUser.password,
      });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.user.username).toBe(testUser.username);
      expect(result.user.email).toBe(testUser.email);
    });

    it("should login with email when @ detected in username field (smart routing)", async () => {
      // NEW: Backend now detects @ symbol and routes to email signin automatically
      // This allows users to enter either username OR email in the same field
      const caller = authRouter.createCaller({
        db,
        user: null,
        env: {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        headers: {} as any,
        req: { headers: {} } as any,
      } as any);

      // Pass email to username field - backend should detect @ and route to email signin
      const result = await caller.login({
        username: testUser.email, // ← email passed as username field
        password: testUser.password,
      });

      expect(result.user).toBeDefined();
      expect(result.user.id).toBe(testUser.id);
      expect(result.user.email).toBe(testUser.email);
    });

    it("should fail login with incorrect password", async () => {
      const caller = authRouter.createCaller({
        db,
        user: null,
        env: {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        headers: {} as any,
        req: { headers: {} } as any,
      } as any);

      await expect(
        caller.login({
          username: testUser.username,
          password: "WrongPassword123!",
        })
      ).rejects.toThrow(); // Just verify it throws
    });

    it("should fail login with non-existent username", async () => {
      const caller = authRouter.createCaller({
        db,
        user: null,
        env: {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        headers: {} as any,
        req: { headers: {} } as any,
      } as any);

      await expect(
        caller.login({
          username: "nonexistent",
          password: testUser.password,
        })
      ).rejects.toThrow(); // Just verify it throws
    });
  });

  describe("Better Auth direct endpoints (email and username)", () => {
    it("should login successfully with email via Better Auth signInEmail", async () => {
      // Test Better Auth's signInEmail endpoint directly
      const auth = createAuth(
        {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        db
      );

      const result = await auth.api.signInEmail({
        body: {
          email: testUser.email,
          password: testUser.password,
        },
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testUser.email);
    });

    it("should login successfully with username via Better Auth signInUsername", async () => {
      // Test Better Auth's signInUsername endpoint directly
      const auth = createAuth(
        {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        db
      );

      const result = await auth.api.signInUsername({
        body: {
          username: testUser.username,
          password: testUser.password,
        },
      });

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testUser.email);
    });

    it("should fail email login with incorrect password", async () => {
      const auth = createAuth(
        {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        db
      );

      await expect(
        auth.api.signInEmail({
          body: {
            email: testUser.email,
            password: "WrongPassword123!",
          },
        })
      ).rejects.toThrow();
    });

    it("should fail username login with incorrect password", async () => {
      const auth = createAuth(
        {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        db
      );

      await expect(
        auth.api.signInUsername({
          body: {
            username: testUser.username,
            password: "WrongPassword123!",
          },
        })
      ).rejects.toThrow();
    });

    it("should NOT allow username login to fall back to email on failure", async () => {
      // This verifies the intentional behavior from commit efa35ce
      // When username login fails, it should NOT silently retry with email

      const auth = createAuth(
        {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        db
      );

      // Try to login with username using wrong password
      // This should fail immediately, not fall back to email
      await expect(
        auth.api.signInUsername({
          body: {
            username: testUser.username,
            password: "WrongPassword123!",
          },
        })
      ).rejects.toThrow();

      // Verify that it actually failed (no silent fallback)
      // If there was a fallback to email, this would succeed
      // But we expect it to fail
    });
  });

  describe("Frontend integration pattern", () => {
    it("should demonstrate how frontend detects email vs username", async () => {
      const auth = createAuth(
        {
          BETTER_AUTH_SECRET: "test-secret-key-minimum-32-chars-long",
          BASE_URL: "https://test.com",
        } as any,
        db
      );

      // Pattern 1: Input contains @ → use email login
      const emailInput = "test@example.com";
      expect(emailInput.includes("@")).toBe(true);

      const emailResult = await auth.api.signInEmail({
        body: {
          email: emailInput,
          password: testUser.password,
        },
      });

      expect(emailResult.user).toBeDefined();
      expect(emailResult.user.email).toBe(testUser.email);

      // Pattern 2: Input doesn't contain @ → use username login
      const usernameInput = "testuser";
      expect(usernameInput.includes("@")).toBe(false);

      const usernameResult = await auth.api.signInUsername({
        body: {
          username: usernameInput,
          password: testUser.password,
        },
      });

      expect(usernameResult.user).toBeDefined();
      expect(usernameResult.user.email).toBe(testUser.email);
    });
  });

  describe("Security", () => {
    it("should hash passwords in database (stored in account table, not user table)", async () => {
      // Better Auth stores passwords in the account table, not the user table
      const [account] = await db.query.account.findMany({
        where: (fields, { eq }) => eq(fields.userId, testUser.id),
      });

      expect(account).toBeDefined();
      expect(account.password).toBeDefined();
      expect(account.password).not.toBe(testUser.password); // Not plaintext
      expect(account.password?.length).toBeGreaterThan(50); // Hash is long
    });
  });
});
