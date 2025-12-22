import { cn } from "@/lib/utils";
import { getColorForCategory } from "@/lib/utils/colors";
import { X } from "lucide-react";

interface Category {
  id: number;
  name: string;
  color?: string;
}

interface CategoryBadgeProps {
  category: Category;
  count?: number;
  showCount?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  variant?: "default" | "outline";
}

export function CategoryBadge({
  category,
  count,
  showCount = false,
  onRemove,
  onClick,
  className,
  variant = "default",
}: CategoryBadgeProps) {
  const color = category.color || getColorForCategory(category.name);
  const isClickable = Boolean(onClick);
  const hasRemove = Boolean(onRemove);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        variant === "default" && "bg-secondary text-secondary-foreground",
        variant === "outline" &&
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        isClickable && "cursor-pointer hover:opacity-80",
        className
      )}
      onClick={onClick}
    >
      {/* Colored dot */}
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      {/* Category name */}
      <span>{category.name}</span>

      {/* Count badge */}
      {showCount && count !== undefined && (
        <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
          {count}
        </span>
      )}

      {/* Remove button */}
      {hasRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 rounded-full hover:bg-muted p-0.5 transition-colors"
          aria-label={`Remove ${category.name} category`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

interface CategoryBadgeListProps {
  categories: Category[];
  onRemove?: (categoryId: number) => void;
  onClick?: (categoryId: number) => void;
  className?: string;
}

export function CategoryBadgeList({
  categories,
  onRemove,
  onClick,
  className,
}: CategoryBadgeListProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {categories.map((category) => (
        <CategoryBadge
          key={category.id}
          category={category}
          onRemove={onRemove ? () => onRemove(category.id) : undefined}
          onClick={onClick ? () => onClick(category.id) : undefined}
        />
      ))}
    </div>
  );
}
