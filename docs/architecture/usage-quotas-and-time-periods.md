# Usage Quotas and Time Periods

## Overview

This document explains how TuvixRSS handles usage tracking, quotas, rate limiting, and time periods. Understanding this is critical for implementing billing features and monthly quota resets.

## Current Implementation Status

### ✅ What IS Implemented

1. **Static Usage Tracking** - Persistent counters that increment/decrement
2. **Plan-Based Quotas** - Fixed limits per plan tier
3. **Rate Limits** - Per-minute limits using Cloudflare Workers rate limit bindings
4. **Custom User Overrides** - Admin can set custom limits per user

### ❌ What is NOT Implemented

1. **Monthly Billing Cycles** - No cycle start/end dates
2. **Quota Reset Logic** - Usage never automatically resets
3. **Payment Processing** - No Stripe/payment integration
4. **Subscription Lifecycle** - No active/inactive/cancelled states
5. **Billing Periods** - No concept of "current billing period"

---

## 1. Usage Quotas (Persistent Tracking)

### How It Works

Usage quotas are **persistent counters** that track resource consumption over the lifetime of the account. They do NOT reset monthly.

**Tracked Resources** (in `usageStats` table):

- `sourceCount` - Number of RSS feeds user is subscribed to
- `publicFeedCount` - Number of public feeds/categories user has created
- `categoryCount` - Number of private categories user has created
- `articleCount` - Total number of articles in user's feeds (informational only)

**Database Location**: `packages/api/src/db/schema.ts`

```sql
CREATE TABLE usageStats (
  userId INTEGER PRIMARY KEY REFERENCES users(id),
  sourceCount INTEGER DEFAULT 0,
  publicFeedCount INTEGER DEFAULT 0,
  categoryCount INTEGER DEFAULT 0,
  articleCount INTEGER DEFAULT 0,
  lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Increment/Decrement Logic

**Service**: `packages/api/src/services/limits.ts`

**Operations**:

```typescript
// When user subscribes to a feed
incrementSourceCount(userId) → sourceCount++

// When user unsubscribes
decrementSourceCount(userId) → sourceCount--

// When user creates public feed
incrementPublicFeedCount(userId) → publicFeedCount++

// When user deletes public feed
decrementPublicFeedCount(userId) → publicFeedCount--

// When user creates category
incrementCategoryCount(userId) → categoryCount++

