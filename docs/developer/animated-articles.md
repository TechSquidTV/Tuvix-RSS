# Animated Articles Feature

This guide covers the animated article list feature that provides smooth, mobile-like animations for article updates.

## Overview

The animated articles feature enhances the user experience by:

- Smoothly animating articles as they load initially
- Animating new articles as they appear (like phone notifications)
- Avoiding jarring full-page refreshes
- Providing visual feedback when articles are updated

## How It Works

### Component Architecture

The feature consists of:

1. **AnimatedArticleList Component** (`packages/app/src/components/app/animated-article-list.tsx`)
   - Wraps article items with Motion animations
   - Detects initial load vs. updates
   - Handles new article animations

2. **Smart Article Detection** (`packages/app/src/routes/app/articles.tsx`)
   - Tracks seen article IDs using a ref
   - Detects new articles by comparing IDs
   - Triggers animations for new articles only

3. **Refresh Mechanisms**
   - Manual refresh uses `refetch()` instead of `invalidate()`
   - Post-subscription refetch after 5-second delay
   - All refreshes trigger smart merging

### Animation Types

#### Initial Load Animation

- Articles slide up from bottom with stagger effect
- Only first 20 articles are staggered for performance
- Uses spring animation: `{ type: "spring", stiffness: 300, damping: 30 }`
- Stagger delay: 0.05 seconds between items

#### New Article Animation

- Articles pop in at top with scale + fade
- Uses spring animation for smooth feel
- No stagger (new articles are typically few)
- Animation: `scale: 0.8 → 1, opacity: 0 → 1, y: -20 → 0`

### Article Detection Strategy

Articles are detected as "new" by comparing their `id` (primary key) against a `seenArticleIds` Set:

```typescript
const seenArticleIds = useRef<Set<number>>(new Set());
const newArticles = allArticles.filter(
  (a) => !seenArticleIds.current.has(a.id)
);
```

**Why IDs instead of dates?**

- IDs are unique and reliable
- No need to compare timestamps
- Simpler and more performant
- Works even if articles are reordered

### Integration with Animate-UI Tabs

The animated list works inside `TabsContent` components which use ResizeObserver for height animations:

- Animated list is a direct child of `TabsContent`
- No extra wrappers that could interfere with height calculations
- Animations don't cause layout shifts that break ResizeObserver
- Tab height animations continue to work correctly

## Usage

### Basic Usage

```tsx
import { AnimatedArticleList } from "@/components/app/animated-article-list";

<AnimatedArticleList articles={filteredArticles} newArticleIds={newArticleIds}>
  {/* Infinite scroll trigger */}
  <div ref={ref}>Loading more...</div>
</AnimatedArticleList>;
```

### Props

- `articles: Article[]` - Array of articles to display
- `newArticleIds?: Set<number>` - IDs of articles that should animate as "new"
- `children?: React.ReactNode` - Optional children (e.g., infinite scroll trigger)
- `className?: string` - Additional CSS classes

### Tracking New Articles

In your component:

```tsx
const [newArticleIds, setNewArticleIds] = useState<Set<number>>(new Set());
const seenArticleIds = useRef<Set<number>>(new Set());

useEffect(() => {
  const newArticles = allArticles.filter(
    (a) => !seenArticleIds.current.has(a.id)
  );

  if (newArticles.length > 0) {
    setNewArticleIds(new Set(newArticles.map((a) => a.id)));
    newArticles.forEach((a) => seenArticleIds.current.add(a.id));

    // Clear after animation completes
    setTimeout(() => setNewArticleIds(new Set()), 3000);
  }
}, [allArticles]);
```

## Post-Subscription Refetch

After subscribing to a new feed:

1. Feed refresh is triggered immediately
2. After 5 seconds, articles query is refetched
3. New articles are detected and animated
4. User sees smooth notification-like appearance

**Implementation:**

```typescript
// In subscriptions.tsx
const timeoutId = setTimeout(() => {
  queryClient.refetchQueries({
    queryKey: [["trpc"], ["articles", "list"]],
  });
  toast.info("Checking for new articles...");
}, 5000);
```

