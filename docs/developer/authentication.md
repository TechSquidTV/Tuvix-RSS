# Authentication and User Management

This document provides comprehensive documentation for TuvixRSS's authentication and user management system, now powered by **Better Auth**.

## Table of Contents

- [Overview](#overview)
- [Better Auth Integration](#better-auth-integration)
- [Authentication System](#authentication-system)
  - [Session Management](#session-management)
  - [Password Security](#password-security)
  - [Rate Limiting](#rate-limiting)
  - [Security Audit Logging](#security-audit-logging)
- [User Management](#user-management)
  - [User Roles](#user-roles)
  - [User Registration](#user-registration)
  - [User Plans and Limits](#user-plans-and-limits)
  - [Account Banning](#account-banning)
- [API Endpoints](#api-endpoints)
  - [Better Auth Endpoints](#better-auth-endpoints)
  - [tRPC Endpoints](#trpc-endpoints)
- [Database Schema](#database-schema)
- [Security Features](#security-features)
- [Configuration](#configuration)
- [Code References](#code-references)

## Overview

TuvixRSS uses **[Better Auth](https://www.better-auth.com/)** for authentication, a modern authentication library that provides:

- **Session Management**: HTTP-only cookies (more secure than JWT tokens)
- **Password Security**: Built-in password hashing (scrypt)
- **Rate Limiting**: Built-in rate limiting with configurable storage
- **Email Verification**: Optional email verification for new accounts
- **Username Support**: Username-based login via Username plugin
- **Admin Management**: Admin role and banning via Admin plugin
- **Multi-platform Support**: Works with both SQLite (Docker) and D1 (Cloudflare)

### Key Features

- Better Auth session management (HTTP-only cookies)
- Username and email/password authentication
- Role-based access control (RBAC)
- Rate limiting disabled (using custom Cloudflare Workers rate limit bindings)
- Comprehensive security audit logging
- Password reset with secure tokens
- Flexible plan system with custom user limits
- Account banning capability

## Better Auth Integration

### Configuration

**Location**: `packages/api/src/auth/better-auth.ts`

Better Auth is configured with:

- **Drizzle Adapter**: Works with both SQLite and D1
- **Username Plugin**: Enables username-based login
- **Admin Plugin**: Provides role management and banning
- **Rate Limiting**: Disabled (using custom Cloudflare Workers rate limit bindings)
- **Email Verification**: Controlled by `global_settings.requireEmailVerification`

### Endpoints

Better Auth automatically handles these endpoints at `/api/auth/*`:

- `POST /api/auth/sign-up/email` - Register with email
- `POST /api/auth/sign-in/username` - Login with username
- `POST /api/auth/sign-in/email` - Login with email
- `POST /api/auth/sign-out` - Logout
- `GET /api/auth/session` - Get current session
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/request-password-reset` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Frontend Client

**Location**: `packages/app/src/lib/auth-client.ts`

```typescript
import { authClient } from "@/lib/auth-client";

// Get session
const { data: session } = authClient.useSession();

// Login
await authClient.signIn.username({ username, password });

// Register
await authClient.signUp.email({ email, password, name: username });

// Logout
await authClient.signOut();
```

## Authentication System

### Session Management

**Implementation**: Better Auth handles sessions automatically

Better Auth uses HTTP-only cookies for session management, which is more secure than JWT tokens stored in localStorage:

- **Security**: Cookies are HTTP-only (not accessible via JavaScript)
- **Automatic**: Sessions are managed automatically
- **Expiration**: Configurable session expiration
- **Cross-domain**: Supports cross-subdomain cookies

**Session Check**: `packages/api/src/trpc/context.ts:50`

```typescript
const session = await auth.api.getSession({ headers });
if (session?.user) {
  user = {
    userId: session.user.id as number,
    username: session.user.username || session.user.name || "",
    role: session.user.role || "user",
  };
}
```

### Password Security

**Implementation**: Better Auth handles password hashing internally

Better Auth uses **scrypt** for password hashing (OWASP-recommended when argon2id is not available).

#### Password Requirements

Better Auth default validation:

- Minimum length: 8 characters
- Maximum length: 128 characters

**Note**: The frontend registration form uses Better Auth's default validation (3-30 chars for username, 8+ chars for password).

### Rate Limiting

**Implementation**: Better Auth rate limiting is **disabled**

Better Auth's built-in rate limiting has been disabled in favor of our custom Cloudflare Workers rate limit bindings system. Authentication endpoints are protected by:

1. **Account lockout** - After `maxLoginAttempts` failed attempts (configurable in global settings)
2. **Custom API rate limiting** - Applied to all authenticated endpoints via tRPC middleware
3. **Security audit logging** - All authentication attempts are logged

**Configuration**: `packages/api/src/auth/better-auth.ts:144`

```typescript
rateLimit: {
  enabled: false, // Disabled - using custom rate limiting system instead
},
```

See [`docs/guides/features/rate-limiting.md`](../../guides/features/rate-limiting.md) for complete rate limiting documentation.

**Custom API Rate Limiting**: `packages/api/src/services/rate-limiter.ts`

Custom API rate limiting (for tRPC endpoints) is still handled separately and based on user plans.

### Security Audit Logging

**Implementation**: `packages/api/src/auth/security.ts:1`

All authentication events are logged to the `security_audit_log` table via Better Auth hooks.

**Hooks**: `packages/api/src/auth/better-auth.ts:161`

```typescript
hooks: {
  after: createAuthMiddleware(async (ctx) => {
    if (ctx.path.startsWith("/sign-up")) {
      // Log registration
    }
    if (ctx.path.startsWith("/sign-in")) {
      // Log login
    }
    if (ctx.path.startsWith("/sign-out")) {
      // Log logout
    }
  }),
}
```

**Event Types**: `packages/api/src/auth/security.ts:14`

- `login_success` / `login_failed`
- `register`
- `logout`
- `password_change`
- `password_reset_request` / `password_reset_success`
- `account_locked` / `account_unlocked`
- `admin_created` / `admin_first_user` / `promoted_to_admin`

## User Management

### User Roles

**Schema**: `packages/api/src/db/schema.ts:29`

TuvixRSS implements a 2-level role-based access control system:

#### User Role

- Default role for all registered users
- Can access personal resources only
- Subject to plan limits
- Cannot access admin endpoints

#### Admin Role

- Full system access
- Can manage all users and plans
- Can view system statistics
- Can configure global settings
- Can ban/unban users (via Better Auth Admin plugin)
- Can set custom limits for individual users

**First User Admin**: If `ALLOW_FIRST_USER_ADMIN` is enabled (default), the first registered user is automatically promoted to admin.

**Role Check Middleware**: `packages/api/src/trpc/init.ts:155`

```typescript
if (ctx.user.role !== "admin") {
  throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
}
```

### User Registration

**Endpoint**: Better Auth `POST /api/auth/sign-up/email` or tRPC `auth.register`

#### Registration Flow

1. **Input Validation**
   - Username: 3-30 characters (Better Auth default)
   - Email: Valid email format
   - Password: Minimum 8 characters (Better Auth default)

2. **Better Auth Processing**
   - Better Auth handles duplicate checking
   - Password is hashed with scrypt
   - User is created in Better Auth's `user` table

3. **Role Assignment**
   - If first user + `ALLOW_FIRST_USER_ADMIN=true`: admin role with admin plan
   - Otherwise: user role with default plan (typically "free")

4. **Account Creation**
   - User record synced to `users` table (for compatibility)
   - Default user settings created
   - Usage stats initialized
   - Security event logged

5. **Session Creation**
   - Better Auth creates session automatically
   - Session cookie is set (HTTP-only)

**Registration Code**: `packages/api/src/routers/auth.ts:35`

### User Plans and Limits

**Schema**: `packages/api/src/db/schema.ts:459`

#### Plan System

Plans define the resource limits for users:

**Plan Fields**:

- `id`: Plan identifier (e.g., "free", "pro", "enterprise")
- `name`: Display name
- `maxSources`: Maximum RSS sources
- `maxPublicFeeds`: Maximum public feeds
- `maxCategories`: Maximum categories (null = unlimited)
- `apiRateLimitPerMinute`: API request rate limit
- `publicFeedRateLimitPerMinute`: Public feed access rate limit (per minute)
- `priceCents`: Price in cents
- `features`: JSON string of plan features

**Default Plans**:

- Defined in `packages/api/src/config/plans.ts`
- Seeded on database initialization

#### Custom User Limits

**Schema**: `packages/api/src/db/schema.ts:483`

Admins can override plan limits for individual users via the `user_limits` table.

**Limit Resolution**: `packages/api/src/services/limits.ts`

When checking user limits, the system:

1. Checks for custom limits in `user_limits` table (for maxSources, maxPublicFeeds, maxCategories only)
2. Falls back to plan defaults from `plans` table
3. Returns the resolved limits

**Note**: Rate limits (`apiRateLimitPerMinute`, `publicFeedRateLimitPerMinute`) cannot be customized per-user. They are enforced by plan-specific Cloudflare Workers bindings:

- Free plan: `FREE_API_RATE_LIMIT` binding (60/min)
- Pro plan: `PRO_API_RATE_LIMIT` binding (180/min)
- Enterprise/admin plan: `ENTERPRISE_API_RATE_LIMIT` binding (600/min)

To change a user's rate limit, change their plan.

### Account Banning

**Implementation**: `packages/api/src/routers/admin.ts:333`

Admins can ban/unban user accounts using Better Auth's Admin plugin:

**Ban User**:

```typescript
await adminRouter.banUser({
  userId: 123,
  banned: true,
  reason: "Terms of service violation",
});
```

**Effects of Banning**:

- User cannot log in
- Existing sessions are invalidated
- All API requests return `403 Forbidden`
- Ban check occurs in auth middleware

**Middleware Check**: `packages/api/src/trpc/init.ts:56`

```typescript
if (userRecord.banned) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Account banned. Please contact support.",
  });
}
```

**Unbanning**:

- Set `banned: false` via admin endpoint
- User can immediately log in again
- All restrictions lifted

## API Endpoints

### Better Auth Endpoints

Better Auth handles these endpoints automatically at `/api/auth/*`:

#### Sign Up

```typescript
POST /api/auth/sign-up/email
Body: { email, password, name: username }
```

#### Sign In

```typescript
POST /api/auth/sign-in/username
Body: { username, password }
```

#### Sign Out

```http
POST /api/auth/sign-out
```

#### Get Session

```http
GET /api/auth/session
```

#### Change Password

```http
POST /api/auth/change-password
Body: { currentPassword, newPassword }
```

#### Request Password Reset

```http
POST /api/auth/request-password-reset
Body: { email, redirectTo }
```

#### Reset Password

```http
POST /api/auth/reset-password
Body: { token, newPassword }
```

### tRPC Endpoints

**Router**: `packages/api/src/routers/auth.ts`

These endpoints are kept for backward compatibility and use Better Auth internally:

#### Register

```typescript
auth.register({
  username: string,
  email: string,
  password: string,
});
```

Uses Better Auth's `signUpEmail` internally.

#### Login

```typescript
auth.login({
  username: string,
  password: string,
});
```

Uses Better Auth's `signInUsername` internally.

#### Get Current User

```typescript
auth.me();
```

Returns current authenticated user information from Better Auth session.

#### Change Password

```typescript
auth.changePassword({
  currentPassword: string,
  newPassword: string,
});
```

Uses Better Auth's `changePassword` internally.

#### Request Password Reset

```typescript
auth.requestPasswordReset({
  email: string,
});
```

Uses Better Auth's `requestPasswordReset` internally.

#### Reset Password

```typescript
auth.resetPassword({
  token: string,
  newPassword: string,
});
```

Uses Better Auth's `resetPassword` internally.

### Admin Endpoints

**Router**: `packages/api/src/routers/admin.ts`

#### User Management

**List Users**: `packages/api/src/routers/admin.ts:74`

```typescript
admin.listUsers({
  limit: number,
  offset: number,
  role?: "user" | "admin",
  plan?: string,
  banned?: boolean,
  search?: string
})
```

**Ban User**: `packages/api/src/routers/admin.ts:333`

```typescript
admin.banUser({
  userId: number,
  banned: boolean,
  reason?: string
})
```

## Database Schema

### Better Auth Tables

Better Auth requires these tables (added via migration):

#### user

**Location**: `packages/api/src/db/schema.ts:25`

Better Auth's user table:

- `id`: Primary key
- `name`: Display name
- `email`: Email address (unique)
- `emailVerified`: Email verification status
- `username`: Username (unique, via Username plugin)
- `role`: User role (via Admin plugin)
- `banned`: Ban status (via Admin plugin)
- `createdAt`, `updatedAt`: Timestamps

#### session

**Location**: `packages/api/src/db/schema.ts:48`

Session management:

- `id`: Primary key
- `token`: Session token (unique)
- `userId`: References user.id
- `expiresAt`: Session expiration
- `ipAddress`, `userAgent`: Client information

#### account

**Location**: `packages/api/src/db/schema.ts:66`

Account providers (email/password, social, etc.):

- `id`: Primary key
- `userId`: References user.id
- `providerId`: Provider type (e.g., "credential" for email/password)
- `password`: Password hash (for credential provider)

#### verification

**Location**: `packages/api/src/db/schema.ts:92`

Email verification and password reset tokens:

- `id`: Primary key
- `identifier`: Email address
- `value`: Verification token
- `expiresAt`: Token expiration

### User Tables

#### users

**Location**: `packages/api/src/db/schema.ts:107`

User table (synced with Better Auth's `user` table):

- `id`: Primary key
- `username`: Unique username
- `email`: Unique email
- `password`: Password hash (Better Auth uses account table)
- `role`: User role
- `plan`: Plan ID
- `banned`: Ban status
- `createdAt`, `updatedAt`: Timestamps

**Note**: The `users` table is synced with Better Auth's `user` table for compatibility with existing code.

## Security Features

### Defense-in-Depth

TuvixRSS implements multiple layers of security:

1. **Input Validation** (Zod schemas, Better Auth validation)
2. **Authentication** (Better Auth sessions + scrypt password hashing)
3. **Rate Limiting** (Custom API rate limiting via Cloudflare Workers bindings)
4. **Authorization** (Role-based access control)
5. **Audit Logging** (Comprehensive event tracking)

### Specific Protections

#### SQL Injection Prevention

- All queries use Drizzle ORM with parameterized statements
- No raw SQL with user input

#### XSS Prevention

- HTML stripped from user inputs where applicable
- Output encoding in frontend

#### CSRF Prevention

- CORS configured to specific origins only
- HTTP-only cookies (Better Auth)

#### Timing Attack Prevention

- Better Auth uses constant-time comparison
- Password verification doesn't leak timing information

#### Email Enumeration Prevention

- Registration: Returns generic "username/email exists" error
- Password reset: Always returns success regardless of email validity

#### Brute Force Prevention

- Custom rate limiting via Cloudflare Workers rate limit bindings
- Configurable thresholds and durations
- Per-endpoint rate limits

## Configuration

### Environment Variables

**Required**:

- `BETTER_AUTH_SECRET`: Secret key for Better Auth (32+ characters recommended)
- `BETTER_AUTH_URL`: Base URL for Better Auth (uses `BASE_URL` if not set)

**Optional**:

- `NODE_ENV`: Environment ("development", "production")
- `ALLOW_FIRST_USER_ADMIN`: Enable first user admin promotion (default: "true")
- `DATABASE_PATH`: Path to SQLite database
- `BASE_URL`: Base URL for email links

### Better Auth Configuration

**Location**: `packages/api/src/auth/better-auth.ts`

Key configuration options:

- `database`: Drizzle adapter configuration
- `secret`: Authentication secret
- `baseURL`: Base URL for Better Auth
- `basePath`: API path (`/api/auth`)
- `emailAndPassword.enabled`: Enable email/password auth
- `emailVerification.sendOnSignUp`: Control email verification
- `rateLimit`: Rate limiting configuration
- `plugins`: Username and Admin plugins

### Email Verification

Email verification is controlled by `global_settings.requireEmailVerification`:

- If enabled: New accounts must verify email before accessing the app
- If disabled: Accounts are immediately active after registration
- Admin users bypass email verification requirement

**Configuration**: `packages/api/src/auth/better-auth.ts:177`

**Verification Flow**:

1. User registers → Verification email sent automatically (if `requireEmailVerification` is enabled)
2. User clicks verification link → Email verified via Better Auth `/api/auth/verify-email` endpoint
3. User can check verification status via `auth.checkVerificationStatus` endpoint
4. User can resend verification email via `auth.resendVerificationEmail` endpoint (rate limited: 1 per 5 minutes)

**Endpoints**:

- `auth.checkVerificationStatus` - Check if verification is required and current status (accessible to unverified users)
- `auth.resendVerificationEmail` - Resend verification email (accessible to unverified users, rate limited)

**Route Protection**:

- Unverified users are blocked from accessing protected endpoints (except verification endpoints)
- App route guard redirects unverified users to `/verify-email` page
- Middleware enforces verification check in `isAuthed` middleware (admins bypass)

**Email System Integration**:

- Verification emails use dedicated `VerificationEmail` template
- Email sending handled by `sendVerificationEmail` function
- See [Email System Guide](./email-system.md) for complete email system documentation

## Code References

### Key Files

| File                                    | Description                        |
| --------------------------------------- | ---------------------------------- |
| `packages/api/src/auth/better-auth.ts`  | Better Auth configuration          |
| `packages/api/src/auth/security.ts`     | Audit logging utilities            |
| `packages/api/src/routers/auth.ts`      | Authentication endpoints (tRPC)    |
| `packages/api/src/routers/admin.ts`     | Admin endpoints                    |
| `packages/api/src/trpc/init.ts`         | tRPC middleware (auth, rate limit) |
| `packages/api/src/trpc/context.ts`      | Better Auth session extraction     |
| `packages/api/src/db/schema.ts`         | Database schema definitions        |
| `packages/app/src/lib/auth-client.ts`   | Better Auth React client           |
| `packages/app/src/lib/hooks/useAuth.ts` | React auth hooks                   |

### Middleware Chain

**Authentication Flow**:

1. Request arrives with session cookie
2. `context.ts` extracts Better Auth session
3. `isAuthed` middleware checks authentication and ban status
4. `isAdmin` middleware checks admin role (for admin endpoints)
5. `withRateLimit` middleware checks API rate limits
6. Procedure handler executes

**Reference**: `packages/api/src/trpc/init.ts`

### Common Patterns

**Check if user is authenticated**:

```typescript
export const myProcedure = protectedProcedure
  .input(z.object({ ... }))
  .mutation(async ({ ctx, input }) => {
    // ctx.user is guaranteed to be defined
    const userId = ctx.user.userId;
  });
```

**Check if user is admin**:

```typescript
export const myAdminProcedure = adminProcedure
  .input(z.object({ ... }))
  .mutation(async ({ ctx, input }) => {
    // ctx.user is guaranteed to be admin
  });
```

**Frontend: Get current user**:

```typescript
import { useCurrentUser } from "@/lib/hooks/useAuth";

const { data: session } = useCurrentUser();
if (session?.user) {
  // User is authenticated
}
```

---

**Last Updated:** 2025-01-15
