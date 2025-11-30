/**
 * Apple Podcast Discovery Service
 *
 * Discovers RSS feeds from Apple Podcasts URLs by using the iTunes Search API
 * to look up podcast metadata and extract the RSS feed URL.
 */

import { isSubdomainOf } from "../utils/domain-matcher";
import type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveredFeed,
} from "../core/types";

/**
 * iTunes Search API response types
 */
interface iTunesSearchResponse {
  resultCount: number;
  results: iTunesPodcastResult[];
}

interface iTunesPodcastResult {
  wrapperType: string;
  kind: string;
  collectionId: number;
  trackId: number;
  artistName: string;
  collectionName: string;
  trackName: string;
  collectionCensoredName: string;
  trackCensoredName: string;
  collectionViewUrl: string;
  feedUrl: string;
  trackViewUrl: string;
  artworkUrl30: string;
  artworkUrl60: string;
  artworkUrl100: string;
  artworkUrl600: string;
  collectionPrice: number;
  trackPrice: number;
  collectionHdPrice: number;
  releaseDate: string;
  collectionExplicitness: string;
  trackExplicitness: string;
  trackCount: number;
  country: string;
  currency: string;
  primaryGenreName: string;
  genreIds: string[];
  genres: string[];
  artistId?: number;
  artistViewUrl?: string;
  trackTimeMillis?: number;
  contentAdvisoryRating?: string;
  shortDescription?: string;
  longDescription?: string;
}

/**
 * Apple Podcast Discovery Service
 *
 * Handles discovery for Apple Podcasts URLs by:
 * 1. Extracting podcast ID from URL
 * 2. Using iTunes Search API to get RSS feed URL
 * 3. Validating the RSS feed
 */
export class AppleDiscoveryService implements DiscoveryService {
  readonly priority = 10; // Run before standard discovery

  /**
   * Check if URL is an Apple domain (apple.com or subdomain)
   */
  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      return hostname === "apple.com" || isSubdomainOf(hostname, "apple.com");
    } catch {
      return false;
    }
  }

  /**
   * Discover RSS feed from Apple Podcasts URL
   */
  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    // If telemetry provided, wrap in span
    if (context.telemetry?.startSpan) {
      return context.telemetry.startSpan(
        {
          op: "feed.discovery.apple",
          name: "Apple Podcast Discovery",
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
    try {
      // Extract podcast ID from URL
      const podcastId = this.extractPodcastId(url);
      if (!podcastId) {
        // No podcast ID found, let standard discovery handle it
        return [];
      }

      context.telemetry?.addBreadcrumb?.({
        message: `Trying Apple iTunes API for podcast ${podcastId}`,
        data: { podcast_id: podcastId, url },
      });

      // Call iTunes Search API
      const apiUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "TuvixRSS/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        context.telemetry?.captureException?.(
          new Error(`iTunes API returned ${response.status}`),
          {
            level: "warning",
            tags: {
              podcast_id: podcastId,
              operation: "itunes_api",
            },
            extra: {
              api_url: apiUrl,
              http_status: response.status,
            },
          }
        );
        return [];
      }

      const data: iTunesSearchResponse = await response.json();

      // Check if we got results
      if (
        data.resultCount === 0 ||
        !data.results ||
        data.results.length === 0
      ) {
        context.telemetry?.addBreadcrumb?.({
          message: `iTunes API returned no results for podcast ${podcastId}`,
          data: { podcast_id: podcastId },
        });
        return [];
      }

      const podcast = data.results[0];

      // Validate that this is actually a podcast (not music, app, etc.)
      if (podcast.wrapperType !== "track" || podcast.kind !== "podcast") {
        context.telemetry?.addBreadcrumb?.({
          message: `iTunes result is not a podcast (${podcast.wrapperType}/${podcast.kind})`,
          data: {
            podcast_id: podcastId,
            wrapper_type: podcast.wrapperType,
            kind: podcast.kind,
          },
        });
        return [];
      }

      // Check if feedUrl exists
      if (!podcast.feedUrl) {
        context.telemetry?.captureException?.(
          new Error("iTunes API result missing feedUrl"),
          {
            level: "warning",
            tags: {
              podcast_id: podcastId,
              podcast_name: podcast.collectionName,
            },
            extra: {
              itunes_data: {
                collectionId: podcast.collectionId,
                collectionName: podcast.collectionName,
              },
            },
          }
        );
        return [];
      }

      context.telemetry?.addBreadcrumb?.({
        message: `Found feed URL for ${podcast.collectionName}`,
        data: {
          feed_url: podcast.feedUrl,
          podcast_name: podcast.collectionName,
        },
      });

      // Validate the RSS feed using shared validator
      const discoveredFeed = await context.validateFeed(podcast.feedUrl);

      if (!discoveredFeed) {
        // Feed validation failed
        context.telemetry?.captureException?.(
          new Error("Feed validation failed for iTunes feed"),
          {
            level: "error",
            tags: {
              podcast_id: podcastId,
              podcast_name: podcast.collectionName,
              operation: "feed_validation",
            },
            extra: {
              feed_url: podcast.feedUrl,
              artwork_url: podcast.artworkUrl600 || podcast.artworkUrl100,
            },
          }
        );
        return [];
      }

      // Use podcast metadata from API if available (better than RSS metadata)
      return [
        {
          ...discoveredFeed,
          title: podcast.collectionName || discoveredFeed.title,
          description:
            podcast.longDescription ||
            podcast.shortDescription ||
            discoveredFeed.description,
        },
      ];
    } catch (error) {
      // Log error but don't fail discovery (fallback to standard discovery)
      console.error("Apple Podcast discovery error:", error);
      context.telemetry?.captureException?.(
        error instanceof Error ? error : new Error(String(error)),
        {
          level: "error",
          tags: { operation: "apple_discovery" },
          extra: { input_url: url },
        }
      );
      return [];
    }
  }

  /**
   * Extract podcast ID from Apple Podcasts URL
   *
   * Supports URLs like:
   * - https://podcasts.apple.com/us/podcast/name/id1234567890
   * - https://itunes.apple.com/us/podcast/name/id1234567890
   *
   * @param url - Apple Podcasts URL
   * @returns Podcast ID or null if not found
   */
  private extractPodcastId(url: string): string | null {
    // Match /id followed by digits, optionally followed by query string or end of string
    const match = url.match(/\/id(\d+)(?:\?|$)/);
    return match ? match[1] : null;
  }
}
