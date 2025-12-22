import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import {
  Plus,
  X,
  Edit,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSubscriptionFilters,
  useCreateSubscriptionFilter,
  useUpdateSubscriptionFilter,
  useDeleteSubscriptionFilter,
  useUpdateSubscription,
} from "@/lib/hooks/useData";

// Subscription Filter type (matches API response format)
type SubscriptionFilter = {
  id: number;
  subscriptionId: number;
  field: "title" | "content" | "description" | "author" | "any";
  matchType: "contains" | "regex" | "exact";
  pattern: string;
  caseSensitive: boolean;
  createdAt?: Date | string;
};

interface SubscriptionFilterManagerProps {
  subscriptionId: number;
  filterEnabled: boolean;
  filterMode: string;
  className?: string;
}

type FilterField = "title" | "content" | "description" | "author" | "any";
type MatchType = "contains" | "exact" | "regex";

interface FilterFormData {
  field: FilterField;
  match_type: MatchType;
  pattern: string;
  case_sensitive: boolean;
}

const FIELD_OPTIONS: { value: FilterField; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
  { value: "description", label: "Description" },
  { value: "author", label: "Author" },
  { value: "any", label: "Any Field" },
];

const MATCH_TYPE_OPTIONS: {
  value: MatchType;
  label: string;
  description: string;
}[] = [
  {
    value: "contains",
    label: "Contains",
    description: "Text appears anywhere",
  },
  { value: "exact", label: "Exact", description: "Exact match only" },
  { value: "regex", label: "Regex", description: "Regular expression" },
];

