CREATE TABLE `account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_usage_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`endpoint` text NOT NULL,
	`method` text NOT NULL,
	`status_code` integer NOT NULL,
	`duration_ms` integer,
	`ip_address` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_api_usage_log_user_id` ON `api_usage_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_api_usage_log_created_at` ON `api_usage_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_api_usage_log_endpoint` ON `api_usage_log` (`endpoint`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`guid` text NOT NULL,
	`title` text NOT NULL,
	`link` text,
	`description` text,
	`content` text,
	`author` text,
	`image_url` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_articles_source_id` ON `articles` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_articles_published_at` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_articles_guid` ON `articles` (`guid`);--> statement-breakpoint
CREATE UNIQUE INDEX `articles_source_id_guid_unique` ON `articles` (`source_id`,`guid`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`icon` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_categories_user_id` ON `categories` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_user_id_name_normalized` ON `categories` (`user_id`,LOWER("name"));--> statement-breakpoint
CREATE TABLE `feed_categories` (
	`feed_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`feed_id`, `category_id`),
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_feed_categories_feed_id` ON `feed_categories` (`feed_id`);--> statement-breakpoint
CREATE INDEX `idx_feed_categories_category_id` ON `feed_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`public` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_feeds_user_id` ON `feeds` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_feeds_slug` ON `feeds` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_user_id_slug_unique` ON `feeds` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `global_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`max_login_attempts` integer DEFAULT 5 NOT NULL,
	`login_attempt_window_minutes` integer DEFAULT 15 NOT NULL,
	`lockout_duration_minutes` integer DEFAULT 30 NOT NULL,
	`allow_registration` integer DEFAULT true NOT NULL,
	`require_email_verification` integer DEFAULT false NOT NULL,
	`password_reset_token_expiry_hours` integer DEFAULT 1 NOT NULL,
	`fetch_interval_minutes` integer DEFAULT 60 NOT NULL,
	`prune_days` integer DEFAULT 30 NOT NULL,
	`last_rss_fetch_at` integer,
	`last_prune_at` integer,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_token_unique` ON `password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_tokens_token` ON `password_reset_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_tokens_user_id` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`max_sources` integer NOT NULL,
	`max_public_feeds` integer NOT NULL,
	`max_categories` integer,
	`api_rate_limit_per_minute` integer NOT NULL,
	`public_feed_rate_limit_per_minute` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`features` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Seed default plans
-- Rate limits match plan-specific bindings: free=60, pro=180, enterprise=600
INSERT INTO `plans` (`id`, `name`, `max_sources`, `max_public_feeds`, `max_categories`, `api_rate_limit_per_minute`, `public_feed_rate_limit_per_minute`, `price_cents`, `features`, `created_at`, `updated_at`) VALUES
('free', 'Free', 100, 2, 50, 60, 2, 0, '{"description": "Perfect for personal use"}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('pro', 'Pro', 500, 25, 100, 180, 17, 1000, '{"description": "For power users and professionals"}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),
('enterprise', 'Enterprise', 10000, 200, NULL, 600, 167, 0, '{"description": "Unlimited for teams and organizations"}', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);
--> statement-breakpoint
CREATE TABLE `public_feed_access_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` integer NOT NULL,
	`ip_address` text NOT NULL,
	`user_agent` text,
	`accessed_at` integer NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_public_feed_access_log_feed_id` ON `public_feed_access_log` (`feed_id`);--> statement-breakpoint
CREATE INDEX `idx_public_feed_access_log_accessed_at` ON `public_feed_access_log` (`accessed_at`);--> statement-breakpoint
CREATE TABLE `security_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`metadata` text,
	`success` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_security_audit_log_user_id` ON `security_audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_security_audit_log_action` ON `security_audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `idx_security_audit_log_created_at` ON `security_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` integer NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`site_url` text,
	`icon_url` text,
	`icon_type` text DEFAULT 'auto',
	`icon_updated_at` integer,
	`last_fetched` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_url_unique` ON `sources` (`url`);--> statement-breakpoint
CREATE INDEX `idx_sources_url` ON `sources` (`url`);--> statement-breakpoint
CREATE INDEX `idx_sources_icon_url` ON `sources` (`icon_url`);--> statement-breakpoint
CREATE TABLE `subscription_categories` (
	`subscription_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`subscription_id`, `category_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_subscription_categories_subscription_id` ON `subscription_categories` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_subscription_categories_category_id` ON `subscription_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `subscription_filters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`field` text NOT NULL,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`case_sensitive` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_subscription_filters_subscription_id` ON `subscription_filters` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`custom_title` text,
	`filter_enabled` integer DEFAULT false NOT NULL,
	`filter_mode` text DEFAULT 'include' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_subscriptions_user_id` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_source_id` ON `subscriptions` (`source_id`);--> statement-breakpoint
CREATE TABLE `usage_stats` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`public_feed_count` integer DEFAULT 0 NOT NULL,
	`category_count` integer DEFAULT 0 NOT NULL,
	`article_count` integer DEFAULT 0 NOT NULL,
	`last_updated` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`username` text,
	`display_username` text,
	`role` text,
	`plan` text DEFAULT 'free',
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TABLE `user_article_states` (
	`user_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `article_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_article_states_user_id` ON `user_article_states` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_article_states_read` ON `user_article_states` (`read`);--> statement-breakpoint
CREATE INDEX `idx_user_article_states_saved` ON `user_article_states` (`saved`);--> statement-breakpoint
CREATE TABLE `user_limits` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`max_sources` integer,
	`max_public_feeds` integer,
	`max_categories` integer,
	`api_rate_limit_per_minute` integer,
	`public_feed_rate_limit_per_minute` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`auto_age_days` integer DEFAULT 7 NOT NULL,
	`default_filter` text DEFAULT 'all' NOT NULL,
	`share_email` integer DEFAULT true NOT NULL,
	`share_hackernews` integer DEFAULT false NOT NULL,
	`share_reddit` integer DEFAULT false NOT NULL,
	`share_twitter` integer DEFAULT false NOT NULL,
	`share_bluesky` integer DEFAULT false NOT NULL,
	`share_mastodon` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_settings_user_id` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
-- Seed default global settings (after all tables are created)
INSERT INTO `global_settings` (`id`, `max_login_attempts`, `login_attempt_window_minutes`, `lockout_duration_minutes`, `allow_registration`, `require_email_verification`, `password_reset_token_expiry_hours`, `fetch_interval_minutes`, `prune_days`, `updated_at`) VALUES
(1, 5, 15, 30, 1, 0, 1, 60, 30, cast(unixepoch('subsecond') * 1000 as integer));
