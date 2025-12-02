/**
 * Feed Discovery Service
 *
 * Public API for extensible feed discovery system.
 */

import { DiscoveryRegistry } from "./registry";
import { AppleDiscoveryService } from "./apple-discovery";
import { RedditDiscoveryService } from "./reddit-discovery";
import { StandardDiscoveryService } from "./standard-discovery";
import type { DiscoveredFeed } from "./types";

// Create singleton registry with default services
const registry = new DiscoveryRegistry();

// Register default services (in priority order)
registry.register(new AppleDiscoveryService()); // Priority 10
registry.register(new RedditDiscoveryService()); // Priority 10
registry.register(new StandardDiscoveryService()); // Priority 100 (fallback)

/**
 * Discover feeds from a URL
 *
 * Uses domain-specific discovery services (e.g., Apple Podcasts) when applicable,
 * falling back to standard URL-based discovery.
 *
 * @param url - URL to discover feeds from
 * @returns Array of discovered feeds
 * @throws TRPCError with code NOT_FOUND if no feeds found
 */
export async function discoverFeeds(url: string): Promise<DiscoveredFeed[]> {
  return registry.discover(url);
}

// Export types and interfaces for extensibility
export type {
  DiscoveredFeed,
  DiscoveryService,
  DiscoveryContext,
} from "./types";
export { DiscoveryRegistry } from "./registry";
export { AppleDiscoveryService } from "./apple-discovery";
export { RedditDiscoveryService } from "./reddit-discovery";
export { StandardDiscoveryService } from "./standard-discovery";
