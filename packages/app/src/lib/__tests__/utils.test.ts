/**
 * Utils Tests
 */

import { describe, it, expect } from "vitest";
import { cn, getPublicBaseUrl } from "../utils";

describe("Utils", () => {
  describe("cn", () => {
    it("should merge class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("should handle conditional classes", () => {
      expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
    });

    it("should merge tailwind classes properly", () => {
      expect(cn("px-2", "px-4")).toBe("px-4");
    });

    it("should handle arrays", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    it("should handle objects", () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });

    it("should handle empty input", () => {
      expect(cn()).toBe("");
    });

    it("should handle undefined and null", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });
  });

  describe("getPublicBaseUrl", () => {
    it("should return the API origin for public feeds", () => {
      const result = getPublicBaseUrl();
      const apiUrl =
        import.meta.env.VITE_PUBLIC_URL ||
        import.meta.env.VITE_API_URL ||
        "http://localhost:3001/trpc";
      expect(result).toBe(new URL(apiUrl, window.location.origin).origin);
    });

    it("should return a URL string", () => {
      const result = getPublicBaseUrl();
      // Should return a valid URL origin (starts with http/https)
      expect(result.startsWith("http")).toBe(true);
    });
  });
});
