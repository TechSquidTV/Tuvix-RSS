/**
 * getStrictContext Tests
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getStrictContext } from "../get-strict-context";
import React from "react";

describe("getStrictContext", () => {
  it("should create a provider and hook pair", () => {
    const [Provider, useContext] = getStrictContext<string>("TestContext");
    expect(Provider).toBeDefined();
    expect(useContext).toBeDefined();
    expect(typeof Provider).toBe("function");
    expect(typeof useContext).toBe("function");
  });

  it("should provide value to children", () => {
    const [Provider, useValue] = getStrictContext<string>("TestContext");

    function Consumer() {
      const value = useValue();
      return <div data-testid="value">{value}</div>;
    }

    render(
      <Provider value="test-value">
        <Consumer />
      </Provider>
    );

    expect(screen.getByTestId("value").textContent).toBe("test-value");
  });

  it("should provide object values", () => {
    interface TestValue {
      name: string;
      count: number;
    }

    const [Provider, useValue] = getStrictContext<TestValue>("TestContext");

    function Consumer() {
      const { name, count } = useValue();
      return (
        <div>
          <span data-testid="name">{name}</span>
          <span data-testid="count">{count}</span>
        </div>
      );
    }

    render(
      <Provider value={{ name: "test", count: 42 }}>
        <Consumer />
      </Provider>
    );

    expect(screen.getByTestId("name").textContent).toBe("test");
    expect(screen.getByTestId("count").textContent).toBe("42");
  });

  it("should throw error when used outside provider with name", () => {
    const [, useValue] = getStrictContext<string>("MyContext");

    function Consumer() {
      useValue();
      return null;
    }

    // Suppress console.error for expected error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow(
      "useContext must be used within MyContext"
    );

    consoleSpy.mockRestore();
  });

  it("should throw error when used outside provider without name", () => {
    const [, useValue] = getStrictContext<string>();

    function Consumer() {
      useValue();
      return null;
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<Consumer />)).toThrow(
      "useContext must be used within a Provider"
    );

    consoleSpy.mockRestore();
  });
});
