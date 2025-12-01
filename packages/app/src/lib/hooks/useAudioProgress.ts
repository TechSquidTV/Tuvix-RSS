import { trpc } from "../api/trpc";
import { useCallback, useEffect, useRef } from "react";
import { useAudio } from "@/contexts/audio-context";
import * as Sentry from "@sentry/react";

// Throttle delay for progress updates (10 seconds)
const PROGRESS_UPDATE_INTERVAL = 10_000;

// Minimum progress change to trigger update (5 seconds)
const MIN_PROGRESS_CHANGE = 5;

/**
 * Hook to automatically save audio progress during playback
 */
export function useAudioProgressSync(articleId: number) {
  const { currentAudioId, currentTime, duration, isPlaying } = useAudio();
  const updateMutation = trpc.articles.updateAudioProgress.useMutation({
    onError: (error) => {
      Sentry.captureException(error, {
        level: "error",
        tags: {
          component: "audio-progress",
          operation: "update",
          articleId: articleId.toString(),
        },
        extra: {
          currentTime,
          duration,
          isPlaying,
        },
      });
    },
    onSuccess: (data, variables) => {
      Sentry.addBreadcrumb({
        category: "audio",
        message: "Audio progress saved",
        level: "info",
        data: {
          articleId: variables.articleId,
          position: variables.position,
          duration: variables.duration,
        },
      });
    },
  });

  const lastSavedTime = useRef(0);
  const lastUpdateTime = useRef(0);
  const isCurrentAudio = currentAudioId === articleId;

  useEffect(() => {
    if (!isCurrentAudio || !isPlaying) {
      return;
    }

    // Throttle updates - only save every 10 seconds
    const now = Date.now();
    if (now - lastUpdateTime.current < PROGRESS_UPDATE_INTERVAL) {
      return;
    }

    // Skip if progress hasn't changed significantly
    if (Math.abs(currentTime - lastSavedTime.current) < MIN_PROGRESS_CHANGE) {
      return;
    }

    lastUpdateTime.current = now;
    lastSavedTime.current = currentTime;

    // Save progress with performance tracking
    Sentry.startSpan(
      {
        op: "audio.progress.update",
        name: "Update Audio Progress",
        attributes: {
          articleId,
          position: Math.floor(currentTime),
          duration: duration > 0 ? Math.floor(duration) : 0,
        },
      },
      () => {
        updateMutation.mutate({
          articleId,
          position: Math.floor(currentTime),
          duration: duration > 0 ? Math.floor(duration) : undefined,
        });
      },
    );
  }, [
    isCurrentAudio,
    currentTime,
    duration,
    isPlaying,
    articleId,
    updateMutation,
  ]);

  // Save progress on pause
  useEffect(() => {
    if (isCurrentAudio && !isPlaying && currentTime > 0) {
      // User paused - save current position
      const timeSinceLastSave = Math.abs(currentTime - lastSavedTime.current);
      if (timeSinceLastSave >= MIN_PROGRESS_CHANGE) {
        lastSavedTime.current = currentTime;

        Sentry.addBreadcrumb({
          category: "audio",
          message: "Saving progress on pause",
          level: "info",
          data: { position: Math.floor(currentTime) },
        });

        updateMutation.mutate({
          articleId,
          position: Math.floor(currentTime),
          duration: duration > 0 ? Math.floor(duration) : undefined,
        });
      }
    }
  }, [
    isPlaying,
    isCurrentAudio,
    currentTime,
    duration,
    articleId,
    updateMutation,
  ]);
}

/**
 * Hook to restore audio progress when playing
 */
export function useAudioProgressRestore(
  articleId: number,
  audioUrl: string | null,
  audioProgress: { position: number; duration: number | null } | null,
) {
  const { playAudio, currentAudioId } = useAudio();
  const hasRestored = useRef(false);

  const play = useCallback(() => {
    if (!audioUrl) {
      try {
        Sentry.captureMessage("Cannot play: audio URL is null", {
          level: "warning",
          tags: { component: "audio-progress", operation: "restore" },
          extra: { articleId },
        });
      } catch {
        // Sentry not available - silently ignore
      }
      return;
    }

    // Restore progress on first play
    const startPosition =
      !hasRestored.current &&
      audioProgress?.position &&
      audioProgress.position > 5
        ? audioProgress.position
        : undefined;

    if (startPosition !== undefined) {
      Sentry.addBreadcrumb({
        category: "audio",
        message: "Restoring audio progress on play",
        level: "info",
        data: {
          articleId,
          startPosition,
          totalDuration: audioProgress?.duration,
        },
      });
    }

    try {
      playAudio(articleId, audioUrl, startPosition);

      if (startPosition !== undefined) {
        hasRestored.current = true;
      }
    } catch (error) {
      Sentry.captureException(error, {
        level: "error",
        tags: { component: "audio-progress", operation: "restore-play" },
        extra: {
          articleId,
          audioUrl,
          startPosition,
        },
      });
    }
  }, [articleId, audioUrl, audioProgress, playAudio]);

  // Reset restore flag when switching audio
  useEffect(() => {
    if (currentAudioId !== articleId) {
      hasRestored.current = false;
    }
  }, [currentAudioId, articleId]);

  return { play };
}

/**
 * Mutation hook to mark audio as completed
 */
export function useMarkAudioCompleted() {
  const utils = trpc.useUtils();

  return trpc.articles.markAudioCompleted.useMutation({
    onSuccess: (data, variables) => {
      Sentry.addBreadcrumb({
        category: "audio",
        message: "Marked audio as completed",
        level: "info",
        data: { articleId: variables.articleId },
      });
      utils.articles.list.invalidate();
    },
    onError: (error, variables) => {
      Sentry.captureException(error, {
        level: "error",
        tags: {
          component: "audio-progress",
          operation: "mark-completed",
          articleId: variables.articleId.toString(),
        },
      });
    },
  });
}

/**
 * Mutation hook to clear audio progress
 */
export function useClearAudioProgress() {
  const utils = trpc.useUtils();

  return trpc.articles.clearAudioProgress.useMutation({
    onSuccess: (data, variables) => {
      Sentry.addBreadcrumb({
        category: "audio",
        message: "Cleared audio progress",
        level: "info",
        data: { articleId: variables.articleId },
      });
      utils.articles.list.invalidate();
    },
    onError: (error, variables) => {
      Sentry.captureException(error, {
        level: "error",
        tags: {
          component: "audio-progress",
          operation: "clear-progress",
          articleId: variables.articleId.toString(),
        },
      });
    },
  });
}