**Rationale:**

- Feed processing happens server-side and takes a few seconds
- One refetch after delay is cleaner than polling
- If articles don't appear, user can manually refresh

## Manual Refresh

Manual refresh now uses `refetch()` instead of `invalidate()`:

**Before:**

```typescript
utils.articles.list.invalidate(); // Full reset
```

**After:**

```typescript
queryClient.refetchQueries({
  queryKey: [["trpc"], ["articles", "list"]],
}); // Smart merge
```

This allows:

- New articles to be detected and animated
- Existing articles to stay in place
- Smooth updates without full page refresh

## Infinite Query Structure

Articles use React Query's infinite query pattern:

```typescript
{
  pages: [
    { items: Article[], total: number, hasMore: boolean }
  ],
  pageParams: number[]
}
```

The smart detection works with this structure by:

- Flattening pages: `allArticles = data?.pages.flatMap(page => page.items)`
- Comparing IDs across all pages
- Animating only truly new articles

## Query Key Construction

For infinite queries, tRPC uses this key structure:

```typescript
[
  ["trpc"],
  ["articles", "list"],
  { input }, // filters, limit, offset
  "infinite",
];
```

When refetching, use:

```typescript
queryClient.refetchQueries({
  queryKey: [["trpc"], ["articles", "list"]], // Partial match
});
```

This refetches all article list queries (with different filters).

## Performance Considerations

### Stagger Limits

- Only first 20 articles are staggered on initial load
- Prevents performance issues with large lists
- Subsequent articles animate without stagger

### Animation Performance

- Uses Motion's hardware-accelerated animations
- `layout` prop enables smooth layout shifts
- `AnimatePresence` handles exit animations efficiently

### Memory Management

- `seenArticleIds` ref persists across renders (no re-initialization)
- New article IDs cleared after 3 seconds
- No memory leaks from timeouts (proper cleanup)

## Troubleshooting

### Articles Not Animating

**Check:**

1. Are article IDs being tracked correctly?
2. Is `newArticleIds` Set being passed to component?
3. Are articles actually new (not in seenArticleIds)?

**Debug:**

```typescript
console.log("New articles:", newArticles);
console.log("Seen IDs:", Array.from(seenArticleIds.current));
console.log("New IDs:", Array.from(newArticleIds));
```

### Tab Height Animation Broken

**Check:**

1. Is AnimatedArticleList a direct child of TabsContent?
2. Are there extra wrapper divs?
3. Do animations cause layout shifts?

**Fix:**

- Ensure no extra wrappers
- Check that animations use `layout` prop
- Verify ResizeObserver is still working

### Refetch Not Working

**Check:**

1. Is query key correct?
2. Are you using `refetchQueries` (not `invalidate`)?
3. Is the query actually refetching?

**Debug:**

```typescript
queryClient.refetchQueries({
  queryKey: [["trpc"], ["articles", "list"]],
  exact: false, // Partial match
});
```

### Initial Load Always Triggering

**Check:**

- Is `hasRenderedRef` being reset incorrectly?
- Are articles array changing identity on each render?

**Fix:**

- Ensure ref persists across renders
- Use stable article references

## Testing

Tests mock Motion components to test logic without animation implementation:

```typescript
vi.mock("motion/react", () => ({
  motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }) => <div>{children}</div>,
}));
```

**Test Coverage:**

- Component rendering
- Article ID tracking
- New article detection
- Children preservation
- className application

## Future Enhancements

Potential improvements:

- Optimistic updates for article state changes
- More sophisticated merge logic for reordered articles
- Configurable animation timings
- Reduced motion support (prefers-reduced-motion)
- Virtual scrolling for very large lists

## Related Documentation

- [Motion Documentation](https://motion.dev/docs/react)
- [React Query Infinite Queries](https://tanstack.com/query/latest/docs/react/guides/infinite-queries)
- [tRPC React Query Integration](https://trpc.io/docs/react-query)
