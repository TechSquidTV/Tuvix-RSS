import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PlayIcon, PauseIcon, Loader2Icon } from "lucide-react";
import {
  ScrubBarContainer,
  ScrubBarProgress,
  ScrubBarThumb,
  ScrubBarTimeLabel,
  ScrubBarTrack,
} from "@/components/ui/scrub-bar";
import { useAudio } from "@/contexts/audio-context";
import {
  useAudioProgressSync,
  useAudioProgressRestore,
} from "@/lib/hooks/useAudioProgress";

interface AudioPlayerProps {
  audioUrl: string;
  articleId: number;
  title?: string;
  className?: string;
  audioProgress?: {
    position: number;
    duration: number | null;
    completedAt: Date | null;
  } | null;
}

export function AudioPlayer({
  audioUrl,
  articleId,
  title,
  className,
  audioProgress,
}: AudioPlayerProps) {
  const {
    currentAudioId,
    isPlaying,
    currentTime,
    duration,
    pauseAudio,
    seekTo,
  } = useAudio();

  const [isLoading, setIsLoading] = React.useState(false);
  const isCurrentAudio = currentAudioId === articleId;
  const isCurrentlyPlaying = isCurrentAudio && isPlaying;

  // Auto-sync progress during playback
  useAudioProgressSync(articleId);

  // Restore progress on play
  const { play } = useAudioProgressRestore(
    articleId,
    audioUrl,
    audioProgress ?? null,
  );

  const handlePlayPause = () => {
    if (isCurrentlyPlaying) {
      pauseAudio();
    } else {
      setIsLoading(true);
      play();
      // Loading state will be cleared when audio starts playing
      setTimeout(() => setIsLoading(false), 1000);
    }
  };

  const handleScrub = (time: number) => {
    seekTo(time);
  };

  // Display time for this audio player
  const displayTime = isCurrentAudio ? currentTime : 0;
  const displayDuration = isCurrentAudio && duration > 0 ? duration : 0;

  return (
    <div
      className={cn("flex items-center gap-3", className)}
      aria-label={title ? `Audio player for ${title}` : "Audio player"}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0 rounded-full",
          isCurrentlyPlaying && "text-primary",
        )}
        onClick={handlePlayPause}
        disabled={isLoading}
        aria-label={isCurrentlyPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <Loader2Icon className="h-5 w-5 animate-spin" />
        ) : isCurrentlyPlaying ? (
          <PauseIcon className="h-5 w-5" />
        ) : (
          <PlayIcon className="h-5 w-5" />
        )}
      </Button>

      <div className="flex-1">
        <ScrubBarContainer
          duration={displayDuration}
          value={displayTime}
          onScrub={handleScrub}
          className="w-full"
        >
          <ScrubBarTimeLabel time={displayTime} className="text-xs" />
          <ScrubBarTrack className="mx-2 flex-1">
            <ScrubBarProgress />
            {isCurrentAudio && <ScrubBarThumb />}
          </ScrubBarTrack>
          <ScrubBarTimeLabel time={displayDuration} className="text-xs" />
        </ScrubBarContainer>
      </div>
    </div>
  );
}
