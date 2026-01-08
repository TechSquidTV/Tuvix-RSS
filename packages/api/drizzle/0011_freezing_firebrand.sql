ALTER TABLE `global_settings` ADD `last_token_cleanup_at` integer;--> statement-breakpoint
ALTER TABLE `global_settings` ADD `ai_enabled` integer DEFAULT false NOT NULL;