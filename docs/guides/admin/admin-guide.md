# TuvixRSS Admin Guide

Complete guide for administering a TuvixRSS instance.

## Table of Contents

- [Admin Access](#admin-access)
- [Global Settings](#global-settings)
- [Plan Management](#plan-management)
- [User Management](#user-management)
- [Rate Limiting](#rate-limiting)
- [Security Monitoring](#security-monitoring)

---

## Admin Access

### Creating the First Admin

The first user to register becomes an admin automatically if configured:

```bash
# .env
ALLOW_FIRST_USER_ADMIN=true
```

### Manual Admin Creation (Cloudflare Workers)

```bash
# Set environment variables
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password

# Call admin init endpoint
curl -X POST https://your-api.com/_admin/init \
  -H "Content-Type: application/json"
```

### Admin Endpoints

All admin endpoints require authentication and admin role. They are available under the `admin` tRPC router.

---

## Global Settings

Global settings control authentication rate limiting, registration, and public endpoints.

### View Current Settings

```typescript
const settings = await client.admin.getGlobalSettings.query();

console.log(settings);
// {
//   maxLoginAttempts: 5,
//   loginAttemptWindowMinutes: 15,
//   lockoutDurationMinutes: 30,
//   allowRegistration: true,
//   requireEmailVerification: false,
//   passwordResetTokenExpiryHours: 1,
//   updatedAt: 2025-01-15T10:30:00.000Z
// }
```

### Update Settings

```typescript
await client.admin.updateGlobalSettings.mutate({
  maxLoginAttempts: 10, // Allow more attempts
  loginAttemptWindowMinutes: 20, // Over longer period
  lockoutDurationMinutes: 60, // Longer lockout
  allowRegistration: false, // Disable new signups
});
```

### Settings Reference

| Setting                         | Purpose                      | Default | Recommended Range           |
| ------------------------------- | ---------------------------- | ------- | --------------------------- |
| `maxLoginAttempts`              | Failed logins before lockout | 5       | 3-10 (higher = less secure) |
| `loginAttemptWindowMinutes`     | Time window for counting     | 15 min  | 10-30 min                   |
| `lockoutDurationMinutes`        | Lockout duration             | 30 min  | 15-60 min                   |
| `allowRegistration`             | Allow new user signups       | true    | -                           |
| `requireEmailVerification`      | Require email verification   | false   | true (if email configured)  |
| `passwordResetTokenExpiryHours` | Reset token lifetime         | 1 hour  | 1-24 hours                  |

**Registration Control** (`allowRegistration`):

- When disabled: Registration endpoint returns `FORBIDDEN` error
- Better Auth's `before` hook also blocks sign-up attempts
- Frontend shows "Registration is currently disabled" message
- Existing users are not affected

**Email Verification** (`requireEmailVerification`):

- When enabled: New users must verify email before accessing protected endpoints
- Verification email sent automatically on registration
- Users can resend verification email (rate limited: 1 per 5 minutes)
- Admin users bypass verification requirement
- Unverified users redirected to `/verify-email` page
- Verification endpoints (`checkVerificationStatus`, `resendVerificationEmail`) accessible to unverified users

---

## Email Configuration

TuvixRSS uses [Resend](https://resend.com) for transactional email delivery. Email functionality includes email verification, password reset emails, and welcome emails for new users.

**For complete email system documentation, see [Email System Guide](../../developer/email-system.md).**

### Quick Setup

1. **Create Resend Account** - Sign up at [resend.com](https://resend.com/signup)
2. **Verify Domain** - Add DNS records (DKIM, SPF, DMARC) in Resend dashboard
3. **Create API Key** - Generate API key in Resend dashboard
4. **Configure Environment Variables**:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxx
   EMAIL_FROM=noreply@yourdomain.com  # Must match verified domain
   BASE_URL=https://yourdomain.com    # Frontend URL
   ```

### Email Types

- **Email Verification**: Sent when `requireEmailVerification` is enabled
- **Password Reset**: Sent when users request a password reset
- **Welcome Email**: Sent automatically when new users register

### Admin-Specific Settings

**Email Verification Control**:

- Enable/disable via `requireEmailVerification` in global settings
- When enabled: New users must verify email before accessing the app
- When disabled: Accounts are immediately active after registration

**Monitoring**:

- Check Resend dashboard for delivery status and logs
- Review security audit logs for email send attempts
- Failed email sends are logged but don't block user actions

See [Email System Guide](../../developer/email-system.md) for complete setup instructions, troubleshooting, and template development.

---

## Plan Management

Plans define resource limits and rate limits for users.

### List All Plans

```typescript
const plans = await client.admin.listPlans.query();

plans.forEach((plan) => {
  console.log(`${plan.name} (${plan.id})`);
  console.log(`  Sources: ${plan.maxSources}`);
  console.log(`  API Rate: ${plan.apiRateLimitPerMinute}/min`);
  console.log(`  Price: $${plan.priceCents / 100}`);
});
```

### Create New Plan

```typescript
await client.admin.createPlan.mutate({
  id: "startup", // Unique identifier (a-z, 0-9, -)
  name: "Startup Plan",
  maxSources: 200,
  maxPublicFeeds: 5,
  maxCategories: 50,
  apiRateLimitPerMinute: 200,
  publicFeedRateLimitPerMinute: 83, // ~5000/hour = ~83/minute
  priceCents: 1999, // $19.99
  features: "Perfect for growing teams",
});
```

### Update Existing Plan

```typescript
// Adjust free tier limits
await client.admin.updatePlan.mutate({
  id: "free",
  maxSources: 50, // Increase from default
  apiRateLimitPerMinute: 120, // More generous rate limit
});

// Adjust pricing
await client.admin.updatePlan.mutate({
  id: "pro",
  priceCents: 999, // Change to $9.99
});
```

### Delete Plan

```typescript
// Cannot delete if users are assigned to it
await client.admin.deletePlan.mutate({
  planId: "legacy-plan",
});
```

### Recommended Plan Structure

| Plan           | Sources | Categories | API/min | Price  | Use Case      |
| -------------- | ------- | ---------- | ------- | ------ | ------------- |
| **Free**       | 25      | 10         | 60      | $0     | Personal use  |
| **Pro**        | 100     | Unlimited  | 180     | $9.99  | Power users   |
| **Enterprise** | 1000    | Unlimited  | 600     | $49.99 | Organizations |

---

## User Management

### List Users

```typescript
// Get all users
const result = await client.admin.listUsers.query({
  limit: 50,
  offset: 0,
});

// Filter by plan
const freeUsers = await client.admin.listUsers.query({
  plan: "free",
  limit: 100,
  offset: 0,
});

// Search by username or email
const searchResults = await client.admin.listUsers.query({
  search: "john",
  limit: 20,
  offset: 0,
});
```

### Get User Details

```typescript
const user = await client.admin.getUser.query({ userId: 123 });

console.log(user.username, user.email, user.plan);
console.log("Usage:", user.usage);
console.log("Limits:", user.limits);
console.log("Custom Limits:", user.customLimits);
```

### Change User Plan

```typescript
await client.admin.changePlan.mutate({
  userId: 123,
  plan: "pro",
});
```

### Set Custom Limits

Override plan limits for specific users:

```typescript
await client.admin.setCustomLimits.mutate({
  userId: 456,
  maxSources: 500, // Override plan limit
  maxPublicFeeds: 50, // Override plan limit
  notes: "Beta tester - higher limits",
  // Note: Rate limits cannot be customized - they are enforced by plan-specific bindings
});

// Remove custom limits (revert to plan)
await client.admin.removeCustomLimits.mutate({
  userId: 456,
});
```

### Ban/Unban User

```typescript
// Ban user
await client.admin.banUser.mutate({
  userId: 789,
  banned: true,
  reason: "Terms of service violation",
});

// Unban user
await client.admin.banUser.mutate({
  userId: 789,
  banned: false,
});
```

### Delete User

```typescript
// WARNING: Permanently deletes user and all their data
await client.admin.deleteUser.mutate({
  userId: 999,
});
```

### Fix Usage Stats

If usage stats become inaccurate:

```typescript
await client.admin.recalculateUsage.mutate({
  userId: 123,
});
```

---

## Rate Limiting

### Understanding the System

TuvixRSS has a multi-layer rate limiting system:

```
┌─────────────────────────────────────────┐
│ 1. Login/Auth Rate Limiting             │
│    - Global settings (admin-configurable)│
│    - Protects against brute force       │
│    - In-memory (IP-based)                │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ 2. API Rate Limiting (Per-User)         │
│    - Based on user's plan               │
│    - Can be overridden per-user         │
│    - Cached from database                │
└─────────────────────────────────────────┘
           ↓
```

### Adjusting Login Rate Limits

If users are getting locked out too frequently:

```typescript
await client.admin.updateGlobalSettings.mutate({
  maxLoginAttempts: 10, // More lenient
  loginAttemptWindowMinutes: 30, // Longer window
});
```

If you're under attack:

```typescript
await client.admin.updateGlobalSettings.mutate({
  maxLoginAttempts: 3, // Strict
  lockoutDurationMinutes: 120, // 2 hour lockout
});
```

### Adjusting Per-Plan API Limits

Increase limits for paying users:

```typescript
await client.admin.updatePlan.mutate({
  id: "pro",
  apiRateLimitPerMinute: 300, // Higher throughput
  publicFeedRateLimitPerMinute: 333, // ~20000/hour = ~333/minute
});
```

### VIP User Rate Limits

Give specific users higher limits:

```typescript
// To give a user higher rate limits, change their plan instead:
await client.admin.changePlan.mutate({
  userId: 456,
  plan: "enterprise", // Enterprise plan has 600/min rate limit
});

// Custom limits can only override non-rate-limit fields:
await client.admin.setCustomLimits.mutate({
  userId: 456,
  maxSources: 10000, // Override plan limit
  notes: "Enterprise trial user - higher source limit",
});
```

### Monitoring Rate Limit Usage

Check who's hitting limits:

```typescript
const stats = await client.admin.getStats.query();

console.log("Platform stats:", stats);
// Monitor usage patterns and adjust limits accordingly
```

---

## Security Monitoring

### View Security Audit Log

The security audit log tracks all authentication events:

```sql
-- Direct database query (SQLite)
SELECT
  action,
  userId,
  ipAddress,
  userAgent,
  success,
  createdAt
FROM security_audit_log
WHERE action IN ('login_success', 'login_failed', 'account_locked')
ORDER BY createdAt DESC
LIMIT 100;
```

### Common Security Patterns

**Brute Force Attack Detection**:

```sql
-- Find IPs with multiple failed logins
SELECT
  ipAddress,
  COUNT(*) as attempts,
  MIN(createdAt) as first_attempt,
  MAX(createdAt) as last_attempt
FROM security_audit_log
WHERE action = 'login_failed'
  AND createdAt > datetime('now', '-1 hour')
GROUP BY ipAddress
HAVING attempts >= 5
ORDER BY attempts DESC;
```

**Account Compromise Detection**:

```sql
-- Users with password changes and multiple IPs
SELECT
  userId,
  COUNT(DISTINCT ipAddress) as ip_count,
  COUNT(*) as events
FROM security_audit_log
WHERE action IN ('password_changed', 'login_success')
  AND createdAt > datetime('now', '-24 hours')
GROUP BY userId
HAVING ip_count > 3;
```

### Platform Statistics

```typescript
const stats = await client.admin.getStats.query();

console.log(`
Total Users: ${stats.totalUsers}
Active: ${stats.activeUsers}
Banned: ${stats.bannedUsers}

Users by Plan:
${Object.entries(stats.usersByPlan)
  .map(([plan, count]) => `  ${plan}: ${count}`)
  .join("\n")}

Resources:
  Sources: ${stats.totalSources}
  Public Feeds: ${stats.totalPublicFeeds}
  Categories: ${stats.totalCategories}
  Articles: ${stats.totalArticles}
`);
```

---

## Best Practices

### Rate Limiting

1. **Start conservative**: Begin with default settings and adjust based on legitimate usage patterns
2. **Monitor metrics**: Track rate limit hits and adjust before users complain
3. **Different tiers**: Free users get lower limits, paying users get higher limits
4. **VIP overrides**: Use custom limits for beta testers, enterprise trials, or partners

### User Management

1. **Ban, don't delete**: Banned users can be restored, deleted users cannot
2. **Document custom limits**: Always add notes when setting custom limits
3. **Regular audits**: Review custom limits monthly to remove expired overrides
4. **Monitor plan distribution**: Ensure most users are on appropriate plans

### Security

1. **Review audit logs**: Check for suspicious patterns weekly
2. **Adjust on attacks**: Tighten rate limits during active attacks
3. **Email notifications**: Implement email alerts for multiple failed logins
4. **GDPR compliance**: Set up automated audit log retention policies

---

## Troubleshooting

### Users Can't Login

1. Check global rate limit settings:

   ```typescript
   const settings = await client.admin.getGlobalSettings.query();
   console.log("Login attempts allowed:", settings.maxLoginAttempts);
   ```

2. Check if user is banned:
   ```typescript
   const user = await client.admin.getUser.query({ userId: 123 });
   console.log("Banned:", user.banned);
   ```

### API Rate Limit Complaints

1. Check user's effective limits:

   ```typescript
   const user = await client.admin.getUser.query({ userId: 123 });
   console.log("API limit:", user.limits.apiRateLimitPerMinute);
   console.log("Custom limits:", user.customLimits);
   ```

2. Consider upgrading their plan or adding custom limits

### Database Performance Issues

Rate limit settings are cached for 1 minute. If you change settings and they don't take effect:

- Wait 60 seconds for cache to expire
- Or restart the API server to clear cache

---

## API Reference

See `packages/api/src/routers/admin.ts` for complete endpoint documentation.

**Global Settings**:

- `admin.getGlobalSettings` - View settings
- `admin.updateGlobalSettings` - Update settings

**Plan Management**:

- `admin.listPlans` - List all plans
- `admin.getPlan` - Get plan details
- `admin.createPlan` - Create new plan
- `admin.updatePlan` - Update plan
- `admin.deletePlan` - Delete plan

**User Management**:

- `admin.listUsers` - List users (with filters)
- `admin.getUser` - Get user details
- `admin.changePlan` - Change user's plan
- `admin.setCustomLimits` - Override plan limits (maxSources, maxPublicFeeds, maxCategories only - rate limits cannot be customized)
- `admin.removeCustomLimits` - Remove overrides
- `admin.banUser` - Ban/unban user
- `admin.deleteUser` - Delete user
- `admin.recalculateUsage` - Fix usage stats

**Statistics**:

- `admin.getStats` - Platform statistics
