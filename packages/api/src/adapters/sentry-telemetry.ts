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
        attributes: (options.attributes || {}) as Record<
          string,
          string | number | boolean
        >,
      },
      callback
    );
  },

  addBreadcrumb: (breadcrumb: {
    message: string;
    level?: "debug" | "info" | "warning" | "error";
    category?: string;
    data?: unknown;
  }): void => {
    Sentry.addBreadcrumb({
      category: breadcrumb.category || "feed.discovery",
      message: breadcrumb.message,
      level: breadcrumb.level || "info",
      data: breadcrumb.data as
        | Record<string, string | number | boolean>
        | undefined,
    });
  },

  captureException: (
    error: Error,
    context?: {
      level?: "debug" | "info" | "warning" | "error";
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): void => {
    Sentry.captureException(error, {
      level: context?.level || "error",
      tags: context?.tags,
      extra: context?.extra,
    });
  },
};
