/**
 * Sentry SDK for Cloudflare Workers
 *
 * This file re-exports all Sentry functionality from @sentry/cloudflare.
 * It's used in production Cloudflare Workers builds.
 *
 * Build-time aliasing in tsup.config.ts routes imports of "@/utils/sentry"
 * to either this file (Cloudflare) or sentry.noop.ts (Node.js/tests).
 */

// Re-export everything from @sentry/cloudflare
export * from "@sentry/cloudflare";

// Also export as default for namespace imports (import * as Sentry from...)
import * as Sentry from "@sentry/cloudflare";
export default Sentry;
