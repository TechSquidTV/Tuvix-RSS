import { createFileRoute } from "@tanstack/react-router";
import {
  useInfiniteArticles,
  useMarkAllRead,
  useArticleCounts,
} from "@/lib/hooks/useArticles";
import { useRefreshFeeds } from "@/lib/hooks/useArticles";
import { useUserSettings } from "@/lib/hooks/useUserSettings";
import { AnimatedArticleList } from "@/components/app/animated-article-list";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContents,
  TabsContent,
} from "@/components/app/tabs-animate";
import { Badge } from "@/components/ui/badge";
import { useInView } from "react-intersection-observer";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Inbox, CheckCheck, Clock, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Link } from "@tanstack/react-router";
import {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
} from "@/components/ui/responsive-alert-dialog";
import type { RouterOutputs } from "@/lib/api/trpc";

type Article = RouterOutputs["articles"]["list"]["items"][number];

export const Route = createFileRoute("/app/articles")({
  component: ArticlesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      category_id: Number(search?.category_id) || undefined,
      subscription_id: Number(search?.subscription_id) || undefined,
    };
  },
});

function ArticlesPage() {
  const search = Route.useSearch();
  const refreshFeeds = useRefreshFeeds();
  const markAllRead = useMarkAllRead();
  const { data: userSettings } = useUserSettings();

  // Create separate refs for each tab to avoid conflicts with tab visibility
  const { ref: refAll, inView: inViewAll } = useInView({
    threshold: 0,
    rootMargin: "400px",
    triggerOnce: false,
  });
  const { ref: refUnread, inView: inViewUnread } = useInView({
    threshold: 0,
    rootMargin: "400px",
    triggerOnce: false,
  });
  const { ref: refRead, inView: inViewRead } = useInView({
    threshold: 0,
    rootMargin: "400px",
    triggerOnce: false,
  });
  const { ref: refSaved, inView: inViewSaved } = useInView({
    threshold: 0,
    rootMargin: "400px",
    triggerOnce: false,
  });

  const [showFirstTimeTooltip, setShowFirstTimeTooltip] = useState(() => {
    if (typeof window === "undefined") return false;
    const hasSeenTooltip = localStorage.getItem("hasSeenArticleTooltip");
    return !hasSeenTooltip;
  });
  const [activeFilter, setActiveFilter] = useState(() => {
    return userSettings?.defaultFilter || "all";
  });

  // Determine which tab's inView to use based on active filter
  const inView =
    activeFilter === "all"
      ? inViewAll
      : activeFilter === "unread"
        ? inViewUnread
        : activeFilter === "read"
          ? inViewRead
          : activeFilter === "saved"
            ? inViewSaved
            : false;
  const [markAllDialogOpen, setMarkAllDialogOpen] = useState(false);
  const [markOldDialogOpen, setMarkOldDialogOpen] = useState(false);

  // Smart detection: Track seen article IDs
  const seenArticleIds = useRef<Set<number>>(new Set());
  const [newArticleIds, setNewArticleIds] = useState<Set<number>>(new Set());

  // Build filters from search params AND active tab filter
  // CRITICAL: Memoize filters object to maintain stable reference
  // React Query uses object identity in query keys, so we need to ensure
  // the filters object only changes when actual filter values change
  const filters = React.useMemo(() => {
    const result: {
      categoryId?: number;
      subscriptionId?: number;
      read?: boolean;
      saved?: boolean;
    } = {};

    if (search.category_id) result.categoryId = search.category_id;
    if (search.subscription_id) result.subscriptionId = search.subscription_id;

    // Apply active filter from tab
    switch (activeFilter) {
      case "unread":
        result.read = false;
        break;
      case "read":
        result.read = true;
        break;
      case "saved":
        result.saved = true;
        break;
      case "all":
      default:
        // No additional filter for "all"
        break;
    }

    return result;
  }, [activeFilter, search.category_id, search.subscription_id]);

  // Fetch articles with filters applied server-side
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteArticles(filters);

  // Mark tooltip as seen when shown
  useEffect(() => {
    if (showFirstTimeTooltip) {
      localStorage.setItem("hasSeenArticleTooltip", "true");
    }
  }, [showFirstTimeTooltip]);

  // Update filter when userSettings changes after initial mount
  // BUT only if the user hasn't manually changed the filter
  const prevDefaultFilterRef = useRef(userSettings?.defaultFilter);
  // NOTE: This ref persists across remounts within the same session
  // This is intentional - once a user manually selects a filter, we respect that choice
  // even if they navigate away and come back, until the page is refreshed
  const hasUserChangedFilterRef = useRef(false);

  useEffect(() => {
    // Only auto-update if user settings change AND user hasn't manually selected a filter
    if (
      userSettings?.defaultFilter &&
      userSettings.defaultFilter !== prevDefaultFilterRef.current &&
      !hasUserChangedFilterRef.current
    ) {
      prevDefaultFilterRef.current = userSettings.defaultFilter;
      // Use startTransition to avoid blocking render
      React.startTransition(() => {
        setActiveFilter(userSettings.defaultFilter);
      });
    }
  }, [userSettings?.defaultFilter]);

  // Get all articles from the current filter
  // Backend returns paginated response: {items: Article[], total: number, hasMore: boolean}
  // Memoize to prevent unnecessary re-renders
  const articles = useMemo(
    () => data?.pages.flatMap((page: { items: Article[] }) => page.items) || [],
    [data?.pages],
  );

  // Fetch counts for all tabs using optimized endpoint
  // Single query that returns ONLY counts (no article data)
  // Replaces 4 separate queries that fetched 200 articles just for counts!
  const { data: counts } = useArticleCounts({
    categoryId: search.category_id,
    subscriptionId: search.subscription_id,
  });

  const allCount = counts?.all ?? 0;
  const unreadCount = counts?.unread ?? 0;
  const readCount = counts?.read ?? 0;
  const savedCount = counts?.saved ?? 0;

  // Track previous article IDs to detect changes
  const previousArticleIdsRef = useRef<Set<number>>(new Set());
  const isInitializedRef = useRef(false);

  // Smart detection: Track new articles for animation
  useEffect(() => {
    if (!data?.pages?.[0] || articles.length === 0) return;

    const currentIds = new Set<number>(articles.map((a: Article) => a.id));

    // Initialize seen IDs on first load
    if (!isInitializedRef.current) {
      seenArticleIds.current = new Set(currentIds);
      previousArticleIdsRef.current = new Set(currentIds);
      isInitializedRef.current = true;
      return;
    }

    // Check if article IDs have actually changed
    const idsChanged =
      currentIds.size !== previousArticleIdsRef.current.size ||
      Array.from(currentIds).some(
        (id) => !previousArticleIdsRef.current.has(id),
      );

    if (!idsChanged) {
      // No change, update ref and return early
      previousArticleIdsRef.current = currentIds;
      return;
    }

    const newArticles = articles.filter(
      (a: Article) => !seenArticleIds.current.has(a.id),
    );

    if (newArticles.length > 0) {
      // Track new articles for animation
      setNewArticleIds(new Set<number>(newArticles.map((a: Article) => a.id)));

      // Update seen IDs
      newArticles.forEach((a: Article) => seenArticleIds.current.add(a.id));

      // Clear new article IDs after animation completes (3 seconds)
      const timeoutId = setTimeout(() => {
        setNewArticleIds(new Set());
      }, 3000);

      // Update previous IDs ref
      previousArticleIdsRef.current = currentIds;

      return () => clearTimeout(timeoutId);
    } else {
      // No new articles, just update seen set with current articles
      currentIds.forEach((id: number) => seenArticleIds.current.add(id));
      // Only update state if it's not already empty to avoid unnecessary re-renders
      setNewArticleIds((prev) => (prev.size > 0 ? new Set() : prev));
      // Update previous IDs ref
      previousArticleIdsRef.current = currentIds;
    }
  }, [data, articles]);

  // Load more when scrolling to bottom (all tabs now support pagination)
  // Use ref to track if we're already fetching to prevent duplicate fetches
  const isFetchingRef = useRef(false);

  // Reset fetch state when user switches tabs to prevent race conditions
  // Without this, a fetch completing from the previous tab could leave isFetchingRef
  // in an inconsistent state for the new tab
  useEffect(() => {
    isFetchingRef.current = false;
  }, [activeFilter]);

  useEffect(() => {
    if (
      inView &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchingRef.current
    ) {
      isFetchingRef.current = true;
      fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = () => {
    refreshFeeds.mutate();
  };

  const handleFilterChange = (value: string) => {
    // Mark that user manually changed the filter
    hasUserChangedFilterRef.current = true;
    // Update local state, no navigation
    setActiveFilter(value);
  };

  const handleMarkAllRead = () => {
    setMarkAllDialogOpen(true);
  };

  const confirmMarkAllRead = () => {
    markAllRead.mutate({});
    setMarkAllDialogOpen(false);
  };

  const handleMarkOldRead = () => {
    setMarkOldDialogOpen(true);
  };

  const confirmMarkOldRead = () => {
    markAllRead.mutate({ olderThanDays: 3 });
    setMarkOldDialogOpen(false);
  };

  return (
    <div className="flex-1 space-y-4 w-full max-w-full min-w-0">
      {/* First-time tooltip */}
      {showFirstTimeTooltip && userSettings && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Welcome to flow-based reading!</AlertTitle>
          <AlertDescription>
            Articles older than {userSettings.autoAgeDays} days are
            automatically marked as read. Customize this in settings.
            <Button
              variant="ghost"
              size="sm"
              className="ml-2"
              onClick={() => setShowFirstTimeTooltip(false)}
            >
              Got it
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Refresh button for desktop */}
      <div className="w-full hidden sm:flex justify-end">
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={isLoading || refreshFeeds.isPending}
          aria-label="Refresh feeds and fetch new articles"
          title="Fetch new articles from all feeds"
        >
          <RefreshCw
            className={
              isLoading || refreshFeeds.isPending ? "animate-spin" : ""
            }
            aria-hidden="true"
          />
        </Button>
      </div>

      {/* Articles List */}
      {isLoading && (
        <div
          className="flex flex-col gap-4"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="sr-only">Loading articles, please wait</span>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 p-4 border rounded-lg">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2 mt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <Alert role="alert" className="text-center py-12">
          <AlertTitle>Error loading articles</AlertTitle>
          <AlertDescription>
            Failed to load articles. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Only show "add subscriptions" empty state if there are NO articles across ALL filters */}
      {!isLoading && !isError && allCount === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox className="size-12" />
            </EmptyMedia>
            <EmptyTitle>No articles yet</EmptyTitle>
            <EmptyDescription>
              Start by adding some RSS feed subscriptions to see articles here
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link to="/app/subscriptions" search={{ subscribe: undefined }}>
              <Button>Add Subscriptions</Button>
            </Link>
          </EmptyContent>
        </Empty>
      )}

      {/* Show tabs if there are ANY articles (even if current filter is empty) */}
      {!isLoading && !isError && allCount > 0 && (
        <Tabs value={activeFilter} onValueChange={handleFilterChange}>
          {/* Filter Tabs */}
          <div className="w-full flex flex-col sm:flex-row items-center sm:justify-between gap-4">
            <div className="w-full sm:w-auto overflow-x-auto scrollbar-hide">
              <TabsList>
                <TabsTrigger value="all">
                  All
                  {allCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {allCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="unread">
                  Unread
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {unreadCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="read">
                  Read
                  {readCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {readCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="saved">
                  Saved
                  {savedCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {savedCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Bulk Actions */}
            {unreadCount > 0 && (
              <div className="flex gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap justify-center sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkOldRead}
                  disabled={markAllRead.isPending}
                  className="flex-1 sm:flex-none"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Mark old as read</span>
                  <span className="sm:hidden">Old</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={markAllRead.isPending}
                  className="flex-1 sm:flex-none"
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Mark all as read</span>
                  <span className="sm:hidden">All</span>
                </Button>
              </div>
            )}
          </div>

          <TabsContents>
            <TabsContent value="all">
              {articles.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox className="size-12" />
                    </EmptyMedia>
                    <EmptyTitle>No articles</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <AnimatedArticleList
                  articles={articles}
                  newArticleIds={newArticleIds}
                >
                  {/* Infinite scroll trigger */}
                  <div ref={refAll} className="flex justify-center py-4">
                    {isFetchingNextPage && (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="animate-spin size-4" />
                        <span className="text-sm text-muted-foreground">
                          Loading more articles...
                        </span>
                      </div>
                    )}
                    {!hasNextPage && articles.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        No more articles
                      </span>
                    )}
                  </div>
                </AnimatedArticleList>
              )}
            </TabsContent>

            <TabsContent value="unread">
              {articles.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox className="size-12" />
                    </EmptyMedia>
                    <EmptyTitle>No unread articles</EmptyTitle>
                    <EmptyDescription>You're all caught up!</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <AnimatedArticleList
                  articles={articles}
                  newArticleIds={newArticleIds}
                >
                  {/* Infinite scroll trigger */}
                  <div ref={refUnread} className="flex justify-center py-4">
                    {isFetchingNextPage && (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="animate-spin size-4" />
                        <span className="text-sm text-muted-foreground">
                          Loading more articles...
                        </span>
                      </div>
                    )}
                    {!hasNextPage && articles.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        No more articles
                      </span>
                    )}
                  </div>
                </AnimatedArticleList>
              )}
            </TabsContent>

            <TabsContent value="read">
              {articles.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox className="size-12" />
                    </EmptyMedia>
                    <EmptyTitle>No read articles</EmptyTitle>
                    <EmptyDescription>
                      Articles you've read will appear here
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <AnimatedArticleList
                  articles={articles}
                  newArticleIds={newArticleIds}
                >
                  {/* Infinite scroll trigger */}
                  <div ref={refRead} className="flex justify-center py-4">
                    {isFetchingNextPage && (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="animate-spin size-4" />
                        <span className="text-sm text-muted-foreground">
                          Loading more articles...
                        </span>
                      </div>
                    )}
                    {!hasNextPage && articles.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        No more articles
                      </span>
                    )}
                  </div>
                </AnimatedArticleList>
              )}
            </TabsContent>

            <TabsContent value="saved">
              {articles.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Inbox className="size-12" />
                    </EmptyMedia>
                    <EmptyTitle>No saved articles</EmptyTitle>
                    <EmptyDescription>
                      Save articles to read them later
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <AnimatedArticleList
                  articles={articles}
                  newArticleIds={newArticleIds}
                >
                  {/* Infinite scroll trigger */}
                  <div ref={refSaved} className="flex justify-center py-4">
                    {isFetchingNextPage && (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="animate-spin size-4" />
                        <span className="text-sm text-muted-foreground">
                          Loading more articles...
                        </span>
                      </div>
                    )}
                    {!hasNextPage && articles.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        No more articles
                      </span>
                    )}
                  </div>
                </AnimatedArticleList>
              )}
            </TabsContent>
          </TabsContents>
        </Tabs>
      )}

      {/* Mark All Read Confirmation Dialog */}
      <ResponsiveAlertDialog
        open={markAllDialogOpen}
        onOpenChange={setMarkAllDialogOpen}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>
              Mark all articles as read?
            </ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              This will mark all articles as read. This action cannot be undone.
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction onClick={confirmMarkAllRead}>
              Mark as read
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>

      {/* Mark Old Read Confirmation Dialog */}
      <ResponsiveAlertDialog
        open={markOldDialogOpen}
        onOpenChange={setMarkOldDialogOpen}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>
              Mark old articles as read?
            </ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              This will mark all articles older than 3 days as read. This action
              cannot be undone.
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction onClick={confirmMarkOldRead}>
              Mark as read
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>
    </div>
  );
}
