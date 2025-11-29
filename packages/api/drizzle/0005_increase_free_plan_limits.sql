-- Migration: Increase free plan limits
-- Date: 2025-11-29
-- Purpose: Update free plan limits to be more generous:
--          - max_sources: 25 -> 100
--          - max_categories: 10 -> 50
--          - max_public_feeds: 2 -> 2 (unchanged)

-- Update free plan limits
UPDATE `plans`
SET
  `max_sources` = 100,
  `max_categories` = 50,
  `updated_at` = strftime('%s', 'now') * 1000
WHERE `id` = 'free';
