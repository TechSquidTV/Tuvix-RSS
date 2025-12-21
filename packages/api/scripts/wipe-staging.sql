-- ============================================================================
-- Wipe Staging Database
-- ============================================================================
-- This script drops all user tables from the staging D1 database
-- Excludes SQLite internal tables (sqlite_*) and Cloudflare tables (_cf_*)
-- Used before applying fresh migrations in staging deployments
-- ============================================================================

-- Get all table names and drop them
-- We need to do this dynamically since table names can change

-- Drop all user tables in reverse dependency order (children before parents)

-- Drop junction/linking tables first (no dependencies)
DROP TABLE IF EXISTS subscription_categories;
DROP TABLE IF EXISTS feed_categories;

-- Drop dependent tables (reference main entities)
DROP TABLE IF EXISTS subscription_filters;
DROP TABLE IF EXISTS user_article_states;
DROP TABLE IF EXISTS public_feed_access_log;
DROP TABLE IF EXISTS api_usage_log;
DROP TABLE IF EXISTS security_audit_log;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS user_limits;
DROP TABLE IF EXISTS usage_stats;

-- Drop main entity tables (reference sources, users, etc.)
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS feeds;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS blocked_domains;

-- Drop auth tables (reference user)
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS user;

-- Drop configuration tables (standalone)
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS global_settings;

-- Drop migration tracking tables (D1 uses these)
DROP TABLE IF EXISTS d1_migrations;
DROP TABLE IF EXISTS __drizzle_migrations;

-- Vacuum to reclaim space
VACUUM;
