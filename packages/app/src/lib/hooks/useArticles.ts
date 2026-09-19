import { getQueryKey } from "@trpc/react-query";
// tRPC Hooks for Articles
import { toast } from "sonner";
import { trpc } from "@/lib/api/trpc";
import { useQueryClient } from "@tanstack/react-query";

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

/**
 * Deduplicates articles across pages by ID
 * Includes defensive checks for malformed data
 * Exported for testing
 */
export function deduplicateArticlesData<T extends InfiniteArticlesData>(
  data: T
): T {
  // Defensive check: ensure data and pages exist
  if (!data?.pages || !Array.isArray(data.pages)) {
    console.warn("⚠️ useInfiniteArticles select: Invalid data structure", {
      hasData: !!data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hasPages: !!(data as any)?.pages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pagesIsArray: Array.isArray((data as any)?.pages),
      data,
    });
    return data;
  }

  const seenIds = new Set<number>();
  const deduplicatedPages = data.pages.map((page) => {
    // Defensive check: ensure page.items exists and is an array
    if (!page?.items || !Array.isArray(page.items)) {
      console.warn("⚠️ useInfiniteArticles select: Page missing items array", {
        hasPage: !!page,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hasItems: !!(page as any)?.items,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itemsIsArray: Array.isArray((page as any)?.items),
        page,
      });
      return {
        ...page,
        items: [],
        total: 0,
      };
    }

    return {
      ...page,
      items: page.items.filter((article) => {
        if (seenIds.has(article.id)) {
          return false;
        }
        seenIds.add(article.id);
        return true;
      }),
    };
  });

  return {
    ...data,
    pages: deduplicatedPages,
  };
}

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
  // Simple input - tRPC will automatically add 'cursor' parameter from getNextPageParam
  const result = trpc.articles.list.useInfiniteQuery(
    {
      limit: 50,
      ...(filters || {}),
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 1000 * 60 * 5, // 5 minutes - data is fresh for this long
      // Deduplicate articles by ID to prevent duplicate keys in render
      select: deduplicateArticlesData,
    }
  );

  return result;
};

/**
 * Optimized hook to fetch article counts for all filter tabs
 * Returns ONLY counts without fetching any article data
 * Replaces 4 separate useInfiniteArticles calls (200 articles) with 1 lightweight query
 */
export const useArticleCounts = (filters?: {
  categoryId?: number;
  subscriptionId?: number;
}) => {
  return trpc.articles.getCounts.useQuery(filters || {});
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
        queryKey: getQueryKey(trpc.articles.list),
      });

      // Optimistically update all cached queries
      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: getQueryKey(trpc.articles.list) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, read: true } : article
              ),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
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
      utils.articles.getCounts.invalidate();
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
        queryKey: getQueryKey(trpc.articles.list),
      });

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: getQueryKey(trpc.articles.list) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, read: false } : article
              ),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
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
      utils.articles.getCounts.invalidate();
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
        queryKey: getQueryKey(trpc.articles.list),
      });

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: getQueryKey(trpc.articles.list) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, saved: true } : article
              ),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
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
      utils.articles.getCounts.invalidate();
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
        queryKey: getQueryKey(trpc.articles.list),
      });

      queryClient.setQueriesData<InfiniteArticlesData>(
        { queryKey: getQueryKey(trpc.articles.list) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((article) =>
                article.id === id ? { ...article, saved: false } : article
              ),
            })),
          };
        }
      );

      return { previousData };
    },
    onError: (_err, _variables, context) => {
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
      utils.articles.getCounts.invalidate();
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
      utils.articles.getCounts.invalidate();
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
      utils.articles.getCounts.invalidate();
      toast.success(
        `${data.updated} article${data.updated === 1 ? "" : "s"} marked as read`
      );
    },
    onError: () => {
      toast.error("Failed to mark articles as read");
    },
  });
};
