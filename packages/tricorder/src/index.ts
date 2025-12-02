/**
 * Tricorder - RSS/Atom Feed Discovery Library
 *
 * Platform-agnostic feed discovery for Node.js and browsers.
 */

// Core
export { DiscoveryRegistry } from "./core/registry";
export type {
  DiscoveredFeed,
  DiscoveryService,
  DiscoveryContext,
  TelemetryAdapter,
} from "./core/types";
export {
  FeedDiscoveryError,
  NoFeedsFoundError,
  FeedValidationError,
} from "./core/errors";

// Services
export { StandardDiscoveryService } from "./services/standard-discovery";
export { AppleDiscoveryService } from "./services/apple-discovery";
export { RedditDiscoveryService } from "./services/reddit-discovery";

// Import for use in factory functions
import { DiscoveryRegistry } from "./core/registry";
import { StandardDiscoveryService } from "./services/standard-discovery";
import { AppleDiscoveryService } from "./services/apple-discovery";
import { RedditDiscoveryService } from "./services/reddit-discovery";
import type { DiscoveredFeed, TelemetryAdapter } from "./core/types";

// Validators
export { createFeedValidator } from "./validators/feed-validator";

// Utilities
export { isSubdomainOf } from "./utils/domain-matcher";
export { normalizeFeedUrl } from "./utils/url-normalize";
export { stripHtml } from "./utils/text-sanitizer";

/**
 * Create a discovery registry with default services registered.
 *
 * This factory function creates a {@link DiscoveryRegistry} pre-configured with:
 * - {@link AppleDiscoveryService} (priority: 10) - For Apple Podcasts URLs
 * - {@link RedditDiscoveryService} (priority: 10) - For Reddit URLs
 * - {@link StandardDiscoveryService} (priority: 100) - For all other URLs
 *
 * Services are executed in priority order (lower number = higher priority) and
 * discovery stops at the first service that finds feeds (early exit).
 *
 * @param options - Configuration options
 * @param options.telemetry - Optional telemetry adapter for observability.
 *   When provided, enables full distributed tracing with spans, breadcrumbs, and
 *   exception capture. When omitted, discovery runs with zero telemetry overhead.
 *
 * @returns Configured discovery registry ready to use
 *
 * @example
 * **Browser extension (no telemetry)**
 * ```typescript
 * const registry = createDefaultRegistry();
 * const feeds = await registry.discover('https://example.com');
 * // Zero telemetry overhead, pure discovery
 * ```
 *
 * @example
 * **API server (with Sentry)**
 * ```typescript
 * import { createDefaultRegistry } from '@tuvixrss/tricorder';
 * import { sentryAdapter } from './sentry-adapter';
 *
 * const registry = createDefaultRegistry({ telemetry: sentryAdapter });
 * const feeds = await registry.discover('https://podcasts.apple.com/...');
 * // Full Sentry tracing with nested spans
 * ```
 *
 * @example
 * **Custom services**
 * ```typescript
 * const registry = createDefaultRegistry();
 * registry.register(new YouTubeDiscoveryService()); // Add custom service
 * const feeds = await registry.discover('https://youtube.com/...');
 * ```
 *
 * @see {@link DiscoveryRegistry} for manual registry creation
 * @see {@link discoverFeeds} for one-shot discovery
 */
export function createDefaultRegistry(options?: {
  telemetry?: TelemetryAdapter;
}): DiscoveryRegistry {
  const registry = new DiscoveryRegistry(options?.telemetry);
  registry.register(new AppleDiscoveryService());
  registry.register(new RedditDiscoveryService());
  registry.register(new StandardDiscoveryService());
  return registry;
}

/**
 * Discover RSS/Atom feeds from any URL (one-shot convenience function).
 *
 * This is the simplest way to discover feeds - it creates a default registry,
 * runs discovery, and returns results. Equivalent to:
 * ```typescript
 * const registry = createDefaultRegistry(options);
 * return registry.discover(url);
 * ```
 *
 * **Discovery Process:**
 * 1. Tries domain-specific services first (e.g., Apple Podcasts)
 * 2. Falls back to standard discovery (common paths + HTML parsing)
 * 3. Validates all discovered feed URLs
 * 4. Deduplicates results
 * 5. Returns immediately when any service finds feeds (early exit)
 *
 * @param url - URL to discover feeds from. Can be:
 *   - Homepage: `https://example.com`
 *   - Blog page: `https://example.com/blog`
 *   - Apple Podcasts: `https://podcasts.apple.com/us/podcast/name/id123`
 *   - Any page with RSS/Atom links
 *
 * @param options - Configuration options
 * @param options.telemetry - Optional telemetry adapter for observability.
 *   Omit for zero-overhead discovery (recommended for browsers).
 *
 * @returns Promise resolving to array of discovered feeds.
 *   Returns empty array if discovery succeeds but finds no feeds.
 *
 * @throws {NoFeedsFoundError} When no feeds are found after trying all services.
 *   This is the expected error for URLs without feeds.
 *
 * @throws {Error} For unexpected errors (network failures, invalid URLs, etc.).
 *   These indicate problems with discovery itself, not missing feeds.
 *
 * @example
 * **Basic usage**
 * ```typescript
 * import { discoverFeeds } from '@tuvix/tricorder';
 *
 * const feeds = await discoverFeeds('https://example.com');
 * console.log(`Found ${feeds.length} feeds`);
 * feeds.forEach(feed => {
 *   console.log(`- ${feed.title} (${feed.type}): ${feed.url}`);
 * });
 * ```
 *
 * @example
 * **With error handling**
 * ```typescript
 * import { discoverFeeds, NoFeedsFoundError } from '@tuvix/tricorder';
 *
 * try {
 *   const feeds = await discoverFeeds('https://example.com');
 *   // Process feeds...
 * } catch (error) {
 *   if (error instanceof NoFeedsFoundError) {
 *     console.log('This website does not have RSS feeds');
 *   } else {
 *     console.error('Discovery failed:', error);
 *   }
 * }
 * ```
 *
 * @example
 * **With telemetry**
 * ```typescript
 * import { discoverFeeds } from '@tuvix/tricorder';
 * import { sentryAdapter } from './sentry-adapter';
 *
 * const feeds = await discoverFeeds('https://example.com', {
 *   telemetry: sentryAdapter // Enables Sentry tracing
 * });
 * ```
 *
 * @see {@link createDefaultRegistry} for reusable registry
 * @see {@link DiscoveryRegistry} for custom service registration
 * @see {@link DiscoveredFeed} for feed data structure
 */
export async function discoverFeeds(
  url: string,
  options?: { telemetry?: TelemetryAdapter }
): Promise<DiscoveredFeed[]> {
  const registry = createDefaultRegistry(options);
  return registry.discover(url);
}
