-- Add lastTokenCleanupAt column to track when token cleanup was last run
-- Used by cron executor to run cleanup weekly
ALTER TABLE global_settings ADD COLUMN last_token_cleanup_at INTEGER;
