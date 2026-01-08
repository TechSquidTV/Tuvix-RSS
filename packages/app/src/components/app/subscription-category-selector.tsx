import { useState, useCallback, useMemo } from "react";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategorySuggestion } from "@/lib/hooks/useFeedPreview";
import type { ModelsCategory } from "@/lib/api/generated/types.gen";

interface SubscriptionCategorySelectorProps {
  suggestedCategories: CategorySuggestion[];
  existingCategories: ModelsCategory[];
  selectedCategoryIds: number[];
  newCategoryNames: string[];
  onToggleCategory: (categoryId: number) => void;
  onAddNewCategory: (categoryName: string) => void;
  onRemoveNewCategory: (categoryName: string) => void;
  isLoadingSuggestions?: boolean;
  aiMatchedCategoryIds?: number[];
  aiNewCategorySuggestions?: string[];
  className?: string;
}

export function SubscriptionCategorySelector({
  suggestedCategories,
  existingCategories,
  selectedCategoryIds,
  newCategoryNames,
  onToggleCategory,
  onAddNewCategory,
  onRemoveNewCategory,
  isLoadingSuggestions = false,
  aiMatchedCategoryIds = [],
  aiNewCategorySuggestions = [],
  className,
}: SubscriptionCategorySelectorProps) {
  const [newCategoryInput, setNewCategoryInput] = useState("");

  // Ensure existingCategories is always an array (memoized to avoid recreating callback)
  const categoriesArray = useMemo(
    () => (Array.isArray(existingCategories) ? existingCategories : []),
    [existingCategories]
  );

  const handleAddNewCategory = useCallback(() => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;

    // Check if it already exists
    if (newCategoryNames.includes(trimmed)) {
      setNewCategoryInput("");
      return;
    }

    // Check if it matches an existing category
    const matchingCategory = categoriesArray.find(
      (c) => c.name && c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchingCategory && matchingCategory.id !== undefined) {
      // Select the existing category instead
      onToggleCategory(matchingCategory.id);
      setNewCategoryInput("");
      return;
    }

    onAddNewCategory(trimmed);
    setNewCategoryInput("");
  }, [
    newCategoryInput,
    newCategoryNames,
    categoriesArray,
    onAddNewCategory,
    onToggleCategory,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddNewCategory();
      }
    },
    [handleAddNewCategory]
  );

  const filteredExistingCategories = categoriesArray.filter(
    (category) =>
      category.id !== undefined && !selectedCategoryIds.includes(category.id)
  );

  // Sort categories to put suggested ones first (visually distinct)
  const suggestedCategoryNames = new Set(
    suggestedCategories.map((s) => s.name.toLowerCase())
  );
  const sortedExistingCategories = [...filteredExistingCategories].sort(
    (a, b) => {
      const aIsSuggested =
        a.name && suggestedCategoryNames.has(a.name.toLowerCase());
      const bIsSuggested =
        b.name && suggestedCategoryNames.has(b.name.toLowerCase());
      if (aIsSuggested && !bIsSuggested) return -1;
      if (!aIsSuggested && bIsSuggested) return 1;
      return 0;
    }
  );

  const totalSelected = selectedCategoryIds.length + newCategoryNames.length;
  const isOverLimit = totalSelected > 10;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <label className="text-sm font-semibold">Categories</label>
          {totalSelected > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {totalSelected} selected
            </span>
          )}
        </div>
        {isOverLimit && (
          <span className="text-xs text-destructive font-medium">
            Max 10 categories
          </span>
        )}
      </div>

      {/* Selected Categories Section */}
      {selectedCategoryIds.length > 0 || newCategoryNames.length > 0 ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Selected Categories
          </label>
          <div className="flex flex-wrap gap-2 p-3 border-2 border-primary/20 rounded-lg bg-primary/5">
            {/* Selected existing categories */}
            {selectedCategoryIds.map((categoryId) => {
              const category = categoriesArray.find((c) => c.id === categoryId);
              if (!category || !category.id) return null;
              return (
                <CategoryBadge
                  key={category.id}
                  category={{
                    id: category.id!,
                    name: category.name || "",
                    color: category.color,
                  }}
                  variant="default"
                  onRemove={() => onToggleCategory(category.id!)}
                />
              );
            })}

            {/* New categories */}
            {newCategoryNames.map((name) => (
              <CategoryBadge
                key={name}
                category={{ id: -1, name, color: "" }}
                variant="default"
                onRemove={() => onRemoveNewCategory(name)}
              />
            ))}
          </div>
          {aiMatchedCategoryIds.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 text-[10px] font-medium text-primary animate-in fade-in slide-in-from-left-1 duration-500">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />✨ AI
              applied {aiMatchedCategoryIds.length} existing categories
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 border border-dashed rounded-lg bg-muted/30 text-center">
          <p className="text-sm text-muted-foreground">
            No categories selected. Choose from below or create a new one.
          </p>
        </div>
      )}

      {/* Suggested Categories Section */}
      {(isLoadingSuggestions || suggestedCategories.length > 0) && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Suggested from Feed
          </label>
          <p className="text-xs text-muted-foreground -mt-1">
            Categories detected from the feed content
          </p>

          {isLoadingSuggestions ? (
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-20" />
              ))}
            </div>
          ) : suggestedCategories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestedCategories.map((suggestion) => {
                // Check if this suggestion matches an existing category
                const matchingCategory = categoriesArray.find(
                  (c) =>
                    c.name &&
                    c.name.toLowerCase() === suggestion.name.toLowerCase()
                );
                const isSelected =
                  matchingCategory && matchingCategory.id !== undefined
                    ? selectedCategoryIds.includes(matchingCategory.id)
                    : newCategoryNames.includes(suggestion.name);

                return (
                  <button
                    key={suggestion.name}
                    type="button"
                    onClick={() => {
                      if (
                        matchingCategory &&
                        matchingCategory.id !== undefined
                      ) {
                        onToggleCategory(matchingCategory.id);
                      } else {
                        if (isSelected) {
                          onRemoveNewCategory(suggestion.name);
                        } else {
                          onAddNewCategory(suggestion.name);
                        }
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm border-2 border-primary"
                        : "border-2 border-primary/50 bg-background hover:bg-primary/10 hover:border-primary text-foreground"
                    )}
                    title={
                      isSelected
                        ? `Remove "${suggestion.name}"`
                        : `Add "${suggestion.name}"`
                    }
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: suggestion.color }}
                      aria-hidden="true"
                    />
                    <span>{suggestion.name}</span>
                    <span className="ml-0.5 rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] font-semibold">
                      {suggestion.count}
                    </span>
                    {isSelected && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            matchingCategory &&
                            matchingCategory.id !== undefined
                          ) {
                            onToggleCategory(matchingCategory.id);
                          } else {
                            onRemoveNewCategory(suggestion.name);
                          }
                        }}
                        className="ml-1 rounded-full hover:bg-primary-foreground/20 p-0.5 transition-colors cursor-pointer inline-flex items-center justify-center"
                        title={`Remove "${suggestion.name}"`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Remove "${suggestion.name}"`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (
                              matchingCategory &&
                              matchingCategory.id !== undefined
                            ) {
                              onToggleCategory(matchingCategory.id);
                            } else {
                              onRemoveNewCategory(suggestion.name);
                            }
                          }
                        }}
                      >
                        <X className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* Your Categories Section */}
      {filteredExistingCategories.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Your Categories
          </label>
          <p className="text-xs text-muted-foreground -mt-1">
            Click to add or remove from this subscription
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortedExistingCategories.map((category) => {
              if (!category.id) return null;
              const isSelected = selectedCategoryIds.includes(category.id);
              const isSuggested =
                category.name &&
                suggestedCategoryNames.has(category.name.toLowerCase());
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onToggleCategory(category.id!)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm border-2 border-primary"
                      : isSuggested
                        ? "border-2 border-primary/50 bg-background hover:bg-primary/10 hover:border-primary text-foreground"
                        : "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20"
                  )}
                  title={
                    isSelected
                      ? `Remove "${category.name}"`
                      : `Add "${category.name}"`
                  }
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <span>{category.name}</span>
                  {isSuggested && !isSelected && (
                    <span className="text-[10px] text-primary font-semibold">
                      ✨
                    </span>
                  )}
                  {isSelected && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCategory(category.id);
                      }}
                      className="ml-1 rounded-full hover:bg-primary-foreground/20 p-0.5 transition-colors cursor-pointer inline-flex items-center justify-center"
                      title={`Remove "${category.name}"`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove "${category.name}"`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleCategory(category.id!);
                        }
                      }}
                    >
                      <X className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Create New Category Input */}
      <div className="space-y-2 border-t pt-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Create New Category
          </label>
          <p className="text-xs text-muted-foreground -mt-1">
            Type a name and press Enter or click Add
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            value={newCategoryInput}
            onChange={(e) => setNewCategoryInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Technology, News, Sports"
            maxLength={50}
            className="flex-1"
          />
          <button
            type="button"
            onClick={handleAddNewCategory}
            disabled={!newCategoryInput.trim()}
            className="px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            title="Add category"
          >
            <Plus className="size-4 mr-1 inline" />
            Add
          </button>
        </div>

        {/* AI New Category Suggestions */}
        {!isLoadingSuggestions && aiNewCategorySuggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              ✨ AI Suggests
            </p>
            <div className="flex flex-wrap gap-1.5">
              {aiNewCategorySuggestions.map((name) => {
                const isSelected = newCategoryNames.includes(name);
                if (isSelected) return null;

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onAddNewCategory(name)}
                    disabled={isOverLimit}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
                  >
                    <Plus className="h-3 w-3" />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {newCategoryInput && newCategoryInput.length > 40 && (
          <p className="text-xs text-muted-foreground">
            {newCategoryInput.length}/50 characters
          </p>
        )}
        {newCategoryInput.trim() && (
          <p className="text-xs text-muted-foreground">
            This will create a new category and add it to this subscription
          </p>
        )}
      </div>
    </div>
  );
}