export function SubscriptionFilterManager({
  subscriptionId,
  filterEnabled,
  filterMode,
  className,
}: SubscriptionFilterManagerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingFilterId, setEditingFilterId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FilterFormData>({
    field: "title",
    match_type: "contains",
    pattern: "",
    case_sensitive: false,
  });
  const [regexError, setRegexError] = useState<string | null>(null);

  const {
    data: filters = [],
    isLoading,
  }: ReturnType<typeof useSubscriptionFilters> =
    useSubscriptionFilters(subscriptionId);
  const createFilter = useCreateSubscriptionFilter(subscriptionId);
  const updateFilter = useUpdateSubscriptionFilter(subscriptionId);
  const deleteFilter = useDeleteSubscriptionFilter(subscriptionId);
  const updateSubscription = useUpdateSubscription();

  const filterCount = filters.length;

  // Handle filter enabled toggle
  const handleToggleFilterEnabled = useCallback(
    (enabled: boolean) => {
      updateSubscription.mutate({
        id: subscriptionId,
        filterEnabled: enabled,
      });
    },
    [subscriptionId, updateSubscription]
  );

  // Handle filter mode change
  const handleFilterModeChange = useCallback(
    (mode: string) => {
      updateSubscription.mutate({
        id: subscriptionId,
        filterMode: mode as "include" | "exclude",
      });
    },
    [subscriptionId, updateSubscription]
  );

  // Validate regex pattern
  const validatePattern = useCallback(
    (pattern: string, matchType: MatchType): string | null => {
      if (!pattern.trim()) {
        return "Pattern is required";
      }

      if (matchType === "regex") {
        try {
          new RegExp(pattern);
          return null;
        } catch (e) {
          return `Invalid regex: ${e instanceof Error ? e.message : "Unknown error"}`;
        }
      }

      return null;
    },
    []
  );

  // Handle pattern change with validation
  const handlePatternChange = useCallback(
    (pattern: string) => {
      setFormData((prev) => ({ ...prev, pattern }));
      const error = validatePattern(pattern, formData.match_type);
      setRegexError(error);
    },
    [formData.match_type, validatePattern]
  );

  // Handle match type change with validation
  const handleMatchTypeChange = useCallback(
    (matchType: MatchType) => {
      setFormData((prev) => ({ ...prev, match_type: matchType }));
      const error = validatePattern(formData.pattern, matchType);
      setRegexError(error);
    },
    [formData.pattern, validatePattern]
  );

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({
      field: "title",
      match_type: "contains",
      pattern: "",
      case_sensitive: false,
    });
    setRegexError(null);
    setShowAddForm(false);
    setEditingFilterId(null);
  }, []);

  // Handle create
  const handleCreate = useCallback(async () => {
    const error = validatePattern(formData.pattern, formData.match_type);
    if (error) {
      setRegexError(error);
      return;
    }

    try {
      await createFilter.mutateAsync({
        subscriptionId,
        field: formData.field,
        matchType: formData.match_type,
        pattern: formData.pattern,
        caseSensitive: formData.case_sensitive,
      });
      resetForm();
    } catch {
      // Error handled by hook
    }
  }, [formData, subscriptionId, validatePattern, createFilter, resetForm]);

  // Handle edit
  const handleEdit = useCallback((filter: SubscriptionFilter) => {
    setFormData({
      field: filter.field || "title",
      match_type: filter.matchType || "contains",
      pattern: filter.pattern || "",
      case_sensitive: filter.caseSensitive || false,
    });
    setEditingFilterId(filter.id || null);
    setShowAddForm(false);
    setRegexError(null);
  }, []);

  // Handle update
  const handleUpdate = useCallback(async () => {
    if (editingFilterId === null) return;

    const error = validatePattern(formData.pattern, formData.match_type);
    if (error) {
      setRegexError(error);
      return;
    }

    try {
      await updateFilter.mutateAsync({
        subscriptionId,
        filterId: editingFilterId,
        field: formData.field,
        matchType: formData.match_type,
        pattern: formData.pattern,
        caseSensitive: formData.case_sensitive,
      });
      resetForm();
    } catch {
      // Error handled by hook
    }
  }, [
    editingFilterId,
    formData,
    subscriptionId,
    validatePattern,
    updateFilter,
    resetForm,
  ]);

  // Handle delete
  const handleDelete = useCallback(
    async (filterId: number) => {
      try {
        await deleteFilter.mutateAsync(filterId);
      } catch {
        // Error handled by hook
      }
    },
    [deleteFilter]
  );

  // Handle cancel
  const handleCancel = useCallback(() => {
    resetForm();
  }, [resetForm]);

  const isSubmitting = createFilter.isPending || updateFilter.isPending;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header - Progressive Disclosure */}
      <div className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded-md transition-colors">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            Content Filters {filterCount > 0 && `(${filterCount})`}
          </span>
        </button>
        <div className="flex items-center gap-3">
          {!isExpanded && filterCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {filterCount} filter{filterCount !== 1 ? "s" : ""}{" "}
              {filterEnabled ? "active" : "disabled"}
            </span>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={filterEnabled}
              onCheckedChange={handleToggleFilterEnabled}
              className="scale-75"
            />
            <span className="text-xs text-muted-foreground">
              {filterEnabled ? "On" : "Off"}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-3 pl-6 pt-2">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Filter articles from this feed by matching specific patterns
            </p>

            {/* Filter Mode Selector */}
            {filterEnabled && filterCount > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Mode:</span>
                <select
                  value={filterMode}
                  onChange={(e) => handleFilterModeChange(e.target.value)}
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
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {/* Existing Filters */}
          {!isLoading && filters.length > 0 && (
            <div className="space-y-2">
              {filters.map((filter) => (
                <div
                  key={filter.id}
                  className={cn(
                    "border rounded-md p-3 space-y-2",
                    editingFilterId === filter.id && "ring-2 ring-primary"
                  )}
                >
                  {editingFilterId === filter.id ? (
                    // Edit Form
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Field
                          </label>
                          <select
                            value={formData.field}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                field: e.target.value as FilterField,
                              }))
                            }
                            className="w-full mt-1 px-2 py-1 text-sm border rounded-md"
                          >
                            {FIELD_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">
                            Match Type
                          </label>
                          <select
                            value={formData.match_type}
                            onChange={(e) =>
                              handleMatchTypeChange(e.target.value as MatchType)
                            }
                            className="w-full mt-1 px-2 py-1 text-sm border rounded-md"
                          >
                            {MATCH_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Pattern
                        </label>
                        <Input
                          value={formData.pattern}
                          onChange={(e) => handlePatternChange(e.target.value)}
                          placeholder="Enter pattern to match"
                          className="mt-1"
                        />
                        {regexError && (
                          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="size-3" />
                            {regexError}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="case-sensitive-edit"
                          checked={formData.case_sensitive}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              case_sensitive: e.target.checked,
                            }))
                          }
                          className="rounded"
                        />
                        <label
                          htmlFor="case-sensitive-edit"
                          className="text-xs text-muted-foreground"
                        >
                          Case sensitive
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleUpdate}
                          disabled={isSubmitting || !!regexError}
                        >
                          <Check className="size-3 mr-1" />
                          Update
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleCancel}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Display Mode
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded">
                            {FIELD_OPTIONS.find((f) => f.value === filter.field)
                              ?.label || filter.field}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {MATCH_TYPE_OPTIONS.find(
                              (m) => m.value === filter.matchType
                            )?.label || filter.matchType}
                          </span>
                          {filter.caseSensitive && (
                            <span className="text-xs text-muted-foreground">
                              (case sensitive)
                            </span>
                          )}
                        </div>
                        <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                          {filter.pattern}
                        </code>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(filter)}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title="Edit filter"
                          aria-label={`Edit filter: ${filter.pattern}`}
                        >
                          <Edit className="size-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => filter.id && handleDelete(filter.id)}
                          className="p-1 hover:bg-destructive/10 text-destructive rounded transition-colors"
                          title="Delete filter"
                          aria-label={`Delete filter: ${filter.pattern}`}
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add New Filter Button */}
          {!showAddForm && editingFilterId === null && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="w-full"
            >
              <Plus className="size-3 mr-1" />
              Add Filter
            </Button>
          )}

          {/* Add Form */}
          {showAddForm && (
            <div className="border rounded-md p-3 space-y-3 ring-2 ring-primary">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Field
                  </label>
                  <select
                    value={formData.field}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        field: e.target.value as FilterField,
                      }))
                    }
                    className="w-full mt-1 px-2 py-1 text-sm border rounded-md"
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Match Type
                  </label>
                  <select
                    value={formData.match_type}
                    onChange={(e) =>
                      handleMatchTypeChange(e.target.value as MatchType)
                    }
                    className="w-full mt-1 px-2 py-1 text-sm border rounded-md"
                  >
                    {MATCH_TYPE_OPTIONS.map((opt) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                        title={opt.description}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Pattern
                </label>
                <Input
                  value={formData.pattern}
                  onChange={(e) => handlePatternChange(e.target.value)}
                  placeholder="Enter pattern to match"
                  className="mt-1"
                />
                {regexError && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3" />
                    {regexError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="case-sensitive-new"
                  checked={formData.case_sensitive}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      case_sensitive: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <label
                  htmlFor="case-sensitive-new"
                  className="text-xs text-muted-foreground"
                >
                  Case sensitive
                </label>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreate}
                  disabled={isSubmitting || !!regexError}
                >
                  <Plus className="size-3 mr-1" />
                  Create Filter
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filters.length === 0 && !showAddForm && (
            <div className="text-center py-6 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">
                No filters configured
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Add filters to show or hide articles based on patterns
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
