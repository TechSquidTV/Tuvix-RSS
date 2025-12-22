import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Category {
  id: number;
  name: string;
  color?: string;
}

interface CategoryMultiSelectProps {
  categories: Category[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
  disabled?: boolean;
}

export function CategoryMultiSelect({
  categories,
  selectedIds,
  onChange,
  disabled = false,
}: CategoryMultiSelectProps) {
  const selectedCategories = categories.filter((cat) =>
    selectedIds.includes(cat.id)
  );

  const handleToggle = (categoryId: number, checked: boolean) => {
    const newSelection = checked
      ? [...selectedIds, categoryId]
      : selectedIds.filter((id) => id !== categoryId);
    onChange(newSelection);
  };

  const handleRemove = (categoryId: number) => {
    onChange(selectedIds.filter((id) => id !== categoryId));
  };

  const handleClear = () => {
    onChange([]);
  };

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No categories available. Create categories in the{" "}
        <a href="/app/categories" className="underline">
          Categories
        </a>{" "}
        page first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Checkbox list */}
      <div className="border rounded-md p-3 space-y-2 max-h-[200px] overflow-y-auto">
        {categories.map((category) => {
          const isSelected = selectedIds.includes(category.id);
          return (
            <div key={category.id} className="flex items-center space-x-2">
              <Checkbox
                id={`category-${category.id}`}
                checked={isSelected}
                onCheckedChange={(checked) =>
                  handleToggle(category.id, checked as boolean)
                }
                disabled={disabled}
              />
              <Label
                htmlFor={`category-${category.id}`}
                className="flex-1 cursor-pointer"
              >
                <CategoryBadge category={category} />
              </Label>
            </div>
          );
        })}
      </div>

      {/* Selected categories summary */}
      {selectedCategories.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedCategories.length} selected
            </span>
            {selectedCategories.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={disabled}
                className="h-auto py-1 px-2 text-xs"
              >
                Clear all
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCategories.map((category) => (
              <div
                key={category.id}
                className="flex items-center gap-1 bg-muted rounded-md px-2 py-1"
              >
                <CategoryBadge category={category} />
                <button
                  type="button"
                  onClick={() => handleRemove(category.id)}
                  className="ml-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                  disabled={disabled}
                >
                  <X className="size-3" />
                  <span className="sr-only">Remove {category.name}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No categories selected - feed will include articles from all your
          subscriptions
        </p>
      )}
    </div>
  );
}
