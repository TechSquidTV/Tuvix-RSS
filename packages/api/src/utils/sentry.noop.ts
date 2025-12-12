/**
 * No-op Sentry Implementation
 *
 * Provides synchronous no-op implementations for all Sentry functions.
 * Used in Node.js builds and tests where Sentry is not needed.
 *
 * Build-time aliasing in tsup.config.ts and vitest.config.ts routes
 * imports of "@/utils/sentry" to this file for Node.js/test builds.
 *
 * All functions match the @sentry/cloudflare API signatures exactly.
 */

import type {
  User,
  Breadcrumb,
  Span,
  StartSpanOptions,
  CaptureContext,
  MetricOptions,
} from "./sentry.types";

// Re-export types for consumers
export type { User, Breadcrumb, Span, StartSpanOptions, CaptureContext, MetricOptions };

/**
 * Set user context (no-op)
 */
export function setUser(_user: User | null): void {
  // No-op
}

/**
 * Add breadcrumb (no-op)
 */
export function addBreadcrumb(_breadcrumb: Breadcrumb): void {
  // No-op
}

/**
 * Capture exception (no-op)
 * Returns undefined instead of event ID
 */
export function captureException(
  _error: Error | unknown,
  _context?: CaptureContext
): string | undefined {
  return undefined;
}

/**
 * Capture message (no-op)
 * Returns undefined instead of event ID
 */
export function captureMessage(
  _message: string,
  _levelOrContext?: "fatal" | "error" | "warning" | "log" | "info" | "debug" | CaptureContext
): string | undefined {
  return undefined;
}

/**
 * Start a span for performance tracing (no-op)
 * Executes callback immediately with a no-op span
 */
export function startSpan<T>(
  _options: StartSpanOptions,
  callback: (span: Span) => T
): T {
  const noopSpan: Span = {
    setAttribute: () => noopSpan,
    setAttributes: () => noopSpan,
    setStatus: () => noopSpan,
  };
  return callback(noopSpan);
}

/**
 * Start an inactive span (no-op)
 * Returns a no-op span immediately
 */
export function startInactiveSpan(_options: StartSpanOptions): Span {
  const noopSpan: Span = {
    setAttribute: () => noopSpan,
    setAttributes: () => noopSpan,
    setStatus: () => noopSpan,
  };
  return noopSpan;
}

/**
 * Flush pending events (no-op)
 * Always returns true (success)
 */
export async function flush(_timeout?: number): Promise<boolean> {
  return true;
}

/**
 * Close the Sentry SDK (no-op)
 * Always returns immediately
 */
export async function close(_timeout?: number): Promise<boolean> {
  return true;
}

/**
 * Get current scope (no-op)
 * Returns a no-op scope object
 */
export function getCurrentScope(): {
  setTransactionName: (name: string) => void;
  setUser: (user: User | null) => void;
  setTag: (key: string, value: string) => void;
  setExtra: (key: string, value: unknown) => void;
} {
  return {
    setTransactionName: () => {},
    setUser: () => {},
    setTag: () => {},
    setExtra: () => {},
  };
}

/**
 * With scope (no-op)
 * Executes callback immediately
 */
export function withScope<T>(callback: (scope: ReturnType<typeof getCurrentScope>) => T): T {
  return callback(getCurrentScope());
}

/**
 * Metrics namespace (no-op implementations)
 */
export const metrics = {
  /**
   * Increment a counter metric (no-op)
   */
  count: (_name: string, _value: number, _options?: MetricOptions): void => {
    // No-op
  },

  /**
   * Set a gauge metric (no-op)
   */
  gauge: (_name: string, _value: number, _options?: MetricOptions): void => {
    // No-op
  },

  /**
   * Record a distribution metric (no-op)
   */
  distribution: (_name: string, _value: number, _options?: MetricOptions): void => {
    // No-op
  },

  /**
   * Record a set metric (no-op)
   */
  set: (_name: string, _value: string | number, _options?: MetricOptions): void => {
    // No-op
  },
};

/**
 * Default export for namespace imports (import * as Sentry from...)
 */
export default {
  setUser,
  addBreadcrumb,
  captureException,
  captureMessage,
  startSpan,
  startInactiveSpan,
  flush,
  close,
  getCurrentScope,
  withScope,
  metrics,
};
