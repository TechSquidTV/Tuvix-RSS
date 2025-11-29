/**
 * OPML Parser Utilities Tests
 */

import { describe, it, expect } from "vitest";
import {
  parseFiltersJson,
  parseCategoriesJson,
  parseBoolean,
  type FilterData,
} from "../opml-parser";

describe("OPML Parser Utilities", () => {
  describe("parseFiltersJson", () => {
    it("should return null for undefined input", () => {
      expect(parseFiltersJson(undefined)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseFiltersJson("")).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      expect(parseFiltersJson("not valid json")).toBeNull();
    });

    it("should return null for non-array JSON", () => {
      expect(parseFiltersJson('{"field": "title"}')).toBeNull();
    });

    it("should parse valid filters array", () => {
      const json = JSON.stringify([
        {
          field: "title",
          matchType: "contains",
          pattern: "test",
          caseSensitive: true,
        },
      ]);

      const result = parseFiltersJson(json);

      expect(result).toEqual([
        {
          field: "title",
          matchType: "contains",
          pattern: "test",
          caseSensitive: true,
        },
      ]);
    });

    it("should default caseSensitive to false when not provided", () => {
      const json = JSON.stringify([
        {
          field: "content",
          matchType: "regex",
          pattern: ".*test.*",
        },
      ]);

      const result = parseFiltersJson(json);

      expect(result).toEqual([
        {
          field: "content",
          matchType: "regex",
          pattern: ".*test.*",
          caseSensitive: false,
        },
      ]);
    });

    it("should filter out invalid filter objects", () => {
      const json = JSON.stringify([
        { field: "title", matchType: "contains", pattern: "valid" },
        { field: "invalid_field", matchType: "contains", pattern: "test" },
        { field: "content", matchType: "invalid_match", pattern: "test" },
        { field: "author", pattern: "missing matchType" },
        null,
        "string",
        123,
      ]);

      const result = parseFiltersJson(json);

      expect(result).toEqual([
        {
          field: "title",
          matchType: "contains",
          pattern: "valid",
          caseSensitive: false,
        },
      ]);
    });

    it("should parse all valid field types", () => {
      const fields: FilterData["field"][] = [
        "title",
        "content",
        "description",
        "author",
        "any",
      ];

      fields.forEach((field) => {
        const json = JSON.stringify([
          { field, matchType: "contains", pattern: "test" },
        ]);
        const result = parseFiltersJson(json);
        expect(result?.[0]?.field).toBe(field);
      });
    });

    it("should parse all valid matchType values", () => {
      const matchTypes: FilterData["matchType"][] = [
        "contains",
        "regex",
        "exact",
      ];

      matchTypes.forEach((matchType) => {
        const json = JSON.stringify([
          { field: "title", matchType, pattern: "test" },
        ]);
        const result = parseFiltersJson(json);
        expect(result?.[0]?.matchType).toBe(matchType);
      });
    });

    it("should handle multiple valid filters", () => {
      const json = JSON.stringify([
        { field: "title", matchType: "contains", pattern: "news" },
        {
          field: "author",
          matchType: "exact",
          pattern: "John Doe",
          caseSensitive: true,
        },
        { field: "any", matchType: "regex", pattern: "tech.*" },
      ]);

      const result = parseFiltersJson(json);

      expect(result).toHaveLength(3);
      expect(result?.[0]).toEqual({
        field: "title",
        matchType: "contains",
        pattern: "news",
        caseSensitive: false,
      });
      expect(result?.[1]).toEqual({
        field: "author",
        matchType: "exact",
        pattern: "John Doe",
        caseSensitive: true,
      });
      expect(result?.[2]).toEqual({
        field: "any",
        matchType: "regex",
        pattern: "tech.*",
        caseSensitive: false,
      });
    });

    it("should return empty array for array with only invalid items", () => {
      const json = JSON.stringify([
        { invalid: "object" },
        null,
        "string",
      ]);

      const result = parseFiltersJson(json);

      expect(result).toEqual([]);
    });
  });

  describe("parseCategoriesJson", () => {
    it("should return null for undefined input", () => {
      expect(parseCategoriesJson(undefined)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseCategoriesJson("")).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      expect(parseCategoriesJson("not valid json")).toBeNull();
    });

    it("should return null for non-array JSON", () => {
      expect(parseCategoriesJson('"string"')).toBeNull();
    });

    it("should parse valid categories array", () => {
      const json = JSON.stringify(["Technology", "News", "Sports"]);

      const result = parseCategoriesJson(json);

      expect(result).toEqual(["Technology", "News", "Sports"]);
    });

    it("should filter out empty strings", () => {
      const json = JSON.stringify(["Technology", "", "News"]);

      const result = parseCategoriesJson(json);

      expect(result).toEqual(["Technology", "News"]);
    });

    it("should filter out whitespace-only strings", () => {
      const json = JSON.stringify(["Technology", "   ", "News", "\t\n"]);

      const result = parseCategoriesJson(json);

      expect(result).toEqual(["Technology", "News"]);
    });

    it("should filter out non-string values", () => {
      const json = JSON.stringify(["Technology", 123, null, true, "News"]);

      const result = parseCategoriesJson(json);

      expect(result).toEqual(["Technology", "News"]);
    });

    it("should return empty array for array with only invalid items", () => {
      const json = JSON.stringify([null, 123, "", "   "]);

      const result = parseCategoriesJson(json);

      expect(result).toEqual([]);
    });

    it("should preserve categories with leading/trailing whitespace", () => {
      const json = JSON.stringify(["  Technology  ", "News"]);

      const result = parseCategoriesJson(json);

      // Should include the string since it has non-whitespace content
      expect(result).toEqual(["  Technology  ", "News"]);
    });
  });

  describe("parseBoolean", () => {
    it("should return false for undefined", () => {
      expect(parseBoolean(undefined)).toBe(false);
    });

    it("should return true for boolean true", () => {
      expect(parseBoolean(true)).toBe(true);
    });

    it("should return false for boolean false", () => {
      expect(parseBoolean(false)).toBe(false);
    });

    it("should return true for string 'true'", () => {
      expect(parseBoolean("true")).toBe(true);
    });

    it("should return true for string 'TRUE' (case insensitive)", () => {
      expect(parseBoolean("TRUE")).toBe(true);
    });

    it("should return true for string 'True' (case insensitive)", () => {
      expect(parseBoolean("True")).toBe(true);
    });

    it("should return false for string 'false'", () => {
      expect(parseBoolean("false")).toBe(false);
    });

    it("should return false for other strings", () => {
      expect(parseBoolean("yes")).toBe(false);
      expect(parseBoolean("1")).toBe(false);
      expect(parseBoolean("")).toBe(false);
      expect(parseBoolean("no")).toBe(false);
    });
  });
});
