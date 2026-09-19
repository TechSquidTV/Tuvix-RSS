/**
 * BASE_URL Helper Tests
 *
 * Tests for base URL construction utility
 */

import { describe, it, expect } from "vitest";
import { getBaseUrl } from "../base-url";
import type { Env } from "@api/types";

describe("getBaseUrl", () => {
  it("should use BASE_URL from environment if set", () => {
    const env: Env = {
      BETTER_AUTH_SECRET: "test",
      BASE_URL: "https://example.com",
    } as Env;

    const url = getBaseUrl(env);
    expect(url).toBe("https://example.com");
  });

  it("should construct URL from X-Forwarded-Host header", () => {
    const env: Env = {
      BETTER_AUTH_SECRET: "test",
    } as Env;

    const headers = {
      "x-forwarded-host": "example.com",
      "x-forwarded-proto": "https",
    };

    const url = getBaseUrl(env, headers);
    expect(url).toBe("https://example.com");
  });

  it("should construct URL from Host header", () => {
    const env: Env = {
      BETTER_AUTH_SECRET: "test",
    } as Env;

    const headers = {
      host: "example.com",
    };

    const url = getBaseUrl(env, headers);
    expect(url).toBe("http://example.com");
  });

  it("should use https when X-Forwarded-SSL is on", () => {
    const env: Env = {
      BETTER_AUTH_SECRET: "test",
    } as Env;

    const headers = {
      host: "example.com",
      "x-forwarded-ssl": "on",
    };

    const url = getBaseUrl(env, headers);
    expect(url).toBe("https://example.com");
  });

  it("should fallback to localhost in development", () => {
    const env: Env = {
      BETTER_AUTH_SECRET: "test",
    } as Env;

    const url = getBaseUrl(env);
    expect(url).toBe("http://localhost:5173");
  });

  it("should prioritize BASE_URL over headers", () => {
    const env: Env = {
      BETTER_AUTH_SECRET: "test",
      BASE_URL: "https://configured.com",
    } as Env;

    const headers = {
      host: "example.com",
      "x-forwarded-host": "other.com",
    };

    const url = getBaseUrl(env, headers);
    expect(url).toBe("https://configured.com");
  });
});
