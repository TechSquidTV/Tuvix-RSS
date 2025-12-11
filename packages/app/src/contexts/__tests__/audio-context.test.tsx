import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AudioContextProvider, useAudio } from "../audio-context";

// Mock Sentry to avoid issues in tests
vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  startSpan: vi.fn((opts, fn) => fn()),
}));

// Mock Audio element with synchronous behavior for testing
class MockAudio {
  src = "";
  currentTime = 0;
  duration = 100;
  paused = true;
  volume = 1;
  readyState = 0;
  networkState = 0;
  error = null;

  private listeners: Record<string, Array<(event?: any) => void>> = {};

  addEventListener(event: string, handler: (event?: any) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: (event?: any) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (h) => h !== handler,
      );
    }
  }

  dispatchEvent(eventName: string) {
    const handlers = this.listeners[eventName] || [];
    handlers.forEach((handler) => handler());
  }

  load() {
    this.readyState = 4;
    this.dispatchEvent("loadedmetadata");
  }

  play() {
    this.paused = false;
    this.dispatchEvent("play");
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent("pause");
  }

  // Add ended event support
  end() {
    this.paused = true;
    this.currentTime = 0;
    this.dispatchEvent("ended");
  }

  // Add error event support
  triggerError(code: number = 4, message: string = "Media error") {
    this.error = { code, message } as any;
    this.dispatchEvent("error");
  }
}

describe("AudioContext", () => {
  let mockAudioInstance: MockAudio;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a new mock audio instance for each test
    mockAudioInstance = new MockAudio();

    // Mock the global Audio constructor - must be a proper constructor function
    global.Audio = class {
      constructor() {
        return mockAudioInstance;
      }
    } as any;
  });

  it("provides audio context to children", () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return (
        <div>
          <div data-testid="audio-id">{audio.currentAudioId ?? "null"}</div>
          <div data-testid="is-playing">
            {audio.isPlaying ? "true" : "false"}
          </div>
        </div>
      );
    };

    render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    expect(screen.getByTestId("audio-id")).toHaveTextContent("null");
    expect(screen.getByTestId("is-playing")).toHaveTextContent("false");
  });

  it("playAudio updates state and plays audio", async () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return (
        <div>
          <button
            onClick={() =>
              audio.playAudio(1, "https://example.com/audio.mp3", 0)
            }
          >
            Play
          </button>
          <div data-testid="audio-id">{audio.currentAudioId ?? "null"}</div>
          <div data-testid="is-playing">
            {audio.isPlaying ? "true" : "false"}
          </div>
          <div data-testid="audio-url">{audio.audioUrl ?? "null"}</div>
        </div>
      );
    };

    const { getByText } = render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    // Initially not playing
    expect(screen.getByTestId("is-playing")).toHaveTextContent("false");

    // Click play button
    await act(async () => {
      getByText("Play").click();
    });

    // State should be updated
    expect(screen.getByTestId("audio-id")).toHaveTextContent("1");
    expect(screen.getByTestId("is-playing")).toHaveTextContent("true");
    expect(screen.getByTestId("audio-url")).toHaveTextContent(
      "https://example.com/audio.mp3",
    );
  });

  it("pauseAudio pauses playback", async () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return (
        <div>
          <button
            onClick={() =>
              audio.playAudio(1, "https://example.com/audio.mp3", 0)
            }
          >
            Play
          </button>
          <button onClick={() => audio.pauseAudio()}>Pause</button>
          <div data-testid="is-playing">
            {audio.isPlaying ? "true" : "false"}
          </div>
        </div>
      );
    };

    const { getByText } = render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    // Start playing
    await act(async () => {
      getByText("Play").click();
    });
    expect(screen.getByTestId("is-playing")).toHaveTextContent("true");

    // Pause
    await act(async () => {
      getByText("Pause").click();
    });
    expect(screen.getByTestId("is-playing")).toHaveTextContent("false");
  });

  it("stopAudio stops and resets playback", async () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return (
        <div>
          <button
            onClick={() =>
              audio.playAudio(1, "https://example.com/audio.mp3", 50)
            }
          >
            Play
          </button>
          <button onClick={() => audio.stopAudio()}>Stop</button>
          <div data-testid="is-playing">
            {audio.isPlaying ? "true" : "false"}
          </div>
          <div data-testid="current-time">{audio.currentTime}</div>
        </div>
      );
    };

    const { getByText } = render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    // Start playing
    await act(async () => {
      getByText("Play").click();
    });
    expect(screen.getByTestId("is-playing")).toHaveTextContent("true");

    // Stop
    await act(async () => {
      getByText("Stop").click();
    });
    expect(screen.getByTestId("is-playing")).toHaveTextContent("false");
    expect(screen.getByTestId("current-time")).toHaveTextContent("0");
  });

  it("seekTo updates current time", async () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return (
        <div>
          <button
            onClick={() =>
              audio.playAudio(1, "https://example.com/audio.mp3", 0)
            }
          >
            Play
          </button>
          <button onClick={() => audio.seekTo(30)}>Seek to 30</button>
          <div data-testid="current-time">{audio.currentTime}</div>
        </div>
      );
    };

    const { getByText } = render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    // Start playing
    await act(async () => {
      getByText("Play").click();
    });

    // Seek to position
    await act(async () => {
      getByText("Seek to 30").click();
    });

    expect(mockAudioInstance.currentTime).toBe(30);
  });

  it("updates currentTime on timeupdate event", async () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return <div data-testid="current-time">{audio.currentTime}</div>;
    };

    render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    // Simulate timeupdate event
    await act(async () => {
      mockAudioInstance.currentTime = 45;
      mockAudioInstance.dispatchEvent("timeupdate");
    });

    expect(screen.getByTestId("current-time")).toHaveTextContent("45");
  });

  it("updates duration on loadedmetadata event", async () => {
    const TestConsumer = () => {
      const audio = useAudio();
      return <div data-testid="duration">{audio.duration}</div>;
    };

    render(
      <AudioContextProvider>
        <TestConsumer />
      </AudioContextProvider>,
    );

    // Simulate loadedmetadata event
    await act(async () => {
      mockAudioInstance.duration = 200;
      mockAudioInstance.dispatchEvent("loadedmetadata");
    });

    expect(screen.getByTestId("duration")).toHaveTextContent("200");
  });
});
