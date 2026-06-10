-- Add failure tracking columns to sources table for circuit breaker pattern
ALTER TABLE `sources` ADD `consecutive_failures` integer NOT NULL DEFAULT 0;
ALTER TABLE `sources` ADD `last_error_at` integer;
ALTER TABLE `sources` ADD `fetch_disabled_at` integer;
CREATE INDEX `idx_sources_fetch_disabled_at` ON `sources` (`fetch_disabled_at`);