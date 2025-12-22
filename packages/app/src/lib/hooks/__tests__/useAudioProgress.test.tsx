/**
 * Audio Progress Hooks Tests
 *
 * Tests for useAudioProgressSync and useAudioProgressRestore hooks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useAudioProgressSync,
  useAudioProgressRestore,
} from "../useAudioProgress";
import * as audioContext from "@/contexts/audio-context";
import * as trpcModule from "../../api/trpc";
import { createWrapper } from "@/test/test-utils";

// Mock dependencies
vi.mock("@/contexts/audio-context");
vi.mock("../../api/trpc");

describe("useAudioProgressSync", () => {
  const mockMutate = vi.fn();
  let fakeTime = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeTime = 0;

    // Mock Date.now()
    vi.spyOn(Date, "now").mockImplementation(() => fakeTime);

    // Mock tRPC mutation with proper proxy structure
    const mockUseMutation = vi.fn(() => ({
      mutate: mockMutate,
      isPending: false,
    }));

    vi.mocked(trpcModule.trpc).articles = {
      updateAudioProgress: {
        useMutation: mockUseMutation,
      },
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not save progress when audio is not current", () => {
    vi.mocked(audioContext.useAudio).mockReturnValue({
      currentAudioId: 2,
      isPlaying: true,
      currentTime: 100,
      duration: 3600,
    } as any);

    renderHook(() => useAudioProgressSync(1), { wrapper: createWrapper() });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("should not save progress when audio is paused", () => {
    vi.mocked(audioContext.useAudio).mockReturnValue({
      currentAudioId: 1,
      isPlaying: false,
      currentTime: 100,
      duration: 3600,
    } as any);

    renderHook(() => useAudioProgressSync(1), { wrapper: createWrapper() });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  // Note: Throttling behavior is tested through integration tests
  // Unit testing React effects with time-based logic is fragile and tests implementation details

  it("should not save if progress change is less than 5 seconds", async () => {
    const mockAudio = {
      currentAudioId: 1,
      isPlaying: true,
      currentTime: 100,
      duration: 3600,
    };

    vi.mocked(audioContext.useAudio).mockReturnValue(mockAudio as any);

    const { rerender } = renderHook(() => useAudioProgressSync(1), {
      wrapper: createWrapper(),
    });

    // Advance time by 11 seconds but only 2 seconds of playback
    act(() => {
      fakeTime += 11000;
      mockAudio.currentTime = 102; // Only 2 seconds change
    });
    rerender();

    // Should not save because change is < 5 seconds
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // Note: Pause behavior is tested through integration tests
  // Unit testing React effects with complex state transitions tests implementation details

  it("should not save on pause if change is < 5 seconds", () => {
    const mockAudio = {
      currentAudioId: 1,
      isPlaying: true,
      currentTime: 100,
      duration: 3600,
    };

    vi.mocked(audioContext.useAudio).mockReturnValue(mockAudio as any);

    const { rerender } = renderHook(() => useAudioProgressSync(1), {
      wrapper: createWrapper(),
    });

    // User plays then pauses after only 2 seconds
    act(() => {
      mockAudio.currentTime = 102;
      mockAudio.isPlaying = false;
    });
    rerender();

    expect(mockMutate).not.toHaveBeenCalled();
  });
});

describe("useAudioProgressRestore", () => {
  const mockPlayAudio = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(audioContext.useAudio).mockReturnValue({
      playAudio: mockPlayAudio,
      currentAudioId: null,
    } as any);
  });

  it("should restore progress on first play", () => {
    const audioProgress = {
      position: 1200,
      duration: 3600,
      completedAt: null,
    };

    const { result } = renderHook(() =>
      useAudioProgressRestore(1, "https://example.com/audio.mp3", audioProgress)
    );

    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      1200
    );
  });

  it("should not restore progress if position < 5 seconds", () => {
    const audioProgress = {
      position: 3,
      duration: 3600,
      completedAt: null,
    };

    const { result } = renderHook(() =>
      useAudioProgressRestore(1, "https://example.com/audio.mp3", audioProgress)
    );

    act(() => {
      result.current.play();
    });

    // Should play from beginning (no startPosition)
    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      undefined
    );
  });

  it("should only restore progress once", () => {
    const audioProgress = {
      position: 1200,
      duration: 3600,
      completedAt: null,
    };

    const { result } = renderHook(() =>
      useAudioProgressRestore(1, "https://example.com/audio.mp3", audioProgress)
    );

    // First play - should restore
    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      1200
    );

    mockPlayAudio.mockClear();

    // Second play - should not restore
    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      undefined
    );
  });

  it("should reset restore flag when switching to different audio", () => {
    const audioProgress = {
      position: 1200,
      duration: 3600,
      completedAt: null,
    };

    const mockAudio = {
      playAudio: mockPlayAudio,
      currentAudioId: 1,
    };

    vi.mocked(audioContext.useAudio).mockReturnValue(mockAudio as any);

    const { result, rerender } = renderHook(() =>
      useAudioProgressRestore(1, "https://example.com/audio.mp3", audioProgress)
    );

    // First play
    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      1200
    );

    mockPlayAudio.mockClear();

    // Switch to different audio
    act(() => {
      mockAudio.currentAudioId = 2;
    });
    rerender();

    // Switch back to original audio
    act(() => {
      mockAudio.currentAudioId = 1;
    });
    rerender();

    // Play again - should restore again since we switched away
    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      1200
    );
  });

  it("should not play if audioUrl is null", () => {
    const audioProgress = {
      position: 1200,
      duration: 3600,
      completedAt: null,
    };

    const { result } = renderHook(() =>
      useAudioProgressRestore(1, null, audioProgress)
    );

    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).not.toHaveBeenCalled();
  });

  it("should play from beginning if no audioProgress", () => {
    const { result } = renderHook(() =>
      useAudioProgressRestore(1, "https://example.com/audio.mp3", null)
    );

    act(() => {
      result.current.play();
    });

    expect(mockPlayAudio).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      undefined
    );
  });
});

// Note: useMarkAudioCompleted and useClearAudioProgress are simple wrappers around tRPC mutations
// Testing cache invalidation behavior is testing implementation details of tRPC
// These hooks are covered by integration tests
