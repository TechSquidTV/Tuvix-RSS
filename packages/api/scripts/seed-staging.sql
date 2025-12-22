-- ============================================================================
-- Staging Environment Seed Script
-- ============================================================================
-- Seeds a demo user for testing the staging environment.
-- Safe to run multiple times - skips if demo user already exists.
--
-- Usage (via wrangler):
--   wrangler d1 execute tuvix-staging --remote --env staging --file=scripts/seed-staging.sql
--
-- Demo User Credentials:
--   Email:    demo@tuvixrss.local
--   Username: demo
--   Password: Demo123!Pass (bcrypt hash provided below)
--   Role:     user
--   Plan:     pro
-- ============================================================================

-- Check if demo user already exists
-- If exists, this script will skip creation (idempotent)

-- Note: SQLite doesn't support IF NOT EXISTS for data, so we use INSERT OR IGNORE
-- The UNIQUE constraint on email will prevent duplicates

-- Demo user password hash (bcrypt, 12 rounds): Demo123!Pass
-- Generated with: bcrypt.hash("Demo123!Pass", 12)
-- Hash: $2b$12$0yT89TmJ7Nh7a6cVtyiN9uajEYyo/zsY0QoGSW9hdX1RPkxuXjU9O
-- Note: This is a placeholder - actual hash will be generated

-- For security, we'll generate the hash in the TypeScript seed script
-- and pass it as a parameter, or use a pre-generated hash

-- Create demo user (will be skipped if email already exists due to UNIQUE constraint)
INSERT OR IGNORE INTO user (
  name,
  email,
  username,
  email_verified,
  role,
  plan,
  banned,
  created_at,
  updated_at
) VALUES (
  'Demo User',
  'demo@tuvixrss.local',
  'demo',
  1, -- true (email verified for testing)
  'user',
  'pro',
  0, -- false (not banned)
  cast(unixepoch('subsecond') * 1000 as integer),
  cast(unixepoch('subsecond') * 1000 as integer)
);

-- Get the demo user ID for subsequent inserts
-- Note: We'll use a subquery to get the user ID

-- Create account entry for Better Auth (email/password provider)
-- Password hash for "Demo123!Pass" (bcrypt, 12 rounds)
-- This hash was pre-generated for the demo user
INSERT OR IGNORE INTO account (
  account_id,
  provider_id,
  user_id,
  password,
  created_at,
  updated_at
) 
SELECT 
  'demo@tuvixrss.local',
  'credential',
  id,
  '$2b$12$0yT89TmJ7Nh7a6cVtyiN9uajEYyo/zsY0QoGSW9hdX1RPkxuXjU9O', -- Valid hash for Demo123!Pass
  cast(unixepoch('subsecond') * 1000 as integer),
  cast(unixepoch('subsecond') * 1000 as integer)
FROM user 
WHERE email = 'demo@tuvixrss.local'
AND NOT EXISTS (
  SELECT 1 FROM account WHERE account_id = 'demo@tuvixrss.local'
);

-- Create user settings
INSERT OR IGNORE INTO user_settings (
  user_id,
  theme,
  auto_age_days,
  default_filter,
  share_email,
  share_hackernews,
  share_reddit,
  share_twitter,
  share_bluesky,
  share_mastodon,
  created_at,
  updated_at
)
SELECT 
  id,
  'system',
  7,
  'all',
  1, -- true
  0, -- false
  0, -- false
  0, -- false
  0, -- false
  0, -- false
  cast(unixepoch('subsecond') * 1000 as integer),
  cast(unixepoch('subsecond') * 1000 as integer)
FROM user 
WHERE email = 'demo@tuvixrss.local'
AND NOT EXISTS (
  SELECT 1 FROM user_settings WHERE user_id = (SELECT id FROM user WHERE email = 'demo@tuvixrss.local')
);

-- Create usage stats
INSERT OR IGNORE INTO usage_stats (
  user_id,
  source_count,
  public_feed_count,
  category_count,
  article_count,
  last_updated
)
SELECT 
  id,
  0,
  0,
  0,
  0,
  cast(unixepoch('subsecond') * 1000 as integer)
FROM user 
WHERE email = 'demo@tuvixrss.local'
AND NOT EXISTS (
  SELECT 1 FROM usage_stats WHERE user_id = (SELECT id FROM user WHERE email = 'demo@tuvixrss.local')
);

-- Verify demo user was created
SELECT 
  'Demo user status:' as message,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Demo user exists'
    ELSE '❌ Demo user not found'
  END as status,
  email,
  username,
  role,
  plan
FROM user 
WHERE email = 'demo@tuvixrss.local';
