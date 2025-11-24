/**
 * Sentry Configuration
 *
 * Provides common Sentry configuration for Cloudflare Workers.
 * Sentry is initialized via withSentry() wrapper in the Cloudflare adapter.
 */

import type { Env } from "@/types";

/**
 * Common Sentry configuration options
 */
export function getSentryConfig(env: Env) {
  const dsn = env.SENTRY_DSN as string | undefined;
  if (!dsn) {
    return null; // Sentry is optional
  }

  const environment = (env.SENTRY_ENVIRONMENT ||
    env.NODE_ENV ||
    "development") as string;
  const release = env.SENTRY_RELEASE as string | undefined;

  return {
    dsn,
    environment,
    release,
    tracesSampleRate: 0.1, // 10% sampling for performance
    enableLogs: true, // Enable Sentry logs for better debugging
  };
}
