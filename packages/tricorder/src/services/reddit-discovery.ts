/**
 * Reddit Feed Discovery Service
 *
 * Discovers RSS feeds from Reddit URLs and fetches subreddit icons.
 * Handles both subreddit feeds and user feeds.
 */

import type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveredFeed,
} from "../core/types";

const FETCH_TIMEOUT = 5000;

/**
 * Reddit Feed Discovery Service
 *
 * Handles discovery for Reddit URLs by:
 * 1. Extracting subreddit or username from URL
 * 2. Constructing proper RSS feed URL
 * 3. Fetching subreddit icon (if applicable)
 * 4. Validating the RSS feed
 */
export class RedditDiscoveryService implements DiscoveryService {
  readonly priority = 10; // Run before standard discovery

  /**
   * Check if URL is a Reddit domain
   */
  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.includes("reddit.com");
    } catch {
      return false;
    }
  }

  /**
   * Discover RSS feed from Reddit URL
   */
  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    // If telemetry provided, wrap in span
    if (context.telemetry?.startSpan) {
      return context.telemetry.startSpan(
        {
          op: "feed.discovery.reddit",
          name: "Reddit Feed Discovery",
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
      // Extract subreddit or user from URL
      // Reddit identifiers can only contain: alphanumeric, underscores, and hyphens
      // Length: 3-21 characters for subreddits, 3-20 for usernames
      const match = url.match(/\/r\/([\w-]{3,21})|\/user\/([\w-]{3,20})/);
      if (!match) {
        context.telemetry?.addBreadcrumb?.({
          message: "Not a subreddit or user URL",
          data: { url },
        });
        return [];
      }

      const subreddit = match[1];
      const username = match[2];

      // Additional validation: ensure we extracted a valid identifier
      if (!subreddit && !username) {
        context.telemetry?.addBreadcrumb?.({
          message: "Invalid Reddit URL",
          data: { url },
        });
        return [];
      }

      let feedUrl: string;
      let iconUrl: string | undefined;

      if (subreddit) {
        // Subreddit feed - use old.reddit.com for better RSS reliability
        feedUrl = `https://old.reddit.com/r/${subreddit}/.rss`;
        iconUrl = await this.getSubredditIcon(subreddit, context);
        context.telemetry?.addBreadcrumb?.({
          message: `Found subreddit feed: r/${subreddit}`,
          data: { feed_url: feedUrl, subreddit },
        });
      } else if (username) {
        // User feed - use old.reddit.com for better RSS reliability
        feedUrl = `https://old.reddit.com/user/${username}/.rss`;
        context.telemetry?.addBreadcrumb?.({
          message: `Found user feed: u/${username}`,
          data: { feed_url: feedUrl, username },
        });
      } else {
        return [];
      }

      // Validate the RSS feed
      const discoveredFeed = await context.validateFeed(feedUrl);

      if (!discoveredFeed) {
        context.telemetry?.captureException?.(
          new Error("Feed validation failed for Reddit feed"),
          {
            level: "error",
            tags: {
              operation: "feed_validation",
              feed_type: subreddit ? "subreddit" : "user",
            },
            extra: {
              feed_url: feedUrl,
              subreddit,
              username,
            },
          }
        );
        return [];
      }

      return [
        {
          ...discoveredFeed,
          iconUrl,
        },
      ];
    } catch (error) {
      console.error("Reddit feed discovery error:", error);
      context.telemetry?.captureException?.(
        error instanceof Error ? error : new Error(String(error)),
        {
          level: "error",
          tags: { operation: "reddit_discovery" },
          extra: { input_url: url },
        }
      );
      return [];
    }
  }

  /**
   * Fetch subreddit icon from Reddit's about.json API
   */
  private async getSubredditIcon(
    subreddit: string,
    context: DiscoveryContext
  ): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const aboutUrl = `https://old.reddit.com/r/${subreddit}/about.json`;

      const response = await fetch(aboutUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
        },
      });

      if (!response.ok) {
        context.telemetry?.addBreadcrumb?.({
          message: `Failed to fetch subreddit icon (HTTP ${response.status})`,
          level: "warning",
          data: { subreddit, status: response.status },
        });
        return undefined;
      }

      const data = (await response.json()) as {
        data?: {
          community_icon?: string;
          icon_img?: string;
        };
      };

      // community_icon: Modern Reddit icon (preferred)
      // icon_img: Legacy Reddit icon (fallback)
      const iconUrl = data?.data?.community_icon || data?.data?.icon_img;

      if (iconUrl) {
        // Reddit returns icons with URL-encoded query params, remove them
        return iconUrl.split("?")[0];
      }

      return undefined;
    } catch (error) {
      // Handle timeout errors specifically for better logging
      if (error instanceof Error && error.name === "AbortError") {
        context.telemetry?.addBreadcrumb?.({
          message: `Timeout fetching icon for r/${subreddit} (${FETCH_TIMEOUT}ms)`,
          level: "warning",
          data: { subreddit, timeout: FETCH_TIMEOUT },
        });
        console.error(
          `[RedditDiscovery] Timeout fetching icon for r/${subreddit} (${FETCH_TIMEOUT}ms)`
        );
      } else {
        context.telemetry?.addBreadcrumb?.({
          message: `Failed to fetch icon for r/${subreddit}`,
          level: "warning",
          data: { subreddit, error: String(error) },
        });
        console.error(
          `[RedditDiscovery] Failed to fetch icon for r/${subreddit}:`,
          error
        );
      }
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }
}
