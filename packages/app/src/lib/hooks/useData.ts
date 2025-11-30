// tRPC Hooks for Categories, Subscriptions, Feeds
import { toast } from "sonner";
import { trpc } from "../api/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRefreshFeeds } from "./useArticles";

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
    onError: (error) => {
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

/**
 * Hook for creating subscriptions with smart polling for new articles.
 *
 * Flow:
 * 1. Creates subscription
 * 2. Triggers server-side feed refresh
 * 3. Polls for new articles every 2 seconds
 * 4. Shows progressive feedback based on timing
 * 5. Captures Sentry warning if articles don't appear after 10s
 */
export const useCreateSubscriptionWithRefetch = () => {
  const createSubscription = useCreateSubscription();
  const refreshFeeds = useRefreshFeeds();
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
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
    // Stop any existing polling
    stopPolling();

    // Create subscription and get the source ID
    const subscription = await createSubscription.mutateAsync(input);
    const sourceId = subscription.source.id;

    // Get initial article count for this source
    const initialResult = queryClient.getQueriesData<{ pages: Array<{ items: Array<{ source?: { id: number } }> }> }>({
      queryKey: [["trpc"], ["articles", "list"]],
    });

    let initialCount = 0;
    for (const [, data] of initialResult) {
      if (data?.pages) {
        for (const page of data.pages) {
          initialCount += page.items.filter(item => item.source?.id === sourceId).length;
        }
      }
    }

    // Trigger server-side feed refresh
    refreshFeeds.mutate();

    // Start smart polling
    setIsPolling(true);
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds (15 polls × 2s)

    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      setPollAttempts(attempts);

      // Refetch articles list
      await queryClient.refetchQueries({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      // Count articles from the new source
      const results = queryClient.getQueriesData<{ pages: Array<{ items: Array<{ source?: { id: number } }> }> }>({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      let currentCount = 0;
      for (const [, data] of results) {
        if (data?.pages) {
          for (const page of data.pages) {
            currentCount += page.items.filter(item => item.source?.id === sourceId).length;
          }
        }
      }

      // Articles found!
      if (currentCount > initialCount) {
        const newArticles = currentCount - initialCount;
        stopPolling();
        toast.success(`Loaded ${newArticles} new article${newArticles === 1 ? "" : "s"}`);
        return;
      }

      // After 5th poll (10 seconds), capture Sentry warning and update UI
      if (attempts === 5) {
        // Capture Sentry warning for slow fetch
        if (typeof window !== "undefined" && window.Sentry) {
          window.Sentry.captureMessage("RSS fetch taking longer than expected", {
            level: "warning",
            tags: {
              operation: "subscription_create",
              feed_url: input.url,
            },
            extra: {
              source_id: sourceId,
              poll_attempts: attempts,
              elapsed_seconds: attempts * 2,
            },
          });
        }

        toast.info("Taking longer than usual. Articles will appear soon...");
      }

      // Timeout after max attempts
      if (attempts >= maxAttempts) {
        stopPolling();
        toast.info("Articles will appear soon. Try refreshing in a moment.", {
          duration: 5000,
        });
      }
    }, 2000); // Poll every 2 seconds
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
