/**
 * Core Types for Feed Discovery
 *
 * Platform-agnostic types for RSS/Atom feed discovery.
 */

/**
 * Discovered feed metadata
 */
export interface DiscoveredFeed {
  /** Feed URL */
  url: string;
  /** Feed title */
  title: string;
  /** Feed format */
  type: "rss" | "atom" | "rdf" | "json";
  /** Feed description (optional) */
  description?: string;
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
  /** Optional telemetry adapter */
  telemetry?: TelemetryAdapter;
}

/**
 * Telemetry adapter interface for optional observability.
 *
 * All methods are optional to allow partial implementations.
 * When not provided, discovery runs with zero telemetry overhead.
 */
export interface TelemetryAdapter {
  /**
   * Start a new span for distributed tracing
   *
   * @param options - Span configuration
   * @param callback - Function to execute within span
   * @returns Result of callback
   */
  startSpan?<T>(
    options: {
      /** Operation name (e.g., "feed.discovery.apple") */
      op?: string;
      /** Human-readable span name */
      name: string;
      /** Span attributes for filtering/grouping */
      attributes?: Record<string, unknown>;
    },
    callback: () => Promise<T>
  ): Promise<T>;

  /**
   * Add a breadcrumb for debugging
   *
   * @param breadcrumb - Breadcrumb data
   */
  addBreadcrumb?(breadcrumb: {
    /** Breadcrumb message */
    message: string;
    /** Severity level */
    level?: "debug" | "info" | "warning" | "error";
    /** Category for grouping */
    category?: string;
    /** Additional data */
    data?: unknown;
  }): void | Promise<void>;

  /**
   * Capture an exception
   *
   * @param error - Error to capture
   * @param context - Additional context
   * @returns Optional event ID from the telemetry system
   */
  captureException?(
    error: Error,
    context?: {
      /** Severity level */
      level?: "debug" | "info" | "warning" | "error";
      /** Tags for filtering */
      tags?: Record<string, string>;
      /** Additional data */
      extra?: Record<string, unknown>;
    }
  ): void | Promise<string | undefined>;
}
