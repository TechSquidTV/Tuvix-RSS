/**
 * Shared Sentry Type Definitions
 *
 * These types are used by both sentry.cloudflare.ts and sentry.noop.ts
 * to ensure consistent interfaces across build targets.
 */

/**
 * User context for Sentry
 * @see https://docs.sentry.io/platforms/javascript/enriching-events/identify-user/
 */
export interface User {
  id?: string | number;
  email?: string;
  username?: string;
  ip_address?: string;
  segment?: string;
  [key: string]: unknown;
}

/**
 * Breadcrumb for debugging context
 * @see https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/
 */
export interface Breadcrumb {
  type?: string;
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
  timestamp?: number;
}

/**
 * Span status codes
 */
export interface SpanStatus {
  code: number;
  message?: string;
}

/**
 * Span for performance tracing
 * @see https://docs.sentry.io/platforms/javascript/performance/instrumentation/custom-instrumentation/
 */
export interface Span {
  setAttribute(key: string, value: string | number | boolean): Span;
  setAttributes(attributes: Record<string, string | number | boolean>): Span;
  setStatus(status: SpanStatus): Span;
}

/**
 * Options for starting a span
 */
export interface StartSpanOptions {
  name: string;
  op?: string;
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Context for captureException
 */
export interface CaptureContext {
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
  user?: User;
  level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
  extra?: Record<string, unknown>;
}

/**
 * Options for metrics
 */
export interface MetricOptions {
  attributes?: Record<string, string | number | boolean>;
  unit?: "millisecond" | "second" | "byte" | "percent";
}
