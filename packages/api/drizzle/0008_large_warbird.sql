CREATE INDEX `idx_articles_source_published` ON `articles` (`source_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user_source` ON `subscriptions` (`user_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user_created` ON `subscriptions` (`user_id`,`created_at`);