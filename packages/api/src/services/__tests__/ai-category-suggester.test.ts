import { describe, it, expect, vi } from "vitest";
import { suggestCategories } from "../ai-category-suggester";

// Mock AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn()),
}));

describe("ai-category-suggester", () => {
  it("should return no_input if no context provided", async () => {
    const result = await suggestCategories(
      {
        title: "",
        feedCategories: [],
        entryCategories: [],
        entryTitles: [],
      },
      [],
      "test-key"
    );

    expect(result.status).toBe("no_input");
    expect(result.matchedCategoryIds).toEqual([]);
  });

  it("should filter matched IDs against user categories", async () => {
    const { generateObject } = await import("ai");
    (generateObject as any).mockResolvedValueOnce({
      object: {
        existingMatches: [
          { categoryId: 1, confidence: 0.9 },
          { categoryId: 999, confidence: 0.9 }, // Non-existent
        ],
        newSuggestions: [],
      },
    });

    const result = await suggestCategories(
      {
        title: "Tech News",
        feedCategories: [],
        entryCategories: [],
        entryTitles: [],
      },
      [{ id: 1, name: "Technology" }],
      "test-key"
    );

    expect(result.status).toBe("success");
    expect(result.matchedCategoryIds).toEqual([1]);
    expect(result.matchedCategoryIds).not.toContain(999);
  });

  it("should filter by confidence threshold", async () => {
    const { generateObject } = await import("ai");
    (generateObject as any).mockResolvedValueOnce({
      object: {
        existingMatches: [
          { categoryId: 1, confidence: 0.9 },
          { categoryId: 2, confidence: 0.5 }, // Low confidence
        ],
        newSuggestions: [
          { name: "New", confidence: 0.9 },
          { name: "Bad", confidence: 0.1 },
        ],
      },
    });

    const result = await suggestCategories(
      {
        title: "Tech News",
        feedCategories: [],
        entryCategories: [],
        entryTitles: [],
      },
      [
        { id: 1, name: "Tech" },
        { id: 2, name: "News" },
      ],
      "test-key"
    );

    expect(result.matchedCategoryIds).toEqual([1]);
    expect(result.newCategorySuggestions).toEqual(["New"]);
  });

  it("should return fail on error", async () => {
    const { generateObject } = await import("ai");
    (generateObject as any).mockRejectedValueOnce(new Error("AI Error"));

    const result = await suggestCategories(
      {
        title: "Tech News",
        feedCategories: [],
        entryCategories: [],
        entryTitles: [],
      },
      [],
      "test-key"
    );

    expect(result.status).toBe("fail");
  });
});
