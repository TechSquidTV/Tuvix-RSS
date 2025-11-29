/**
 * useSwipeable Hook Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock motion/react
vi.mock("motion/react", () => ({
  useMotionValue: vi.fn(() => ({
    get: vi.fn(() => 0),
    set: vi.fn(),
  })),
  useTransform: vi.fn((value, input, output) => ({
    get: vi.fn(() => output[Math.floor(output.length / 2)]),
  })),
  useAnimation: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  })),
}));

import { useSwipeable } from "../use-swipeable";

describe("useSwipeable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return swipeable controls", () => {
    const { result } = renderHook(() => useSwipeable({}));

    expect(result.current).toHaveProperty("x");
    expect(result.current).toHaveProperty("onDragStart");
    expect(result.current).toHaveProperty("onDragEnd");
    expect(result.current).toHaveProperty("controls");
    expect(result.current).toHaveProperty("isDragging");
  });

  it("should start with isDragging false", () => {
    const { result } = renderHook(() => useSwipeable({}));

    expect(result.current.isDragging).toBe(false);
  });

  it("should set isDragging to true when onDragStart is called", () => {
    const { result } = renderHook(() => useSwipeable({}));

    act(() => {
      result.current.onDragStart?.();
    });

    expect(result.current.isDragging).toBe(true);
  });

  it("should use default thresholds when not provided", () => {
    const { result } = renderHook(() => useSwipeable({}));

    // Just verify the hook returns values - the actual thresholds are used internally
    expect(result.current).toBeDefined();
  });

  it("should accept custom thresholds", () => {
    const { result } = renderHook(() =>
      useSwipeable({
        leftThreshold: 200,
        rightThreshold: 150,
      }),
    );

    expect(result.current).toBeDefined();
  });

  it("should call onSwipeLeft callback when swiped left", async () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeable({
        onSwipeLeft,
      }),
    );

    await act(async () => {
      await result.current.onDragEnd(
        {} as PointerEvent,
        {
          offset: { x: -150 },
          velocity: { x: -100 },
        } as any,
      );
    });

    expect(onSwipeLeft).toHaveBeenCalled();
  });

  it("should call onSwipeRight callback when swiped right", async () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeable({
        onSwipeRight,
      }),
    );

    await act(async () => {
      await result.current.onDragEnd(
        {} as PointerEvent,
        {
          offset: { x: 150 },
          velocity: { x: 100 },
        } as any,
      );
    });

    expect(onSwipeRight).toHaveBeenCalled();
  });

  it("should not call callbacks when disabled", async () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeable({
        onSwipeLeft,
        onSwipeRight,
        disabled: true,
      }),
    );

    await act(async () => {
      await result.current.onDragEnd(
        {} as PointerEvent,
        {
          offset: { x: -150 },
          velocity: { x: -100 },
        } as any,
      );
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("should not call callbacks when below threshold", async () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeable({
        onSwipeLeft,
        onSwipeRight,
      }),
    );

    await act(async () => {
      // Small offset, should not trigger
      await result.current.onDragEnd(
        {} as PointerEvent,
        {
          offset: { x: 10 },
          velocity: { x: 10 },
        } as any,
      );
    });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("should trigger swipe on high velocity even with low offset", async () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeable({
        onSwipeRight,
      }),
    );

    await act(async () => {
      // Small offset but high velocity
      await result.current.onDragEnd(
        {} as PointerEvent,
        {
          offset: { x: 50 },
          velocity: { x: 600 },
        } as any,
      );
    });

    expect(onSwipeRight).toHaveBeenCalled();
  });
});
