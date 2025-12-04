PRAGMA foreign_keys=OFF;
--> statement-breakpoint
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
--> statement-breakpoint
INSERT INTO `__new_security_audit_log`("id", "user_id", "action", "ip_address", "user_agent", "metadata", "success", "created_at")
SELECT "id", "user_id", "action", "ip_address", "user_agent", "metadata", "success", "created_at"
FROM `security_audit_log`;
--> statement-breakpoint
DROP TABLE `security_audit_log`;
--> statement-breakpoint
ALTER TABLE `__new_security_audit_log` RENAME TO `security_audit_log`;
--> statement-breakpoint
CREATE INDEX `idx_security_audit_log_user_id` ON `security_audit_log` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_security_audit_log_action` ON `security_audit_log` (`action`);
--> statement-breakpoint
CREATE INDEX `idx_security_audit_log_created_at` ON `security_audit_log` (`created_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
