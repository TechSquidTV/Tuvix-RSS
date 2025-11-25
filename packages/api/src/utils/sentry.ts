/**
 * Runtime-agnostic Sentry wrapper
 *
 * Provides a unified Sentry interface that works in both Cloudflare Workers and Node.js:
 * - Cloudflare Workers: Uses @sentry/cloudflare (lazy-loaded)
 * - Node.js: Provides no-op stubs (Sentry disabled for Express)
 *
 * This prevents runtime errors from importing Cloudflare-specific SDK in Node.js.
 */

// Import only the types that exist in @sentry/cloudflare
import type { Breadcrumb, Span, User } from "@sentry/cloudflare";

// Define types that don't exist in the SDK but match the API
interface SentryStartSpanOptions {
  name: string;
  op?: string;
  attributes?: Record<string, string | number | boolean>;
}

interface SentryCaptureContext {
  tags?: Record<string, string>;
  contexts?: Record<string, Record<string, unknown>>;
  user?: User;
  level?: "fatal" | "error" | "warning" | "log" | "info" | "debug";
  extra?: Record<string, unknown>;
}

interface SentryMetricOptions {
  attributes?: Record<string, string | number | boolean>;
  unit?: "millisecond" | "second" | "byte" | "percent";
}

// Detect runtime using environment variable
// In Node.js, process.env.RUNTIME will be "nodejs"
// In Cloudflare Workers, it will be "cloudflare" or undefined
const isCloudflare =
  typeof process !== "undefined" && process.env?.RUNTIME === "nodejs"
    ? false
    : true;

// Lazy-loaded Sentry module (only in Cloudflare Workers)
let _sentry: typeof import("@sentry/cloudflare") | null = null;
let _loadPromise: Promise<typeof import("@sentry/cloudflare") | null> | null =
  null;

/**
 * Lazy-load the Sentry SDK (Cloudflare only)
 */
function loadSentry(): Promise<typeof import("@sentry/cloudflare") | null> {
  // Return cached promise if already loading
  if (_loadPromise) return _loadPromise;

  // Return cached module if already loaded
  if (_sentry) return Promise.resolve(_sentry);

  // Return null for Node.js runtime
  if (!isCloudflare) return Promise.resolve(null);

  // Lazy-load Sentry for Cloudflare Workers
  _loadPromise = import("@sentry/cloudflare")
    .then((module) => {
      _sentry = module;
      return module;
    })
    .catch((error) => {
      console.error("Failed to load Sentry SDK:", error);
      return null;
    });

  return _loadPromise;
}

/**
 * Runtime-agnostic Sentry namespace
 *
 * Provides the same API as @sentry/cloudflare but works in both runtimes:
 * - Cloudflare: Proxies to real Sentry SDK (async due to lazy loading)
 * - Node.js: No-op implementations (return resolved promises immediately)
 *
 * Note: All functions are async for consistency, even though setUser/addBreadcrumb
 * are typically synchronous in the real SDK. This is necessary because we need
 * to await the dynamic import. The no-op stubs return immediately with no overhead.
 */
export const Sentry = {
  /**
   * Set user context for error reporting
   * In real SDK: Synchronous
   * In wrapper: Async (to await dynamic import), but no-op returns immediately
   */
  setUser: async (user: User | null): Promise<void> => {
    if (!isCloudflare) return Promise.resolve(); // Immediate return for no-op
    const s = await loadSentry();
    s?.setUser(user);
  },

  /**
   * Add breadcrumb for debugging context
   * In real SDK: Synchronous
   * In wrapper: Async (to await dynamic import), but no-op returns immediately
   */
  addBreadcrumb: async (breadcrumb: Breadcrumb): Promise<void> => {
    if (!isCloudflare) return Promise.resolve(); // Immediate return for no-op
    const s = await loadSentry();
    s?.addBreadcrumb(breadcrumb);
  },

  /**
   * Capture exception for error tracking
   * In real SDK: Async (returns Promise<string | undefined>)
   * In wrapper: Async, no-op returns undefined immediately
   */
  captureException: async (
    error: Error | unknown,
    context?: SentryCaptureContext
  ): Promise<string | undefined> => {
    if (!isCloudflare) return Promise.resolve(undefined); // Immediate return for no-op
    const s = await loadSentry();
    return s?.captureException(error, context);
  },

  /**
   * Start a performance span for tracing
   * In real SDK: Async
   * In wrapper: Async, no-op executes callback immediately
   *
   * Note: We always provide a span (no-op in Node.js), so callback receives non-undefined span
   */
  startSpan: async <T>(
    options: SentryStartSpanOptions,
    callback: (span: Span) => T | Promise<T>
  ): Promise<T> => {
    // No-op span for Node.js - minimal implementation with chainable methods
    const noopSpan = {
      setAttribute: () => noopSpan,
      setStatus: () => noopSpan,
      setAttributes: () => noopSpan,
    } as unknown as Span;

    if (!isCloudflare) {
      // Execute callback immediately with no-op span
      return Promise.resolve(callback(noopSpan));
    }

    const s = await loadSentry();
    if (!s) {
      return Promise.resolve(callback(noopSpan));
    }

    // Cast to match Sentry's signature (options and callback with optional span)
    return s.startSpan(
      options as Parameters<typeof s.startSpan>[0],
      callback as (span: Span | undefined) => T | Promise<T>
    );
  },

  /**
   * Flush Sentry events (wait for them to be sent)
   * In real SDK: Async (returns Promise<boolean>)
   * In wrapper: Async, no-op returns true immediately
   */
  flush: async (timeout?: number): Promise<boolean> => {
    if (!isCloudflare) return Promise.resolve(true);
    const s = await loadSentry();
    return s?.flush(timeout) ?? Promise.resolve(true);
  },

  /**
   * Sentry Metrics API (counters, gauges, distributions)
   */
  metrics: {
    /**
     * Increment a counter metric
     */
    count: (
      name: string,
      value: number,
      options?: SentryMetricOptions
    ): void => {
      if (!isCloudflare) return; // No-op for Node.js
      if (_sentry?.metrics) {
        _sentry.metrics.count(name, value, options);
      }
    },

    /**
     * Set a gauge metric
     */
    gauge: (
      name: string,
      value: number,
      options?: SentryMetricOptions
    ): void => {
      if (!isCloudflare) return; // No-op for Node.js
      if (_sentry?.metrics) {
        _sentry.metrics.gauge(name, value, options);
      }
    },

    /**
     * Record a distribution metric
     */
    distribution: (
      name: string,
      value: number,
      options?: SentryMetricOptions
    ): void => {
      if (!isCloudflare) return; // No-op for Node.js
      if (_sentry?.metrics) {
        _sentry.metrics.distribution(name, value, options);
      }
    },
  },
};

// Re-export for named imports
export const {
  setUser,
  addBreadcrumb,
  captureException,
  startSpan,
  flush,
  metrics,
} = Sentry;
