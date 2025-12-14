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

// SpanJSON represents the serialized span object passed to beforeSendSpan
interface SpanJSON {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// Event represents the error/message event passed to beforeSend
interface SentryEvent {
  breadcrumbs?: Array<{
    data?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
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
    // Set to 1.0 in development/staging for complete observability
    // Lower in production to manage quota
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,

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
     * beforeSend callback
     *
     * Removes PII from error events before sending to Sentry
     * This ensures email addresses and other sensitive data never leave the application
     */
    beforeSend: (event: SentryEvent): SentryEvent | null => {
      // Remove PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            const data = { ...breadcrumb.data };
            // Remove email-related PII
            delete data.recipient;
            delete data.userEmail;
            delete data.user_email;
            return { ...breadcrumb, data };
          }
          return breadcrumb;
        });
      }

      // Remove PII from extra context
      if (event.extra) {
        const extra = { ...event.extra };
        delete extra.recipient;
        delete extra.userEmail;
        delete extra.user_email;
        event.extra = extra;
      }

      return event;
    },

    /**
     * beforeSendSpan callback
     *
     * Adds global context to all spans (traces) and removes PII
     * Note: beforeSendSpan receives a serialized SpanJSON object, not a Span instance
     */
    beforeSendSpan: (span: SpanJSON): SpanJSON => {
      // Initialize data object if it doesn't exist
      if (!span.data) {
        span.data = {};
      }

      // Remove PII from span attributes
      delete span.data.user_email;
      delete span.data.userEmail;
      delete span.data.recipient;

      // Add global context directly to span data
      span.data.runtime = runtime;
      if (release) {
        span.data["app.version"] = release;
      }
      span.data["app.environment"] = environment;

      return span;
    },
  };
}
