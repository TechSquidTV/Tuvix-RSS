# tRPC API Architecture

This document provides comprehensive documentation of the TuvixRSS tRPC API architecture, including routers, middleware, authentication, and deployment adapters.

## Table of Contents

- [Core Configuration](#core-configuration)
- [Middleware & Authorization](#middleware--authorization)
- [Context Creation](#context-creation)
- [Application Router](#application-router)
- [API Routers](#api-routers)
- [Deployment Adapters](#deployment-adapters)
- [Type Safety](#type-safety)
- [File Organization](#file-organization)
- [Client Configuration](#client-configuration)

## Core Configuration

### Location

`packages/api/src/trpc/`

### Key Files

- **`init.ts`** - tRPC initialization with middleware definitions
- **`router.ts`** - Main application router combining all sub-routers
- **`context.ts`** - Request context creation for all requests

## Middleware & Authorization

The tRPC instance uses a layered middleware approach for authentication, authorization, and rate limiting.

### Middleware Chain

```
Request
  ↓
Context Creation (Better Auth session extraction, DB setup)
  ↓
Procedure Type Selection:
  ├─ publicProcedure (no auth)
  ├─ protectedProcedure (auth required)
  │   └─ isAuthed middleware (user check, ban check, email verification check)
  ├─ protectedProcedureWithoutVerification (auth required, no email verification check)
  │   └─ isAuthedWithoutVerification middleware (user check, ban check only)
  ├─ adminProcedure (admin role required)
  │   └─ isAdmin middleware (role verification)
  └─ rateLimitedProcedure (auth + rate limiting)
      └─ withRateLimit middleware (API rate limits)
```

### Middleware Details

#### 1. isAuthed Middleware

**Location:** `packages/api/src/trpc/init.ts:39-86`

**Purpose:** Ensures user is authenticated, not banned, and email verified (if required)

**Checks:**

- Better Auth session exists in context
- User exists in database
- User is not banned
- Email verification status (if `requireEmailVerification` is enabled in global settings)
- Admin users bypass email verification check
- Narrows TypeScript type to guarantee non-null user

**Error Codes:**

- `UNAUTHORIZED` - No user in context or user not found
- `FORBIDDEN` - User account is banned or email verification required

#### 1a. isAuthedWithoutVerification Middleware

**Location:** `packages/api/src/trpc/init.ts:90-128`

**Purpose:** Ensures user is authenticated and not banned, but skips email verification check

**Checks:**

- Better Auth session exists in context
- User exists in database
- User is not banned
- **Does NOT check email verification** (allows unverified users to access verification endpoints)

**Error Codes:**

- `UNAUTHORIZED` - No user in context or user not found
- `FORBIDDEN` - User account is banned

**Use Case:** Used by `protectedProcedureWithoutVerification` for endpoints that unverified users need to access (e.g., `checkVerificationStatus`, `resendVerificationEmail`)

#### 2. isAdmin Middleware

**Location:** `packages/api/src/trpc/init.ts:126-169`

**Purpose:** Restricts access to admin-only operations

**Checks:**

- All `isAuthed` checks (inherits from protectedProcedure)
- User role is "admin" from Better Auth session

**Error Codes:**

- `FORBIDDEN` - User is not an admin

#### 3. withRateLimit Middleware

**Location:** `packages/api/src/trpc/init.ts:178-207`

**Purpose:** Enforces API rate limits per user

**Features:**

- Applies only to authenticated users
- Checks API rate limit per minute (from user's plan)
- Returns rate limit status in context
- Throws error if limit exceeded

**Error Response:**

```typescript
{
  code: "TOO_MANY_REQUESTS",
  message: "API rate limit exceeded. Try again in X seconds."
}
```

#### 4. withLimitCheck Middleware

**Location:** `packages/api/src/trpc/init.ts:81-116`

**Purpose:** Factory function for resource-specific limit checking

**Supported Resources:**

- `sources` - RSS feed subscriptions
- `publicFeeds` - Public RSS feeds
- `categories` - Article categories

**Context Addition:**

```typescript
{
  limitCheck: {
    resource: string;
    limit: number;
    current: number;
    canAdd: boolean;
  }
}
```

### Exported Procedure Types

```typescript
// No authentication required
publicProcedure

// Authentication required
protectedProcedure

// Authentication + Admin role
adminProcedure

// Authentication + Rate limit checking
rateLimitedProcedure

// Authentication + Resource limit factory
createProtectedWithLimit(resource: "sources" | "publicFeeds" | "categories")
```

## Context Creation

**Location:** `packages/api/src/trpc/context.ts`

### Context Structure

```typescript
{
  db: DatabaseConnection           // Drizzle ORM instance
  user: AuthUser | null            // From Better Auth session: { userId, username, role }
  env: Env                          // Environment variables
  headers: Record<string, string>   // Request headers
  req: FetchRequest                 // Raw request object

  // Added by middleware:
  limitCheck?: LimitCheckResult     // From withLimitCheck
  rateLimit?: RateLimitResult       // From withRateLimit
}
```

### Database Initialization

The context automatically selects the appropriate database based on environment:

- **Node.js/Docker:** SQLite via `packages/api/src/db/client.ts`
- **Cloudflare Workers:** D1 Database via binding

### Better Auth Session Extraction

1. Better Auth extracts session from HTTP-only cookies
2. Verifies with `BETTER_AUTH_SECRET` from environment
3. Invalid/missing sessions don't fail - user stays null (enables public procedures)

### AuthUser Type

```typescript
{
  userId: number;
  username: string;
  role: "user" | "admin";
}
```

## Application Router

**Location:** `packages/api/src/trpc/router.ts`

### Combined Routers

```typescript
appRouter = {
  auth, // Authentication (register, login, password reset)
  articles, // Article retrieval and state management
  subscriptions, // RSS feed subscriptions
  categories, // Category/tag management
  feeds, // Public feed aggregation and management
  userSettings, // User preferences
  admin, // Admin operations
  plans, // Subscription plans
};
```

### Type Export

```typescript
export type AppRouter = typeof appRouter; // For frontend type safety
```

This type is imported by the frontend to achieve end-to-end type safety with zero code generation.

## API Routers

### Auth Router

**Location:** `packages/api/src/routers/auth.ts`

#### Public Procedures

##### `register`

- **Purpose:** Create new user account (uses Better Auth internally)
- **Input:** `{ username, email, password }`
- **Features:**
  - Checks `allowRegistration` global setting (blocks if disabled)
  - Password validation and hashing (scrypt via Better Auth)
  - First user auto-promotion to admin (if `ALLOW_FIRST_USER_ADMIN=true`)
  - Security event logging
  - Email verification email sent if `requireEmailVerification` is enabled
  - Session created automatically via HTTP-only cookies
- **Returns:** `{ user }` (session managed via Better Auth cookies)
- **Error:** `FORBIDDEN` if registration is disabled

##### `login`

- **Purpose:** Authenticate user (uses Better Auth internally)
- **Input:** `{ username, password }`
- **Features:**
  - Account lockout after failed attempts (configurable)
  - Security event logging
  - Ban check
  - Session created automatically via HTTP-only cookies
- **Returns:** `{ success: true }` (session managed via Better Auth cookies)

##### `requestPasswordReset`

- **Purpose:** Initiate password reset flow
- **Input:** `{ email }`
- **Features:**
  - Generates secure reset token
  - Sends email via Resend (if configured)
  - No email enumeration (always returns success)
- **Returns:** `{ success: true }`

##### `resetPassword`

- **Purpose:** Complete password reset with token
- **Input:** `{ token, newPassword }`
- **Features:**
  - Token validation and expiration check
  - Password hashing
  - Security event logging
- **Returns:** `{ success: true }`

#### Protected Procedures

##### `me`

- **Purpose:** Get current authenticated user from Better Auth session
- **Returns:** `{ id, username, email, role, plan, banned, emailVerified, ... }`

##### `checkVerificationStatus`

- **Purpose:** Check if email verification is required and current verification status
- **Procedure Type:** `protectedProcedureWithoutVerification` (accessible to unverified users)
- **Returns:** `{ requiresVerification: boolean, emailVerified: boolean }`
- **Use Case:** Allows unverified users to check their verification status

##### `resendVerificationEmail`

- **Purpose:** Resend verification email to authenticated user
- **Procedure Type:** `protectedProcedureWithoutVerification` (accessible to unverified users)
- **Features:**
  - Rate limited: max 1 request per 5 minutes per user
  - Only works if `requireEmailVerification` is enabled
  - Creates new verification token and sends email
- **Returns:** `{ success: boolean, message: string }`
- **Error:** `TOO_MANY_REQUESTS` if rate limit exceeded

##### `changePassword`

- **Purpose:** Change password with current password verification
- **Input:** `{ currentPassword, newPassword }`
- **Returns:** `{ success: true }`

---

### Subscriptions Router

**Location:** `packages/api/src/routers/subscriptions.ts`

All procedures use `rateLimitedProcedure`.

##### `list`

- **Purpose:** List user's RSS feed subscriptions
- **Input:** `{ offset?, limit? }`
- **Features:**
  - Pagination support
  - N+1 query prevention (bulk category/filter fetching)
  - Includes category details and filters
- **Returns:** Array of subscriptions with metadata

##### `add`

- **Purpose:** Subscribe to RSS feed
- **Input:** `{ url, categoryId? }`
- **Features:**
  - Resource limit checking
  - RSS feed parsing and validation
  - Favicon auto-detection
  - Category discovery from feed metadata
- **Returns:** New subscription object

##### `remove`

- **Purpose:** Unsubscribe from RSS feed
- **Input:** `{ id }`
- **Returns:** `{ success: true }`

##### `update`

- **Purpose:** Update subscription settings
- **Input:** `{ id, categoryId?, enabled? }`
- **Returns:** Updated subscription object

##### `addFilter`

- **Purpose:** Add content filter to subscription
- **Input:** `{ subscriptionId, field, pattern, type: "include" | "exclude" }`
- **Returns:** New filter object

##### `removeFilter`

- **Purpose:** Remove content filter
- **Input:** `{ id }`
- **Returns:** `{ success: true }`

##### `importOpml`

- **Purpose:** Import subscriptions from OPML file
- **Input:** `{ opml: string }`
- **Features:**
  - Parses OPML XML
  - Creates categories from outline structure
  - Validates against resource limits
- **Returns:** `{ imported, skipped, errors }`

##### `exportOpml`

- **Purpose:** Export subscriptions to OPML format
- **Returns:** OPML XML string

---

### Articles Router

**Location:** `packages/api/src/routers/articles.ts`

All procedures use `rateLimitedProcedure`.

##### `list`

- **Purpose:** Retrieve articles with filters
- **Input:**
  ```typescript
  {
    offset?, limit?
    filter?: "all" | "unread" | "read" | "saved"
    subscriptionId?
    categoryId?
    searchTerm?
    startDate?, endDate?
  }
  ```
- **Features:**
  - Pagination
  - Filter by read/saved status
  - Filter by subscription or category
  - Search by title/content
  - Date range filtering
  - Applies subscription filters (include/exclude patterns)
- **Returns:** Array of articles with source metadata

##### `markRead`

- **Purpose:** Mark article as read/unread
- **Input:** `{ id, read: boolean }`
- **Returns:** `{ success: true }`

##### `markSaved`

- **Purpose:** Mark article as saved/unsaved
- **Input:** `{ id, saved: boolean }`
- **Returns:** `{ success: true }`

##### `batchMarkRead`

- **Purpose:** Bulk mark articles as read
- **Input:** `{ ids: number[] }`
- **Features:** Batch processing with `executeBatch`
- **Returns:** `{ success: true, count }`

##### `markAllRead`

- **Purpose:** Mark all articles as read (with filters)
- **Input:** `{ subscriptionId?, categoryId?, beforeDate? }`
- **Returns:** `{ success: true, count }`

---

### Categories Router

**Location:** `packages/api/src/routers/categories.ts`

All procedures use `rateLimitedProcedure`.

##### `list`

- **Purpose:** List user's categories
- **Returns:** Array of `{ id, name, color, ... }`

##### `create`

- **Purpose:** Create new category
- **Input:** `{ name, color? }`
- **Features:**
  - Resource limit checking
  - Unique name validation
  - Auto-generates color if not provided
- **Returns:** New category object

##### `update`

- **Purpose:** Update category properties
- **Input:** `{ id, name?, color? }`
- **Returns:** Updated category object

##### `delete`

- **Purpose:** Delete category
- **Input:** `{ id }`
- **Features:** Removes category from all subscriptions
- **Returns:** `{ success: true }`

---

### Feeds Router

**Location:** `packages/api/src/routers/feeds.ts`

Mix of `rateLimitedProcedure` (authenticated) and `publicProcedure` (RSS generation).

##### `list` (protected)

- **Purpose:** List user's public feeds
- **Returns:** Array of public feed configurations

##### `create` (protected)

- **Purpose:** Create public RSS feed
- **Input:**
  ```typescript
  {
    (title, description);
    slug;
    categoryId ? isPublic : boolean;
  }
  ```
- **Features:**
  - Resource limit checking
  - Unique slug validation
  - Privacy controls
- **Returns:** New feed object

##### `update` (protected)

- **Purpose:** Update feed settings
- **Input:** `{ id, title?, description?, isPublic? }`
- **Returns:** Updated feed object

##### `delete` (protected)

- **Purpose:** Delete public feed
- **Input:** `{ id }`
- **Returns:** `{ success: true }`

##### `generate` (public)

- **Purpose:** Generate RSS XML for public feed
- **Input:** `{ username, slug }`
- **Features:**
  - Rate limit checking (via adapter)
  - Cache headers (5 minutes)
  - OPML-style category grouping
- **Returns:** RSS 2.0 XML string

---

### User Settings Router

**Location:** `packages/api/src/routers/userSettings.ts`

All procedures use `rateLimitedProcedure`.

##### `get`

- **Purpose:** Get user preferences
- **Returns:** Settings object with defaults

##### `update`

- **Purpose:** Update user settings
- **Input:**
  ```typescript
  {
    theme?: "system" | "light" | "dark"
    autoAgeDays?: number
    defaultFilter?: "all" | "unread" | "read" | "saved"
    shareEmail?: boolean
    shareHackernews?: boolean
    shareReddit?: boolean
    shareTwitter?: boolean
    shareBluesky?: boolean
    shareMastodon?: boolean
  }
  ```
- **Returns:** Updated settings object

---

### Admin Router

**Location:** `packages/api/src/routers/admin.ts`

All procedures use `adminProcedure`.

##### `listUsers`

- **Purpose:** List all users with filtering
- **Input:**
  ```typescript
  {
    offset?, limit?
    search?  // Username or email
    role?: "user" | "admin"
    plan?: string
    banned?: boolean
  }
  ```
- **Features:**
  - Pagination
  - Search by username/email
  - Filter by role, plan, ban status
- **Returns:** Array of users with usage/limit stats

##### `getUser`

- **Purpose:** Get detailed user information
- **Input:** `{ userId }`
- **Returns:**
  ```typescript
  {
    user: { id, username, email, role, plan, banned, ... }
    usage: { sourceCount, publicFeedCount, categoryCount, articleCount }
    limits: { maxSources, maxPublicFeeds, maxCategories, apiRateLimitPerMinute }
    customLimits: { per-user overrides }
    rateLimit: { apiUsagePercent, feedUsagePercent }
  }
  ```

##### `updateUserPlan`

- **Purpose:** Change user's subscription plan
- **Input:** `{ userId, plan }`
- **Returns:** Updated user object

##### `banUser`

- **Purpose:** Ban or unban user account
- **Input:** `{ userId, banned: boolean, reason?: string }`
- **Returns:** Updated user object

##### `setUserLimit`

- **Purpose:** Set custom limit for specific user
- **Input:**
  ```typescript
  {
    userId;
    limitType: "maxSources" |
      "maxPublicFeeds" |
      "maxCategories" |
      "apiRateLimitPerMinute";
    limitValue: number;
  }
  ```
- **Returns:** `{ success: true }`

##### `removeUserLimit`

- **Purpose:** Remove custom limit (revert to plan default)
- **Input:** `{ userId, limitType }`
- **Returns:** `{ success: true }`

##### Rate Limiting

- **Note:** Rate limit reset functionality has been removed
- Rate limits automatically reset every minute via Cloudflare Workers bindings

---

### Plans Router

**Location:** `packages/api/src/routers/plans.ts`

##### `list` (public)

- **Purpose:** List all available subscription plans
- **Returns:** Array of plan objects

##### `getById` (public)

- **Purpose:** Get plan details by ID
- **Input:** `{ id }`
- **Returns:** Plan object or null

**Plan Structure:**

```typescript
{
  id: string;
  name: string;
  maxSources: number;
  maxPublicFeeds: number;
  maxCategories: number | null;
  apiRateLimitPerMinute: number;
  publicFeedRateLimitPerMinute: number;
  priceCents: number;
  features: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## Deployment Adapters

TuvixRSS supports two deployment targets with a single codebase.

### Express Adapter

**Location:** `packages/api/src/adapters/express.ts`

**Deployment:** Docker/Node.js servers

#### Features

1. **CORS Configuration**
   - Origin checking from `CORS_ORIGIN` env var
   - Credentials support
   - Common headers (Authorization, Content-Type, etc.)

2. **Health Check Endpoint**
   - Route: `GET /health`
   - Response: `{ status: "ok", timestamp, environment }`

3. **Public RSS Endpoint**
   - Route: `GET /public/:username/:slug`
   - Features:
     - Rate limit checking (per feed owner, per minute)
     - Access logging
     - Cache headers (5 minutes)
   - Returns: RSS 2.0 XML

4. **tRPC Middleware**
   - Route: `POST /trpc/*`
   - Uses `createExpressMiddleware`
   - Error logging

#### Initialization

```typescript
app.use(cors({ origin, credentials: true }));
app.use(express.json());
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError,
  })
);
app.listen(PORT);
```

#### Environment Variables

```bash
DATABASE_PATH=/data/tuvix.db
PORT=3001
CORS_ORIGIN=http://localhost:5173,https://app.tuvix.dev
NODE_ENV=production
BETTER_AUTH_SECRET=your-secret-key
```

---

### Cloudflare Workers Adapter

**Location:** `packages/api/src/adapters/cloudflare.ts`

**Deployment:** Cloudflare Workers (edge runtime)

#### Features

1. **Fetch Handler**
   - Handles all HTTP requests
   - Route matching via URL path

2. **Scheduled Handler**
   - Handles cron triggers
   - RSS fetch based on intervals
   - Article pruning (daily)

3. **Public RSS Endpoint**
   - Route: `GET /public/:username/:slug`
   - Rate limiting via Durable Objects
   - Same features as Express adapter

4. **Admin Initialization**
   - Route: `POST /_admin/init`
   - Bootstrap admin user creation
   - Development-only endpoint

5. **CORS Headers**
   - Automatic OPTIONS preflight handling
   - Origin validation

#### Route Handlers

```typescript
GET  /health              → Health check
POST /_admin/init         → Bootstrap admin user
GET  /public/:user/:slug  → Public RSS feed
POST /trpc/*              → tRPC API
OPTIONS *                 → CORS preflight
```

#### Bindings (wrangler.toml)

```toml
[env.production]
name = "tuvix-api"

[[env.production.d1_databases]]
binding = "DB"
database_id = "${D1_DATABASE_ID}"  # Environment variable

[[env.production.ratelimits]]
name = "API_RATE_LIMIT"
namespace_id = "1001"
simple = { limit = 10000, period = 60 }

[[env.production.ratelimits]]
name = "FEED_RATE_LIMIT"
namespace_id = "1002"
simple = { limit = 10000, period = 60 }
```

#### Environment Variables

```bash
BETTER_AUTH_SECRET=your-secret-key
CORS_ORIGIN=https://app.tuvix.dev
BASE_URL=https://api.tuvix.dev
RESEND_API_KEY=your-resend-key  # Optional
```

---

### Adapter Comparison

| Feature       | Express      | Cloudflare Workers                     |
| ------------- | ------------ | -------------------------------------- |
| Runtime       | Node.js      | V8 Isolate (Edge)                      |
| Database      | SQLite       | D1 (SQLite)                            |
| Rate Limiting | Disabled     | Cloudflare Workers rate limit bindings |
| Cron Jobs     | Same process | Scheduled events                       |
| File System   | Yes          | No                                     |
| Cold Start    | N/A          | ~0ms                                   |
| Scaling       | Vertical     | Automatic (global)                     |
| Cost          | Server-based | Pay-per-request                        |

## Type Safety

**Location:** `packages/api/src/types/index.ts`

### Type Exports

#### Auto-generated from Drizzle ORM

```typescript
(selectUserSchema, insertUserSchema, updateUserSchema);
(selectCategorySchema, insertCategorySchema, updateCategorySchema);
(selectSubscriptionSchema, insertSubscriptionSchema, updateSubscriptionSchema);
(selectArticleSchema, articleWithSourceSchema);
(selectFeedSchema, insertFeedSchema, updateFeedSchema);
// ... and more
```

#### Custom Types

```typescript
// Environment configuration
type Env = {
  BETTER_AUTH_SECRET: string;
  DATABASE_PATH?: string;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;

  // Cloudflare bindings
  DB?: D1Database;
  API_RATE_LIMIT?: RateLimit;
  FEED_RATE_LIMIT?: RateLimit;

  // Optional services
  RESEND_API_KEY?: string;
  BASE_URL?: string;
};

// Better Auth session user (extracted from session)
type AuthUser = {
  userId: number;
  username: string;
  role: "user" | "admin";
};
```

### Frontend Type Safety

The frontend achieves full end-to-end type safety by importing the `AppRouter` type:

```typescript
// In frontend: packages/app/src/lib/api/trpc.ts
import type { AppRouter } from "@tuvix/api";

export const trpc = createTRPCReact<AppRouter>();
```

This provides:

- TypeScript autocomplete for all procedures
- Input validation via Zod schemas
- Typed return values
- No code generation required

## File Organization

```
packages/api/src/
├── trpc/                          # Core tRPC setup
│   ├── init.ts                    # Middleware & procedure types
│   ├── router.ts                  # Main app router
│   └── context.ts                 # Context creation
├── routers/                       # API endpoints
│   ├── auth.ts
│   ├── subscriptions.ts
│   ├── articles.ts
│   ├── categories.ts
│   ├── feeds.ts
│   ├── userSettings.ts
│   ├── admin.ts
│   ├── plans.ts
│   └── __tests__/                 # Router tests
├── adapters/                      # Server implementations
│   ├── express.ts                 # Node.js/Docker
│   └── cloudflare.ts              # Cloudflare Workers
├── db/
│   ├── schema.ts                  # Drizzle ORM schema
│   ├── schemas.zod.ts             # Auto-generated Zod schemas
│   ├── client.ts                  # DB connection logic
│   ├── helpers.ts                 # Query helpers
│   ├── transformers.ts            # Response transformers
│   └── __tests__/
├── services/
│   ├── limits.ts                  # Resource limit checking
│   ├── rate-limiter.ts            # API rate limiting
│   ├── plans.ts                   # Plan management
│   ├── category-discovery.ts      # Auto-category detection
│   └── [other services]
├── auth/
│   ├── better-auth.ts             # Better Auth configuration
│   ├── password.ts                # Hashing & validation (admin init only)
│   └── security.ts                # Security logging
├── types/
│   ├── index.ts                   # Central type exports
│   ├── validators.ts              # Zod input validators
│   └── feed.ts                    # Feed-related types
└── [other directories]
```

## Key Architectural Patterns

### Error Handling

- Custom error formatter in `init.ts` logs all errors
- Consistent error responses with tRPC error codes
- Errors include stack traces in non-production
- Security events logged for audit trail

### Query Optimization

- **N+1 Prevention:** Bulk operations in subscriptions router
- **Batch Processing:** Articles use `executeBatch` for bulk updates
- **Pagination:** All list endpoints support offset/limit
- **Lazy Loading:** Categories/filters fetched on-demand

### Security

- Better Auth session-based authentication (HTTP-only cookies)
- Password hashing with scrypt (Better Auth default, OWASP-recommended)
- Rate limiting (Custom API rate limiting via Cloudflare Workers bindings)
- Input validation with Zod schemas
- CORS configuration per environment
- Security event logging for audit trail
- Account banning support (via Better Auth Admin plugin)
- No email enumeration on password reset

### Portability

- Single codebase for Node.js and Cloudflare Workers
- Database abstraction (SQLite vs D1)
- Environment-aware configuration
- Context creation works with both runtimes
- Conditional imports based on environment

## Middleware Composition Examples

### Protected with Rate Limiting

```typescript
rateLimitedProcedure = protectedProcedure.use(withRateLimit);
// Chain: isAuthed → withRateLimit
```

### Protected with Resource Limits

```typescript
createProtectedWithLimit("sources");
// = protectedProcedure.use(withLimitCheck("sources"))
// Chain: isAuthed → withLimitCheck
```

### Admin Only

```typescript
adminProcedure;
// Chain: isAdmin (includes isAuthed checks + role verification)
```

## Performance Considerations

1. **Caching**
   - Public RSS feeds cached for 5 minutes (via HTTP headers)
   - TanStack Query caching on frontend

2. **Rate Limiting**
   - Login attempts: Better Auth built-in (3 per 10 seconds for login endpoints)
   - API calls: Per plan (default 60/min)
   - Public feeds: Per feed owner, per minute

3. **Batch Operations**
   - Subscriptions use bulk queries for categories/filters
   - Articles support batch read/saved updates

4. **Pagination**
   - All list endpoints support offset/limit
   - Default limit: 50 items

5. **Lazy Loading**
   - Categories/filters fetched on-demand
   - Infinite scroll support for articles

## Environment Configuration

### Required (All Deployments)

```bash
BETTER_AUTH_SECRET=your-secret-key  # For Better Auth session management (32+ characters recommended)
```

### Node.js/Docker

```bash
DATABASE_PATH=/data/tuvix.db  # Default: ./data/tuvix.db
PORT=3001                      # Default: 3001
CORS_ORIGIN=http://localhost:5173,https://app.tuvix.dev
NODE_ENV=production            # or "development"
```

### Cloudflare Workers

```bash
# Bindings configured in wrangler.toml:
# - DB (D1 Database)
# - API_RATE_LIMIT (Rate Limit Binding)
# - FEED_RATE_LIMIT (Rate Limit Binding)

CORS_ORIGIN=https://app.tuvix.dev
BASE_URL=https://api.tuvix.dev
```

### Optional Services

```bash
RESEND_API_KEY=re_...          # For email delivery
ALLOW_FIRST_USER_ADMIN=true    # Auto-promote first user
```

## Client Configuration

### tRPC Link Selection

**Location:** `packages/app/src/components/provider/trpc-provider.tsx`

The frontend uses `httpLink` instead of `httpBatchLink` for tRPC requests. This is an intentional architectural decision.

#### Why Not `httpBatchLink`?

1. **Body Parsing Issues with `fetchRequestHandler`**
   - The backend uses `fetchRequestHandler` from `@trpc/server/adapters/fetch` instead of `@hono/trpc-server`
   - When deployed to Cloudflare Workers, `fetchRequestHandler` has issues properly parsing batched request bodies
   - The request body stream can get consumed before tRPC processes it, resulting in `undefined` input

2. **SuperJSON Serialization Complexity**
   - `httpBatchLink` requires consistent SuperJSON configuration on both client and server
   - Without SuperJSON, batched request serialization produces inconsistent formats
   - SuperJSON adds complexity and potential for double-wrapping issues (`{json: {json: ...}}`)

3. **Acceptable Performance Trade-off**
   - For an RSS reader application, individual requests have acceptable latency
   - Most user actions involve single API calls (fetch articles, mark read, etc.)
   - The simplicity of non-batched requests outweighs the minor latency benefit of batching

#### Current Configuration

```typescript
// packages/app/src/components/provider/trpc-provider.tsx
trpc.createClient({
  links: [
    httpLink({
      url: import.meta.env.VITE_API_URL || "http://localhost:3001/trpc",
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include", // Required for HTTP-only session cookies
          headers: {
            ...options?.headers, // Preserve Sentry trace headers
          },
        });
      },
    }),
  ],
  // No transformer - using plain JSON serialization
});
```

#### If Switching Back to `httpBatchLink`

If you need batching in the future, you must:

1. Add SuperJSON transformer to both client and server
2. Switch backend from `fetchRequestHandler` to `@hono/trpc-server`
3. Test thoroughly on Cloudflare Workers before deploying
4. Verify no double-wrapping of responses occurs

## Summary

The TuvixRSS tRPC API provides:

- **Type Safety:** End-to-end TypeScript with zero code generation
- **Portability:** Single codebase for Node.js and Cloudflare Workers
- **Security:** Better Auth sessions, rate limiting, input validation, audit logging
- **Performance:** Batch operations, pagination, caching, N+1 prevention
- **Flexibility:** Middleware composition, multi-tenant resource limits
- **Developer Experience:** Full autocomplete, error handling, clear file organization

The architecture leverages tRPC's strengths to create a robust, maintainable API that scales from local development to global edge deployment.

---

**Last Updated:** 2025-12-11
