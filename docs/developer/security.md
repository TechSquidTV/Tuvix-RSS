# Security Documentation

This document outlines the security measures implemented in the TuvixRSS API and deployment considerations.

## Table of Contents

- [Overview](#overview)
- [Authentication & Authorization](#authentication--authorization)
  - [Better Auth Sessions](#better-auth-sessions)
  - [Password Security](#password-security)
  - [Password Reset](#password-reset)
  - [Email Service (Resend)](#email-service-resend)
  - [Security Audit Logging](#security-audit-logging)
- [Rate Limiting Strategy](#rate-limiting-strategy)
  - [Admin-Configurable Rate Limiting](#admin-configurable-rate-limiting)
  - [Current Implementation (In-Memory)](#current-implementation-in-memory)
  - [Production Rate Limiting Solutions](#production-rate-limiting-solutions)
- [Input Validation](#input-validation)
  - [Length Limits](#length-limits)
  - [URL Validation](#url-validation)
  - [Regex Pattern Validation](#regex-pattern-validation)
- [Content Security](#content-security)
  - [HTML Stripping](#html-stripping)
  - [XSS Prevention](#xss-prevention)
  - [SQL Injection Prevention](#sql-injection-prevention)
- [CORS Configuration](#cors-configuration)
  - [Docker Compose / Express](#docker-compose--express)
  - [Cloudflare Workers](#cloudflare-workers)
- [Environment Variables](#environment-variables)
  - [Required Variables](#required-variables)
  - [Optional Variables](#optional-variables)
  - [Generating Secure Secrets](#generating-secure-secrets)
- [Security Checklist](#security-checklist)
- [Security Scanning](#security-scanning)
- [Reporting Security Issues](#reporting-security-issues)
- [Code References](#code-references)
- [Additional Resources](#additional-resources)

## Overview

TuvixRSS implements comprehensive security measures across authentication, authorization, input validation, content security, and deployment configurations. This guide covers all security-related features and best practices for secure deployment.

**Related Documentation:**

- [Authentication Guide](./authentication.md) - Detailed authentication system documentation
- [Rate Limiting Guide](./rate-limiting.md) - Complete rate limiting system guide

## Authentication & Authorization

### Better Auth Sessions

- **Session Management**: HTTP-only cookies (more secure than JWT tokens)
- **Expiration**: Configurable via Better Auth settings
- **Secret Requirements**: Minimum 32 characters, stored in `BETTER_AUTH_SECRET` environment variable

### Password Security

- **Hashing**: scrypt (Better Auth default, OWASP-recommended)
- **Validation Requirements** (Better Auth defaults):
  - Minimum 8 characters, maximum 128 characters
  - Better Auth uses standard password validation (no complex requirements by default)
  - Custom validation can be added via Better Auth configuration if needed

### Password Reset

- **Token Generation**: 32-byte cryptographically secure random token
- **Token Expiration**: 1 hour
- **Security Features**:
  - One-time use tokens
  - Automatic invalidation of previous unused tokens
  - Tokens sent via email only (not in API responses)
  - Email enumeration protection (always returns success)

### Email Service (Resend)

TuvixRSS uses [Resend](https://resend.com) for transactional email delivery, supporting email verification, password reset, and welcome emails.

**For complete email system documentation, see [Email System Guide](./email-system.md).**

**Quick Setup:**

- Create Resend account and verify domain
- Set `RESEND_API_KEY` and `EMAIL_FROM` environment variables
- Email templates use React Email components
- Development mode logs emails to console if API key is missing

**Email Types:**

- Email verification (when `requireEmailVerification` is enabled)
- Password reset
- Welcome emails

See [Email System Guide](./email-system.md) for:

- Complete setup instructions
- Email flow documentation
- Template development guide
- Troubleshooting guide
- API reference

### Security Audit Logging

All authentication events are logged with:

- User ID (if available)
- Action type (login, logout, password change, etc.)
- IP address
- User agent
- Timestamp
- Success/failure status
- Additional metadata

## Rate Limiting Strategy

TuvixRSS uses a **custom rate limiting system** based on Cloudflare Workers rate limit bindings:

### Rate Limiting Implementation

**Better Auth rate limiting is disabled** - we use custom Cloudflare Workers rate limit bindings instead.

**Configuration**: `packages/api/src/auth/better-auth.ts`

- Better Auth rate limiting: **disabled** (`rateLimit: { enabled: false }`)
- Custom rate limiting: Cloudflare Workers rate limit bindings (`API_RATE_LIMIT`, `FEED_RATE_LIMIT`)
- Docker Compose: Rate limiting disabled (all requests allowed)

### Admin-Configurable Rate Limiting

TuvixRSS features **admin-configurable rate limiting** for API endpoints, stored in the database:

#### Global Authentication Rate Limits

These settings control custom rate limiting logic (separate from Better Auth's built-in limits):

| Setting                     | Description                          | Default    | Range   |
| --------------------------- | ------------------------------------ | ---------- | ------- |
| `maxLoginAttempts`          | Failed login attempts before lockout | 5          | 1-100   |
| `loginAttemptWindowMinutes` | Time window for counting attempts    | 15 minutes | 1-1440  |
| `lockoutDurationMinutes`    | How long user is locked out          | 30 minutes | 1-10080 |

**Changing settings** (Admin only):

```typescript
// Via tRPC
await client.admin.updateGlobalSettings.mutate({
  maxLoginAttempts: 10,
  loginAttemptWindowMinutes: 20,
  lockoutDurationMinutes: 60,
});
```

Settings are **cached for 1 minute** to avoid database overhead on every request.

#### Per-Plan API Rate Limits

Authenticated API requests are rate-limited based on the user's plan:

| Plan       | API Requests/Minute | Public Feed Requests/Hour |
| ---------- | ------------------- | ------------------------- |
| Free       | Configurable        | Configurable              |
| Pro        | Configurable        | Configurable              |
| Enterprise | Configurable        | Configurable              |

**Managing plans** (Admin only):

```typescript
// Create new plan
await client.admin.createPlan.mutate({
  id: "premium",
  name: "Premium Plan",
  maxSources: 500,
  maxPublicFeeds: 10,
  maxCategories: null, // unlimited
  apiRateLimitPerMinute: 300,
  publicFeedRateLimitPerMinute: 167, // ~10000/hour = ~167/minute
  priceCents: 999,
  features: "Unlimited categories, priority support",
});

// Update existing plan
await client.admin.updatePlan.mutate({
  id: "free",
  apiRateLimitPerMinute: 120, // Increase free tier limit
});

// Change user's plan
await client.admin.changePlan.mutate({
  userId: 123,
  plan: "premium",
});
```

#### Per-User Custom Rate Limits

Admins can override plan limits for specific users:

```typescript
await client.admin.setCustomLimits.mutate({
  userId: 456,
  apiRateLimitPerMinute: 1000, // Custom high limit
  maxSources: 10000,
  notes: "VIP customer - enterprise trial",
});
```

### Current Implementation (In-Memory)

The API uses **in-memory rate limiting**, which works well for:

- **Single-instance deployments** (Docker Compose)
- **Development environments**
- **Low to medium traffic applications**

### Limitations

⚠️ **In-memory rate limiting does NOT work across multiple server instances.**

If you scale horizontally (multiple API containers), each instance maintains its own rate limit state. An attacker could bypass rate limits by distributing requests across multiple instances.

### Production Rate Limiting Solutions

#### Option 1: Docker Compose with Redis

For Docker deployments, add Redis for distributed rate limiting:

1. **Add Redis to docker-compose.yml**:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  api:
    environment:
      - REDIS_URL=redis://redis:6379
```

2. **Install Redis client**:

```bash
pnpm add ioredis rate-limiter-flexible
```

3. **Update rate limiter** (future implementation):

```typescript
import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";

const redis = new Redis(process.env.REDIS_URL);
const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  points: 5, // Number of requests
  duration: 15 * 60, // Per 15 minutes
});
```

#### Option 2: Cloudflare Workers with Built-in Rate Limiting

For Cloudflare deployments, use Cloudflare's built-in solutions:

**A. Cloudflare Rate Limiting (Paid Feature)**

- Configure via Cloudflare Dashboard
- Per-endpoint rate limits
- Automatic enforcement at the edge
- No code changes needed

**B. Durable Objects (Alternative)**

```typescript
// Already configured in Env type
env.RATE_LIMITER; // Durable Objects namespace
```

Durable Objects provide:

- Strongly consistent state
- Global coordination
- Low latency
- Automatic scaling

**C. Rate Limit Bindings (Rate Limiting)**

```typescript
// Already configured in Env type
env.API_RATE_LIMIT; // Rate limit binding
env.FEED_RATE_LIMIT; // Rate limit binding
```

Use for:

- API and public feed rate limiting
- Distributed edge-based rate limiting
- Lower cost than Durable Objects

### Recommended Deployment Strategy

| Deployment Type             | Recommended Solution                        | Reason                   |
| --------------------------- | ------------------------------------------- | ------------------------ |
| **Docker Compose (Single)** | In-memory (current)                         | Simple, no dependencies  |
| **Docker Compose (Multi)**  | Redis                                       | Distributed state        |
| **Cloudflare Workers**      | Cloudflare Rate Limiting or Durable Objects | Native edge integration  |
| **Kubernetes**              | Redis Cluster                               | Enterprise-grade scaling |

## Input Validation

All user inputs are validated using Zod schemas with strict length limits:

### Length Limits

```typescript
USERNAME: { min: 3, max: 50 }
EMAIL: { min: 3, max: 255 }
TITLE: { min: 1, max: 500 }
DESCRIPTION: { min: 0, max: 5000 }
CONTENT: { min: 0, max: 500000 } // 500KB
URL: { min: 1, max: 2048 }
FILTER_PATTERN: { min: 1, max: 1000 }
CATEGORY_NAME: { min: 1, max: 100 }
OPML_CONTENT: { min: 1, max: 10000000 } // 10MB
```

### URL Validation

- Only HTTP/HTTPS protocols allowed
- Maximum length: 2048 characters
- Dangerous protocols blocked (javascript:, data:, vbscript:)

### Regex Pattern Validation

User-provided regex patterns are validated before execution:

- Maximum pattern length: 1000 characters
- Pattern compilation tested before use
- Consider adding ReDoS protection (safe-regex2) for production

## Content Security

### HTML Sanitization

**All article descriptions are sanitized before storage** to prevent XSS attacks while preserving safe formatting:

- Removes dangerous HTML tags and attributes (script, iframe, onclick, etc.)
- Preserves safe formatting tags (links, bold, italic, lists, headings, etc.)
- Enforces secure link attributes (target="\_blank", rel="noopener noreferrer")
- Only allows safe URL protocols (http, https, mailto)

**Implementation**:

```typescript
import { sanitizeHtml, truncateHtml } from "@/utils/text-sanitizer";

// Descriptions: Sanitized HTML (allows safe tags)
const sanitizedDescription = sanitizeHtml(rawDescription);
const description = truncateHtml(sanitizedDescription, 5000);
```

**Sanitization is enforced at the single entry point**:

- Location: `packages/api/src/services/rss-fetcher.ts:689-693`
- Library: `sanitize-html` with strict allowlist configuration
- Allowed tags: Only inline elements (`a`, `strong`, `b`, `em`, `i`, `u`, `code`, `br`)
- Heading conversion: `h1-h6` tags are automatically converted to `<strong>` to preserve emphasis
- Blocked tags: Block-level elements (`p`, `blockquote`, `ul`, `ol`, `li`, `pre`, `div`) are stripped
- Allowed attributes: Only `href`, `title`, `target`, `rel` on links
- Rationale: Descriptions render inside `<p>` tags in the frontend, so only inline elements are valid HTML

**Frontend rendering**:

- The frontend uses `dangerouslySetInnerHTML` to render sanitized descriptions in two components:
  - `packages/app/src/components/app/article-item.tsx:238` (standard article view)
  - `packages/app/src/components/app/article-item-audio.tsx:252` (audio/podcast view)
- This is safe because sanitization is guaranteed at the backend ingestion layer
- Both components use the same `Article` type from tRPC, ensuring consistent data handling
- No user-generated HTML is ever stored

### XSS Prevention

- ✅ HTML sanitized from all article descriptions on ingestion
- ✅ Single code path for article creation (rss-fetcher.ts)
- ✅ Battle-tested sanitization library (sanitize-html)
- ✅ Strict allowlist of safe tags and attributes
- ✅ Zod validation on all user inputs
- ✅ Content type headers set correctly

### SQL Injection Prevention

- ✅ Drizzle ORM used for all database queries
- ✅ Parameterized queries throughout
- ✅ No raw SQL execution with user input

## CORS Configuration

### Docker Compose / Express

Set allowed origins via environment variable:

```bash
# Single origin
CORS_ORIGIN=http://localhost:5173

# Multiple origins (comma-separated)
CORS_ORIGIN=http://localhost:5173,https://example.com

# Development (defaults)
# If not set in development: http://localhost:5173, http://localhost:3000
```

**Behavior**:

- ✅ Credentials enabled
- ✅ Origin validation on every request
- ✅ Blocked origins logged
- ⚠️ Production requires explicit CORS_ORIGIN

### Cloudflare Workers

```bash
# wrangler.toml or secrets
CORS_ORIGIN=https://your-frontend.com

# Multiple origins
CORS_ORIGIN=https://app.example.com,https://beta.example.com

# Same-domain service bindings (if API and frontend on same domain)
CORS_ORIGIN=*
```

**For service bindings**, consider using Cloudflare's built-in CORS settings instead of `CORS_ORIGIN=*`.

## Environment Variables

### Required Variables

```bash
# Authentication (REQUIRED)
BETTER_AUTH_SECRET=            # Generate with: openssl rand -base64 32

# CORS (REQUIRED in production)
CORS_ORIGIN=                   # Frontend URL(s)
```

### Optional Variables

```bash
# Runtime
NODE_ENV=development           # or "production"
PORT=3000

# Database
DATABASE_PATH=./data/tuvix.db  # Node.js only

# Admin Bootstrap
ADMIN_USERNAME=                # Auto-create admin user
ADMIN_EMAIL=
ADMIN_PASSWORD=
ALLOW_FIRST_USER_ADMIN=true    # First user becomes admin

# Email (for password reset)
RESEND_API_KEY=                # Email service API key
EMAIL_FROM=                    # From address
BASE_URL=                      # Base URL for reset links
```

### Generating Secure Secrets

```bash
# Linux/macOS
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Python
python -c "import secrets; print(secrets.token_hex(32))"
```

## Security Checklist

Before deploying to production:

- [ ] `BETTER_AUTH_SECRET` set to secure random value (32+ characters)
- [ ] `CORS_ORIGIN` configured with specific frontend URLs
- [ ] `NODE_ENV=production` set
- [ ] Rate limiting strategy chosen and implemented
- [ ] HTTPS enabled (TLS/SSL certificates)
- [ ] Security audit logs monitored
- [ ] Email service configured (Resend API key and verified domain)
- [ ] Password reset email delivery tested
- [ ] Welcome email delivery tested
- [ ] Database backups configured
- [ ] Secrets stored in secure secret manager (not in git)

## Security Scanning

Run these tools regularly:

```bash
# Dependency vulnerabilities
pnpm audit

# Static analysis
npm install -g snyk
snyk test

# Secret scanning
docker run -v $(pwd):/path ghcr.io/gitleaks/gitleaks:latest detect --source=/path

# Container scanning
docker run aquasec/trivy fs .
```

## Reporting Security Issues

If you discover a security vulnerability, please email: [security contact - to be configured]

**Do not open public issues for security vulnerabilities.**

## Code References

- **Better Auth Configuration**: `packages/api/src/auth/better-auth.ts`
- **Password Security**: `packages/api/src/auth/password.ts` (admin init only)
- **Security Audit Logging**: `packages/api/src/auth/security.ts`
- **Email Service**: `packages/api/src/services/email.ts`
- **Email Templates**: `packages/api/src/services/email-templates/`
- **Text Sanitization**: `packages/api/src/utils/text-sanitizer.ts`
- **Input Validation**: `packages/api/src/db/schemas.zod.ts`

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Password Storage Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Better Auth Documentation](https://www.better-auth.com/docs)