// When user deletes category
decrementCategoryCount(userId) → categoryCount--
```

**Enforcement**:

- Before allowing a new subscription/feed/category, check if `currentCount < limit`
- If limit reached, return error: `QuotaExceededError`
- Limits come from user's plan or custom overrides

**Recalculation**:

- `recalculateUsage(userId)` - Recounts from scratch to fix inconsistencies
- Manually triggered by admins or after bulk operations

### Plan Limits

**Database Location**: `packages/api/src/db/schema.ts`

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,  -- 'free', 'pro', 'enterprise'
  name TEXT NOT NULL,
  maxSources INTEGER NOT NULL,
  maxPublicFeeds INTEGER NOT NULL,
  maxCategories INTEGER,  -- NULL = unlimited
  apiRateLimitPerMinute INTEGER NOT NULL,
  publicFeedRateLimitPerMinute INTEGER NOT NULL,
  priceCents INTEGER NOT NULL,
  features TEXT,  -- JSON array of feature strings
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Default Plans** (`packages/api/src/config/plans.ts`):

| Plan       | Max Sources | Max Public Feeds | Max Categories | API Rate/min | Feed Rate/min | Price     |
| ---------- | ----------- | ---------------- | -------------- | ------------ | ------------- | --------- |
| Free       | 25          | 2                | 10             | 60           | 2             | $0        |
| Pro        | 500         | 25               | 100            | 180          | 17            | $9.99/mo  |
| Enterprise | 10000       | 200              | ∞              | 600          | 167           | $49.99/mo |

**Note**: Rate limits are enforced by plan-specific Cloudflare Workers bindings. Each plan has its own binding:

- Free: `FREE_API_RATE_LIMIT` (60/min)
- Pro: `PRO_API_RATE_LIMIT` (180/min)
- Enterprise: `ENTERPRISE_API_RATE_LIMIT` (600/min)

### Custom Limit Overrides

**Database Location**: `packages/api/src/db/schema.ts`

```sql
CREATE TABLE userLimits (
  userId INTEGER PRIMARY KEY REFERENCES users(id),
  maxSources INTEGER,
  maxPublicFeeds INTEGER,
  maxCategories INTEGER,
  apiRateLimitPerMinute INTEGER,  -- Deprecated: Rate limits cannot be customized
  publicFeedRateLimitPerMinute INTEGER,  -- Deprecated: Rate limits cannot be customized
  notes TEXT,  -- Admin notes explaining why custom limits applied
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Precedence**: Custom limits > Plan limits (for non-rate-limit fields only)

**Note**: Rate limits (`apiRateLimitPerMinute`, `publicFeedRateLimitPerMinute`) cannot be customized per-user. They are enforced by plan-specific Cloudflare Workers bindings. To change a user's rate limit, change their plan.

**Admin Actions**:

- `admin.setCustomLimits(userId, {...})` - Override specific limits
- `admin.removeCustomLimits(userId)` - Revert to plan defaults

---

## 2. Rate Limits (Time-Window Based)

### How It Works

Rate limits use **Cloudflare Workers rate limit bindings** for Cloudflare deployments, or are disabled for Docker Compose deployments.

**Implementation**: `packages/api/src/services/rate-limiter.ts`

**Types of Rate Limits**:

1. **API Rate Limit**
   - Window: Per minute (60 seconds)
   - Limit: Defined by plan (60-1000 requests/min)
   - Applied to: All authenticated API endpoints
   - Key format: `"api:${userId}"`
   - Storage: Cloudflare Workers `API_RATE_LIMIT` binding

2. **Public Feed Rate Limit**
   - Window: Per minute (60 seconds)
   - Limit: Defined by plan (~17-1667 requests/min)
   - Applied to: Public feed/RSS endpoint accesses
   - Key format: `"publicFeed:${userId}"`
   - Storage: Cloudflare Workers `FEED_RATE_LIMIT` binding

3. **Login Rate Limit**
   - Handled by Better Auth (disabled in our configuration)
   - No custom rate limiting for login endpoints

### Cloudflare Workers Rate Limit Bindings

```typescript
// For each incoming request:
// 1. Get user's plan limit
const limits = await getUserLimits(db, userId);

// 2. Select appropriate binding
const binding = type === "api" ? env.API_RATE_LIMIT : env.FEED_RATE_LIMIT;

// 3. Create unique key per user
const key = `${type}:${userId}`;

// 4. Call binding (consumes a request)
const result = await binding.limit({ key });

// 5. Enforce user's plan limit
const bindingUsed = result.limit - result.remaining; // Total requests made
const allowed = bindingUsed <= limits.limit;

if (!allowed) {
  // Reject request
  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(result.reset * 1000), // Binding provides reset time
  };
}

// Allow request
return {
  allowed: true,
  remaining: Math.max(0, limits.limit - bindingUsed),
  resetAt: new Date(result.reset * 1000),
};
```

### Storage

- **Cloudflare Workers**: Uses rate limit bindings (distributed, edge-based)
- **Docker Compose**: Rate limiting disabled (always allows requests)

### Time Window Resets

Rate limits reset automatically every minute (60 seconds) via Cloudflare Workers bindings. The binding tracks requests per key and automatically resets the counter at the end of each minute window.

Example for API rate limit (60 requests/min):

- Requests between 10:00:00-10:00:59 → counted together
- At 10:01:00 → counter resets, new window begins
- Requests between 10:01:00-10:01:59 → counted in new window

---

## 3. Billing Cycles (NOT IMPLEMENTED)

### Current State

**TuvixRSS does NOT have monthly billing cycles.**

**Missing Components**:

- No `subscriptionDate` field in users table
- No `nextBillingDate` or `currentPeriodEnd`
- No `billingCycleStart` or `billingCycleEnd` in usage stats
- No payment processing integration
- No subscription status (active/inactive/past_due/cancelled)
- No invoice generation or payment history

### How Plans Are Assigned

Currently, plans are assigned **manually by admins**:

1. Admin navigates to admin users page
2. Selects user
3. Changes plan dropdown to 'free', 'pro', 'enterprise', or 'custom'
4. User immediately gets new limits
5. **No payment verification** - trust-based system

**API**: `admin.changePlan(userId, planId)`
**Database**: Updates `users.plan` field

### What Would Be Needed for Billing

To implement proper SaaS billing, you would need:

#### Database Schema Additions

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN subscriptionStatus TEXT DEFAULT 'none';
  -- Values: 'none', 'trialing', 'active', 'past_due', 'cancelled', 'unpaid'
ALTER TABLE users ADD COLUMN subscriptionId TEXT;  -- Stripe subscription ID
ALTER TABLE users ADD COLUMN customerId TEXT;  -- Stripe customer ID
ALTER TABLE users ADD COLUMN currentPeriodStart TIMESTAMP;
ALTER TABLE users ADD COLUMN currentPeriodEnd TIMESTAMP;
ALTER TABLE users ADD COLUMN cancelAtPeriodEnd BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN trialEnd TIMESTAMP;

-- Add payment history table
CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  userId INTEGER REFERENCES users(id),
  stripePaymentIntentId TEXT UNIQUE,
  amountCents INTEGER,
  currency TEXT DEFAULT 'usd',
  status TEXT,  -- 'succeeded', 'failed', 'pending'
  failureReason TEXT,
  paidAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add invoices table
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  userId INTEGER REFERENCES users(id),
  stripeInvoiceId TEXT UNIQUE,
  amountDue INTEGER,
  amountPaid INTEGER,
  currency TEXT DEFAULT 'usd',
  status TEXT,  -- 'draft', 'open', 'paid', 'void', 'uncollectible'
  periodStart TIMESTAMP,
  periodEnd TIMESTAMP,
  dueDate TIMESTAMP,
  paidAt TIMESTAMP,
  invoiceUrl TEXT,
  invoicePdfUrl TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add usage tracking per billing cycle
CREATE TABLE usageHistory (
  id INTEGER PRIMARY KEY,
  userId INTEGER REFERENCES users(id),
  billingPeriodStart TIMESTAMP,
  billingPeriodEnd TIMESTAMP,
  sourceCount INTEGER,
  publicFeedCount INTEGER,
  categoryCount INTEGER,
  apiCallCount INTEGER,  -- If implementing metered billing
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Services to Implement

1. **Payment Service** (`services/payments.ts`)
   - Stripe integration
   - Create customer, subscription, payment method
   - Handle webhooks for payment events
   - Process refunds

2. **Billing Service** (`services/billing.ts`)
   - Start subscription (on plan upgrade)
   - Cancel subscription (with immediate or period-end options)
   - Change subscription (proration logic)
   - Generate invoices
   - Send payment reminders

3. **Subscription Lifecycle Service** (`services/subscriptions.ts`)
   - Handle subscription renewal
   - Downgrade on payment failure after grace period
   - Archive usage stats at end of billing cycle
   - Reset monthly quotas (if implementing monthly limits)
   - Trial period management

4. **Webhook Handler** (`routers/stripe-webhooks.ts`)
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.failed`

#### Monthly Quota Reset Logic

**Option 1: Hard Reset on Billing Cycle**

```typescript
// On subscription renewal (webhook: invoice.payment_succeeded)
async function resetMonthlyQuotas(userId: number) {
  // Archive current period usage
  await db.insert(usageHistory).values({
    userId,
    billingPeriodStart: subscription.currentPeriodStart,
    billingPeriodEnd: subscription.currentPeriodEnd,
    sourceCount: usage.sourceCount,
    // ... other counts
  });

  // Reset usage stats (or keep persistent - depends on UX)
  // Note: For TuvixRSS, sources/feeds are ongoing subscriptions,
  // so you likely DON'T want to reset these. They're cumulative.
  // You might add NEW metrics like:
  await db
    .update(usageStats)
    .set({
      apiCallsThisMonth: 0,
      articlesViewedThisMonth: 0,
      publicFeedAccessesThisMonth: 0,
    })
    .where(eq(usageStats.userId, userId));
}
```

**Option 2: Metered Billing (Usage-Based)**

```typescript
// Track usage per billing cycle
// At end of cycle, calculate overage charges
async function calculateOverageCharges(userId: number) {
  const usage = await getUserUsage(userId);
  const limits = await getUserLimits(userId);

  const overage = {
    sources: Math.max(0, usage.sourceCount - limits.maxSources),
    publicFeeds: Math.max(0, usage.publicFeedCount - limits.maxPublicFeeds),
  };

  const overageCharge =
    overage.sources * 0.1 + // $0.10 per extra source
    overage.publicFeeds * 1.0; // $1.00 per extra public feed

  if (overageCharge > 0) {
    await createInvoiceLineItem(userId, "Overage Charges", overageCharge);
  }
}
```

**Recommended for TuvixRSS**: **No monthly reset**, keep cumulative tracking. Only reset transient metrics like API calls or feed accesses if you want to add soft limits.

---

## 4. Time Period Determination Strategies

If implementing billing cycles, here are strategies for determining billing periods:

### Strategy 1: Anniversary Billing (Recommended)

User's billing cycle starts on the day they subscribe and renews monthly on that date.

**Example**:

- User subscribes on January 15, 2025
- Billing cycles:
  - Period 1: Jan 15 - Feb 15
  - Period 2: Feb 15 - Mar 15
  - Period 3: Mar 15 - Apr 15

**Pros**:

- Stripe's default behavior
- Fair to users (full month from signup)
- Spreads billing load evenly across calendar

**Cons**:

- Different users have different billing dates
- More complex to report "monthly revenue"

**Implementation**:

```typescript
// On subscription creation
const subscriptionStartDate = new Date();
const currentPeriodEnd = new Date(subscriptionStartDate);
currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

await db
  .update(users)
  .set({
    subscriptionStatus: "active",
    currentPeriodStart: subscriptionStartDate,
    currentPeriodEnd: currentPeriodEnd,
  })
  .where(eq(users.id, userId));
```

### Strategy 2: Calendar Month Billing

All users' billing cycles align to calendar months (1st of month).

**Example**:

- User subscribes on January 15, 2025
- First period: Jan 15 - Jan 31 (prorated)
- Subsequent periods:
  - Period 2: Feb 1 - Feb 28
  - Period 3: Mar 1 - Mar 31

**Pros**:

- Easier accounting and reporting
- Simplifies "monthly active users" metrics
- Easier to understand for users

**Cons**:

- Requires proration logic for mid-month signups
- All renewals on same day (billing system load spike)
- Less fair to users who join mid-month

**Implementation**:

```typescript
// On subscription creation
const subscriptionStartDate = new Date();
const firstPeriodEnd = new Date(
  subscriptionStartDate.getFullYear(),
  subscriptionStartDate.getMonth() + 1,
  1
);
const daysInFirstPeriod = Math.ceil(
  (firstPeriodEnd.getTime() - subscriptionStartDate.getTime()) /
    (1000 * 60 * 60 * 24)
);
const daysInMonth = new Date(
  subscriptionStartDate.getFullYear(),
  subscriptionStartDate.getMonth() + 1,
  0
).getDate();
const proratedAmount = (plan.priceCents * daysInFirstPeriod) / daysInMonth;

// Charge prorated amount for first period
await createInvoice(
  userId,
  proratedAmount,
  subscriptionStartDate,
  firstPeriodEnd
);

// Set next billing to start of next month
await db
  .update(users)
  .set({
    subscriptionStatus: "active",
    currentPeriodStart: subscriptionStartDate,
    currentPeriodEnd: firstPeriodEnd,
  })
  .where(eq(users.id, userId));
```

### Strategy 3: Fixed Billing Day (e.g., 1st of every month)

Like Strategy 2, but ALWAYS bill on specific day (e.g., 1st).

**Use Case**: Enterprise contracts often specify "Net 30" terms starting on 1st of month.

**Implementation**: Same as Strategy 2, but:

- Trial period extends until the 1st of next month
- Proration only for first partial month
- All subsequent bills on 1st

---

## 5. Current User Journey (Without Billing)

### New User Signup

1. User creates account (`auth.register()`)
2. User automatically assigned `plan: 'free'`
3. Usage stats initialized with zeros
4. User can immediately use app within free tier limits

### Plan Upgrade (Manual)

1. Admin navigates to `/app/admin/users`
2. Finds user in list
3. Clicks "Change Plan"
4. Selects 'pro' or 'enterprise'
5. User immediately gets new limits
6. No payment collected

### Quota Enforcement

1. User tries to subscribe to feed
2. Backend checks `sourceCount < maxSources`
3. If under limit: subscription created, `sourceCount++`
4. If at limit: returns 403 error with message "Source limit reached"
5. Frontend shows error toast

### Rate Limit Enforcement

1. User makes API request
2. Rate limiter calls Cloudflare Workers binding
3. Binding tracks request and returns status
4. Application code enforces user's plan limit
5. If under limit: request proceeds
6. If at limit: returns 429 Too Many Requests (no headers)

---

## 6. Proposed Future Implementation

### Phase 1: Billing Infrastructure (Foundation)

**Goal**: Add payment processing without changing quota system.

**Deliverables**:

1. Add database fields: `subscriptionStatus`, `subscriptionId`, `customerId`, `currentPeriodStart`, `currentPeriodEnd`
2. Integrate Stripe SDK
3. Create payment service with webhook handlers
4. Add payment history and invoice tables
5. Build user-facing billing settings page (update card, view invoices)
6. Modify plan change flow to use Stripe checkout

**Quota Behavior**: Keep persistent tracking (no resets)

### Phase 2: Subscription Lifecycle

**Goal**: Automate subscription management and handle payment failures.

**Deliverables**:

1. Implement subscription status state machine
2. Add trial period support (14 days)
3. Build dunning flow (retry failed payments, send emails)
4. Implement grace period (3 days past due before downgrade)
5. Add subscription cancellation (immediate vs. end of period)
6. Build admin tools to manually adjust subscriptions

**Quota Behavior**: Still persistent, but add status checks (suspend features if payment fails)

### Phase 3: Usage History & Analytics

**Goal**: Track usage over time for insights and potential metered billing.

**Deliverables**:

1. Create `usageHistory` table
2. Archive usage stats at end of each billing cycle
3. Build usage trends dashboard for users
4. Add admin analytics: revenue per plan, churn rate, LTV
5. Implement usage alerts (email when 80% of quota used)

**Quota Behavior**: Still persistent, but now with historical tracking

### Phase 4: Metered Billing (Optional)

**Goal**: Charge for overage or usage-based pricing.

**Deliverables**:

1. Add new usage metrics: `apiCallsThisMonth`, `articlesViewedThisMonth`
2. Reset these metrics at start of billing cycle
3. Calculate overage charges at end of cycle
4. Add overage line items to invoices
5. Build overage pricing configuration in admin

**Quota Behavior**: Hybrid - some persistent (sources, feeds), some monthly (API calls, views)

---

## 7. Recommendations

### For Current System (No Billing)

**Keep it simple**:

- Persistent usage tracking is correct for TuvixRSS use case
- Sources and feeds are ongoing subscriptions, not consumable resources
- Rate limits with per-minute windows work well for abuse prevention
- Manual plan changes are fine for MVP/beta

**Improvements to consider**:

1. Add "soft limits" with warnings at 80% and 90% usage
2. Implement usage trend graphs on user settings page
3. Add email notifications when approaching limits
4. Build self-service plan upgrade flow (even without payment)

### For Future Billing Implementation

**Start with anniversary billing**:

- Stripe handles it automatically
- Fairest to users
- Less complex than proration

**DON'T reset source/feed quotas**:

- These are cumulative resources, not consumables
- Resetting would mean users lose their feeds each month (terrible UX)
- Instead, keep persistent tracking

**DO consider resetting transient metrics** (if added):

- API call count per month
- Public feed access count per month
- Articles viewed per month
- These make sense for usage-based soft limits or overage pricing

**Billing cycle determination**:

```typescript
// Store on subscription creation
currentPeriodStart = new Date(); // When they subscribed
currentPeriodEnd = addMonths(currentPeriodStart, 1); // 30 days later

// On renewal (Stripe webhook)
currentPeriodStart = currentPeriodEnd; // Roll forward
currentPeriodEnd = addMonths(currentPeriodStart, 1);
```

---

## 8. Key Takeaways

1. **TuvixRSS does NOT have monthly billing cycles currently** - it's a persistent quota system
2. **Rate limits ≠ billing cycles** - they use per-minute windows that reset automatically
3. **Usage tracking is cumulative** - counts go up/down but never reset to zero
4. **Plan changes are instant** - no proration or billing period alignment
5. **To add billing**, you need: Stripe integration, subscription lifecycle management, and billing period tracking
6. **For billing periods**, use anniversary billing (Stripe default) for simplest implementation
7. **Don't reset source/feed quotas** - they're ongoing resources, not monthly allocations
8. **DO reset API/access metrics** (if added) - these make sense as monthly soft limits

---

## Related Files

- Database Schema: `packages/api/src/db/schema.ts`
- Limits Service: `packages/api/src/services/limits.ts`
- Rate Limiter: `packages/api/src/services/rate-limiter.ts`
- Plans Config: `packages/api/src/config/plans.ts`
- Admin Router: `packages/api/src/routers/admin.ts`
- User Settings Router: `packages/api/src/routers/userSettings.ts`
- User Settings UI: `packages/app/src/routes/app/settings.tsx`
