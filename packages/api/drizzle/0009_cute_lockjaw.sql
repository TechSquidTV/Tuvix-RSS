ALTER TABLE `user` ADD `last_seen_at` integer;--> statement-breakpoint
CREATE INDEX `idx_user_last_seen_at` ON `user` (`last_seen_at`);