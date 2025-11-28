/**
 * Feed Discovery Types
 *
 * Types and interfaces for the extensible feed discovery system.
 */

import type { DiscoveredFeed } from "@/types/feed";

/**
 * Context shared across discovery services during a single discovery request.
 * Used for deduplication and feed validation.
 */
export interface DiscoveryContext {
  /** Normalized URLs already discovered (for deduplication) */
  seenUrls: Set<string>;
  /** Atom feed IDs already discovered (for content-based deduplication) */
  seenFeedIds: Set<string>;
  /** Shared feed validation helper */
  validateFeed(feedUrl: string): Promise<DiscoveredFeed | null>;
}

/**
 * Discovery service interface for extensible feed discovery.
 *
 * Each service implements this interface to handle discovery for specific domains
 * or URL patterns (e.g., Apple Podcasts, YouTube).
 */
export interface DiscoveryService {
  /**
   * Check if this service can handle the given URL.
   *
   * @param url - The URL to check
   * @returns True if this service can handle the URL
   */
  canHandle(url: string): boolean;

  /**
   * Discover feeds from the given URL.
   *
   * @param url - The URL to discover feeds from
   * @param context - Shared discovery context for deduplication
   * @returns Array of discovered feeds, or empty array if none found
   */
  discover(url: string, context: DiscoveryContext): Promise<DiscoveredFeed[]>;

  /**
   * Execution priority (lower = higher priority).
   * Services with lower priority run first.
   */
  priority: number;
}

export type { DiscoveredFeed } from "@/types/feed";
