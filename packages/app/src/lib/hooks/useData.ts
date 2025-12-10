// tRPC Hooks for Categories, Subscriptions, Feeds
import { toast } from "sonner";
import { trpc } from "@/lib/api/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { InfiniteArticlesData } from "./useArticles";
import * as Sentry from "@sentry/react";

// Categories
export const useCategories = () => {
  return trpc.categories.list.useQuery();
};

export const useCategory = (id: number) => {
  return trpc.categories.getById.useQuery({ id });
};

export const useCreateCategory = () => {
  const utils = trpc.useUtils();

  return trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      toast.success("Category created");
    },
    onError: () => {
      toast.error("Failed to create category");
    },
  });
};

export const useUpdateCategory = () => {
  const utils = trpc.useUtils();

  return trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.invalidate();
      toast.success("Category updated");
    },
    onError: () => {
      toast.error("Failed to update category");
    },
  });
};

export const useDeleteCategory = () => {
  const utils = trpc.useUtils();

  return trpc.categories.delete.useMutation({
    onSuccess: () => {
      utils.categories.invalidate();
      toast.success("Category deleted");
    },
    onError: () => {
      toast.error("Failed to delete category");
    },
  });
};

// Subscriptions
export const useSubscriptions = () => {
  return trpc.subscriptions.list.useQuery({ limit: 100, offset: 0 });
};

export const useSubscription = (id: number) => {
  return trpc.subscriptions.getById.useQuery({ id });
};

export const useCreateSubscription = () => {
  const utils = trpc.useUtils();

  return trpc.subscriptions.create.useMutation({
    onSuccess: () => {
      utils.subscriptions.list.invalidate();
      utils.categories.list.invalidate();
      toast.success("Subscription added");
    },
    onError: (error: unknown) => {
      // Handle duplicate subscription error specifically
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("Already subscribed") ||
        errorMessage.includes("CONFLICT")
      ) {
        toast.error("Already subscribed to this feed");
      } else {
        toast.error("Failed to add subscription");
      }
    },
  });
};

// Article polling configuration
const POLL_INTERVAL_MS = 2000; // 2 seconds between polls
const MAX_POLL_ATTEMPTS = 15; // 30 seconds total (15 × 2s)
const SLOW_FETCH_THRESHOLD = 5; // Show warning after 5th attempt (10s)

/**
 * Hook for creating subscriptions with smart polling for new articles.
 *
 * Flow:
 * 1. Creates subscription
 * 2. Triggers server-side feed refresh
 * 3. Polls for new articles every 2 seconds
 * 4. Shows progressive feedback based on timing
 * 5. Captures Sentry warning if articles don't appear after 10s
 *
 * Exports isPolling and pollAttempts for UI feedback:
 * - isPolling: boolean - true while actively polling for articles
 * - pollAttempts: number - current poll attempt count (0-15)
 *
 * Consumers can use these to show loading states, progress indicators,
 * or disable UI elements during the polling process.
 */
export const useCreateSubscriptionWithRefetch = () => {
  const createSubscription = useCreateSubscription();
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const attemptsRef = useRef(0); // Use ref to avoid closure issues
  const isMountedRef = useRef(true); // Track mount status to prevent state updates after unmount
  const isExecutingRef = useRef(false); // Prevent concurrent executions
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      isExecutingRef.current = false; // Reset execution flag on unmount
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    attemptsRef.current = 0;
    isExecutingRef.current = false; // Reset execution flag when polling stops
    setIsPolling(false);
    setPollAttempts(0);
  };

  const createWithRefetch = async (input: {
    url: string;
    customTitle?: string;
    iconUrl?: string;
    iconType?: "auto" | "custom" | "none";
    categoryIds?: number[];
    newCategoryNames?: string[];
  }) => {
    // Prevent concurrent executions - if already executing, ignore this call
    if (isExecutingRef.current) {
      return;
    }

    isExecutingRef.current = true;

    // Stop any existing polling (synchronously to prevent race conditions)
    stopPolling();

    // Set polling state immediately to prevent race conditions from rapid clicks
    setIsPolling(true);

    try {
      // Create subscription and get the source ID
      const subscription = await createSubscription.mutateAsync(input);

      // Validate that we have a source ID before proceeding
      if (!subscription.source) {
        throw new Error("Subscription created but source is missing");
      }

      const sourceId = subscription.source.id;

      // Get initial article count for this source
      const initialResult = queryClient.getQueriesData<InfiniteArticlesData>({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      let initialCount = 0;
      for (const [, data] of initialResult) {
        if (data?.pages) {
          for (const page of data.pages) {
            initialCount += page.items.filter(
              (item) => item.source.id === sourceId,
            ).length;
          }
        }
      }

      // Note: Backend now fetches articles immediately when creating subscription
      // No need to trigger a separate refresh here

      // Start smart polling (state already set above)
      // Recursive polling function to ensure serial execution
      const poll = async () => {
        // Check if polling was stopped
        if (!pollIntervalRef.current) return;

        attemptsRef.current++;
        setPollAttempts(attemptsRef.current);

        // Refetch articles list and wait for cache update
        // The await ensures the cache is updated before we read from it
        await queryClient.refetchQueries({
          queryKey: [["trpc"], ["articles", "list"]],
        });

        // Check if component unmounted during async refetch
        if (!isMountedRef.current) return;

        // Count articles from the new source (cache is guaranteed fresh after await above)
        // Optimized: reduce instead of nested loops with filter
        const results = queryClient.getQueriesData<InfiniteArticlesData>({
          queryKey: [["trpc"], ["articles", "list"]],
        });

        const currentCount = results.reduce((total, [, data]) => {
          if (!data?.pages) return total;
          return (
            total +
            data.pages.reduce(
              (pageTotal, page) =>
                pageTotal +
                page.items.reduce(
                  (itemTotal, item) =>
                    itemTotal + (item.source.id === sourceId ? 1 : 0),
                  0,
                ),
              0,
            )
          );
        }, 0);

        // Articles found!
        if (currentCount > initialCount) {
          const newArticles = currentCount - initialCount;
          stopPolling();
          toast.success(
            `Loaded ${newArticles} new article${newArticles === 1 ? "" : "s"}`,
          );
          return;
        }

        // After threshold, capture Sentry warning and update UI
        if (attemptsRef.current === SLOW_FETCH_THRESHOLD) {
          // Capture Sentry warning for slow fetch (safely handle if Sentry not initialized)
          try {
            Sentry.captureMessage("RSS fetch taking longer than expected", {
              level: "warning",
              tags: {
                operation: "subscription_create",
                feed_url: input.url,
              },
              extra: {
                source_id: sourceId,
                poll_attempts: attemptsRef.current,
                elapsed_seconds: attemptsRef.current * 2,
              },
            });
          } catch {
            // Sentry not available - silently ignore
          }

          toast.info("Taking longer than usual. Articles will appear soon...");
        }

        // Timeout after max attempts
        if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
          stopPolling();
          toast.info("Articles will appear soon. Try refreshing in a moment.", {
            duration: 5000,
          });
          return;
        }

        // Schedule next poll only after current poll completes
        pollIntervalRef.current = setTimeout(
          poll,
          POLL_INTERVAL_MS,
        ) as NodeJS.Timeout;
      };

      // Start first poll
      pollIntervalRef.current = setTimeout(
        poll,
        POLL_INTERVAL_MS,
      ) as NodeJS.Timeout;
    } catch (error) {
      // Reset polling state if subscription creation fails
      // stopPolling() will reset isExecutingRef
      stopPolling();
      throw error; // Re-throw to let the mutation handle the error
    }
    // Note: isExecutingRef is reset in stopPolling(), which is called on:
    // - Success (line 242)
    // - Timeout (line 274)
    // - Error (catch block above)
  };

  return {
    ...createSubscription,
    mutateAsync: createWithRefetch,
    isPolling,
    pollAttempts,
  };
};

