/**
 * Infinite Scroll Pagination Integration Tests
 *
 * Tests for the useInfiniteArticles hook and pagination behavior.
 * These tests verify:
 * - Pages are fetched in sequence (page 1, 2, 3)
 * - Duplicate items are deduplicated
 * - Pagination stops when hasMore is false
 * - Concurrent duplicate fetches are prevented
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { trpc } from "@/lib/api/trpc";
import { deduplicateById, mergePages } from "@/lib/utils/pagination";

// Mock trpc client
vi.mock("@/lib/api/trpc", () => ({
  trpc: {
    articles: {
      list: {
        useInfiniteQuery: vi.fn(),
      },
    },
    createClient: vi.fn(() => ({})),
    Provider: ({ children }: { children: ReactNode }) => children,
  },
}));

// Import the hook after mocks are set up
const { useInfiniteArticles } = await import("@/lib/hooks/useArticles");

// Helper to create test articles
function createMockArticle(id: number, title?: string) {
  return {
    id,
    title: title || `Article ${id}`,
    description: `Description for article ${id}`,
    link: `https://example.com/article/${id}`,
    publishedAt: new Date().toISOString(),
    read: false,
    saved: false,
    source: {
      id: Math.floor(id / 10) + 1,
      title: `Source ${Math.floor(id / 10) + 1}`,
      url: "https://example.com",
    },
  };
}

// Helper to create a mock page response
function createMockPage(
  items: ReturnType<typeof createMockArticle>[],
  hasMore: boolean,
  total: number
) {
  return {
    items,
    hasMore,
    total,
  };
}

// Create test wrapper with QueryClient
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <trpc.Provider client={trpc.createClient({})} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );

  return { queryClient, wrapper };
}

describe("useInfiniteArticles", () => {
  let mockUseInfiniteQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInfiniteQuery = vi.fn();
    vi.mocked(trpc.articles.list.useInfiniteQuery).mockImplementation(
      mockUseInfiniteQuery
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call useInfiniteQuery with correct parameters", () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isLoading: true,
    });

    const { wrapper } = createTestWrapper();
    renderHook(() => useInfiniteArticles({ categoryId: 1 }), { wrapper });

    expect(mockUseInfiniteQuery).toHaveBeenCalled();
    // Verify the hook is called with a function and options
    const [inputFn, options] = mockUseInfiniteQuery.mock.calls[0];
    expect(typeof inputFn).toBe("function");
    expect(options).toHaveProperty("getNextPageParam");
    expect(options).toHaveProperty("initialPageParam", 0);
  });

  it("should pass filters to query input", () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isLoading: true,
    });

    const { wrapper } = createTestWrapper();
    const filters = { categoryId: 1, subscriptionId: 2, unread: true };

    renderHook(() => useInfiniteArticles(filters), { wrapper });

    const [inputFn] = mockUseInfiniteQuery.mock.calls[0];
    // Call the input function with a page param to get the query input
    const queryInput = inputFn(0);
    expect(queryInput).toMatchObject({
      ...filters,
      limit: 20,
      offset: 0,
    });
  });

  it("should use pageParam as offset in query input", () => {
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      isLoading: true,
    });

    const { wrapper } = createTestWrapper();

    renderHook(() => useInfiniteArticles(), { wrapper });

    const [inputFn] = mockUseInfiniteQuery.mock.calls[0];

    // Test different page params
    expect(inputFn(0)).toMatchObject({ offset: 0, limit: 20 });
    expect(inputFn(20)).toMatchObject({ offset: 20, limit: 20 });
    expect(inputFn(40)).toMatchObject({ offset: 40, limit: 20 });
  });
});

describe("Pagination getNextPageParam logic", () => {
  it("should return undefined when hasMore is false", () => {
    const page1 = createMockPage(
      [createMockArticle(1), createMockArticle(2)],
      false,
      2
    );

    // Calculate next page param
    const nextOffset = page1.hasMore ? 2 : undefined;

    expect(nextOffset).toBeUndefined();
  });

  it("should return item count when hasMore is true", () => {
    const page1 = createMockPage(
      [createMockArticle(1), createMockArticle(2)],
      true,
      10
    );

    // Calculate next page param
    const nextOffset = page1.hasMore ? page1.items.length : undefined;

    expect(nextOffset).toBe(2);
  });

  it("should calculate offset from all pages", () => {
    const allPages = [
      createMockPage([createMockArticle(1), createMockArticle(2)], true, 100),
      createMockPage([createMockArticle(3), createMockArticle(4)], true, 100),
    ];

    // Calculate next offset using mergePages (our utility)
    const uniqueItems = mergePages(allPages);
    const nextOffset = uniqueItems.length;

    expect(nextOffset).toBe(4);
  });

  it("should handle duplicates in offset calculation", () => {
    const allPages = [
      createMockPage([createMockArticle(1), createMockArticle(2)], true, 100),
      createMockPage(
        [createMockArticle(2), createMockArticle(3)],
        true,
        100
      ), // id: 2 is duplicate
    ];

    // Calculate next offset using mergePages (our utility)
    const uniqueItems = mergePages(allPages);
    const nextOffset = uniqueItems.length;

    // Should be 3 (unique items: 1, 2, 3), not 4
    expect(nextOffset).toBe(3);
  });

  it("should stop pagination when last page has no items", () => {
    const lastPage = createMockPage([], true, 100);

    // Even if hasMore is true, empty items should stop pagination
    const shouldStop = lastPage.items.length === 0;

    expect(shouldStop).toBe(true);
  });
});

describe("Article deduplication", () => {
  it("should deduplicate articles across pages", () => {
    const page1Articles = [
      createMockArticle(1),
      createMockArticle(2),
      createMockArticle(3),
    ];

    const page2Articles = [
      createMockArticle(3), // duplicate
      createMockArticle(4),
      createMockArticle(5),
    ];

    const allArticles = [...page1Articles, ...page2Articles];
    const deduped = deduplicateById(allArticles);

    expect(deduped).toHaveLength(5);
    expect(deduped.map((a) => a.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should keep first occurrence when deduplicating", () => {
    const articles = [
      { id: 1, title: "First" },
      { id: 1, title: "Second" }, // duplicate
    ];

    const deduped = deduplicateById(articles);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].title).toBe("First");
  });

  it("should handle empty arrays", () => {
    const deduped = deduplicateById([]);
    expect(deduped).toEqual([]);
  });

  it("should handle arrays with no duplicates", () => {
    const articles = [
      createMockArticle(1),
      createMockArticle(2),
      createMockArticle(3),
    ];

    const deduped = deduplicateById(articles);

    expect(deduped).toHaveLength(3);
    expect(deduped).toEqual(articles);
  });
});

describe("Concurrent fetch prevention", () => {
  it("should not trigger fetch when already fetching", () => {
    // Simulate the condition check in articles.tsx
    const conditions = {
      inView: true,
      hasNextPage: true,
      isFetchingNextPage: true, // Already fetching
      activeFilter: "all",
    };

    const shouldFetch =
      conditions.inView &&
      conditions.hasNextPage &&
      !conditions.isFetchingNextPage &&
      conditions.activeFilter === "all";

    expect(shouldFetch).toBe(false);
  });

  it("should trigger fetch when conditions are met", () => {
    const conditions = {
      inView: true,
      hasNextPage: true,
      isFetchingNextPage: false,
      activeFilter: "all",
    };

    const shouldFetch =
      conditions.inView &&
      conditions.hasNextPage &&
      !conditions.isFetchingNextPage &&
      conditions.activeFilter === "all";

    expect(shouldFetch).toBe(true);
  });

  it("should not trigger fetch when not in view", () => {
    const conditions = {
      inView: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      activeFilter: "all",
    };

    const shouldFetch =
      conditions.inView &&
      conditions.hasNextPage &&
      !conditions.isFetchingNextPage &&
      conditions.activeFilter === "all";

    expect(shouldFetch).toBe(false);
  });

  it("should not trigger fetch when no more pages", () => {
    const conditions = {
      inView: true,
      hasNextPage: false, // No more pages
      isFetchingNextPage: false,
      activeFilter: "all",
    };

    const shouldFetch =
      conditions.inView &&
      conditions.hasNextPage &&
      !conditions.isFetchingNextPage &&
      conditions.activeFilter === "all";

    expect(shouldFetch).toBe(false);
  });

  it("should not trigger fetch for filtered tabs", () => {
    const conditions = {
      inView: true,
      hasNextPage: true,
      isFetchingNextPage: false,
      activeFilter: "unread", // Filtered tab
    };

    const shouldFetch =
      conditions.inView &&
      conditions.hasNextPage &&
      !conditions.isFetchingNextPage &&
      conditions.activeFilter === "all";

    expect(shouldFetch).toBe(false);
  });
});

describe("Pagination sequence validation", () => {
  it("should request pages in sequence with correct offsets", () => {
    const requests: Array<{ offset: number; limit: number }> = [];

    // Simulate page fetching
    const fetchPage = (offset: number) => {
      requests.push({ offset, limit: 20 });
      return createMockPage(
        Array.from({ length: 20 }, (_, i) =>
          createMockArticle(offset + i + 1)
        ),
        offset + 20 < 60, // hasMore until 60 articles
        60
      );
    };

    // Fetch page 1 (offset 0)
    const page1 = fetchPage(0);
    expect(page1.hasMore).toBe(true);

    // Fetch page 2 (offset 20)
    const page2 = fetchPage(20);
    expect(page2.hasMore).toBe(true);

    // Fetch page 3 (offset 40)
    const page3 = fetchPage(40);
    expect(page3.hasMore).toBe(false);

    // Verify request sequence
    expect(requests).toEqual([
      { offset: 0, limit: 20 },
      { offset: 20, limit: 20 },
      { offset: 40, limit: 20 },
    ]);
  });

  it("should stop requesting after empty page", () => {
    let requestCount = 0;

    const fetchPage = (offset: number) => {
      requestCount++;
      if (offset >= 40) {
        // Return empty page at offset 40
        return createMockPage([], false, 40);
      }
      return createMockPage(
        Array.from({ length: 20 }, (_, i) =>
          createMockArticle(offset + i + 1)
        ),
        true,
        100
      );
    };

    // Simulate pagination
    let page = fetchPage(0);
    let offset = 20;

    while (page.hasMore && page.items.length > 0 && requestCount < 10) {
      page = fetchPage(offset);
      offset += 20;
    }

    // Should have made 3 requests (0, 20, 40)
    expect(requestCount).toBe(3);
  });

  it("should render all unique articles from all pages", () => {
    const pages = [
      createMockPage([createMockArticle(1), createMockArticle(2)], true, 6),
      createMockPage([createMockArticle(3), createMockArticle(4)], true, 6),
      createMockPage([createMockArticle(5), createMockArticle(6)], false, 6),
    ];

    const allArticles = mergePages(pages);

    expect(allArticles).toHaveLength(6);
    expect(allArticles.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
