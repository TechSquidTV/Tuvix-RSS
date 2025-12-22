import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useSubscriptions,
  useCreateSubscriptionWithRefetch,
  useUpdateSubscription,
  useDeleteSubscription,
  useCategories,
} from "@/lib/hooks/useData";
import { useFeedPreview } from "@/lib/hooks/useFeedPreview";
import {
  useFeedDiscovery,
  type DiscoveredFeed,
} from "@/lib/hooks/useFeedDiscovery";
import { useParseOPML, useImportOPML } from "@/lib/hooks/useImportOPML";
import { trpc } from "@/lib/api/trpc";
import { ImportPreviewDialog } from "@/components/app/import-preview-dialog";
import { FeedAvatar } from "@/components/app/feed-avatar";
import { SubscriptionCategorySelector } from "@/components/app/subscription-category-selector";
import { SubscriptionFilterManager } from "@/components/app/subscription-filter-manager";
import { FeedSuggestions } from "@/components/app/feed-suggestions";
import { CategoryBadgeList } from "@/components/ui/category-badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import {
  Plus,
  Trash2,
  Edit2,
  Loader2,
  Rss,
  Download,
  Upload,
  X,
  Newspaper,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
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

export const Route = createFileRoute("/app/subscriptions")({
  component: SubscriptionsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    subscribe: (search.subscribe as string) || undefined,
  }),
});

function SubscriptionsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: subscriptionsData, isLoading, isError } = useSubscriptions();
  const subscriptions = subscriptionsData?.items || [];
  const createSubscription = useCreateSubscriptionWithRefetch();
  const updateSubscription = useUpdateSubscription();
  const deleteSubscription = useDeleteSubscription();
  const feedDiscovery = useFeedDiscovery();
  const { data: existingCategories = [] } = useCategories();
  const utils = trpc.useUtils();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editCategoryIds, setEditCategoryIds] = useState<number[]>([]);
  const [editNewCategories, setEditNewCategories] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSubUrl, setNewSubUrl] = useState("");
  const [newSubTitle, setNewSubTitle] = useState("");
  const [discoveredFeeds, setDiscoveredFeeds] = useState<DiscoveredFeed[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subscriptionToDelete, setSubscriptionToDelete] = useState<
    number | null
  >(null);

  // Category selection state
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [newCategoryNames, setNewCategoryNames] = useState<string[]>([]);

  // Filter configuration state (for new subscription)
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterMode, setFilterMode] = useState<"include" | "exclude">(
    "include"
  );
  const [initialFilters, setInitialFilters] = useState<
    Array<{
      field: string;
      matchType: string;
      pattern: string;
      caseSensitive: boolean;
    }>
  >([]);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const parseOPML = useParseOPML();
  const importOPML = useImportOPML();

  // Debounce the URL input
  const debouncedUrl = useDebounce(newSubUrl, 500);

  // Memoize URL validation check
  const looksLikeFeedUrl = useMemo(() => {
    if (!debouncedUrl) return false;
    return (
      debouncedUrl.endsWith(".xml") ||
      debouncedUrl.endsWith(".rss") ||
      debouncedUrl.endsWith(".atom") ||
      debouncedUrl.includes("/feed") ||
      debouncedUrl.includes("/rss") ||
      debouncedUrl.includes("/atom")
    );
  }, [debouncedUrl]);

  // Use query-based preview (auto-fetches when URL is valid)
  const feedPreview = useFeedPreview(looksLikeFeedUrl ? debouncedUrl : null);

  // Auto-discover feeds when URL looks like a website (not direct feed)
  useEffect(() => {
    if (debouncedUrl && debouncedUrl.startsWith("http") && !looksLikeFeedUrl) {
      // Website URL - attempt discovery
      feedDiscovery.mutate(
        { url: debouncedUrl },
        {
          onSuccess: (feeds: DiscoveredFeed[]) => {
            setDiscoveredFeeds(feeds);

            // If only one feed found, auto-select it
            const [feed] = feeds;
            if (feed && feeds.length === 1) setNewSubUrl(feed.url);
          },
          onError: () => {
            setDiscoveredFeeds([]);
          },
        }
      );
    } else {
      // Clear discovered feeds when URL is empty, invalid, or looks like a feed
      setDiscoveredFeeds([]);
    }
    // Only depend on the actual values that should trigger discovery, not the mutation objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedUrl, looksLikeFeedUrl]);

  // Handle subscribe URL parameter
  useEffect(() => {
    if (search.subscribe) {
      try {
        // Decode the URL
        const url = decodeURIComponent(search.subscribe);

        // Validate it's a proper URL
        new URL(url);

        // Pre-populate the form
        setShowAddForm(true);
        setNewSubUrl(url);

        // Clear the parameter from URL (don't keep it in browser history)
        navigate({
          to: "/app/subscriptions",
          search: { subscribe: undefined },
          replace: true,
        });

        // Show helpful message
        toast.info("Feed URL loaded - review and confirm subscription");
      } catch {
        // Invalid URL provided
        toast.error("Invalid feed URL provided");

        // Still clear the parameter
        navigate({
          to: "/app/subscriptions",
          search: { subscribe: undefined },
          replace: true,
        });
      }
    }
  }, [search.subscribe, navigate]);

  // Handle OPML files opened via File Handling API
  useEffect(() => {
    // Check if File Handling API is supported
    if (!("launchQueue" in window)) {
      return;
    }

    const handleFileLaunch = async (file: File) => {
      try {
        // Validate it's an OPML file
        if (
          !file.name.endsWith(".opml") &&
          !file.type.includes("xml") &&
          !file.type.includes("opml")
        ) {
          toast.error("Invalid file type. Please provide an OPML file.");
          return;
        }

        setUploadedFile(file);

        // Read and parse the OPML file
        const opmlContent = await file.text();
        await parseOPML.mutateAsync({ opmlContent });
        setShowPreview(true);

        toast.success(`Opened ${file.name}`);
      } catch (error) {
        console.error("Failed to open OPML file:", error);
        toast.error("Failed to open OPML file");
      }
    };

    // Set up the launch queue consumer
    window.launchQueue?.setConsumer(async (launchParams: LaunchParams) => {
      if (!launchParams.files || launchParams.files.length === 0) {
        return;
      }

      // Handle the first file (OPML imports are typically single files)
      const fileHandle = launchParams.files[0];
      if (!fileHandle) return;

      const file = await fileHandle.getFile();
      await handleFileLaunch(file);
    });
  }, [parseOPML]);

  const handleAdd = useCallback(async () => {
    if (!newSubUrl) {
      toast.error("URL is required");
      return;
    }

    try {
      // Create subscription
      const subscription = await createSubscription.mutateAsync({
        url: newSubUrl,
        customTitle: newSubTitle || undefined,
        iconUrl: feedPreview.data?.icon_url,
        iconType: feedPreview.data?.icon_url ? "auto" : "none",
        categoryIds:
          selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
        newCategoryNames:
          newCategoryNames.length > 0 ? newCategoryNames : undefined,
      });

      // If filters are configured, set them up
      if (filterEnabled && initialFilters.length > 0 && subscription?.id) {
        // Update subscription to enable filters
        await updateSubscription.mutateAsync({
          id: subscription.id,
          filterEnabled: true,
          filterMode: filterMode,
        });

        // Create each filter - note: temporarily disabled until we have direct filter creation access
        // This will be handled by the filter manager UI after subscription creation
      }

      // Clear form
      setNewSubUrl("");
      setNewSubTitle("");
      setShowAddForm(false);
      setDiscoveredFeeds([]);
      setSelectedCategoryIds([]);
      setNewCategoryNames([]);
      setFilterEnabled(false);
      setFilterMode("include");
      setInitialFilters([]);
      feedDiscovery.reset();

      // Delayed refetch of articles is handled by useCreateSubscriptionWithRefetch hook
    } catch (error) {
      // Error already handled by mutation hooks
      console.error("Failed to create subscription:", error);
    }
  }, [
    newSubUrl,
    newSubTitle,
    selectedCategoryIds,
    newCategoryNames,
    filterEnabled,
    filterMode,
    initialFilters,
    createSubscription,
    updateSubscription,
    feedPreview,
    feedDiscovery,
  ]);

  const handleToggleCategory = useCallback((categoryId: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  }, []);

  const handleAddNewCategory = useCallback((categoryName: string) => {
    setNewCategoryNames((prev) => [...prev, categoryName]);
  }, []);

  const handleRemoveNewCategory = useCallback((categoryName: string) => {
    setNewCategoryNames((prev) => prev.filter((n) => n !== categoryName));
  }, []);

  const handleSelectFeed = useCallback((feed: DiscoveredFeed) => {
    setNewSubUrl(feed.url);
    // Clear discovery results to show preview
    setDiscoveredFeeds([]);
  }, []);

  const handleEdit = useCallback(
    (
      id: number,
      currentTitle: string,
      currentCategories: Array<{ id?: number }>
    ) => {
      setEditingId(id);
      setEditValue(currentTitle);
      // Set current category IDs for editing
      setEditCategoryIds(
        currentCategories
          .filter((c): c is typeof c & { id: number } => c.id !== undefined)
          .map((c) => c.id)
      );
      setEditNewCategories([]);
    },
    []
  );

  const handleSaveEdit = useCallback(
    (id: number) => {
      updateSubscription.mutate(
        {
          id,
          customTitle: editValue,
          categoryIds: editCategoryIds.length > 0 ? editCategoryIds : undefined,
          newCategoryNames:
            editNewCategories.length > 0 ? editNewCategories : undefined,
        },
        {
          onSuccess: () => {
            setEditingId(null);
            setEditValue("");
            setEditCategoryIds([]);
            setEditNewCategories([]);
          },
        }
      );
    },
    [editValue, editCategoryIds, editNewCategories, updateSubscription]
  );

  const handleDelete = useCallback((id: number) => {
    setSubscriptionToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (subscriptionToDelete) {
      deleteSubscription.mutate({ id: subscriptionToDelete });
      setDeleteDialogOpen(false);
      setSubscriptionToDelete(null);
    }
  }, [subscriptionToDelete, deleteSubscription]);

  const handleCancelAdd = useCallback(() => {
    setShowAddForm(false);
    setNewSubUrl("");
    setNewSubTitle("");
    setDiscoveredFeeds([]);
    setSelectedCategoryIds([]);
    setNewCategoryNames([]);
    setFilterEnabled(false);
    setFilterMode("include");
    setInitialFilters([]);
    feedDiscovery.reset();
  }, [feedDiscovery]);

  const formatDate = useCallback((dateString?: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  }, []);

  // Import handlers
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadedFile(file);

      try {
        // Read file content as text
        const opmlContent = await file.text();
        await parseOPML.mutateAsync({ opmlContent });
        setShowPreview(true);
      } catch {
        toast.error("Failed to parse OPML file");
      } finally {
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [parseOPML]
  );

  const handleConfirmImport = useCallback(
    async (
      selectedUrls: string[],
      categorySelections: Record<
        string,
        { selectedCategoryIds: number[]; newCategoryNames: string[] }
      >
    ) => {
      // Category selections are collected in the preview dialog but not used
      // The backend automatically imports categories from the OPML structure
      void categorySelections;

      if (!uploadedFile || importOPML.isPending) return;

      try {
        // Read file content as text
        const opmlContent = await uploadedFile.text();
        const result = await importOPML.mutateAsync({
          opmlContent,
          selectedUrls,
        });

        setShowPreview(false);
        setUploadedFile(null);

        // Show results immediately (synchronous import)
        if (result.successCount > 0) {
          toast.success(`Import complete! 🎉`, {
            description: `Imported ${result.successCount} feeds${result.errorCount > 0 ? `. ${result.errorCount} feeds failed to import` : ""}`,
          });
        } else if (result.errorCount > 0) {
          toast.warning("Import completed with errors", {
            description: `${result.errorCount} feeds failed to import`,
          });
        } else {
          toast.info("No feeds imported", {
            description: "All selected feeds were already imported or failed",
          });
        }

        utils.subscriptions.list.invalidate();
        utils.categories.list.invalidate();
      } catch {
        toast.error("Failed to import feeds");
      }
    },
    [uploadedFile, importOPML, utils]
  );

  const handleExportSubscriptions = useCallback(async () => {
    try {
      // Use tRPC utils to call the export query
      const opmlContent = await utils.subscriptions.export.fetch();

      // Generate filename
      const filename = `tuvix-subscriptions-${new Date().toISOString().split("T")[0]}.opml`;

      // Create blob and trigger download
      const blob = new Blob([opmlContent], {
        type: "application/xml",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Subscriptions exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export subscriptions");
    }
  }, [utils]);

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground text-sm">
            Manage your RSS feed subscriptions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportSubscriptions}>
            <Download className="md:mr-2 size-4" />
            <span className="hidden md:inline">Export OPML</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={parseOPML.isPending}
          >
            <Upload className="md:mr-2 size-4" />
            <span className="hidden md:inline">Import OPML</span>
          </Button>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="mr-2 size-4" />
            Add Subscription
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Preview Dialog */}
      {parseOPML.data && (
        <ImportPreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          feeds={parseOPML.data.feeds.map(
            (feed: (typeof parseOPML.data.feeds)[0]) => ({
              ...feed,
              folder: feed.categories?.[0], // Use first category as folder for grouping
            })
          )}
          existingCategories={existingCategories}
          onConfirm={handleConfirmImport}
          isImporting={importOPML.isPending}
        />
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="border rounded-lg p-4 space-y-4">
          <h3 className="font-semibold">Add New Subscription</h3>
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Feed URL or Website</label>
              <input
                type="url"
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
                placeholder="https://example.com or https://example.com/feed.xml"
                className="w-full p-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter a website URL and we'll find the feed, or paste a direct
                feed URL
              </p>
            </div>

            {/* Discovery Loading State */}
            {feedDiscovery.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="size-4 animate-spin" />
                <span>Looking for feeds...</span>
              </div>
            )}

            {/* Discovered Feeds Selection */}
            {discoveredFeeds.length > 1 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select a Feed</label>
                <div className="space-y-2">
                  {discoveredFeeds.map((feed) => (
                    <button
                      key={feed.url}
                      onClick={() => handleSelectFeed(feed)}
                      className="w-full p-3 border rounded-md hover:bg-accent/50 transition-colors text-left flex items-start gap-3"
                    >
                      <Rss className="size-5 mt-0.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate">{feed.title}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {feed.type.toUpperCase()}
                          </Badge>
                        </div>
                        {feed.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                            {feed.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground truncate font-mono">
                          {feed.url}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Discovery Error - No feeds found */}
            {feedDiscovery.isError && !feedPreview.data && (
              <div className="p-3 border border-yellow-500/50 rounded-md bg-yellow-500/10">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  No feeds found at common paths. Please enter a direct feed
                  URL.
                </p>
              </div>
            )}

            {/* Feed Preview */}
            {feedPreview.isPending && looksLikeFeedUrl && debouncedUrl && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>Loading preview...</span>
              </div>
            )}

            {feedPreview.isSuccess && feedPreview.data && (
              <div className="border rounded-md p-3 bg-muted/50 flex items-start gap-3">
                <FeedAvatar
                  feedName={feedPreview.data.title}
                  iconUrl={feedPreview.data.iconUrl}
                  feedUrl={newSubUrl}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate">
                    {feedPreview.data.title}
                  </h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {feedPreview.data.description}
                  </p>
                  {feedPreview.data.siteUrl && (
                    <a
                      href={feedPreview.data.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {feedPreview.data.siteUrl}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Category Selector - Shows after preview */}
            {feedPreview.isSuccess && feedPreview.data && (
              <SubscriptionCategorySelector
                suggestedCategories={
                  feedPreview.data.suggested_categories || []
                }
                existingCategories={existingCategories}
                selectedCategoryIds={selectedCategoryIds}
                newCategoryNames={newCategoryNames}
                onToggleCategory={handleToggleCategory}
                onAddNewCategory={handleAddNewCategory}
                onRemoveNewCategory={handleRemoveNewCategory}
                isLoadingSuggestions={feedPreview.isLoading}
              />
            )}

            <div>
              <label className="text-sm font-medium">
                Custom Title (Optional)
              </label>
              <input
                type="text"
                value={newSubTitle}
                onChange={(e) => setNewSubTitle(e.target.value)}
                placeholder={feedPreview.data?.title || "My Feed"}
                className="w-full p-2 border rounded-md"
              />
            </div>

            {/* Filter Configuration */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Content Filters</label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={filterEnabled}
                    onCheckedChange={setFilterEnabled}
                    className="scale-75"
                  />
                  <span className="text-xs text-muted-foreground">
                    {filterEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>

              {filterEnabled && (
                <div className="space-y-3 pl-4 border-l-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Mode:</span>
                    <select
                      value={filterMode}
                      onChange={(e) =>
                        setFilterMode(e.target.value as "include" | "exclude")
                      }
                      className="px-2 py-1 border rounded-md text-xs bg-background"
                    >
                      <option value="include">
                        Include (show matching articles)
                      </option>
                      <option value="exclude">
                        Exclude (hide matching articles)
                      </option>
                    </select>
                  </div>

                  {initialFilters.map((filter, index) => (
                    <div
                      key={index}
                      className="border rounded-md p-3 space-y-2 bg-muted/30"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Field
                          </label>
                          <select
                            value={filter.field}
                            onChange={(e) => {
                              const newFilters = [...initialFilters];
                              const filterToUpdate = newFilters[index];
                              if (filterToUpdate) {
                                filterToUpdate.field = e.target.value;
                                setInitialFilters(newFilters);
                              }
                            }}
                            className="w-full mt-1 px-2 py-1 text-xs border rounded-md bg-background"
                          >
                            <option value="title">Title</option>
                            <option value="content">Content</option>
                            <option value="description">Description</option>
                            <option value="author">Author</option>
                            <option value="any">Any Field</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Match Type
                          </label>
                          <select
                            value={filter.matchType}
                            onChange={(e) => {
                              const newFilters = [...initialFilters];
                              const filterToUpdate = newFilters[index];
                              if (filterToUpdate) {
                                filterToUpdate.matchType = e.target.value;
                                setInitialFilters(newFilters);
                              }
                            }}
                            className="w-full mt-1 px-2 py-1 text-xs border rounded-md bg-background"
                          >
                            <option value="contains">Contains</option>
                            <option value="exact">Exact</option>
                            <option value="regex">Regex</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Pattern
                        </label>
                        <input
                          type="text"
                          value={filter.pattern}
                          onChange={(e) => {
                            const newFilters = [...initialFilters];
                            const filterToUpdate = newFilters[index];
                            if (filterToUpdate) {
                              filterToUpdate.pattern = e.target.value;
                              setInitialFilters(newFilters);
                            }
                          }}
                          placeholder="Enter pattern to match"
                          className="w-full mt-1 px-2 py-1 text-xs border rounded-md bg-background"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`case-sensitive-${index}`}
                            checked={filter.caseSensitive}
                            onChange={(e) => {
                              const newFilters = [...initialFilters];
                              const filterToUpdate = newFilters[index];
                              if (filterToUpdate) {
                                filterToUpdate.caseSensitive = e.target.checked;
                                setInitialFilters(newFilters);
                              }
                            }}
                            className="rounded"
                          />
                          <label
                            htmlFor={`case-sensitive-${index}`}
                            className="text-xs text-muted-foreground"
                          >
                            Case sensitive
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setInitialFilters((prev) =>
                              prev.filter((_, i) => i !== index)
                            )
                          }
                          className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors"
                          title="Remove filter"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Add a default filter
                      setInitialFilters((prev) => [
                        ...prev,
                        {
                          field: "title",
                          matchType: "contains",
                          pattern: "",
                          caseSensitive: false,
                        },
                      ]);
                    }}
                    className="w-full"
                  >
                    <Plus className="size-3 mr-1" />
                    Add Filter Rule
                  </Button>

                  {initialFilters.some((f) => !f.pattern) && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Complete all filter patterns before adding the
                      subscription
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleAdd}
              disabled={
                createSubscription.isPending ||
                !newSubUrl ||
                (!feedPreview.data && discoveredFeeds.length > 1)
              }
            >
              {createSubscription.isPending ? "Adding..." : "Add"}
            </Button>
            <Button variant="outline" onClick={handleCancelAdd}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading subscriptions, please wait</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-4">
              <Skeleton className="h-6 w-1/3 mb-2" />
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <Alert role="alert" className="text-center py-12">
          <AlertTitle>Error loading subscriptions</AlertTitle>
          <AlertDescription>
            Failed to load subscriptions. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Empty State */}
      {!isLoading && !isError && subscriptions?.length === 0 && (
        <>
          <div className="text-center py-12 border border-dashed rounded-lg">
            <p className="text-muted-foreground">No subscriptions yet</p>
            <p className="text-muted-foreground text-sm mt-2">
              Add your first RSS feed to get started
            </p>
          </div>
          <FeedSuggestions className="mt-6" />
        </>
      )}

      {/* Subscriptions List */}
      {!isLoading && subscriptions && subscriptions.length > 0 && (
        <div className="space-y-4">
          {subscriptions.map((sub: (typeof subscriptions)[0]) => (
            <div
              key={sub.id}
              className="border rounded-lg p-3 md:p-4 hover:bg-accent/50 transition-colors"
            >
              {editingId === sub.id ? (
                <div className="space-y-3">
                  {/* Title Input */}
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full p-2 border rounded-md mt-1"
                      placeholder={sub.source?.title || "Feed title"}
                    />
                  </div>

                  {/* Category Selector */}
                  <SubscriptionCategorySelector
                    suggestedCategories={[]}
                    existingCategories={existingCategories}
                    selectedCategoryIds={editCategoryIds}
                    newCategoryNames={editNewCategories}
                    onToggleCategory={(categoryId: number) => {
                      setEditCategoryIds((prev) =>
                        prev.includes(categoryId)
                          ? prev.filter((id) => id !== categoryId)
                          : [...prev, categoryId]
                      );
                    }}
                    onAddNewCategory={(categoryName: string) => {
                      setEditNewCategories((prev) => [...prev, categoryName]);
                    }}
                    onRemoveNewCategory={(categoryName: string) => {
                      setEditNewCategories((prev) =>
                        prev.filter((n) => n !== categoryName)
                      );
                    }}
                    isLoadingSuggestions={false}
                  />

                  {/* Content Filters */}
                  {sub.id && (
                    <div>
                      <SubscriptionFilterManager
                        subscriptionId={sub.id}
                        filterEnabled={sub.filterEnabled || false}
                        filterMode={sub.filterMode || "include"}
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(sub.id)}
                      disabled={updateSubscription.isPending}
                    >
                      Save Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(null);
                        setEditValue("");
                        setEditCategoryIds([]);
                        setEditNewCategories([]);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2">
                  {/* Feed Avatar - Left column */}
                  <div className="row-span-1 flex items-center">
                    <FeedAvatar
                      feedName={
                        sub.customTitle || sub.source?.title || "Untitled"
                      }
                      iconUrl={sub.source?.iconUrl}
                      feedUrl={sub.source?.url}
                      size="lg"
                    />
                  </div>

                  {/* Title - Middle column, first row */}
                  <div className="min-w-0 flex items-center">
                    <h3 className="font-semibold text-base md:text-lg leading-tight">
                      {sub.customTitle || sub.source?.title || "Untitled Feed"}
                    </h3>
                  </div>

                  {/* Action Buttons - Right column, spans rows on mobile, single row on desktop */}
                  <div className="row-span-2 md:row-span-1 flex md:flex-col gap-1 md:gap-2 items-center md:items-start">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 md:size-9"
                          asChild
                          aria-label={`View articles from ${sub.customTitle || sub.source?.title || "Untitled Feed"}`}
                        >
                          <Link
                            to="/app/articles"
                            search={{
                              category_id: undefined,
                              subscription_id: sub.id,
                            }}
                          >
                            <Newspaper className="size-4" aria-hidden="true" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View Articles</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 md:size-9"
                          onClick={() =>
                            handleEdit(
                              sub.id,
                              sub.customTitle || sub.source?.title || "",
                              sub.categories || []
                            )
                          }
                          aria-label={`Edit subscription ${sub.customTitle || sub.source?.title || "Untitled Feed"}`}
                        >
                          <Edit2 className="size-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit Subscription</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 md:size-9"
                          onClick={() => handleDelete(sub.id)}
                          disabled={deleteSubscription.isPending}
                          aria-label={`Delete subscription ${sub.customTitle || sub.source?.title || "Untitled Feed"}`}
                        >
                          <Trash2
                            className="size-4 text-destructive"
                            aria-hidden="true"
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete Subscription</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Description - Full width row below avatar and title */}
                  <div className="col-span-3 md:col-span-2 md:col-start-2 space-y-2">
                    {sub.source?.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {sub.source?.description}
                      </p>
                    )}

                    {/* Categories */}
                    {sub.categories && sub.categories.length > 0 && (
                      <CategoryBadgeList
                        categories={sub.categories
                          .filter(
                            (
                              c: (typeof sub.categories)[0]
                            ): c is typeof c & { id: number } =>
                              c.id !== undefined
                          )
                          .map(
                            (
                              c: (typeof sub.categories)[0] & {
                                id: number;
                              }
                            ) => ({
                              id: c.id,
                              name: c.name || "",
                              color: c.color,
                            })
                          )}
                        onRemove={(categoryId) => {
                          const currentCategoryIds =
                            sub.categories
                              ?.filter(
                                (
                                  c: (typeof sub.categories)[0]
                                ): c is typeof c & { id: number } =>
                                  c.id !== undefined && c.id !== categoryId
                              )
                              .map(
                                (
                                  c: (typeof sub.categories)[0] & {
                                    id: number;
                                  }
                                ) => c.id
                              ) || [];
                          updateSubscription.mutate({
                            id: sub.id!,
                            categoryIds:
                              currentCategoryIds.length > 0
                                ? currentCategoryIds
                                : undefined,
                          });
                        }}
                      />
                    )}

                    {/* Filters Display */}
                    {sub.filterEnabled &&
                      sub.filters &&
                      sub.filters.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {sub.filterMode === "exclude"
                              ? "Exclude"
                              : "Include"}{" "}
                            Mode
                          </Badge>
                          {sub.filters
                            .slice(0, 3)
                            .map((filter: (typeof sub.filters)[0]) => (
                              <Badge
                                key={filter.id}
                                variant="outline"
                                className="text-xs"
                              >
                                {filter.field === "any"
                                  ? "Any"
                                  : filter.field.charAt(0).toUpperCase() +
                                    filter.field.slice(1)}{" "}
                                {filter.matchType === "contains"
                                  ? "contains"
                                  : filter.matchType === "exact"
                                    ? "is"
                                    : "matches"}{" "}
                                "{filter.pattern}"
                              </Badge>
                            ))}
                          {sub.filters.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{sub.filters.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    {sub.filterEnabled &&
                      (!sub.filters || sub.filters.length === 0) && (
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            Filters enabled (no filters configured)
                          </Badge>
                        </div>
                      )}
                  </div>

                  {/* Metadata row - Spans full width at bottom */}
                  <div className="col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-2 border-t">
                    <span className="truncate max-w-full md:max-w-md">
                      {sub.source?.url}
                    </span>
                    <span className="hidden md:inline">•</span>
                    <span className="whitespace-nowrap">
                      Updated: {formatDate(sub.source?.lastFetched)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ResponsiveAlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>
              Unsubscribe from feed
            </ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              Are you sure you want to unsubscribe? This action cannot be
              undone.
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction onClick={confirmDelete}>
              Unsubscribe
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>
    </div>
  );
}
