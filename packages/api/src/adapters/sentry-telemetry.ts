/**
 * Sentry Telemetry Adapter
 *
 * Implements TelemetryAdapter interface for Sentry observability.
 */

import * as Sentry from "@/utils/sentry";
import type { TelemetryAdapter } from "@tuvixrss/tricorder";

/**
 * Sentry telemetry adapter for feed discovery
 *
 * Provides full Sentry integration with:
 * - Nested span tracing
 * - Breadcrumbs for debugging
 * - Exception capture with context
 */
/**
 * Filter attributes to only include primitive types supported by Sentry
 */
function filterAttributes(
  attributes?: Record<string, unknown>
): Record<string, string | number | boolean> {
  if (!attributes) return {};

  const filtered: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export const sentryTelemetryAdapter: TelemetryAdapter = {
  startSpan: <T>(
    options: {
      op?: string;
      name: string;
      attributes?: Record<string, unknown>;
    },
    callback: () => Promise<T>
  ): Promise<T> => {
    return Sentry.startSpan(
      {
        op: options.op,
        name: options.name,
        attributes: filterAttributes(options.attributes),
      },
      callback
    );
  },

  addBreadcrumb: (breadcrumb: {
    message: string;
    level?: "debug" | "info" | "warning" | "error";
    category?: string;
    data?: unknown;
  }): Promise<void> => {
    // Filter breadcrumb data to only include primitive types
    let filteredData: Record<string, string | number | boolean> | undefined =
      undefined;
    if (
      breadcrumb.data &&
      typeof breadcrumb.data === "object" &&
      !Array.isArray(breadcrumb.data)
    ) {
      filteredData = filterAttributes(
        breadcrumb.data as Record<string, unknown>
      );
    }

    Sentry.addBreadcrumb({
      category: breadcrumb.category || "feed.discovery",
      message: breadcrumb.message,
      level: breadcrumb.level || "info",
      data: filteredData,
    });
    return Promise.resolve();
  },

  captureException: (
    error: Error,
    context?: {
      level?: "debug" | "info" | "warning" | "error";
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): Promise<string | undefined> => {
    return Promise.resolve(
      Sentry.captureException(error, {
        level: context?.level || "error",
        tags: context?.tags,
        extra: context?.extra,
      })
    );
  },
};
