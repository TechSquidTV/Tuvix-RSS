import * as React from "react";
import { getStrictContext } from "@/lib/get-strict-context";

interface AudioContextValue {
  currentAudioId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioUrl: string | null;
  playAudio: (articleId: number, audioUrl: string) => void;
  pauseAudio: () => void;
  stopAudio: () => void;
  seekTo: (time: number) => void;
}

const [AudioProvider, useAudio] =
  getStrictContext<AudioContextValue>("AudioContext");

function AudioContextProvider({ children }: { children: React.ReactNode }) {
  const [currentAudioId, setCurrentAudioId] = React.useState<number | null>(
    null,
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

    // Event listeners
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const playAudio = React.useCallback(
    (articleId: number, url: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      // If switching to a different audio file
      if (currentAudioId !== articleId || audioUrl !== url) {
        audio.src = url;
        setCurrentAudioId(articleId);
        setAudioUrl(url);
        setCurrentTime(0);
        audio.load();
      }

      audio.play().catch((error) => {
        console.error("Failed to play audio:", error);
      });
    },
    [currentAudioId, audioUrl],
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
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(time, audio.duration));
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

export { AudioContextProvider, useAudio };

export type { AudioContextValue };
