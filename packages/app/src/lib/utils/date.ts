/**
 * Format a date as relative time (e.g., "2 hours ago", "in 5 minutes")
 * Uses the built-in Intl.RelativeTimeFormat API instead of date-fns
 */
export function formatDistanceToNow(
  date: Date,
  options?: { addSuffix?: boolean },
): string {
  const rtf = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
    style: "long",
  });
  const now = new Date();
  const diffInSeconds = Math.floor((date.getTime() - now.getTime()) / 1000);

  const intervals: Array<{
    unit: Intl.RelativeTimeFormatUnit;
    seconds: number;
  }> = [
    { unit: "year", seconds: 31536000 },
    { unit: "month", seconds: 2592000 },
    { unit: "week", seconds: 604800 },
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];

  for (const { unit, seconds } of intervals) {
    const interval = Math.floor(Math.abs(diffInSeconds) / seconds);
    if (interval >= 1) {
      const value = diffInSeconds < 0 ? -interval : interval;
      const formatted = rtf.format(value, unit);
      // Intl.RelativeTimeFormat always includes "ago" or "in", so we handle addSuffix accordingly
      if (options?.addSuffix) {
        return formatted;
      }
      // Remove the suffix when addSuffix is false
      return formatted.replace(/^(in |ago )/, "").trim();
    }
  }

  // For very recent times (< 1 second)
  const formatted = rtf.format(0, "second");
  return options?.addSuffix
    ? formatted
    : formatted.replace(/^(in |ago )/, "").trim();
}

/**
 * Format a date string or Date object as relative time
 * Handles undefined/null values gracefully
 */
export function getRelativeTime(dateString?: string | Date | null): string {
  if (!dateString) return "Unknown";

  const date =
    typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

/**
 * Get color class based on how recent the last seen date is
 * - Green: < 24 hours ago
 * - Yellow: < 7 days ago
 * - Gray: > 7 days ago or never
 */
export function getLastSeenStatusColor(date: Date | null): string {
  if (!date) return "text-muted-foreground";

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInHours / 24;

  if (diffInHours < 24) {
    return "text-green-600";
  } else if (diffInDays < 7) {
    return "text-yellow-600";
  } else {
    return "text-muted-foreground";
  }
}
