import { Skeleton } from "@/components/ui/skeleton";
import { Item, ItemContent, ItemFooter, ItemHeader } from "@/components/ui/item";

interface ArticleItemSkeletonProps {
  count?: number;
}

export function ArticleItemSkeleton({ count = 1 }: ArticleItemSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Item
          key={i}
          className="bg-card text-card-foreground border border-border"
        >
          {/* Header skeleton */}
          <ItemHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-24" />
          </ItemHeader>

          <ItemContent className="gap-4">
            <div className="space-y-3">
              {/* Title skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
              </div>

              {/* Description skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </ItemContent>

          {/* Footer skeleton */}
          <ItemFooter className="flex items-center justify-between pt-3 border-t">
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
            <Skeleton className="h-8 w-24" />
          </ItemFooter>
        </Item>
      ))}
    </>
  );
}
