import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { AudioPlayer } from "../audio-player";
import * as audioContext from "@/contexts/audio-context";
import * as useAudioProgressModule from "@/lib/hooks/useAudioProgress";

// Mock dependencies
vi.mock("@/contexts/audio-context");
vi.mock("@/lib/hooks/useAudioProgress");

describe("AudioPlayer", () => {
  const mockPauseAudio = vi.fn();
  const mockSeekTo = vi.fn();
  const mockPlay = vi.fn();
  const mockUseAudioProgressSync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock audio context with default values
    vi.mocked(audioContext.useAudio).mockReturnValue({
      currentAudioId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      audioUrl: null,
      playAudio: vi.fn(),
      pauseAudio: mockPauseAudio,
      stopAudio: vi.fn(),
      seekTo: mockSeekTo,
    });

    // Mock audio progress hooks
    vi.mocked(useAudioProgressModule.useAudioProgressSync).mockImplementation(
      mockUseAudioProgressSync
    );

    vi.mocked(useAudioProgressModule.useAudioProgressRestore).mockReturnValue({
      play: mockPlay,
    });
  });

  it("renders play button when not playing", () => {
    render(
      <AudioPlayer
        audioUrl="https://example.com/audio.mp3"
        articleId={1}
        title="Test Episode"
      />
    );

    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("calls play function when play button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <AudioPlayer
        audioUrl="https://example.com/audio.mp3"
        articleId={1}
        title="Test Episode"
      />
    );

    const playButton = screen.getByLabelText("Play");
    await user.click(playButton);

    expect(mockPlay).toHaveBeenCalled();
  });

  it("renders pause button when audio is playing", () => {
    vi.mocked(audioContext.useAudio).mockReturnValue({
      currentAudioId: 1,
      isPlaying: true,
      currentTime: 100,
      duration: 3600,
      audioUrl: "https://example.com/audio.mp3",
      playAudio: vi.fn(),
      pauseAudio: mockPauseAudio,
      stopAudio: vi.fn(),
      seekTo: mockSeekTo,
    });

    render(
      <AudioPlayer
        audioUrl="https://example.com/audio.mp3"
        articleId={1}
        title="Test Episode"
      />
    );

    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
  });

  it("calls pauseAudio when pause button is clicked", async () => {
    const user = userEvent.setup();

    vi.mocked(audioContext.useAudio).mockReturnValue({
      currentAudioId: 1,
      isPlaying: true,
      currentTime: 100,
      duration: 3600,
      audioUrl: "https://example.com/audio.mp3",
      playAudio: vi.fn(),
      pauseAudio: mockPauseAudio,
      stopAudio: vi.fn(),
      seekTo: mockSeekTo,
    });

    render(
      <AudioPlayer
        audioUrl="https://example.com/audio.mp3"
        articleId={1}
        title="Test Episode"
      />
    );

    const pauseButton = screen.getByLabelText("Pause");
    await user.click(pauseButton);

    expect(mockPauseAudio).toHaveBeenCalled();
  });

  it("displays saved progress when not currently playing", () => {
    render(
      <AudioPlayer
        audioUrl="https://example.com/audio.mp3"
        articleId={1}
        title="Test Episode"
        audioProgress={{
          position: 1200,
          duration: 3600,
          completedAt: null,
        }}
      />
    );

    expect(screen.getByText("20:00")).toBeInTheDocument(); // 1200 seconds
    expect(screen.getByText("60:00")).toBeInTheDocument(); // 3600 seconds
  });

  it("calls useAudioProgressRestore with correct parameters", () => {
    const audioProgress = {
      position: 1200,
      duration: 3600,
      completedAt: null,
    };

    render(
      <AudioPlayer
        audioUrl="https://example.com/audio.mp3"
        articleId={1}
        title="Test Episode"
        audioProgress={audioProgress}
      />
    );

    expect(useAudioProgressModule.useAudioProgressRestore).toHaveBeenCalledWith(
      1,
      "https://example.com/audio.mp3",
      audioProgress
    );
  });
});
