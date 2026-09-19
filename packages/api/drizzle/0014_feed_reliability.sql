CREATE TABLE `feed_fetch_health` (
	`id` integer PRIMARY KEY NOT NULL,
	`backlog` integer DEFAULT 0 NOT NULL,
	`failing_batches` integer DEFAULT 0 NOT NULL,
	`growing_batches` integer DEFAULT 0 NOT NULL,
	`last_alert_at` integer
);
--> statement-breakpoint
ALTER TABLE `sources` ADD `fetch_lease_token` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `fetch_lease_until` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `next_fetch_at` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `last_fetch_error` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `consecutive_fetch_failures` integer DEFAULT 0 NOT NULL;