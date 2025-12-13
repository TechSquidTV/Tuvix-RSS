/**
 * Sentry SDK for Node.js
 *
 * This file re-exports all Sentry functionality from @sentry/node.
 * It's used in local Docker development builds.
 *
 * Build-time aliasing in tsup.config.ts routes imports of "@/utils/sentry"
 * to this file for Node.js builds.
 *
 * Note: Sentry must be initialized in the entry point (entries/node.ts)
 * BEFORE any other imports for auto-instrumentation to work properly.
 * This file just re-exports the SDK for use in application code.
 */

// Re-export everything from @sentry/node
export * from "@sentry/node";

// Also export as default for namespace imports (import * as Sentry from...)
import * as Sentry from "@sentry/node";
export default Sentry;
