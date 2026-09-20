/** Single source of truth for execution intervals and Sentry monitoring. */
export const CRON_SCHEDULES = {
  "rss-fetch": { minutes: 1 },
  "article-prune": { minutes: 24 * 60 },
  "token-cleanup": { minutes: 7 * 24 * 60 },
} as const;
