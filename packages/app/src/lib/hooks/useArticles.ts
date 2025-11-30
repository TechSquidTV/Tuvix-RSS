// tRPC Hooks for Articles
import { toast } from "sonner";
import { trpc } from "../api/trpc";
import { useQueryClient } from "@tanstack/react-query";

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
        if (!lastPage?.hasMore) return undefined;
        // Calculate next offset based on all pages loaded so far
        const totalLoaded = allPages.reduce(
          (sum, page) => sum + page.items.length,
          0,
        );
        return totalLoaded;
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

  return trpc.articles.markRead.useMutation({
    onSuccess: () => {
      utils.articles.list.invalidate();
      toast.success("Marked as read");
    },
    onError: () => {
      toast.error("Failed to mark as read");
    },
  });
};

export const useMarkArticleUnread = () => {
  const utils = trpc.useUtils();

  return trpc.articles.markUnread.useMutation({
    onSuccess: () => {
      utils.articles.list.invalidate();
      toast.success("Marked as unread");
    },
    onError: () => {
      toast.error("Failed to mark as unread");
    },
  });
};

export const useSaveArticle = () => {
  const utils = trpc.useUtils();

  return trpc.articles.save.useMutation({
    onSuccess: () => {
      utils.articles.list.invalidate();
      toast.success("Article saved");
    },
    onError: () => {
      toast.error("Failed to save article");
    },
  });
};

export const useUnsaveArticle = () => {
  const utils = trpc.useUtils();

  return trpc.articles.unsave.useMutation({
    onSuccess: () => {
      utils.articles.list.invalidate();
      toast.success("Article unsaved");
    },
    onError: () => {
      toast.error("Failed to unsave article");
    },
  });
};

// Bulk operations
export const useBulkMarkRead = () => {
  const utils = trpc.useUtils();

  return trpc.articles.bulkMarkRead.useMutation({
    onSuccess: (data) => {
      utils.articles.list.invalidate();
      toast.success(`${data.count} articles updated`);
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
        `${data.count} article${data.count === 1 ? "" : "s"} marked as read`,
      );
    },
    onError: () => {
      toast.error("Failed to mark articles as read");
    },
  });
};

export const useRefreshFeeds = () => {
  const queryClient = useQueryClient();

  return trpc.articles.refresh.useMutation({
    onSuccess: () => {
      // Trigger refetch instead of invalidate to allow smart merging
      // Use queryClient.refetchQueries for infinite queries
      queryClient.refetchQueries({
        queryKey: [["trpc"], ["articles", "list"]],
      });
      toast.success("Feeds refreshed");
    },
    onError: () => {
      toast.error("Failed to refresh feeds");
    },
  });
};
