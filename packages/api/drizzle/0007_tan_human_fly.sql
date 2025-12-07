CREATE INDEX `idx_categories_name` ON `categories` (`name`);--> statement-breakpoint
CREATE INDEX `idx_feeds_created_at` ON `feeds` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sources_last_fetched` ON `sources` (`last_fetched`);--> statement-breakpoint
CREATE INDEX `idx_user_plan` ON `user` (`plan`);--> statement-breakpoint
CREATE INDEX `idx_user_created_at` ON `user` (`created_at`);