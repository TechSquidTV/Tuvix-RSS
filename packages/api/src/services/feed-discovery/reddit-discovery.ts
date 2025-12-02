/**
 * Reddit Feed Discovery Service
 *
 * Discovers RSS feeds from Reddit URLs and fetches subreddit icons.
 * Handles both subreddit feeds and user feeds.
 */

import type { DiscoveryContext, DiscoveryService } from "./types";
import type { DiscoveredFeed } from "@/types/feed";
import * as Sentry from "@sentry/node";

const FETCH_TIMEOUT = 5000;

/**
 * Reddit discovery service
 * Priority: 10 (runs before standard discovery)
 */
export class RedditDiscoveryService implements DiscoveryService {
  priority = 10;

  canHandle(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname.includes("reddit.com");
    } catch {
      return false;
    }
  }

  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    return await Sentry.startSpan(
      {
        op: "feed.discovery.reddit",
        name: "Reddit Feed Discovery",
        attributes: {
          url,
        },
      },
      async (span) => {
        try {
          // Parse URL to extract protocol and hostname
          const parsedUrl = new URL(url);
          const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

          // Extract subreddit or user from URL
          // Reddit identifiers can only contain: alphanumeric, underscores, and hyphens
          // Length: 3-21 characters for subreddits, 3-20 for usernames
          const match = url.match(/\/r\/([\w-]{3,21})|\/user\/([\w-]{3,20})/);
          if (!match) {
            span.setStatus({ code: 2, message: "Not a subreddit or user URL" });
            return [];
          }

          const subreddit = match[1];
          const username = match[2];

          // Additional validation: ensure we extracted a valid identifier
          if (!subreddit && !username) {
            span.setStatus({ code: 2, message: "Invalid Reddit URL" });
            return [];
          }

          let feedUrl: string;
          let iconUrl: string | undefined;

          if (subreddit) {
            // Subreddit feed - preserve original domain (www.reddit.com, reddit.com, old.reddit.com, etc.)
            feedUrl = `${baseUrl}/r/${subreddit}/.rss`;
            iconUrl = await this.getSubredditIcon(subreddit);
            span.setAttribute("feed_type", "subreddit");
            span.setAttribute("subreddit", subreddit);
          } else if (username) {
            // User feed - preserve original domain
            feedUrl = `${baseUrl}/user/${username}/.rss`;
            span.setAttribute("feed_type", "user");
            span.setAttribute("username", username);
          } else {
            span.setStatus({ code: 2, message: "Invalid Reddit URL" });
            return [];
          }

          // Validate the RSS feed
          const discoveredFeed = await context.validateFeed(feedUrl);

          if (!discoveredFeed) {
            span.setStatus({ code: 2, message: "Feed validation failed" });
            return [];
          }

          span.setStatus({ code: 1, message: "ok" });
          span.setAttribute("feed_validated", true);
          if (iconUrl) {
            span.setAttribute("icon_url", iconUrl);
          }

          return [
            {
              ...discoveredFeed,
              iconUrl,
            },
          ];
        } catch (error) {
          span.setStatus({ code: 2, message: "Discovery failed" });
          console.error("Reddit feed discovery error:", error);
          await Sentry.captureException(error, {
            level: "error",
            tags: {
              operation: "reddit_discovery",
            },
            extra: {
              input_url: url,
            },
          });
          return [];
        }
      }
    );
  }

  /**
   * Fetch subreddit icon from Reddit's about.json API
   */
  private async getSubredditIcon(
    subreddit: string
  ): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const aboutUrl = `https://www.reddit.com/r/${subreddit}/about.json`;

      const response = await fetch(aboutUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "TuvixRSS/1.0 (RSS Reader; +https://github.com/techsquidtv/tuvix)",
        },
      });

      if (!response.ok) {
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
        console.error(
          `[RedditDiscovery] Timeout fetching icon for r/${subreddit} (${FETCH_TIMEOUT}ms)`
        );
      } else {
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
