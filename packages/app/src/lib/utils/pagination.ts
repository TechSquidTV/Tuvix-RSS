/**
 * Pagination Utilities
 *
 * Helper functions for infinite scroll pagination, deduplication, and merging.
 */

/**
 * Generic item with id
 */
interface ItemWithId {
  id: number;
}

/**
 * Deduplicate items by id, keeping the first occurrence
 *
 * @param items - Array of items with id property
 * @returns Deduplicated array preserving order
 *
 * @example
 * ```ts
 * const items = [{ id: 1, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'C' }];
 * const unique = deduplicateById(items);
 * // Result: [{ id: 1, name: 'A' }, { id: 2, name: 'C' }]
 * ```
 */
export function deduplicateById<T extends ItemWithId>(items: T[]): T[] {
  const seenIds = new Set<number>();
  const result: T[] = [];

  for (const item of items) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      result.push(item);
    }
  }

  return result;
}

/**
 * Merge multiple pages of items with deduplication
 *
 * @param pages - Array of pages, each containing items array
 * @returns Flat array of deduplicated items
 *
 * @example
 * ```ts
 * const pages = [
 *   { items: [{ id: 1 }, { id: 2 }] },
 *   { items: [{ id: 2 }, { id: 3 }] } // id: 2 is duplicate
 * ];
 * const all = mergePages(pages);
 * // Result: [{ id: 1 }, { id: 2 }, { id: 3 }]
 * ```
 */
export function mergePages<T extends ItemWithId>(
  pages: Array<{ items: T[] }>
): T[] {
  const allItems = pages.flatMap((page) => page.items);
  return deduplicateById(allItems);
}

/**
 * Calculate the next page offset based on current pages
 *
 * @param pages - Array of pages with items
 * @param hasMore - Whether there are more items to fetch
 * @returns The next offset or undefined if no more pages
 *
 * @example
 * ```ts
 * const pages = [{ items: [...], hasMore: true }];
 * const nextOffset = getNextPageOffset(pages, true); // Returns item count
 * const noMore = getNextPageOffset(pages, false); // Returns undefined
 * ```
 */
export function getNextPageOffset<T extends ItemWithId>(
  pages: Array<{ items: T[] }>,
  hasMore: boolean
): number | undefined {
  if (!hasMore) {
    return undefined;
  }

  // Calculate total unique items loaded (deduped count)
  const allItems = mergePages(pages);
  return allItems.length;
}

/**
 * Check if items contain duplicates
 *
 * @param items - Array of items with id property
 * @returns True if duplicates exist
 */
export function hasDuplicates<T extends ItemWithId>(items: T[]): boolean {
  const ids = items.map((item) => item.id);
  return new Set(ids).size !== ids.length;
}

/**
 * Count duplicate items
 *
 * @param items - Array of items with id property
 * @returns Number of duplicate items
 */
export function countDuplicates<T extends ItemWithId>(items: T[]): number {
  const ids = items.map((item) => item.id);
  return ids.length - new Set(ids).size;
}
