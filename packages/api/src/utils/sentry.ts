/**
 * Runtime-agnostic Sentry wrapper
 *
 * Provides a unified Sentry interface that works in both Cloudflare Workers and Node.js:
 * - Cloudflare Workers: Uses @sentry/cloudflare (lazy-loaded)
 * - Node.js: Provides no-op stubs (Sentry disabled for Express)
 *
 * This prevents runtime errors from importing Cloudflare-specific SDK in Node.js.
 */

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
  setUser: async (user: { id: string } | null): Promise<void> => {
    if (!isCloudflare) return Promise.resolve(); // Immediate return for no-op
    const s = await loadSentry();
    s?.setUser(user);
  },

  /**
   * Add breadcrumb for debugging context
   * In real SDK: Synchronous
   * In wrapper: Async (to await dynamic import), but no-op returns immediately
   */
  addBreadcrumb: async (breadcrumb: unknown): Promise<void> => {
    if (!isCloudflare) return Promise.resolve(); // Immediate return for no-op
    const s = await loadSentry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    s?.addBreadcrumb(breadcrumb as any);
  },

  /**
   * Capture exception for error tracking
   * In real SDK: Async (returns Promise<string | undefined>)
   * In wrapper: Async, no-op returns undefined immediately
   */
  captureException: async (
    error: Error | unknown,
    context?: unknown
  ): Promise<string | undefined> => {
    if (!isCloudflare) return Promise.resolve(undefined); // Immediate return for no-op
    const s = await loadSentry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    return s?.captureException(error, context as any);
  },

  /**
   * Start a performance span for tracing
   * In real SDK: Async
   * In wrapper: Async, no-op executes callback immediately
   */
  startSpan: async <T>(
    options: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (span: any) => T | Promise<T>
  ): Promise<T> => {
    // No-op span for Node.js
    const noopSpan = {
      setAttribute: () => {},
      setStatus: () => {},
    };

    if (!isCloudflare) {
      // Execute callback immediately (synchronous no-op)
      return Promise.resolve(callback(noopSpan));
    }

    const s = await loadSentry();
    if (!s) {
      return Promise.resolve(callback(noopSpan));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    return s.startSpan(options as any, callback);
  },
};

// Re-export for named imports
export const { setUser, addBreadcrumb, captureException, startSpan } = Sentry;
