-- ============================================================================
-- Wipe Staging Database
-- ============================================================================
-- This script drops all user tables from the staging D1 database
-- Excludes SQLite internal tables (sqlite_*) and Cloudflare tables (_cf_*)
-- Used before applying fresh migrations in staging deployments
-- ============================================================================

-- Get all table names and drop them
-- We need to do this dynamically since table names can change

-- Drop all user tables (this will be executed multiple times to handle dependencies)
DROP TABLE IF EXISTS security_audit_log;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS subscription_feed_links;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS feeds;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS global_settings;

-- Drop migration tracking tables (D1 uses these)
DROP TABLE IF EXISTS d1_migrations;
DROP TABLE IF EXISTS __drizzle_migrations;

-- Vacuum to reclaim space
VACUUM;
