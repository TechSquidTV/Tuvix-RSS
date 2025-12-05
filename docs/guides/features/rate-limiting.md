# Rate Limiting

Comprehensive guide to TuvixRSS's rate limiting system for API protection and resource management.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Deployment-Specific Setup](#deployment-specific-setup)
- [Rate Limit Types](#rate-limit-types)
- [Admin Management](#admin-management)
- [User Settings](#user-settings)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Overview

TuvixRSS implements a rate limiting system with two distinct layers:

```
┌─────────────────────────────────────────────────────────┐
│ 1. API Rate Limiting (Per-User, Authenticated)          │
│    - Based on user's subscription plan                  │
│    - Per-minute window                                  │
│    - Plan-specific Cloudflare Workers bindings          │
│    - Free: 60/min, Pro: 180/min, Enterprise: 600/min  │
│    - No rate limiting (Docker Compose)                  │
│    - Protects tRPC endpoints                            │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Public Feed Rate Limiting (Per-Feed Owner)           │
│    - Protects RSS feed endpoints                        │
│    - Per-minute window                                  │
│    - Anonymous access allowed                           │
│    - Rate limited by feed owner's plan                  │
│    - Access logging for analytics                       │
│    - Cloudflare Workers rate limit bindings (Cloudflare)│
│    - No rate limiting (Docker Compose)                  │
└─────────────────────────────────────────────────────────┘
```

### Key Features

- **Cloudflare Workers Native**: Uses plan-specific Cloudflare Workers rate limit bindings for production deployments
- **Per-Minute Windows**: All rate limits are enforced on a per-minute basis
- **Plan-Based Limits**: Each plan (free/pro/enterprise) has its own binding with the plan's rate limit
- **No Custom Rate Limits**: Rate limits are enforced by plan-specific bindings and cannot be customized per-user
- **Docker Compose**: No rate limiting for Docker Compose deployments (always allows requests)
- **Access Logging**: Track public feed usage for analytics

---

## Architecture

### Rate Limiter Service

**Location**: `packages/api/src/services/rate-limiter.ts`

The rate limiter uses Cloudflare Workers rate limit bindings for Cloudflare deployments and has no rate limiting for Docker Compose.

```typescript
interface RateLimitResult {
  allowed: boolean; // Whether request is allowed
  limit: number; // Maximum requests in window (user's plan limit)
  remaining: number; // Requests remaining (approximate)
  resetAt: Date; // When the limit resets
}

type RateLimitType = "api" | "publicFeed";
```

---

## How It Works

### Cloudflare Workers Deployment

1. **Request arrives** → Get user's plan ID from database
2. **Select binding** → Choose plan-specific binding:
   - `FREE_API_RATE_LIMIT` (60/min) for free plan
   - `PRO_API_RATE_LIMIT` (180/min) for pro plan
   - `ENTERPRISE_API_RATE_LIMIT` (600/min) for enterprise/admin plan
3. **Create unique key** → Format: `userId` as string (e.g., `"123"` or `"456"`)
   - Since bindings are plan-specific, user ID alone is sufficient
4. **Call binding** → `binding.limit({ key })` - returns `{ success: boolean }`
5. **Allow or deny** → `success: true` = allowed, `success: false` = rate limit exceeded

**Key Points**:

- Each plan has its own binding with the plan's exact rate limit
- Each user gets their own independent counter tracked by the binding
- The binding enforces the plan's limit directly (no application-level enforcement needed)
- Bindings only return `{ success: boolean }` - no usage details available
- **Batch Requests**: Cloudflare bindings handle batch requests correctly - each user's requests are tracked independently

### Docker Compose Deployment

- **No rate limiting**: All requests are automatically allowed
- **No configuration needed**: Rate limiting is disabled by default
- **Useful for**: Development, testing, and single-user deployments

---

## Configuration

### Cloudflare Workers Setup

#### Step 1: Update wrangler.toml

**Note**: Rate limit `namespace_id` values are user-defined positive integers that you choose yourself (e.g., `"1001"`, `"1002"`). They don't need to be created via CLI or dashboard - you simply assign unique integer IDs in your `wrangler.toml` configuration.

```toml
# Plan-specific API rate limit bindings
# Each plan has its own binding with the plan's rate limit
# namespace_id: A positive integer you define, unique to your Cloudflare account
# You choose these IDs yourself - they don't need to be created elsewhere
[[ratelimits]]
name = "FREE_API_RATE_LIMIT"
namespace_id = "1003"  # User-defined identifier - choose any unique positive integer
simple = { limit = 60, period = 60 }  # Free plan: 60 requests per minute

[[ratelimits]]
name = "PRO_API_RATE_LIMIT"
namespace_id = "1004"  # User-defined identifier - choose any unique positive integer
simple = { limit = 180, period = 60 }  # Pro plan: 180 requests per minute

[[ratelimits]]
name = "ENTERPRISE_API_RATE_LIMIT"
namespace_id = "1005"  # User-defined identifier - choose any unique positive integer
simple = { limit = 600, period = 60 }  # Enterprise/admin plan: 600 requests per minute

# Public Feed rate limiting (unchanged - still uses single binding)
[[ratelimits]]
name = "FEED_RATE_LIMIT"
namespace_id = "1002"  # User-defined identifier - choose any unique positive integer
simple = { limit = 10000, period = 60 }  # High limit - actual limits enforced per user via getUserLimits()
```

#### Step 2: Deploy

```bash
# Deploy to Cloudflare
wrangler deploy
```

### Docker Compose Setup

**No configuration required** - rate limiting is automatically disabled.

---

## Rate Limit Types

### 1. API Rate Limiting

**Purpose**: Prevent API abuse and ensure fair resource allocation

**Configuration**: Based on user's subscription plan

**Default Limits by Plan**:
| Plan | Requests per Minute | Binding |
|------|---------------------|---------|
| Free | 60 | `FREE_API_RATE_LIMIT` |
| Pro | 180 | `PRO_API_RATE_LIMIT` |
| Enterprise/Admin | 600 | `ENTERPRISE_API_RATE_LIMIT` |

**Endpoints Protected**: All authenticated tRPC procedures

**How It Works**:

- Each authenticated API request checks the user's plan
- Selects the appropriate plan-specific binding (FREE_API_RATE_LIMIT, PRO_API_RATE_LIMIT, or ENTERPRISE_API_RATE_LIMIT)
- Uses `userId` as the key (bindings are plan-specific, so user ID alone is sufficient)
- Binding enforces the plan's limit directly
- Returns `TOO_MANY_REQUESTS` error if limit exceeded

### 2. Public Feed Rate Limiting

**Purpose**: Prevent abuse of public RSS feeds while allowing anonymous access

**Configuration**: Based on feed owner's plan

**Default Limits by Plan**:
| Plan | Requests per Minute |
|------|---------------------|
| Free | ~17 |
| Pro | ~167 |
| Enterprise | ~1,667 |
| Custom | Admin-defined |

**Key Features**:

- Anonymous access allowed (RSS readers don't authenticate)
- Rate limited by feed owner, not requester
- Protects feed owner's resources
- Access logging for analytics

**Endpoints Protected**:

- `GET /public/:username/:slug` (Express/Docker)
- `GET /public/:username/:slug` (Cloudflare Workers)

**How It Works**:

- Each public feed request checks the feed owner's rate limit
- Uses `FEED_RATE_LIMIT` binding with key `"publicFeed:ownerUserId"`
- Feed owner's plan limit is enforced in application code
- Returns `429 Too Many Requests` if limit exceeded

---

## Admin Management

### Managing Plans

**Location**: Admin Dashboard → Plans

Admins can create and edit subscription plans with rate limits:

1. **API Rate Limit (per minute)**: Maximum API requests per minute for users on this plan
2. **Public Feed Rate Limit (per minute)**: Maximum public feed requests per minute

**Note**: All rate limits are configured per-minute. The system uses Cloudflare Workers rate limit bindings for enforcement.

### Setting Custom Limits

**Location**: Admin Dashboard → Users → [User] → Set Custom Limits

Admins can override plan limits for specific users:

- **Max Sources**: Override the user's plan source limit
- **Max Public Feeds**: Override the user's plan public feed limit
- **Max Categories**: Override the user's plan category limit

**Note**: Rate limits cannot be customized per-user. They are enforced by plan-specific Cloudflare Workers bindings. To change a user's rate limit, change their plan.

### Monitoring Rate Limits

**Location**: Admin Dashboard → Rate Limits

The rate limits monitor shows:

- **Public Feed Access (24h)**: Total RSS feed requests in the last 24 hours
- **Rate Limiting Status**: Whether rate limiting is enabled (Cloudflare) or disabled (Docker)
- **Recent Public Feed Access**: Last 50 RSS feed requests with IP addresses and user agents

---

## User Settings

**Location**: Settings → Usage & Limits

Users can view their rate limits:

- **Rate Limiting Status**: Shows if rate limiting is enabled or disabled
- **API Requests (per minute)**: Shows the user's API rate limit from their plan
- **Public Feed Access (per minute)**: Shows the user's public feed rate limit from their plan
- **Custom Limits Indicator**: Shows if custom limits are applied (for non-rate-limit fields)

**Note**: Detailed usage statistics (used/remaining) are not available because Cloudflare Workers rate limit bindings don't expose per-user usage data. Users see their plan limits, not real-time usage.

**Batch Requests**: When multiple tRPC procedures are batched into a single HTTP request, they count as 1 rate limit check, not N procedures. This ensures fair rate limiting for batch operations.

---

## Troubleshooting

### Rate Limiting Not Working

**Symptoms**: Requests are not being rate limited

**Solutions**:

1. **Check deployment type**: Rate limiting only works on Cloudflare Workers, not Docker Compose
2. **Verify bindings**: Ensure all plan-specific bindings are configured in `wrangler.toml`:
   - `FREE_API_RATE_LIMIT` (namespace_id: 1003, limit: 60)
   - `PRO_API_RATE_LIMIT` (namespace_id: 1004, limit: 180)
   - `ENTERPRISE_API_RATE_LIMIT` (namespace_id: 1005, limit: 600)
   - `FEED_RATE_LIMIT` (namespace_id: 1002, limit: 10000)
   - Uses `name` (not `binding`)
   - Uses `namespace_id` as a string integer (e.g., `"1003"`)
   - Uses `simple` object with `limit` and `period`
3. **Check namespace IDs**: Ensure `namespace_id` values are unique positive integers (you choose these yourself)
4. **Check logs**: Look for warnings about missing bindings in worker logs
5. **Verify user's plan**: Ensure users have a valid plan (free, pro, or enterprise) - unknown plans fall back to free plan binding

### Debug Mode

**Enable Debug Logging**: To troubleshoot rate limiting issues, enable debug mode:

```bash
# Enable debug logging
npx wrangler secret put RATE_LIMIT_DEBUG true

# Monitor logs
npx wrangler tail

# Disable after debugging
npx wrangler secret delete RATE_LIMIT_DEBUG
```

Debug mode logs all rate limit checks with detailed information:

- `plan`: User's plan ID (free, pro, enterprise)
- `type`: Rate limit type (api or publicFeed)
- `userId`: User ID
- `limit`: User's plan limit (for display purposes)
- `allowed`: Whether request was allowed (from binding's success status)
- `resetAt`: When the rate limit window resets (60 seconds from request time)

**Note**: Cloudflare bindings only return `{ success: boolean }`, so detailed usage statistics (remaining requests, etc.) are not available.

**Note**: Debug mode is opt-in and disabled by default for production safety.

### Rate Limits Too Strict

**Symptoms**: Users hitting rate limits too frequently

**Solutions**:

1. **Upgrade user's plan**: Move user to a higher plan (pro or enterprise) with higher rate limits
2. **Adjust plan limits**: Edit plan limits in Admin Dashboard → Plans (affects all users on that plan)
3. **Check for abuse**: Review rate limit monitor for unusual patterns

### Rate Limits Too Lenient

**Symptoms**: Users making excessive requests

**Solutions**:

1. **Decrease plan limits**: Edit plan limits in Admin Dashboard → Plans (affects all users on that plan)
2. **Downgrade user's plan**: Move user to a lower plan (free or pro) with lower rate limits
3. **Review plan tiers**: Consider adjusting default limits for all plans

---

## Best Practices

### Plan Configuration

- **Free Plan**: Set conservative limits (e.g., 60 API requests/min, ~17 feed requests/min)
- **Pro Plan**: Set moderate limits (e.g., 180 API requests/min, ~167 feed requests/min)
- **Enterprise Plan**: Set high limits (e.g., 600 API requests/min, ~1667 feed requests/min)

### Custom Limits

- **Non-rate-limit fields only**: Custom limits can only override maxSources, maxPublicFeeds, and maxCategories
- **Rate limits are plan-based**: Rate limits cannot be customized - they are enforced by plan-specific bindings
- **Use sparingly**: Only set custom limits when necessary
- **Document reasons**: Add notes when setting custom limits
- **Review regularly**: Periodically review custom limits and remove unnecessary ones

### Monitoring

- **Check rate limit monitor**: Regularly review public feed access logs
- **Watch for patterns**: Look for unusual access patterns that might indicate abuse
- **Adjust as needed**: Update plan limits based on actual usage patterns

### Docker Compose Deployments

- **No rate limiting**: Docker Compose deployments have no rate limiting
- **Suitable for**: Development, testing, single-user deployments
- **Not suitable for**: Production multi-user deployments (use Cloudflare Workers)

---

## Technical Details

### Rate Limit Binding API

Cloudflare Workers rate limit bindings provide:

```typescript
interface RateLimit {
  limit(options: { key: string }): Promise<{
    success: boolean; // Whether the request was allowed
    limit: number; // Binding's limit (10000)
    remaining: number; // Requests remaining in binding's limit
    reset: number; // Unix timestamp when limit resets
  }>;
}
```

### Key Format

Keys are formatted as `"type:userId"`:

- API requests: `"api:123"`
- Public feed requests: `"publicFeed:456"`

### Limit Enforcement

1. Binding tracks requests per key (up to 10,000/minute)
2. Application code enforces user's plan limit
3. If user exceeds plan limit, request is denied even if binding allows it

### Docker Compose Behavior

- `checkRateLimit()` always returns `allowed: true` for Docker Compose
- No rate limit checking is performed
- All requests are automatically allowed
