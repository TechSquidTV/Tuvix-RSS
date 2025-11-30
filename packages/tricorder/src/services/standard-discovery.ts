/**
 * Standard URL-Based Discovery Service
 *
 * Discovers feeds using standard URL patterns:
 * - Path extensions (.rss, .atom, .xml)
 * - Common feed paths (/feed, /rss, /atom, etc.)
 * - HTML link tag parsing
 */

import type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveredFeed,
} from "../core/types";

/**
 * Standard Discovery Service
 *
 * Handles discovery for any URL using common feed URL patterns.
 * This is the fallback service that runs after domain-specific services.
 */
export class StandardDiscoveryService implements DiscoveryService {
  readonly priority = 100; // Run after domain-specific services

  /**
   * Always return true - this service handles all URLs as fallback
   */
  canHandle(_url: string): boolean {
    return true;
  }

  /**
   * Discover feeds using standard URL patterns
   */
  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    // If telemetry provided, wrap in span
    if (context.telemetry?.startSpan) {
      return context.telemetry.startSpan(
        {
          op: "feed.discovery.standard",
          name: "Standard Feed Discovery",
          attributes: { input_url: url },
        },
        () => this.discoverInternal(url, context)
      );
    }

    return this.discoverInternal(url, context);
  }

  /**
   * Internal discovery implementation
   */
  private async discoverInternal(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    const discoveredFeeds: DiscoveredFeed[] = [];

    try {
      const siteUrl = new URL(url);
      const originalPathname = siteUrl.pathname;
      const baseUrl = `${siteUrl.protocol}//${siteUrl.hostname}${siteUrl.port ? ":" + siteUrl.port : ""}`;
      const inputPathname = siteUrl.pathname.endsWith("/")
        ? siteUrl.pathname
        : `${siteUrl.pathname}/`;

      context.telemetry?.addBreadcrumb?.({
        message: `Starting standard discovery for ${baseUrl}`,
        data: { base_url: baseUrl, pathname: originalPathname },
      });

      // Step 0: Try appending .rss, .atom, or .xml to the original URL path
      // This handles cases like Mastodon where @username.rss is the feed
      if (
        originalPathname &&
        !originalPathname.endsWith(".rss") &&
        !originalPathname.endsWith(".atom") &&
        !originalPathname.endsWith(".xml")
      ) {
        const pathExtensions = [".rss", ".atom", ".xml"];
        const pathExtensionResults = await Promise.all(
          pathExtensions.map((ext) =>
            context.validateFeed(`${baseUrl}${originalPathname}${ext}`)
          )
        );

        for (const feed of pathExtensionResults) {
          if (feed) {
            discoveredFeeds.push(feed);
          }
        }
      }

      // Step 1: Try common feed paths
      const commonPaths = [
        "/feed",
        "/rss",
        "/atom",
        "/atom.xml",
        "/feed.xml",
        "/rss.xml",
        "/index.xml",
        "/feeds/posts/default",
        "/feeds/all.atom",
        "/feed/atom/",
        "/blog/feed",
        "/blog/rss",
        "/blog/rss.xml",
        "/blog/feed.xml",
        "/blog/atom.xml",
      ];

      // Try common paths relative to base domain
      const commonPathResults = await Promise.all(
        commonPaths.map((path) => context.validateFeed(`${baseUrl}${path}`))
      );

      for (const feed of commonPathResults) {
        if (feed) {
          discoveredFeeds.push(feed);
        }
      }

      // Also try common paths relative to the input URL's pathname
      if (inputPathname !== "/") {
        const pathRelativePaths = [
          "feed",
          "rss",
          "atom",
          "atom.xml",
          "feed.xml",
          "rss.xml",
          "index.xml",
        ];

        const pathRelativeResults = await Promise.all(
          pathRelativePaths.map((path) =>
            context.validateFeed(`${baseUrl}${inputPathname}${path}`)
          )
        );

        for (const feed of pathRelativeResults) {
          if (feed) {
            discoveredFeeds.push(feed);
          }
        }
      }

      // Step 2: Fetch HTML and parse for feed links
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "TuvixRSS/1.0",
            Accept: "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const html = await response.text();

          // Parse for RSS/Atom link tags using regex
          const linkRegex =
            /<link[^>]*type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi;
          const matches = html.matchAll(linkRegex);

          const feedUrls: string[] = [];

          for (const match of matches) {
            const linkTag = match[0];

            if (!linkTag || typeof linkTag !== "string") {
              continue;
            }

            // Extract href
            const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
            if (hrefMatch && hrefMatch[1]) {
              let feedUrl = hrefMatch[1];

              // Resolve relative URLs
              if (feedUrl.startsWith("/")) {
                feedUrl = `${baseUrl}${feedUrl}`;
              } else if (!feedUrl.startsWith("http")) {
                feedUrl = `${baseUrl}/${feedUrl}`;
              }

              feedUrls.push(feedUrl);
            }
          }

          if (feedUrls.length > 0) {
            context.telemetry?.addBreadcrumb?.({
              message: `Found ${feedUrls.length} feed links in HTML`,
              data: {
                feed_count: feedUrls.length,
                sample_urls: feedUrls.slice(0, 3),
              },
            });
          }

          // Validate discovered feeds in parallel
          const htmlLinkResults = await Promise.all(
            feedUrls.map((feedUrl) => context.validateFeed(feedUrl))
          );

          for (const feed of htmlLinkResults) {
            if (feed) {
              discoveredFeeds.push(feed);
            }
          }
        }
      } catch (error) {
        // HTML fetch failed, but we may have found feeds via common paths
        context.telemetry?.addBreadcrumb?.({
          message: "HTML fetch failed, using common paths only",
          level: "warning",
          data: {
            error: error instanceof Error ? error.message : "Unknown",
          },
        });
      }

      return discoveredFeeds;
    } catch (error) {
      context.telemetry?.captureException?.(
        error instanceof Error ? error : new Error(String(error)),
        {
          level: "warning",
          tags: { operation: "standard_discovery" },
          extra: { input_url: url },
        }
      );
      return [];
    }
  }
}
