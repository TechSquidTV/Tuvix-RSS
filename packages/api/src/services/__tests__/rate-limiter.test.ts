/**
 * Rate Limiter Service Tests
 *
 * Tests rate limiting behavior for different runtime environments:
 * - Node.js (Docker Compose): Rate limiting is disabled - all requests allowed
 * - Cloudflare Workers: Uses rate limit bindings (requires mocking in tests)
 *
 * Note: Cloudflare Workers tests require mocking the rate limit bindings,
 * which is complex. Current tests focus on Node.js behavior and basic
 * Cloudflare runtime validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  checkApiRateLimit,
  checkPublicFeedRateLimit,
} from "../rate-limiter";
import type { Env } from "@/types";

describe("Rate Limiter Service", () => {
  let env: Env;

  beforeEach(() => {
    // Use Docker Compose environment (no rate limiting)
    env = {
      BETTER_AUTH_SECRET: "test-secret",
      RUNTIME: "nodejs",
    } as Env;
  });

  describe("checkRateLimit", () => {
    it("should always allow requests for Node.js runtime (Docker Compose)", async () => {
      const userId = 1;
      const limit = 10;
      const windowMs = 60 * 1000; // 1 minute

      // Node.js runtime (Docker Compose) has rate limiting disabled
      const result = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(limit);
      expect(result.remaining).toBe(limit);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it("should always allow even when limit would be exceeded (Node.js runtime)", async () => {
      const userId = 2;
      const limit = 5;
      const windowMs = 60 * 1000;

      // Make many requests - all should be allowed (Node.js has no rate limiting)
      for (let i = 0; i < 10; i++) {
        const result = await checkRateLimit(
          env,
          userId,
          "free",
          limit,
          windowMs,
          "api"
        );
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit);
      }
    });

    it("should return consistent values for Node.js runtime", async () => {
      const userId = 3;
      const limit = 3;
      const windowMs = 60 * 1000;

      // All requests return same values (rate limiting disabled)
      const result1 = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(limit);

      const result2 = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(limit);
    });

    it("should work for different rate limit types (Node.js runtime)", async () => {
      const userId = 4;
      const limit = 5;
      const windowMs = 60 * 1000;

      // Both types always allow (rate limiting disabled for Node.js)
      const apiResult = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(apiResult.allowed).toBe(true);

      const feedResult = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "publicFeed"
      );
      expect(feedResult.allowed).toBe(true);
    });

    it("should work for different users (Node.js runtime)", async () => {
      const user1 = 5;
      const user2 = 6;
      const limit = 3;
      const windowMs = 60 * 1000;

      // All users always allowed (rate limiting disabled for Node.js)
      const user1Result = await checkRateLimit(
        env,
        user1,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(user1Result.allowed).toBe(true);

      const user2Result = await checkRateLimit(
        env,
        user2,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(user2Result.allowed).toBe(true);
    });
  });

  describe("checkApiRateLimit", () => {
    it("should check API rate limit (Node.js runtime - always allows)", async () => {
      const userId = 10;
      const limitPerMinute = 60;

      const result = await checkApiRateLimit(
        env,
        userId,
        "free",
        limitPerMinute
      );

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60);
      expect(result.remaining).toBe(60);
    });

    it("should always allow multiple requests (Node.js runtime)", async () => {
      const userId = 11;
      const limitPerMinute = 3;

      // Make many requests - all allowed (rate limiting disabled for Node.js)
      for (let i = 0; i < 10; i++) {
        const result = await checkApiRateLimit(
          env,
          userId,
          "free",
          limitPerMinute
        );
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limitPerMinute);
      }
    });
  });

  describe("checkPublicFeedRateLimit", () => {
    it("should check public feed rate limit (Node.js runtime - always allows)", async () => {
      const userId = 20;
      const limitPerMinute = 100;

      const result = await checkPublicFeedRateLimit(
        env,
        userId,
        "free",
        limitPerMinute
      );

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(100);
    });

    it("should always allow multiple requests (Node.js runtime)", async () => {
      const userId = 21;
      const limitPerMinute = 5;

      // Make many requests - all allowed (rate limiting disabled for Node.js)
      for (let i = 0; i < 10; i++) {
        const result = await checkPublicFeedRateLimit(
          env,
          userId,
          "free",
          limitPerMinute
        );
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limitPerMinute);
      }
    });

    it("should return valid resetAt date (Node.js runtime)", async () => {
      const userId = 22;
      const limitPerMinute = 2;

      const result = await checkPublicFeedRateLimit(
        env,
        userId,
        "free",
        limitPerMinute
      );

      expect(result.allowed).toBe(true);
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Runtime Validation", () => {
    it("should handle Cloudflare runtime without bindings (fallback behavior)", async () => {
      const cloudflareEnv: Env = {
        RUNTIME: "cloudflare",
        BETTER_AUTH_SECRET: "test-secret",
        // API_RATE_LIMIT and FEED_RATE_LIMIT are undefined (not mocked)
      } as Env;

      const userId = 100;
      const limit = 10;
      const windowMs = 60 * 1000;

      // Without bindings, falls back to allowing requests (with warning logged)
      const result = await checkRateLimit(
        cloudflareEnv,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result.allowed).toBe(true);
      // Note: In production, bindings would be configured and rate limiting would be enforced
    });

    it("should allow all requests for Node.js runtime (no rate limiting)", async () => {
      const nodejsEnv: Env = {
        RUNTIME: "nodejs",
        BETTER_AUTH_SECRET: "test-secret",
      } as Env;

      const userId = 102;
      const limit = 5;
      const windowMs = 60 * 1000;

      // Should not throw
      const result = await checkRateLimit(
        nodejsEnv,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result.allowed).toBe(true);
    });

    it("should allow all requests when RUNTIME is undefined (defaults to nodejs)", async () => {
      const defaultEnv: Env = {
        // RUNTIME is undefined - should default to "nodejs"
        BETTER_AUTH_SECRET: "test-secret",
      } as Env;

      const userId = 103;
      const limit = 5;
      const windowMs = 60 * 1000;

      // Should not throw
      const result = await checkRateLimit(
        defaultEnv,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle limit of 1 (Node.js runtime)", async () => {
      const userId = 60;
      const limit = 1;
      const windowMs = 60 * 1000;

      // Node.js runtime always allows (rate limiting disabled)
      const result1 = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(limit);

      const result2 = await checkRateLimit(
        env,
        userId,
        "free",
        limit,
        windowMs,
        "api"
      );
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(limit);
    });

    it("should handle very high limits (Node.js runtime)", async () => {
      const userId = 61;
      const limit = 10000;
      const windowMs = 60 * 1000;

      // Make many requests - all allowed (rate limiting disabled for Node.js)
      for (let i = 0; i < 100; i++) {
        const result = await checkRateLimit(
          env,
          userId,
          "free",
          limit,
          windowMs,
          "api"
        );
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit);
      }
    });
  });
});
