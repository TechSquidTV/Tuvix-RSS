/**
 * Discovery Registry
 *
 * Manages discovery services and orchestrates feed discovery.
 * Services are executed in priority order (lower priority = higher priority).
 */

import { createFeedValidator } from "../validators/feed-validator";
import { NoFeedsFoundError } from "./errors";
import type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveredFeed,
  TelemetryAdapter,
} from "./types";

/**
 * Discovery Registry - Main orchestrator for feed discovery.
 *
 * The registry manages multiple {@link DiscoveryService} implementations and
 * executes them in priority order until one finds feeds. This enables:
 *
 * - **Domain-specific optimization**: Special handling for known domains
 *   (e.g., Apple Podcasts via iTunes API instead of scraping)
 * - **Extensibility**: Easy to add new discovery services
 * - **Early exit**: Stops at first service that finds feeds for performance
 * - **Optional telemetry**: Zero overhead when not needed, full tracing when enabled
 *
 * **Discovery Flow:**
 * 1. Services are sorted by priority (lower number = higher priority)
 * 2. Each service's `canHandle(url)` is checked
 * 3. First matching service runs `discover(url, context)`
 * 4. If feeds found, return immediately (early exit)
 * 5. If no feeds or error, try next service
 * 6. If no services find feeds, throw {@link NoFeedsFoundError}
 *
 * @example
 * **Basic usage**
 * ```typescript
 * const registry = new DiscoveryRegistry();
 * registry.register(new AppleDiscoveryService());
 * registry.register(new StandardDiscoveryService());
 *
 * const feeds = await registry.discover('https://example.com');
 * ```
 *
 * @example
 * **With telemetry**
 * ```typescript
 * import { sentryAdapter } from './sentry-adapter';
 *
 * const registry = new DiscoveryRegistry(sentryAdapter);
 * registry.register(new AppleDiscoveryService());
 *
 * // Full Sentry tracing enabled
 * const feeds = await registry.discover('https://podcasts.apple.com/...');
 * ```
 *
 * @example
 * **Custom service**
 * ```typescript
 * class YouTubeService implements DiscoveryService {
 *   readonly priority = 20;
 *   canHandle(url: string) { return url.includes('youtube.com'); }
 *   async discover(url, context) { / * ... * / }
 * }
 *
 * registry.register(new YouTubeService());
 * ```
 *
 * @see {@link createDefaultRegistry} for pre-configured registry
 * @see {@link DiscoveryService} for creating custom services
 */
export class DiscoveryRegistry {
  private services: DiscoveryService[] = [];

  constructor(private telemetry?: TelemetryAdapter) {}

