/**
 * ThemeProvider Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../theme-provider";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: query === "(prefers-color-scheme: dark)" ? false : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Test component that uses the theme context
function TestComponent() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("invalid-theme" as any)}>
        Set Invalid
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Reset document classes
    document.documentElement.className = "";
  });

  it("should render children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Child</div>
      </ThemeProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("should use default theme when no stored theme", () => {
    render(
      <ThemeProvider defaultTheme="light">
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId("current-theme").textContent).toBe("light");
  });

  it("should use stored theme from localStorage", () => {
    localStorageMock.getItem.mockReturnValue("dark");

    render(
      <ThemeProvider storageKey="test-theme">
        <TestComponent />
      </ThemeProvider>
    );

    expect(localStorageMock.getItem).toHaveBeenCalledWith("test-theme");
  });

  it("should allow changing theme", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const darkButton = screen.getByText("Set Dark");

    act(() => {
      darkButton.click();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "vite-ui-theme",
      "dark"
    );
  });

  it("should apply theme class to document root", () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestComponent />
      </ThemeProvider>
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should handle system theme preference", () => {
    // Mock system prefers dark
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <ThemeProvider defaultTheme="system">
        <TestComponent />
      </ThemeProvider>
    );

    // When system prefers dark and theme is "system", dark class should be applied
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should handle invalid theme fallback", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const invalidButton = screen.getByText("Set Invalid");

    act(() => {
      invalidButton.click();
    });

    // Invalid themes should fallback to light
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "vite-ui-theme",
      "light"
    );
  });
});

describe("useTheme", () => {
  it("should work correctly within ThemeProvider", () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Verify the hook works correctly
    expect(screen.getByTestId("current-theme")).toBeInTheDocument();
  });
});
