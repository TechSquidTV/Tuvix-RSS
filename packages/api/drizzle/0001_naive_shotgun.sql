-- Migration: Add blocked_domains table
-- Date: 2025-01-15
-- Purpose: Add admin functionality to block domains and prevent users from subscribing to feeds from blocked domains.
--          Supports wildcard patterns (*.example.com), optional reason tracking, and enterprise user bypass.

CREATE TABLE `blocked_domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain` text NOT NULL,
	`reason` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocked_domains_domain_unique` ON `blocked_domains` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_blocked_domains_domain` ON `blocked_domains` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_blocked_domains_reason` ON `blocked_domains` (`reason`);--> statement-breakpoint
CREATE INDEX `idx_blocked_domains_created_at` ON `blocked_domains` (`created_at`);