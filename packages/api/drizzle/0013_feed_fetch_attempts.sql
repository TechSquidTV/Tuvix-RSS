ALTER TABLE `sources` ADD `last_fetch_attempt_at` integer;--> statement-breakpoint
UPDATE `sources` SET `last_fetch_attempt_at` = `last_fetched`;--> statement-breakpoint
CREATE INDEX `idx_sources_last_fetch_attempt_at` ON `sources` (`last_fetch_attempt_at`);
