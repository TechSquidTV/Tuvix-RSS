-- Fix security_audit_log.created_at missing SQL default
-- This fixes the bug where audit logs were silently failing to insert
-- because created_at had no default value and was NOT NULL

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
PRAGMA foreign_keys=OFF;

-- Create new table with correct default
CREATE TABLE `__new_security_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`metadata` text,
	`success` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);

-- Copy existing data (table is currently empty in production, but safe to copy anyway)
INSERT INTO `__new_security_audit_log`("id", "user_id", "action", "ip_address", "user_agent", "metadata", "success", "created_at")
SELECT "id", "user_id", "action", "ip_address", "user_agent", "metadata", "success", "created_at"
FROM `security_audit_log`;

-- Drop old table
DROP TABLE `security_audit_log`;

-- Rename new table
ALTER TABLE `__new_security_audit_log` RENAME TO `security_audit_log`;

-- Re-enable foreign keys
PRAGMA foreign_keys=ON;

-- Recreate indexes
CREATE INDEX `idx_security_audit_log_user_id` ON `security_audit_log` (`user_id`);
CREATE INDEX `idx_security_audit_log_action` ON `security_audit_log` (`action`);
CREATE INDEX `idx_security_audit_log_created_at` ON `security_audit_log` (`created_at`);
