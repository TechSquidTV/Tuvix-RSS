// tRPC Hooks for Categories, Subscriptions, Feeds
import { toast } from "sonner";
import { trpc } from "../api/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

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
 * Hook for creating subscriptions with delayed article refetch.
 * Reuses the standard subscription creation logic and adds a delayed refetch
 * of articles after 5 seconds to allow server-side feed processing.
 */
export const useCreateSubscriptionWithRefetch = () => {
  const createSubscription = useCreateSubscription();
  const queryClient = useQueryClient();
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
    };
  }, []);

  const createWithRefetch = async (input: {
    url: string;
    customTitle?: string;
    iconUrl?: string;
    iconType?: "auto" | "custom" | "none";
    categoryIds?: number[];
    newCategoryNames?: string[];
  }) => {
    // Clear any existing timeout
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }

    try {
      await createSubscription.mutateAsync(input);

      // Delayed refetch of articles to show new articles smoothly
      // Feed processing happens server-side and can take a few seconds
      refetchTimeoutRef.current = setTimeout(() => {
        queryClient.refetchQueries({
          queryKey: [["trpc"], ["articles", "list"]],
        });
        toast.info("Checking for new articles...");
        refetchTimeoutRef.current = null;
      }, 5000); // 5 second delay
    } catch (error) {
      // Error already handled by useCreateSubscription hook
      throw error;
    }
  };

  return {
    ...createSubscription,
    mutateAsync: createWithRefetch,
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
