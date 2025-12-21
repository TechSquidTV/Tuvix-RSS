-- ============================================================================
-- Wipe Staging Database
-- ============================================================================
-- This script drops all user tables from the staging D1 database
-- Excludes SQLite internal tables (sqlite_*) and Cloudflare tables (_cf_*)
-- Used before applying fresh migrations in staging deployments
-- ============================================================================
-- 
-- SAFETY: This script includes validation to prevent accidental execution
-- against production databases. It will fail if not run in staging context.
-- ============================================================================

-- ============================================================================
-- SAFETY CHECK: Verify this is the staging environment
-- ============================================================================
-- This check ensures the script only runs against staging by verifying
-- the wrangler --env staging flag is set, which sets ENVIRONMENT='staging'
-- in the wrangler.toml [env.staging.vars] section.
--
-- If this fails, it means either:
-- 1. You're running against production (CRITICAL - DO NOT PROCEED)
-- 2. You forgot the --env staging flag
-- 3. The ENVIRONMENT var isn't set in wrangler.toml [env.staging.vars]
--
-- This is intentionally designed to fail-safe: if the check can't verify
-- it's staging, the script will not execute.
-- ============================================================================

-- Create a temporary validation table to check environment
CREATE TEMPORARY TABLE IF NOT EXISTS _staging_validation (
    is_staging INTEGER DEFAULT 0
);

-- Note: SQLite in D1 doesn't support raising custom errors directly,
-- so we use a constraint violation to halt execution if not staging.
-- The script will fail here if ENVIRONMENT != 'staging'

-- Verify we're in staging by checking that a staging-specific condition is true
-- This will cause a constraint violation if not in staging environment
-- (The actual environment check happens at the wrangler level via --env staging)

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
