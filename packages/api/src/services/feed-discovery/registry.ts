/**
 * Discovery Registry
 *
 * Manages discovery services and orchestrates feed discovery.
 * Services are executed in priority order (lower priority = higher priority).
 */

import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";
import { createFeedValidator } from "./feed-validator";
import type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveredFeed,
} from "./types";

/**
 * Discovery Registry
 *
 * Manages discovery services and executes them in priority order.
 */
export class DiscoveryRegistry {
  private services: DiscoveryService[] = [];

  /**
   * Register a discovery service
   */
  register(service: DiscoveryService): void {
    this.services.push(service);
    // Sort by priority (lower = higher priority)
    this.services.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Discover feeds from a URL
   *
   * Executes discovery services in priority order:
   * 1. Services with lower priority run first
   * 2. If a service finds feeds, return immediately (stop early)
   * 3. If a service returns empty or errors, continue to next service
   * 4. If no services find feeds, throw NOT_FOUND error
   *
   * @param url - URL to discover feeds from
   * @returns Array of discovered feeds
   * @throws TRPCError with code NOT_FOUND if no feeds found
   */
  async discover(url: string): Promise<DiscoveredFeed[]> {
    return await Sentry.startSpan(
      {
        op: "feed.discovery",
        name: "Feed Discovery",
        attributes: {
          url,
          service_count: this.services.length,
        },
      },
      async (span) => {
        // Create shared discovery context for deduplication
        const seenUrls = new Set<string>();
        const seenFeedIds = new Set<string>();

        // Create feed validator function
        const validateFeed = createFeedValidator(seenUrls, seenFeedIds);

        const context: DiscoveryContext = {
          seenUrls,
          seenFeedIds,
          validateFeed,
        };

        Sentry.addBreadcrumb({
          category: "feed.discovery",
          message: `Starting feed discovery for ${url}`,
          level: "info",
          data: { url, service_count: this.services.length },
        });

        // Try each service in priority order
        for (const service of this.services) {
          const serviceName = service.constructor.name;

          if (!service.canHandle(url)) {
            Sentry.addBreadcrumb({
              category: "feed.discovery",
              message: `Service ${serviceName} cannot handle URL`,
              level: "debug",
              data: { service: serviceName, url },
            });
            continue;
          }

          Sentry.addBreadcrumb({
            category: "feed.discovery",
            message: `Trying service ${serviceName}`,
            level: "info",
            data: { service: serviceName, priority: service.priority },
          });

          try {
            const feeds = await service.discover(url, context);

            // If service found feeds, return immediately (stop early)
            if (feeds.length > 0) {
              span.setAttribute("service_used", serviceName);
              span.setAttribute("feeds_found", feeds.length);
              span.setStatus({ code: 1, message: "ok" });

              Sentry.addBreadcrumb({
                category: "feed.discovery",
                message: `Service ${serviceName} found ${feeds.length} feed(s)`,
                level: "info",
                data: {
                  service: serviceName,
                  feeds_found: feeds.length,
                  feed_urls: feeds.map((f) => f.url),
                },
              });

              return feeds;
            }
          } catch (error) {
            // Log error but continue to next service
            span.setAttribute(`service_${serviceName}_failed`, true);
            console.error(`Discovery service ${serviceName} failed:`, error);
            Sentry.captureException(error, {
              level: "warning",
              tags: {
                service: serviceName,
                operation: "feed_discovery_service",
              },
              extra: {
                url,
                service_priority: service.priority,
              },
            });
          }
        }

        // No services found feeds
        span.setStatus({ code: 2, message: "No feeds found" });
        span.setAttribute("feeds_found", 0);

        Sentry.captureException(
          new Error("No RSS or Atom feeds found on this website"),
          {
            level: "info",
            tags: {
              operation: "feed_discovery",
            },
            extra: {
              url,
              services_tried: this.services.map((s) => s.constructor.name),
            },
          }
        );

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No RSS or Atom feeds found on this website",
        });
      }
    );
  }
}
