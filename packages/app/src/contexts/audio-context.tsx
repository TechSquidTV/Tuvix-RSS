import * as React from "react";
import { getStrictContext } from "@/lib/get-strict-context";
import * as Sentry from "@sentry/react";

interface AudioContextValue {
  currentAudioId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioUrl: string | null;
  playAudio: (
    articleId: number,
    audioUrl: string,
    startPosition?: number
  ) => void;
  pauseAudio: () => void;
  stopAudio: () => void;
  seekTo: (time: number) => void;
}

const [AudioProvider, useAudio] =
  getStrictContext<AudioContextValue>("AudioContext");

function AudioContextProvider({ children }: { children: React.ReactNode }) {
  const [currentAudioId, setCurrentAudioId] = React.useState<number | null>(
    null
  );
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  React.useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    // Event listeners with error handling
    const handleTimeUpdate = () => {
      try {
        setCurrentTime(audio.currentTime);
      } catch (error) {
        Sentry.captureException(error, {
          level: "warning",
          tags: { component: "audio-context", event: "timeupdate" },
        });
      }
    };

    const handleLoadedMetadata = () => {
      try {
        setDuration(audio.duration);
        Sentry.addBreadcrumb({
          category: "audio",
          message: "Audio metadata loaded",
          level: "info",
          data: { duration: audio.duration },
        });
      } catch (error) {
        Sentry.captureException(error, {
          level: "error",
          tags: { component: "audio-context", event: "loadedmetadata" },
        });
      }
    };

    const handleEnded = () => {
      try {
        setIsPlaying(false);
        setCurrentTime(0);
        Sentry.addBreadcrumb({
          category: "audio",
          message: "Audio playback completed",
          level: "info",
        });
      } catch (error) {
        Sentry.captureException(error, {
          level: "warning",
          tags: { component: "audio-context", event: "ended" },
        });
      }
    };

    const handlePlay = () => {
      try {
        setIsPlaying(true);
      } catch (error) {
        Sentry.captureException(error, {
          level: "warning",
          tags: { component: "audio-context", event: "play" },
        });
      }
    };

    const handlePause = () => {
      try {
        setIsPlaying(false);
      } catch (error) {
        Sentry.captureException(error, {
          level: "warning",
          tags: { component: "audio-context", event: "pause" },
        });
      }
    };

    const handleError = () => {
      const audioError = audio.error;
      Sentry.captureException(new Error("Audio element error"), {
        level: "error",
        tags: { component: "audio-context", event: "error" },
        extra: {
          errorCode: audioError?.code,
          errorMessage: audioError?.message,
          audioUrl: audio.src,
          networkState: audio.networkState,
          readyState: audio.readyState,
        },
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const playAudio = React.useCallback(
    (articleId: number, url: string, startPosition?: number) => {
      return Sentry.startSpan(
        {
          op: "audio.play",
          name: "Play Audio",
          attributes: {
            articleId,
            hasStartPosition: !!startPosition,
            startPosition: startPosition || 0,
          },
        },
        () => {
          const audio = audioRef.current;
          if (!audio) {
            try {
              Sentry.captureMessage("Audio ref not available", {
                level: "warning",
                tags: { component: "audio-context", operation: "play" },
              });
            } catch {
              // Sentry not available - silently ignore
            }
            return;
          }

          // If switching to a different audio file
          if (currentAudioId !== articleId || audioUrl !== url) {
            Sentry.addBreadcrumb({
              category: "audio",
              message: "Loading new audio file",
              level: "info",
              data: { articleId, url, startPosition },
            });

            audio.src = url;
            setCurrentAudioId(articleId);
            setAudioUrl(url);
            setCurrentTime(0);
            audio.load();

            // Restore progress if provided
            if (startPosition !== undefined && startPosition > 0) {
              try {
                audio.currentTime = startPosition;
                setCurrentTime(startPosition);
                Sentry.addBreadcrumb({
                  category: "audio",
                  message: "Restored playback position",
                  level: "info",
                  data: { position: startPosition },
                });
              } catch (error) {
                Sentry.captureException(error, {
                  level: "warning",
                  tags: {
                    component: "audio-context",
                    operation: "restore-position",
                  },
                  extra: { startPosition },
                });
              }
            }
          }

          audio.play().catch((error: Error) => {
            Sentry.captureException(error, {
              level: "error",
              tags: {
                component: "audio-context",
                operation: "play",
                errorName: error.name,
              },
              extra: {
                articleId,
                audioUrl: url,
                errorMessage: error.message,
                readyState: audio.readyState,
                networkState: audio.networkState,
              },
            });
          });
        }
      );
    },
    [currentAudioId, audioUrl]
  );

  const pauseAudio = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  const stopAudio = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  const seekTo = React.useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      try {
        Sentry.captureMessage("Cannot seek: audio ref not available", {
          level: "warning",
          tags: { component: "audio-context", operation: "seek" },
        });
      } catch {
        // Sentry not available - silently ignore
      }
      return;
    }

    try {
      const clampedTime = Math.max(0, Math.min(time, audio.duration));
      audio.currentTime = clampedTime;

      Sentry.addBreadcrumb({
        category: "audio",
        message: "Seeked to position",
        level: "info",
        data: {
          requestedTime: time,
          actualTime: clampedTime,
          duration: audio.duration,
        },
      });
    } catch (error) {
      Sentry.captureException(error, {
        level: "error",
        tags: { component: "audio-context", operation: "seek" },
        extra: {
          requestedTime: time,
          currentTime: audio.currentTime,
          duration: audio.duration,
          readyState: audio.readyState,
        },
      });
    }
  }, []);

  const value: AudioContextValue = {
    currentAudioId,
    isPlaying,
    currentTime,
    duration,
    audioUrl,
    playAudio,
    pauseAudio,
    stopAudio,
    seekTo,
  };

  return <AudioProvider value={value}>{children}</AudioProvider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export { AudioContextProvider, useAudio };

export type { AudioContextValue };
