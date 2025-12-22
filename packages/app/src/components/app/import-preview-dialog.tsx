import React, { useState, useEffect, useRef } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FeedAvatar } from "@/components/app/feed-avatar";
import { SubscriptionCategorySelector } from "@/components/app/subscription-category-selector";
import {
  Search,
  FolderIcon,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";
import type { OPMLFeed } from "@/lib/hooks/useImportOPML";
import type { ModelsCategory } from "@/lib/api/generated/types.gen";
import { useFeedPreview } from "@/lib/hooks/useFeedPreview";

type FeedCategorySelection = {
  selectedCategoryIds: number[];
  newCategoryNames: string[];
};

type ImportPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeds: OPMLFeed[];
  existingCategories: ModelsCategory[];
  onConfirm: (
    selectedUrls: string[],
    categorySelections: Record<string, FeedCategorySelection>
  ) => void;
  isImporting: boolean;
};

export function ImportPreviewDialog({
  open,
  onOpenChange,
  feeds,
  existingCategories,
  onConfirm,
  isImporting,
}: ImportPreviewDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(feeds.map((f) => f.url))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFeeds, setExpandedFeeds] = useState<Set<string>>(new Set());
  const [categorySelections, setCategorySelections] = useState<
    Record<string, FeedCategorySelection>
  >({});
  const [suggestedCategoriesCache, setSuggestedCategoriesCache] = useState<
    Record<string, ModelsCategory[]>
  >({});
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(
    null
  );
  const processedUrlsRef = useRef<Set<string>>(new Set());

  // Use feed preview hook for fetching suggested categories
  const feedPreview: ReturnType<typeof useFeedPreview> =
    useFeedPreview(currentPreviewUrl);

  // When feed preview data arrives, cache it and auto-select matching categories
  useEffect(() => {
    if (
      feedPreview.data &&
      currentPreviewUrl &&
      !processedUrlsRef.current.has(currentPreviewUrl)
    ) {
      processedUrlsRef.current.add(currentPreviewUrl);
      const suggestedCategories = feedPreview.data.suggested_categories || [];

      // Batch state updates using startTransition to avoid cascading renders
      React.startTransition(() => {
        setSuggestedCategoriesCache((prev) => ({
          ...prev,
          [currentPreviewUrl]: suggestedCategories,
        }));

        // Auto-select suggested categories that match existing categories
        const matchingCategoryIds = suggestedCategories
          .map((suggested) => {
            const existing = existingCategories.find(
              (category) =>
                category.name &&
                category.name.toLowerCase() === suggested.name.toLowerCase()
            );
            return existing?.id;
          })
          .filter((id): id is number => id !== undefined);

        if (matchingCategoryIds.length > 0) {
          setCategorySelections((prev) => ({
            ...prev,
            [currentPreviewUrl]: {
              selectedCategoryIds: matchingCategoryIds,
              newCategoryNames: [],
            },
          }));
        }

        setCurrentPreviewUrl(null);
      });
    }
  }, [feedPreview.data, currentPreviewUrl, existingCategories]);

  const filteredFeeds = feeds.filter(
    (feed) =>
      feed.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feed.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (feed.folder &&
        feed.folder.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleFeed = (url: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else {
      newSelected.add(url);
    }
    setSelected(newSelected);
  };

  const toggleExpanded = (url: string) => {
    const newExpanded = new Set(expandedFeeds);
    if (newExpanded.has(url)) {
      newExpanded.delete(url);
    } else {
      newExpanded.add(url);
      // Fetch suggested categories if we don't have them cached
      if (!suggestedCategoriesCache[url]) {
        setCurrentPreviewUrl(url);
      }
    }
    setExpandedFeeds(newExpanded);
  };

  const handleToggleCategory = (feedUrl: string, categoryId: number) => {
    setCategorySelections((prev) => {
      const current = prev[feedUrl] || {
        selectedCategoryIds: [],
        newCategoryNames: [],
      };
      const selectedCategoryIds = current.selectedCategoryIds.includes(
        categoryId
      )
        ? current.selectedCategoryIds.filter((id) => id !== categoryId)
        : [...current.selectedCategoryIds, categoryId];
      return {
        ...prev,
        [feedUrl]: { ...current, selectedCategoryIds },
      };
    });
  };

  const handleAddNewCategory = (feedUrl: string, categoryName: string) => {
    setCategorySelections((prev) => {
      const current = prev[feedUrl] || {
        selectedCategoryIds: [],
        newCategoryNames: [],
      };
      return {
        ...prev,
        [feedUrl]: {
          ...current,
          newCategoryNames: [...current.newCategoryNames, categoryName],
        },
      };
    });
  };

  const handleRemoveNewCategory = (feedUrl: string, categoryName: string) => {
    setCategorySelections((prev) => {
      const current = prev[feedUrl] || {
        selectedCategoryIds: [],
        newCategoryNames: [],
      };
      return {
        ...prev,
        [feedUrl]: {
          ...current,
          newCategoryNames: current.newCategoryNames.filter(
            (n) => n !== categoryName
          ),
        },
      };
    });
  };

  const selectAll = () => {
    setSelected(new Set(filteredFeeds.map((f) => f.url)));
  };

  const deselectAll = () => {
    setSelected(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selected), categorySelections);
  };

  // Group feeds by folder
  const feedsByFolder = filteredFeeds.reduce(
    (acc, feed) => {
      const folder = feed.folder || "No Folder";
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(feed);
      return acc;
    },
    {} as Record<string, OPMLFeed[]>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <ResponsiveDialogHeader className="flex-shrink-0">
          <ResponsiveDialogTitle>Preview OPML Import</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Found {feeds.length} feeds. Select which ones to import.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Search and Controls */}
        <div className="space-y-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search feeds..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              {selected.size} of {feeds.length} selected
            </span>
          </div>
        </div>

        {/* Feed List - Scrollable */}
        <div className="flex-1 min-h-0 -mx-6 px-6">
          <ScrollArea className="h-full">
            <div className="space-y-4 pr-4">
              {Object.entries(feedsByFolder).map(([folder, folderFeeds]) => (
                <div key={folder} className="space-y-2">
                  {folder !== "No Folder" && (
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <FolderIcon className="size-4" />
                      <span>{folder}</span>
                      <Badge variant="secondary" className="text-xs">
                        {folderFeeds.length}
                      </Badge>
                    </div>
                  )}

                  <div className="space-y-2">
                    {folderFeeds.map((feed) => {
                      const isExpanded = expandedFeeds.has(feed.url);
                      const feedCategories = categorySelections[feed.url] || {
                        selectedCategoryIds: [],
                        newCategoryNames: [],
                      };

                      return (
                        <div
                          key={feed.url}
                          className="border rounded-lg overflow-hidden"
                        >
                          <div
                            className="flex items-start gap-3 p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                            onClick={() => toggleFeed(feed.url)}
                          >
                            <Checkbox
                              checked={selected.has(feed.url)}
                              onCheckedChange={() => toggleFeed(feed.url)}
                              onClick={(e) => e.stopPropagation()}
                            />

                            <FeedAvatar
                              feedName={feed.title}
                              feedUrl={feed.url}
                              size="md"
                              className="shrink-0"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium truncate">
                                  {feed.title}
                                </h4>
                                {feed.filters && feed.filters.length > 0 && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs flex items-center gap-1"
                                  >
                                    <Filter className="size-3" />
                                    {feed.filters.length} filter
                                    {feed.filters.length !== 1 ? "s" : ""}
                                    {feed.filterEnabled === false && (
                                      <span className="text-muted-foreground">
                                        {" "}
                                        (disabled)
                                      </span>
                                    )}
                                  </Badge>
                                )}
                                {feed.filterEnabled === true &&
                                  (!feed.filters ||
                                    feed.filters.length === 0) && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      Filters enabled
                                    </Badge>
                                  )}
                              </div>
                              {feed.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {feed.description}
                                </p>
                              )}
                              <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                                {feed.url}
                              </p>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(feed.url);
                              }}
                              className="shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </Button>
                          </div>

                          {/* Category Selection and Filter Info - Expanded */}
                          {isExpanded && (
                            <div className="px-3 pb-3 border-t bg-muted/30">
                              <div className="pt-3 space-y-4">
                                {/* Filter Information */}
                                {feed.filters && feed.filters.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                      <Filter className="size-4" />
                                      <span>Content Filters</span>
                                      {feed.filterMode && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {feed.filterMode === "include"
                                            ? "Include"
                                            : "Exclude"}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="space-y-1 pl-6">
                                      {feed.filters.map((filter, idx) => (
                                        <div
                                          key={idx}
                                          className="text-xs text-muted-foreground flex items-center gap-2"
                                        >
                                          <span className="font-medium">
                                            {filter.field === "any"
                                              ? "Any"
                                              : filter.field
                                                  .charAt(0)
                                                  .toUpperCase() +
                                                filter.field.slice(1)}
                                          </span>
                                          <span>
                                            {filter.matchType === "contains"
                                              ? "contains"
                                              : filter.matchType === "exact"
                                                ? "equals"
                                                : "matches regex"}
                                          </span>
                                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                            {filter.pattern}
                                          </code>
                                          {filter.caseSensitive && (
                                            <Badge
                                              variant="outline"
                                              className="text-xs"
                                            >
                                              Case sensitive
                                            </Badge>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {feed.filterEnabled === true &&
                                  (!feed.filters ||
                                    feed.filters.length === 0) && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                      <Filter className="size-4" />
                                      <span>
                                        Filters enabled (no filters configured)
                                      </span>
                                    </div>
                                  )}

                                {/* Category Selection */}
                                <div>
                                  <SubscriptionCategorySelector
                                    suggestedCategories={
                                      suggestedCategoriesCache[feed.url] ||
                                      (feed.folder
                                        ? [
                                            {
                                              name: feed.folder,
                                              count: 0,
                                              color: "#808080",
                                            },
                                          ]
                                        : [])
                                    }
                                    existingCategories={existingCategories}
                                    selectedCategoryIds={
                                      feedCategories.selectedCategoryIds
                                    }
                                    newCategoryNames={
                                      feedCategories.newCategoryNames
                                    }
                                    onToggleCategory={(categoryId) =>
                                      handleToggleCategory(feed.url, categoryId)
                                    }
                                    onAddNewCategory={(categoryName) =>
                                      handleAddNewCategory(
                                        feed.url,
                                        categoryName
                                      )
                                    }
                                    onRemoveNewCategory={(categoryName) =>
                                      handleRemoveNewCategory(
                                        feed.url,
                                        categoryName
                                      )
                                    }
                                    isLoadingSuggestions={
                                      currentPreviewUrl === feed.url &&
                                      feedPreview.isLoading
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <ResponsiveDialogFooter className="flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0 || isImporting}
          >
            Import {selected.size} Feed{selected.size !== 1 ? "s" : ""}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
