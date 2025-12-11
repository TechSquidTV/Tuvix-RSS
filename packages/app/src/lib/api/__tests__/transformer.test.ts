/**
 * SuperJSON Transformer Tests
 *
 * Tests for the tRPC v11 transformer wrapper around SuperJSON
 */

import { describe, it, expect } from "vitest";
import { serializeData, deserializeData, transformer } from "../transformer";

describe("serializeData", () => {
  it("should serialize primitive values", () => {
    const result = serializeData("hello");
    expect(result).toHaveProperty("json");
    expect(result.json).toBe("hello");
  });

  it("should serialize objects", () => {
    const obj = { name: "test", value: 123 };
    const result = serializeData(obj);
    expect(result.json).toEqual(obj);
  });

  it("should serialize Date objects with type metadata", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const result = serializeData({ date });
    expect(result.json).toHaveProperty("date");
    expect(result.meta).toBeDefined();
  });

  it("should serialize arrays", () => {
    const arr = [1, 2, 3];
    const result = serializeData(arr);
    expect(result.json).toEqual(arr);
  });

  it("should serialize nested objects", () => {
    const nested = { outer: { inner: { value: "deep" } } };
    const result = serializeData(nested);
    expect(result.json).toEqual(nested);
  });

  it("should handle null values", () => {
    const result = serializeData(null);
    expect(result.json).toBeNull();
  });

  it("should handle undefined values (converts to null in JSON)", () => {
    const result = serializeData(undefined);
    // JSON doesn't support undefined, so SuperJSON converts it to null
    expect(result.json).toBeNull();
  });
});

describe("deserializeData", () => {
  it("should deserialize primitive values", () => {
    const serialized = { json: "hello" };
    const result = deserializeData(serialized);
    expect(result).toBe("hello");
  });

  it("should deserialize objects", () => {
    const obj = { name: "test", value: 123 };
    const serialized = { json: obj };
    const result = deserializeData(serialized);
    expect(result).toEqual(obj);
  });

  it("should deserialize Date objects back to Date instances", () => {
    const date = new Date("2024-01-15T12:00:00Z");
    const serialized = serializeData({ date });
    const result = deserializeData(serialized) as { date: Date };
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.toISOString()).toBe(date.toISOString());
  });

  it("should deserialize arrays", () => {
    const arr = [1, 2, 3];
    const serialized = { json: arr };
    const result = deserializeData(serialized);
    expect(result).toEqual(arr);
  });

  it("should handle null values", () => {
    const serialized = { json: null };
    const result = deserializeData(serialized);
    expect(result).toBeNull();
  });
});

describe("transformer", () => {
  it("should have input.serialize function", () => {
    expect(typeof transformer.input.serialize).toBe("function");
  });

  it("should have input.deserialize function", () => {
    expect(typeof transformer.input.deserialize).toBe("function");
  });

  it("should have output.serialize function", () => {
    expect(typeof transformer.output.serialize).toBe("function");
  });

  it("should have output.deserialize function", () => {
    expect(typeof transformer.output.deserialize).toBe("function");
  });

  it("should serialize and deserialize round-trip correctly", () => {
    const data = {
      id: 1,
      name: "Test",
      createdAt: new Date("2024-01-15T12:00:00Z"),
      tags: ["a", "b", "c"],
      nested: { value: 42 },
    };

    // Use output for responses (what the client receives)
    const serialized = transformer.output.serialize(data);
    const deserialized = transformer.output.deserialize(
      serialized,
    ) as typeof data;

    expect(deserialized.id).toBe(data.id);
    expect(deserialized.name).toBe(data.name);
    expect(deserialized.createdAt).toBeInstanceOf(Date);
    expect(deserialized.createdAt.toISOString()).toBe(
      data.createdAt.toISOString(),
    );
    expect(deserialized.tags).toEqual(data.tags);
    expect(deserialized.nested).toEqual(data.nested);
  });

  it("should handle tRPC-style wrapped responses", () => {
    // Simulate what the server sends back
    const serverResponse = {
      items: [
        { id: 1, title: "Item 1" },
        { id: 2, title: "Item 2" },
      ],
      total: 2,
      hasMore: false,
    };

    const serialized = transformer.output.serialize(serverResponse);
    const deserialized = transformer.output.deserialize(
      serialized,
    ) as typeof serverResponse;

    expect(deserialized.items).toHaveLength(2);
    expect(deserialized.total).toBe(2);
    expect(deserialized.hasMore).toBe(false);
  });
});
