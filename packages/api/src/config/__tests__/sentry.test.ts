/**
 * Sentry Configuration Tests
 *
 * Tests for Sentry configuration functions
 */

import { describe, it, expect } from "vitest";
import { getSentryConfig } from "../sentry";
import type { Env } from "@/types";

describe("getSentryConfig", () => {
  it("should return null when DSN is not provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
    };

    const config = getSentryConfig(env);
    expect(config).toBeNull();
  });

  it("should return config when DSN is provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SENTRY_DSN: "https://test@test.ingest.sentry.io/123",
    };

    const config = getSentryConfig(env);
    expect(config).not.toBeNull();
    expect(config?.dsn).toBe("https://test@test.ingest.sentry.io/123");
    expect(config?.environment).toBe("development");
    expect(config?.tracesSampleRate).toBe(0.1);
  });

  it("should use SENTRY_ENVIRONMENT when provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SENTRY_DSN: "https://test@test.ingest.sentry.io/123",
      SENTRY_ENVIRONMENT: "production",
    };

    const config = getSentryConfig(env);
    expect(config?.environment).toBe("production");
  });

  it("should fallback to NODE_ENV when SENTRY_ENVIRONMENT is not provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SENTRY_DSN: "https://test@test.ingest.sentry.io/123",
      NODE_ENV: "staging",
    };

    const config = getSentryConfig(env);
    expect(config?.environment).toBe("staging");
  });

  it("should default to 'development' when neither SENTRY_ENVIRONMENT nor NODE_ENV is provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SENTRY_DSN: "https://test@test.ingest.sentry.io/123",
    };

    const config = getSentryConfig(env);
    expect(config?.environment).toBe("development");
  });

  it("should include release when SENTRY_RELEASE is provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SENTRY_DSN: "https://test@test.ingest.sentry.io/123",
      SENTRY_RELEASE: "v1.0.0",
    };

    const config = getSentryConfig(env);
    expect(config?.release).toBe("v1.0.0");
  });

  it("should have undefined release when SENTRY_RELEASE is not provided", () => {
    const env: Env = {
      RUNTIME: "nodejs",
      BETTER_AUTH_SECRET: "test-secret",
      SENTRY_DSN: "https://test@test.ingest.sentry.io/123",
    };

    const config = getSentryConfig(env);
    expect(config?.release).toBeUndefined();
  });
});
