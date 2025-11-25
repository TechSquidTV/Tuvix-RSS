/**
 * Sentry Configuration
 *
 * Provides common Sentry configuration for both Node.js and Cloudflare Workers.
 * Includes Span Metrics and Sentry Metrics configuration.
 */

import type { Env } from "@/types";

// Define types for Sentry callbacks
interface SentryMetric {
  name: string;
  type: "counter" | "gauge" | "distribution" | "set";
  attributes?: Record<string, unknown>;
  unit?: string;
  value: number;
}

interface SentrySpan {
  setAttribute: (key: string, value: unknown) => void;
  [key: string]: unknown;
}

/**
 * Common Sentry configuration options
 *
 * Includes:
 * - Tracing configuration (10% sample rate)
 * - Metrics enabled (counters, gauges, distributions)
 * - beforeSendSpan callback for global span attributes
 * - beforeSendMetric callback for PII filtering
 */
export function getSentryConfig(env: Env): Record<string, unknown> | null {
  const dsn = env.SENTRY_DSN as string | undefined;
  if (!dsn) {
    return null; // Sentry is optional
  }

  const environment = (env.SENTRY_ENVIRONMENT ||
    env.NODE_ENV ||
    "development") as string;
  const release = env.SENTRY_RELEASE as string | undefined;

  // Detect runtime from explicit env.RUNTIME (set by entry points)
  // Fallback to process detection only if RUNTIME not set
  const runtime: "nodejs" | "cloudflare" =
    env.RUNTIME ||
    (typeof process !== "undefined" && process.env ? "nodejs" : "cloudflare");

  return {
    dsn,
    environment,
    release,
    tracesSampleRate: 0.1, // 10% sampling for performance tracing

    // Enable Sentry Metrics (counters, gauges, distributions)
    enableMetrics: true,

    // Enable logs for better debugging
    enableLogs: true,

    // Debug mode (verbose logging - useful for development)
    debug: environment === "development",

    /**
     * beforeSendMetric callback
     *
     * Filters sensitive data from metrics before sending to Sentry
     * Returns null to drop metrics, or the metric to send it
     */
    beforeSendMetric: (metric: SentryMetric): SentryMetric | null => {
      // Remove any PII from metric attributes
      if (metric.attributes?.email) {
        delete metric.attributes.email;
      }

      // Don't send test metrics in production
      if (metric.name.startsWith("test.") && environment === "production") {
        return null;
      }

      return metric;
    },

    /**
     * beforeSendSpan callback
     *
     * Adds global context to all spans (traces)
     */
    beforeSendSpan: (span: SentrySpan): SentrySpan => {
      // Add global context to all spans
      span.setAttribute("runtime", runtime);
      span.setAttribute("app.version", release);
      span.setAttribute("app.environment", environment);

      return span;
    },
  };
}
