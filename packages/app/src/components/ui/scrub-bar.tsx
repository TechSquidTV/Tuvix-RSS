import * as React from "react";
import { cn } from "@/lib/utils";

interface ScrubBarContextValue {
  duration: number;
  value: number;
  onScrub?: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}

const ScrubBarContext = React.createContext<ScrubBarContextValue | null>(null);

function useScrubBar() {
  const context = React.useContext(ScrubBarContext);
  if (!context) {
    throw new Error(
      "ScrubBar components must be used within ScrubBarContainer",
    );
  }
  return context;
}

interface ScrubBarContainerProps {
  duration: number;
  value: number;
  onScrub?: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function ScrubBarContainer({
  duration,
  value,
  onScrub,
  onScrubStart,
  onScrubEnd,
  children,
  className,
}: ScrubBarContainerProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <ScrubBarContext.Provider
      value={{
        duration,
        value,
        onScrub,
        onScrubStart,
        onScrubEnd,
        isDragging,
        setIsDragging,
      }}
    >
      <div className={cn("flex items-center gap-2", className)}>{children}</div>
    </ScrubBarContext.Provider>
  );
}

interface ScrubBarTrackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function ScrubBarTrack({
  children,
  className,
  ...props
}: ScrubBarTrackProps) {
  const { duration, onScrub, onScrubStart, onScrubEnd, setIsDragging } =
    useScrubBar();
  const trackRef = React.useRef<HTMLDivElement>(null);

  const handlePointerMove = React.useCallback(
    (e: PointerEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      const time = percentage * duration;
      onScrub?.(time);
    },
    [duration, onScrub],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;

    // Prevent swipe gestures from interfering with scrubbing
    e.stopPropagation();

    setIsDragging(true);
    onScrubStart?.();

    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const time = percentage * duration;
    onScrub?.(time);

    const handlePointerUp = () => {
      setIsDragging(false);
      onScrubEnd?.();
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative flex h-2 w-full cursor-pointer items-center",
        className,
      )}
      onPointerDown={handlePointerDown}
      {...props}
    >
      {children}
    </div>
  );
}

export function ScrubBarProgress({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { duration, value } = useScrubBar();
  const percentage = duration > 0 ? (value / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "absolute left-0 h-full w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export function ScrubBarThumb({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { duration, value, isDragging } = useScrubBar();
  const percentage = duration > 0 ? (value / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "absolute h-4 w-4 rounded-full bg-primary transition-transform",
        isDragging && "scale-125",
        className,
      )}
      style={{
        left: `${percentage}%`,
        top: "50%",
        transform: `translate(-50%, -50%) ${isDragging ? "scale(1.25)" : ""}`,
      }}
      {...props}
    />
  );
}

interface ScrubBarTimeLabelProps {
  time: number;
  format?: (time: number) => string;
  className?: string;
}

function defaultTimeFormat(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ScrubBarTimeLabel({
  time,
  format = defaultTimeFormat,
  className,
}: ScrubBarTimeLabelProps) {
  return (
    <span
      className={cn("text-sm tabular-nums text-muted-foreground", className)}
    >
      {format(time)}
    </span>
  );
}
