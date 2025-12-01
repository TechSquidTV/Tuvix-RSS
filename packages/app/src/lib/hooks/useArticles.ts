// tRPC Hooks for Articles
import { toast } from "sonner";
import { trpc } from "../api/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { mergePages } from "../utils/pagination";

// Type for paginated article structure in React Query cache
export type InfiniteArticlesData = {
  pages: Array<{
    items: Array<{
      id: number;
      read: boolean;
      saved: boolean;
      source: { id: number }; // Required - API always returns source via database join
    }>;
    total: number;
    hasMore: boolean;
  }>;
  pageParams: unknown[];
};

// Hooks
export const useArticles = (filters?: {
  categoryId?: number;
  subscriptionId?: number;
  unread?: boolean;
  read?: boolean;
  saved?: boolean;
  offset?: number;
  limit?: number;
}) => {
  return trpc.articles.list.useQuery({
    limit: 50,
    offset: 0,
    ...filters,
  });
};

export const useInfiniteArticles = (filters?: {
  categoryId?: number;
  subscriptionId?: number;
  unread?: boolean;
  read?: boolean;
  saved?: boolean;
}) => {
  return trpc.articles.list.useInfiniteQuery(
    // Use function form to receive pageParam (offset) for each page fetch
    (pageParam) => ({ ...filters, limit: 20, offset: pageParam }),
    {
      getNextPageParam: (lastPage, allPages) => {
        // Backend returns {items: Article[], total: number, hasMore: boolean}
        // Stop pagination when no more items are available
        if (!lastPage?.hasMore) return undefined;

        // If the last page returned empty items, stop pagination to prevent infinite loop
        if (!lastPage.items || lastPage.items.length === 0) return undefined;

        // Calculate next offset based on unique items loaded so far
        // Use deduplication to handle any overlap between pages
        const uniqueItems = mergePages(allPages);
        return uniqueItems.length;
      },
      initialPageParam: 0,
    },
  );
};

export const useArticle = (id: number) => {
  return trpc.articles.getById.useQuery({ id });
};

export const useMarkArticleRead = () => {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  return trpc.articles.markRead.useMutation({
    onMutate: async ({ id }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await utils.articles.list.cancel();

      // Snapshot the previous value for rollback
      const previousData = queryClient.getQueriesData({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      // Optimistically update all cached queries
      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: [["trpc"], ["articles", "list"]] },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, read: true } : article,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        // getQueriesData returns [QueryKey, TData][] tuples
        // setQueryData accepts QueryKey directly - formats are compatible
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to mark as read");
    },
    onSuccess: () => {
      // Invalidate all article list queries to ensure filtered views are updated
      utils.articles.list.invalidate();
      toast.success("Marked as read");
    },
  });
};

export const useMarkArticleUnread = () => {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  return trpc.articles.markUnread.useMutation({
    onMutate: async ({ id }) => {
      await utils.articles.list.cancel();

      const previousData = queryClient.getQueriesData({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: [["trpc"], ["articles", "list"]] },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, read: false } : article,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        // getQueriesData returns [QueryKey, TData][] tuples
        // setQueryData accepts QueryKey directly - formats are compatible
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to mark as unread");
    },
    onSuccess: () => {
      // Invalidate all article list queries to ensure filtered views are updated
      utils.articles.list.invalidate();
      toast.success("Marked as unread");
    },
  });
};

export const useSaveArticle = () => {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  return trpc.articles.save.useMutation({
    onMutate: async ({ id }) => {
      await utils.articles.list.cancel();

      const previousData = queryClient.getQueriesData({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: [["trpc"], ["articles", "list"]] },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, saved: true } : article,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        // getQueriesData returns [QueryKey, TData][] tuples
        // setQueryData accepts QueryKey directly - formats are compatible
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to save article");
    },
    onSuccess: () => {
      // Invalidate all article list queries to ensure filtered views are updated
      utils.articles.list.invalidate();
      toast.success("Article saved");
    },
  });
};

export const useUnsaveArticle = () => {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  return trpc.articles.unsave.useMutation({
    onMutate: async ({ id }) => {
      await utils.articles.list.cancel();

      const previousData = queryClient.getQueriesData({
        queryKey: [["trpc"], ["articles", "list"]],
      });

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: [["trpc"], ["articles", "list"]] },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, saved: false } : article,
              ),
            })),
          };
        },
      );

      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        // getQueriesData returns [QueryKey, TData][] tuples
        // setQueryData accepts QueryKey directly - formats are compatible
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to unsave article");
    },
    onSuccess: () => {
      // Invalidate all article list queries to ensure filtered views are updated
      utils.articles.list.invalidate();
      toast.success("Article unsaved");
    },
  });
};

// Bulk operations
export const useBulkMarkRead = () => {
  const utils = trpc.useUtils();

  return trpc.articles.bulkMarkRead.useMutation({
    onSuccess: (data) => {
      utils.articles.list.invalidate();
      toast.success(`${data.updated} articles updated`);
    },
    onError: () => {
      toast.error("Failed to mark articles");
    },
  });
};

export const useMarkAllRead = () => {
  const utils = trpc.useUtils();

  return trpc.articles.markAllRead.useMutation({
    onSuccess: (data) => {
      utils.articles.list.invalidate();
      toast.success(
        `${data.updated} article${data.updated === 1 ? "" : "s"} marked as read`,
      );
    },
    onError: () => {
      toast.error("Failed to mark articles as read");
    },
  });
};

export const useRefreshFeeds = () => {
  return trpc.articles.refresh.useMutation({
    onSuccess: () => {
      // Don't refetch immediately - the background fetch takes time
      // Let the caller handle refetch timing (e.g., useCreateSubscriptionWithRefetch)
      toast.success("Feed refresh started");
    },
    onError: () => {
      toast.error("Failed to refresh feeds");
    },
  });
};
