# Authentication & Security Modules

## Overview

This directory contains authentication and security utilities for TuvixRSS. The project now uses **Better Auth** for authentication, with minimal utilities for admin initialization and testing.

## Better Auth Integration

The project uses [Better Auth](https://www.better-auth.com/) for authentication. See:

- `better-auth.ts` - Better Auth configuration
- `/api/auth/*` - Better Auth endpoints (handled automatically)
- Frontend: `packages/app/src/lib/auth-client.ts` - Better Auth React client

### Better Auth Features

- Email/password authentication
- Username-based login (via Username plugin)
- Admin role management (via Admin plugin)
- Session management (HTTP-only cookies)
- Rate limiting (disabled - using custom Cloudflare Workers rate limit bindings)
- Email verification (optional, admin-configurable)
- Password reset

## Modules

### 🔐 `password.ts`

Minimal password hashing utilities for admin initialization and tests only.

**Note**: Better Auth handles password hashing for regular authentication flows. This module is only used for:

- Admin user initialization (`services/admin-init.ts`)
- Test database seeding (`test/setup.ts`)

**Functions**:

- `hashPassword(password, saltRounds?)` - Hash a password
- `verifyPassword(password, hash)` - Verify a password

### 📋 `security.ts`

Security audit logging and utilities.

**Features**:

- Comprehensive audit logging
- IP address and user agent extraction

**Note**: Password reset tokens are handled by Better Auth's `verification` table.

### 🗑️ Removed Modules

The following modules have been removed as Better Auth handles these features:

- **`jwt.ts`** - Removed. Better Auth uses HTTP-only cookies for sessions.
- **`rate-limit.ts`** - Removed. Better Auth rate limiting is disabled; we use custom Cloudflare Workers rate limit bindings instead.

## Configuration

### Environment Variables

```bash
# Better Auth (required)
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:5173  # Uses BASE_URL if not set
```

### Better Auth Configuration

See `better-auth.ts` for configuration:

- Database adapter (Drizzle)
- Username plugin
- Admin plugin
- Rate limiting disabled (Better Auth's built-in rate limiting is disabled; we use custom Cloudflare Workers rate limit bindings instead)
- Email verification (controlled by `global_settings.requireEmailVerification`)

## Database Schema

Better Auth requires these tables (added via migration):

- `user` - Better Auth user table
- `session` - Session management
- `account` - Account providers (email/password, social, etc.)
- `verification` - Email verification and password reset tokens

Better Auth uses the `user` table as the single source of truth for user data.

## Testing

For tests that need password hashing:

```typescript
import { hashPassword } from "@/auth/password";

const hash = await hashPassword("TestPass123!");
```

## Further Reading

- [Better Auth Documentation](https://www.better-auth.com/docs)
- [Better Auth Rate Limiting](https://www.better-auth.com/docs/concepts/rate-limit) (Note: Better Auth rate limiting is disabled in this project)
- [Better Auth Email Verification](https://www.better-auth.com/docs/concepts/email)
