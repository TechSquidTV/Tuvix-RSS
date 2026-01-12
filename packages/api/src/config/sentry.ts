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

    // Send default PII (request headers, IP) for better context
    // Safe to enable because we filter sensitive fields via beforeSend callbacks
    sendDefaultPii: true,

    // Debug mode (verbose logging - useful for development)
    debug: environment === "development",

    // Vercel AI SDK integration for automatic AI span tracking
    // Captures token usage, model info, latency, and errors from AI SDK calls
    // Note: Integration setup is handled differently for Cloudflare Workers vs Node.js
    // For Cloudflare, integrations are configured in the entry point via withSentry
    enableAIIntegration: true,

    /**
     * beforeSendMetric callback
     *
     * Filters sensitive data from metrics before sending to Sentry
     * Returns null to drop metrics, or the metric to send it
     */
    beforeSendMetric: (metric: SentryMetric): SentryMetric | null => {
      // List of PII field names to remove
      const piiFields = [
        "email",
        "recipient",
        "userEmail",
        "user_email",
        "username",
        "password",
      ];

      // Remove any PII from metric attributes
      if (metric.attributes) {
        for (const field of piiFields) {
          delete metric.attributes[field];
        }
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
      // List of PII field names to remove
      const piiFields = [
        "email",
        "recipient",
        "userEmail",
        "user_email",
        "username",
        "password",
      ];

      // Helper to recursively remove PII from an object
      const removePII = (
        obj: Record<string, unknown>
      ): Record<string, unknown> => {
        const cleaned = { ...obj };
        for (const key of piiFields) {
          delete cleaned[key];
        }
        // Recursively clean nested objects
        for (const [key, value] of Object.entries(cleaned)) {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            cleaned[key] = removePII(value as Record<string, unknown>);
          }
        }
        return cleaned;
      };

      // Remove PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data) {
            return { ...breadcrumb, data: removePII(breadcrumb.data) };
          }
          return breadcrumb;
        });
      }

      // Remove PII from extra context
      if (event.extra) {
        event.extra = removePII(event.extra);
      }

      // Remove PII from contexts (signup.email, login.username, etc.)
      if (event.contexts) {
        event.contexts = removePII(event.contexts);
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
      // List of PII field names to remove
      const piiFields = [
        "email",
        "recipient",
        "userEmail",
        "user_email",
        "username",
        "password",
      ];

      // Initialize data object if it doesn't exist
      if (!span.data) {
        span.data = {};
      }

      // Remove PII from span attributes
      for (const field of piiFields) {
        delete span.data[field];
      }

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
