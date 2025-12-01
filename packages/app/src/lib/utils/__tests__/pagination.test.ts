/**
 * Pagination Utilities Tests
 */

import { describe, it, expect } from "vitest";
import {
  deduplicateById,
  mergePages,
  getNextPageOffset,
  hasDuplicates,
  countDuplicates,
} from "../pagination";

describe("deduplicateById", () => {
  it("should remove duplicate items by id", () => {
    const items = [
      { id: 1, title: "A" },
      { id: 2, title: "B" },
      { id: 1, title: "A2" }, // duplicate id
      { id: 3, title: "C" },
    ];

    const result = deduplicateById(items);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual([1, 2, 3]);
    // First occurrence is kept
    expect(result[0].title).toBe("A");
  });

  it("should handle empty array", () => {
    const result = deduplicateById([]);
    expect(result).toEqual([]);
  });

  it("should handle array with no duplicates", () => {
    const items = [
      { id: 1, title: "A" },
      { id: 2, title: "B" },
      { id: 3, title: "C" },
    ];

    const result = deduplicateById(items);

    expect(result).toEqual(items);
    expect(result).toHaveLength(3);
  });

  it("should handle array with all duplicates", () => {
    const items = [
      { id: 1, title: "A" },
      { id: 1, title: "B" },
      { id: 1, title: "C" },
    ];

    const result = deduplicateById(items);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 1, title: "A" });
  });

  it("should preserve order of first occurrences", () => {
    const items = [
      { id: 3, title: "C" },
      { id: 1, title: "A" },
      { id: 2, title: "B" },
      { id: 1, title: "A2" },
      { id: 3, title: "C2" },
    ];

    const result = deduplicateById(items);

    expect(result.map((i) => i.id)).toEqual([3, 1, 2]);
  });
});

describe("mergePages", () => {
  it("should merge multiple pages and deduplicate", () => {
    const pages = [
      { items: [{ id: 1 }, { id: 2 }] },
      { items: [{ id: 2 }, { id: 3 }] }, // id: 2 is duplicate
      { items: [{ id: 3 }, { id: 4 }] }, // id: 3 is duplicate
    ];

    const result = mergePages(pages);

    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });

  it("should handle empty pages array", () => {
    const result = mergePages([]);
    expect(result).toEqual([]);
  });

  it("should handle pages with empty items", () => {
    const pages = [
      { items: [{ id: 1 }] },
      { items: [] }, // empty page
      { items: [{ id: 2 }] },
    ];

    const result = mergePages(pages);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual([1, 2]);
  });

  it("should handle single page", () => {
    const pages = [{ items: [{ id: 1 }, { id: 2 }, { id: 3 }] }];

    const result = mergePages(pages);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe("getNextPageOffset", () => {
  it("should return undefined when hasMore is false", () => {
    const pages = [{ items: [{ id: 1 }, { id: 2 }] }];

    const result = getNextPageOffset(pages, false);

    expect(result).toBeUndefined();
  });

  it("should return item count when hasMore is true", () => {
    const pages = [
      { items: [{ id: 1 }, { id: 2 }] },
      { items: [{ id: 3 }, { id: 4 }] },
    ];

    const result = getNextPageOffset(pages, true);

    expect(result).toBe(4);
  });

  it("should return deduplicated count", () => {
    const pages = [
      { items: [{ id: 1 }, { id: 2 }] },
      { items: [{ id: 2 }, { id: 3 }] }, // id: 2 is duplicate
    ];

    const result = getNextPageOffset(pages, true);

    // Only 3 unique items: 1, 2, 3
    expect(result).toBe(3);
  });

  it("should handle empty pages", () => {
    const pages: Array<{ items: { id: number }[] }> = [];

    const result = getNextPageOffset(pages, false);

    expect(result).toBeUndefined();
  });

  it("should handle pages with empty items", () => {
    const pages = [
      { items: [{ id: 1 }] },
      { items: [] },
      { items: [{ id: 2 }] },
    ];

    const result = getNextPageOffset(pages, true);

    expect(result).toBe(2);
  });
});

describe("hasDuplicates", () => {
  it("should return true when duplicates exist", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 1 }];
    expect(hasDuplicates(items)).toBe(true);
  });

  it("should return false when no duplicates", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(hasDuplicates(items)).toBe(false);
  });

  it("should return false for empty array", () => {
    expect(hasDuplicates([])).toBe(false);
  });

  it("should return false for single item", () => {
    expect(hasDuplicates([{ id: 1 }])).toBe(false);
  });
});

describe("countDuplicates", () => {
  it("should count duplicate items correctly", () => {
    const items = [
      { id: 1 },
      { id: 2 },
      { id: 1 }, // duplicate
      { id: 3 },
      { id: 2 }, // duplicate
    ];

    expect(countDuplicates(items)).toBe(2);
  });

  it("should return 0 when no duplicates", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(countDuplicates(items)).toBe(0);
  });

  it("should return 0 for empty array", () => {
    expect(countDuplicates([])).toBe(0);
  });

  it("should handle multiple duplicates of same id", () => {
    const items = [
      { id: 1 },
      { id: 1 }, // duplicate
      { id: 1 }, // duplicate
      { id: 1 }, // duplicate
    ];

    // 4 items - 1 unique = 3 duplicates
    expect(countDuplicates(items)).toBe(3);
  });
});
