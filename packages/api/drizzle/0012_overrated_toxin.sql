CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL
);
