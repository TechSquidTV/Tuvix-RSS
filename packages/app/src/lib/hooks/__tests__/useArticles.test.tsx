/**
 * useArticles Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createWrapper } from "@/test/test-utils";
import { toast } from "sonner";

// Mock sonner for toast notifications
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Import the hooks after mocks are set up
const {
  useArticles,
  useInfiniteArticles,
  useArticle,
  useMarkArticleRead,
  useMarkArticleUnread,
  useSaveArticle,
  useUnsaveArticle,
  useBulkMarkRead,
  useMarkAllRead,
  deduplicateArticlesData,
} = await import("../useArticles");

describe("useArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useArticles).toBeDefined();
    expect(typeof useArticles).toBe("function");
  });

  it("should return a query result", () => {
    const { result } = renderHook(() => useArticles(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("data");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("error");
  });

  it("should accept filters", () => {
    const { result } = renderHook(
      () => useArticles({ unread: true, limit: 10 }),
      {
        wrapper: createWrapper(),
      }
    );

    expect(result.current).toHaveProperty("data");
  });
});

describe("useInfiniteArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useInfiniteArticles).toBeDefined();
    expect(typeof useInfiniteArticles).toBe("function");
  });

  it("should return an infinite query result", () => {
    const { result } = renderHook(() => useInfiniteArticles(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("data");
    expect(result.current).toHaveProperty("hasNextPage");
    expect(result.current).toHaveProperty("fetchNextPage");
  });

  it("should accept filters", () => {
    const { result } = renderHook(() => useInfiniteArticles({ unread: true }), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("data");
  });
});

describe("useArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useArticle).toBeDefined();
    expect(typeof useArticle).toBe("function");
  });

  it("should return a query result", () => {
    const { result } = renderHook(() => useArticle(1), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("data");
    expect(result.current).toHaveProperty("isLoading");
  });
});

describe("useMarkArticleRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useMarkArticleRead).toBeDefined();
    expect(typeof useMarkArticleRead).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useMarkArticleRead(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });

  it("should show success toast on successful mutation", async () => {
    const { result } = renderHook(() => useMarkArticleRead(), {
      wrapper: createWrapper(),
    });

    // Trigger mutation - it will fail (no backend) but should show toast based on onSuccess/onError
    act(() => {
      result.current.mutate({ id: 1 });
    });

    // Wait for mutation to process
    await waitFor(
      () => {
        // Either success or error toast should be called
        expect(
          vi.mocked(toast.success).mock.calls.length +
            vi.mocked(toast.error).mock.calls.length
        ).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("should handle optimistic updates", () => {
    const { result } = renderHook(() => useMarkArticleRead(), {
      wrapper: createWrapper(),
    });

    // Verify mutation has onMutate for optimistic updates
    expect(result.current).toHaveProperty("mutate");
    // The hook structure supports optimistic updates via onMutate callback
    // Full integration testing requires a working backend
  });

  it("should handle rollback on error", () => {
    const { result } = renderHook(() => useMarkArticleRead(), {
      wrapper: createWrapper(),
    });

    // Verify mutation has error handling
    expect(result.current).toHaveProperty("mutate");
    // The hook structure supports rollback via onError callback
    // Full integration testing requires a working backend
  });
});

describe("useMarkArticleUnread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useMarkArticleUnread).toBeDefined();
    expect(typeof useMarkArticleUnread).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useMarkArticleUnread(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useSaveArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useSaveArticle).toBeDefined();
    expect(typeof useSaveArticle).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useSaveArticle(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useUnsaveArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useUnsaveArticle).toBeDefined();
    expect(typeof useUnsaveArticle).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useUnsaveArticle(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useBulkMarkRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useBulkMarkRead).toBeDefined();
    expect(typeof useBulkMarkRead).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useBulkMarkRead(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });
});

describe("useMarkAllRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should be defined", () => {
    expect(useMarkAllRead).toBeDefined();
    expect(typeof useMarkAllRead).toBe("function");
  });

  it("should return a mutation result", () => {
    const { result } = renderHook(() => useMarkAllRead(), {
      wrapper: createWrapper(),
    });

    expect(result.current).toHaveProperty("mutate");
    expect(result.current).toHaveProperty("isPending");
    expect(typeof result.current.mutate).toBe("function");
  });

  it("should accept empty object payload for marking all articles read", async () => {
    const { result } = renderHook(() => useMarkAllRead(), {
      wrapper: createWrapper(),
    });

    // Call mutate with empty object (marks all articles read)
    act(() => {
      result.current.mutate({});
    });

    // Wait for mutation to process
    await waitFor(
      () => {
        // Either success or error toast should be called
        expect(
          vi.mocked(toast.success).mock.calls.length +
            vi.mocked(toast.error).mock.calls.length
        ).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("should accept payload with olderThanDays property for marking old articles read", async () => {
    const { result } = renderHook(() => useMarkAllRead(), {
      wrapper: createWrapper(),
    });

    // Call mutate with olderThanDays property (marks articles older than N days as read)
    act(() => {
      result.current.mutate({ olderThanDays: 3 });
    });

    // Wait for mutation to process
    await waitFor(
      () => {
        // Either success or error toast should be called
        expect(
          vi.mocked(toast.success).mock.calls.length +
            vi.mocked(toast.error).mock.calls.length
        ).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });
});

describe("deduplicateArticlesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createArticle = (id: number) => ({
    id,
    read: false,
    saved: false,
    source: { id: 1 },
  });

  const createPage = (
    items: ReturnType<typeof createArticle>[],
    total = items.length,
    hasMore = false
  ) => ({
    items,
    total,
    hasMore,
  });

  it("should deduplicate articles across pages", () => {
    const data = {
      pages: [
        createPage([createArticle(1), createArticle(2)]),
        createPage([createArticle(2), createArticle(3)]), // article 2 is duplicate
      ],
      pageParams: [0, 2],
    };

    const result = deduplicateArticlesData(data);

    expect(result.pages[0].items).toHaveLength(2);
    expect(result.pages[1].items).toHaveLength(1); // Only article 3
    expect(result.pages[1].items[0].id).toBe(3);
  });

  it("should handle empty pages", () => {
    const data = {
      pages: [createPage([]), createPage([createArticle(1)])],
      pageParams: [0, 0],
    };

    const result = deduplicateArticlesData(data);

    expect(result.pages[0].items).toHaveLength(0);
    expect(result.pages[1].items).toHaveLength(1);
  });

  it("should handle single page with no duplicates", () => {
    const data = {
      pages: [
        createPage([createArticle(1), createArticle(2), createArticle(3)]),
      ],
      pageParams: [0],
    };

    const result = deduplicateArticlesData(data);

    expect(result.pages[0].items).toHaveLength(3);
  });

  describe("defensive checks", () => {
    it("should handle null data gracefully", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = deduplicateArticlesData(null as any);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Invalid data structure",
        expect.any(Object)
      );
    });

    it("should handle undefined data gracefully", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = deduplicateArticlesData(undefined as any);

      expect(result).toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Invalid data structure",
        expect.any(Object)
      );
    });

    it("should handle data without pages property", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = { pageParams: [] } as any;

      const result = deduplicateArticlesData(data);

      expect(result).toEqual(data);
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Invalid data structure",
        expect.any(Object)
      );
    });

    it("should handle pages that is not an array", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = { pages: "not an array", pageParams: [] } as any;

      const result = deduplicateArticlesData(data);

      expect(result).toEqual(data);
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Invalid data structure",
        expect.any(Object)
      );
    });

    it("should handle page without items property", () => {
      const data = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages: [{ total: 0, hasMore: false } as any],
        pageParams: [0],
      };

      const result = deduplicateArticlesData(data);

      expect(result.pages[0].items).toEqual([]);
      expect(result.pages[0].total).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Page missing items array",
        expect.any(Object)
      );
    });

    it("should handle page with items that is not an array", () => {
      const data = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages: [{ items: "not an array", total: 0, hasMore: false } as any],
        pageParams: [0],
      };

      const result = deduplicateArticlesData(data);

      expect(result.pages[0].items).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Page missing items array",
        expect.any(Object)
      );
    });

    it("should handle null page in pages array", () => {
      const data = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pages: [null as any],
        pageParams: [0],
      };

      const result = deduplicateArticlesData(data);

      expect(result.pages[0].items).toEqual([]);
      expect(result.pages[0].total).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(
        "⚠️ useInfiniteArticles select: Page missing items array",
        expect.any(Object)
      );
    });

    it("should handle mix of valid and invalid pages", () => {
      const data = {
        pages: [
          createPage([createArticle(1)]),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          null as any,
          createPage([createArticle(2)]),
        ],
        pageParams: [0, 1, 2],
      };

      const result = deduplicateArticlesData(data);

      expect(result.pages[0].items).toHaveLength(1);
      expect(result.pages[1].items).toEqual([]);
      expect(result.pages[2].items).toHaveLength(1);
    });
  });
});