export const useUpdateSubscription = () => {
  const utils = trpc.useUtils();

  return trpc.subscriptions.update.useMutation({
    onSuccess: () => {
      utils.subscriptions.invalidate();
      utils.categories.list.invalidate();
      toast.success("Subscription updated");
    },
    onError: () => {
      toast.error("Failed to update subscription");
    },
  });
};

export const useDeleteSubscription = () => {
  const utils = trpc.useUtils();

  return trpc.subscriptions.delete.useMutation({
    onSuccess: () => {
      utils.subscriptions.invalidate();
      toast.success("Unsubscribed");
    },
    onError: () => {
      toast.error("Failed to unsubscribe");
    },
  });
};

// Feeds
export const useFeeds = () => {
  return trpc.feeds.list.useQuery({ limit: 100, offset: 0 });
};

export const useFeed = (id: number) => {
  return trpc.feeds.getById.useQuery({ id });
};

export const useFeedByCategoryId = (categoryId: number) => {
  return trpc.feeds.getByCategoryId.useQuery({ categoryId });
};

export const useCreateFeed = () => {
  const utils = trpc.useUtils();

  return trpc.feeds.create.useMutation({
    onSuccess: () => {
      utils.feeds.list.invalidate();
      toast.success("Feed created");
    },
    onError: () => {
      toast.error("Failed to create feed");
    },
  });
};

export const useUpdateFeed = () => {
  const utils = trpc.useUtils();

  return trpc.feeds.update.useMutation({
    onSuccess: () => {
      utils.feeds.invalidate();
      toast.success("Feed updated");
    },
    onError: () => {
      toast.error("Failed to update feed");
    },
  });
};

export const useDeleteFeed = () => {
  const utils = trpc.useUtils();

  return trpc.feeds.delete.useMutation({
    onSuccess: () => {
      utils.feeds.invalidate();
      toast.success("Feed deleted");
    },
    onError: () => {
      toast.error("Failed to delete feed");
    },
  });
};

// Subscription Filters
export const useSubscriptionFilters = (subscriptionId: number) => {
  return trpc.subscriptions.listFilters.useQuery({ subscriptionId });
};

export const useCreateSubscriptionFilter = (subscriptionId: number) => {
  const utils = trpc.useUtils();

  return trpc.subscriptions.createFilter.useMutation({
    onSuccess: () => {
      utils.subscriptions.listFilters.invalidate({ subscriptionId });
      utils.subscriptions.getById.invalidate({ id: subscriptionId });
      toast.success("Filter created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create filter");
    },
  });
};

export const useUpdateSubscriptionFilter = (subscriptionId: number) => {
  const utils = trpc.useUtils();

  return trpc.subscriptions.updateFilter.useMutation({
    onSuccess: () => {
      utils.subscriptions.listFilters.invalidate({ subscriptionId });
      utils.subscriptions.getById.invalidate({ id: subscriptionId });
      toast.success("Filter updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update filter");
    },
  });
};

export const useDeleteSubscriptionFilter = (subscriptionId: number) => {
  const utils = trpc.useUtils();

  return trpc.subscriptions.deleteFilter.useMutation({
    onSuccess: () => {
      utils.subscriptions.listFilters.invalidate({ subscriptionId });
      utils.subscriptions.getById.invalidate({ id: subscriptionId });
      toast.success("Filter deleted");
    },
    onError: () => {
      toast.error("Failed to delete filter");
    },
  });
};