  /**
   * Register a discovery service.
   *
   * Services are automatically sorted by priority after registration
   * (lower priority number = executes first).
   *
   * @param service - Discovery service to register
   *
   * @example
   * ```typescript
   * registry.register(new AppleDiscoveryService()); // priority: 10
   * registry.register(new YouTubeDiscoveryService()); // priority: 20
   * registry.register(new StandardDiscoveryService()); // priority: 100
   * // Execution order: Apple → YouTube → Standard
   * ```
   */
  register(service: DiscoveryService): void {
    this.services.push(service);
    // Sort by priority (lower = higher priority)
    this.services.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Helper: Wrap operation in telemetry span if telemetry is provided
   */
  private async span<T>(
    name: string,
    attributes: Record<string, unknown>,
    callback: () => Promise<T>
  ): Promise<T> {
    if (this.telemetry?.startSpan) {
      return this.telemetry.startSpan(
        {
          op: "feed.discovery",
          name,
          attributes,
        },
        callback
      );
    }
    return callback();
  }

  /**
   * Helper: Add breadcrumb if telemetry is provided
   */
  private breadcrumb(message: string, data?: unknown): void {
    this.telemetry?.addBreadcrumb?.({
      category: "feed.discovery",
      message,
      level: "info",
      data,
    });
  }

  /**
   * Discover RSS/Atom feeds from a URL.
   *
   * Executes registered discovery services in priority order until one finds feeds:
   *
   * 1. **Service selection**: Filters to services where `canHandle(url)` returns true
   * 2. **Priority execution**: Runs services in priority order (lower = first)
   * 3. **Early exit**: Returns immediately when a service finds feeds (performance optimization)
   * 4. **Error resilience**: If a service errors, continues to next service
   * 5. **Feed validation**: All discovered URLs are validated and deduplicated
   *
   * **Performance:**
   * - Network-bound: ~300ms typical
   * - Telemetry overhead: <0.01ms (without), ~5ms (with Sentry)
   * - Parallel validation: Multiple feed URLs checked concurrently
   *
   * @param url - URL to discover feeds from. Examples:
   *   - Homepage: `https://example.com`
   *   - Blog: `https://example.com/blog`
   *   - Apple Podcasts: `https://podcasts.apple.com/.../id123`
   *   - Any page with RSS/Atom links
   *
   * @returns Promise resolving to array of discovered feeds.
   *   Each feed includes `url`, `title`, `type`, and optional `description`.
   *
   * @throws {NoFeedsFoundError} When no services find any feeds.
   *   This is the expected error for URLs without feeds.
   *
   * @throws {Error} For unexpected errors (network failures, invalid URLs).
   *   Service-level errors are caught and logged, but don't stop discovery.
   *
   * @example
   * **Standard website**
   * ```typescript
   * const feeds = await registry.discover('https://example.com');
   * // Tries: Apple service (skipped), Standard service (runs)
   * // Returns: [{ url: 'https://example.com/feed', title: '...', type: 'rss' }]
   * ```
   *
   * @example
   * **Apple Podcasts**
   * ```typescript
   * const feeds = await registry.discover('https://podcasts.apple.com/.../id123');
   * // Tries: Apple service (finds feed via iTunes API, returns immediately)
   * // Standard service never runs (early exit)
   * ```
   *
   * @see {@link DiscoveryService} for creating custom services
   * @see {@link DiscoveredFeed} for feed data structure
   */
  async discover(url: string): Promise<DiscoveredFeed[]> {
    return this.span(
      "Feed Discovery",
      {
        url,
        service_count: this.services.length,
      },
      () => this.discoverInternal(url)
    );
  }

  /**
   * Internal discovery implementation without telemetry wrapper
   */
  private async discoverInternal(url: string): Promise<DiscoveredFeed[]> {
    // Create shared discovery context for deduplication
    const seenUrls = new Set<string>();
    const seenFeedIds = new Set<string>();

    // Create feed validator function
    const validateFeed = createFeedValidator(seenUrls, seenFeedIds);

    const context: DiscoveryContext = {
      seenUrls,
      seenFeedIds,
      validateFeed,
      telemetry: this.telemetry,
    };

    this.breadcrumb(`Starting feed discovery for ${url}`, {
      url,
      service_count: this.services.length,
    });

    // Try each service in priority order
    for (const service of this.services) {
      const serviceName = service.constructor.name;

      if (!service.canHandle(url)) {
        this.breadcrumb(`Service ${serviceName} cannot handle URL`, {
          service: serviceName,
          url,
        });
        continue;
      }

      this.breadcrumb(`Trying service ${serviceName}`, {
        service: serviceName,
        priority: service.priority,
      });

      try {
        const feeds = await service.discover(url, context);

        // If service found feeds, return immediately (stop early)
        if (feeds.length > 0) {
          this.breadcrumb(
            `Service ${serviceName} found ${feeds.length} feed(s)`,
            {
              service: serviceName,
              feeds_found: feeds.length,
              feed_urls: feeds.map((f) => f.url),
            }
          );

          return feeds;
        }
      } catch (error) {
        // Log error but continue to next service
        console.error(`Discovery service ${serviceName} failed:`, error);
        this.telemetry?.captureException?.(
          error instanceof Error
            ? error
            : new Error(String(error)),
          {
            level: "warning",
            tags: {
              service: serviceName,
              operation: "feed_discovery_service",
            },
            extra: {
              url,
              service_priority: service.priority,
            },
          }
        );
      }
    }

    // No services found feeds - this is an expected case, not an error
    this.breadcrumb("No feeds found after trying all services", {
      url,
      services_tried: this.services.map((s) => s.constructor.name),
      service_count: this.services.length,
    });

    throw new NoFeedsFoundError();
  }
}
