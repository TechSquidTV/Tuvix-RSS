/**
 * Pagination Types & Helpers
 *
 * Standard types and utilities for consistent pagination across all routers.
 */

import { z } from "zod";

/**
 * Generic paginated response schema factory
 *
 * Creates a consistent paginated response type for any item schema.
 *
 * @example
 * ```ts
 * const ArticleListSchema = createPaginatedSchema(articleWithSourceSchema);
 * // Results in: { items: Article[], total: number, hasMore: boolean }
 * ```
 */
export const createPaginatedSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    hasMore: z.boolean(),
  });

/**
 * Infer TypeScript type from paginated schema
 */
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

/**
 * Standard pagination input schema
 *
 * Use this for any endpoint that supports pagination.
 *
 * @example
 * ```ts
 * .input(paginationInputSchema.extend({
 *   categoryId: z.number().optional(),
 * }))
 * ```
 */
export const paginationInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  // Cursor-based pagination: cumulative count of items fetched (used as offset for infinite scroll)
  cursor: z.number().int().optional(),
});

/**
 * Infer TypeScript type from pagination input
 */
export type PaginationInput = z.infer<typeof paginationInputSchema>;

/**
 * Helper function to create a paginated response
 *
 * This helper automatically:
 * - Detects if there are more results
 * - Trims the results to the requested limit
 * - Calculates a reasonable total count estimate
 *
 * @param items - Array of items (should be fetched with limit + 1)
 * @param limit - The requested limit
 * @param offset - The current offset
 * @returns Paginated response object
 *
 * @example
 * ```ts
 * // In your query handler:
 * const results = await db.query().limit(input.limit + 1);
 * return createPaginatedResponse(results, input.limit, input.offset);
 * ```
 */
export function createPaginatedResponse<T>(
  items: T[],
  limit: number,
  offset: number
): PaginatedResponse<T> {
  const hasMore = items.length > limit;
  const trimmedItems = items.slice(0, limit);

  // Estimated total: offset + current items + at least 1 more if hasMore
  // This is an estimate; for exact count, run a separate COUNT query
  const total = offset + trimmedItems.length + (hasMore ? 1 : 0);

  return {
    items: trimmedItems,
    total,
    hasMore,
  };
}

/**
 * Helper to validate pagination input
 *
 * Useful for custom validation or logging.
 *
 * @param limit - Requested limit
 * @param offset - Requested offset
 * @throws Error if validation fails
 */
export function validatePaginationInput(limit: number, offset: number): void {
  if (limit < 1 || limit > 100) {
    throw new Error("Limit must be between 1 and 100");
  }
  if (offset < 0) {
    throw new Error("Offset must be non-negative");
  }
}

/**
 * Calculate pagination metadata
 *
 * Useful for adding additional pagination info.
 *
 * @param total - Total items (or estimate)
 * @param limit - Items per page
 * @param offset - Current offset
 * @returns Pagination metadata
 */
export function calculatePaginationMeta(
  total: number,
  limit: number,
  offset: number
) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = offset + limit < total;
  const hasPrevPage = offset > 0;

  return {
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    itemsPerPage: limit,
  };
}
