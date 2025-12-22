-- ============================================================================
-- Wipe Staging Database
-- ============================================================================
-- This script drops all user tables from the staging D1 database
-- Excludes SQLite internal tables (sqlite_*) and Cloudflare tables (_cf_*)
-- Used before applying fresh migrations in staging deployments
-- ============================================================================
-- 
-- SAFETY: This script is intended to be run only against the staging database.
-- The primary safety mechanism is your deployment tooling (e.g. wrangler
-- with --env staging) ensuring it targets the correct D1 instance.
-- ============================================================================

-- ============================================================================
-- SAFETY CHECK: Informational validation of database state
-- ============================================================================
-- This section does NOT enforce environment separation by itself. It assumes
-- you are already connected to the correct staging database (e.g. via
-- wrangler.toml [env.staging] and wrangler --env staging).
--
-- If you see unexpected data here, STOP and verify that:
-- 1. You're not accidentally connected to production.
-- 2. You're using the correct wrangler environment/credentials.
--
-- This check is informational only; it does not prevent execution.
-- ============================================================================

-- For D1/SQLite, we rely on the wrangler command including --env staging
-- which ensures we're targeting the tuvix-staging database, not tuvix production.
-- The database name itself is the primary safety mechanism.

-- Additional safety: Check if this is a fresh staging deployment
-- by verifying the database is either empty or has staging markers
SELECT CASE 
    WHEN COUNT(*) = 0 THEN 'OK: Database is empty (fresh staging)'
    WHEN COUNT(*) > 0 THEN 'WARNING: Database has tables - proceeding with wipe'
END as safety_check
FROM sqlite_master 
WHERE type = 'table' 
  AND name NOT LIKE 'sqlite_%' 
  AND name NOT LIKE '_cf_%'
  AND name NOT LIKE '__drizzle_migrations'
  AND name NOT LIKE 'd1_migrations';

-- ============================================================================
-- PROCEED WITH WIPE (only if safety checks pass)
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
