# TuvixRSS tRPC API

End-to-end type-safe API backend for TuvixRSS, built with tRPC. This package provides a portable API that can run on both Node.js (Docker) and Cloudflare Workers.

## Architecture

This is a **portable API** with 95% shared code between deployment targets:

- **Shared**: Routers, types, validation, business logic, cron handlers
- **Swappable**: Database driver (better-sqlite3 / D1), HTTP adapter (Express / Workers)

## Features

- ✅ End-to-end type safety with tRPC
- ✅ Runtime validation with Zod
- ✅ JWT authentication
- ✅ Portable architecture (Docker + Cloudflare Workers)
- ✅ SQLite with Drizzle ORM
- ✅ Background job scheduling (node-cron / Workers scheduled events)
- ✅ RSS feed parsing and management
- ✅ Content filtering and subscriptions
- ✅ Public RSS feed generation
- ✅ User plans and rate limiting
- ✅ Admin operations

## Documentation

- **[Admin Guide](../../docs/admin-guide.md)** - Admin operations and user management
- **[Main Project Documentation](../../docs/README.md)** - Complete documentation index

## Project Structure

```
packages/api/
├── src/
│   ├── adapters/          # HTTP adapters
│   │   ├── express.ts     # Node.js/Docker adapter
│   │   └── cloudflare.ts  # Cloudflare Workers adapter
│   ├── auth/              # Authentication utilities
│   │   ├── better-auth.ts # Better Auth configuration
│   │   ├── password.ts    # Password hashing (admin init only)
│   │   └── security.ts    # Security audit logging
│   ├── cron/              # Scheduled jobs
│   │   ├── handlers.ts    # Portable cron logic
│   │   └── scheduler.ts   # Node.js cron setup
│   ├── db/                # Database
│   │   ├── schema.ts      # Drizzle schema
│   │   └── client.ts      # Portable DB client factory
│   ├── routers/           # tRPC routers
│   │   ├── auth.ts        # ✅ Authentication (complete)
│   │   ├── articles.ts    # ✅ Articles management
│   │   ├── subscriptions.ts # ✅ Subscriptions & filters
│   │   ├── categories.ts  # ✅ Categories
│   │   ├── feeds.ts       # ✅ Public feeds
│   │   ├── plans.ts       # ✅ Plans management
│   │   ├── admin.ts       # ✅ Admin operations
│   │   └── userSettings.ts # ✅ User settings
│   ├── services/          # Business logic services
│   │   ├── rss-fetcher.ts      # ✅ RSS parsing
│   │   ├── favicon-fetcher.ts  # ✅ Favicon discovery
│   │   ├── xml-generator.ts     # ✅ RSS XML generation
│   │   ├── email.ts            # ✅ Email service
│   │   ├── rate-limiter.ts     # ✅ Rate limiting
│   │   └── global-settings.ts  # ✅ Global settings
│   ├── trpc/              # tRPC core
│   │   ├── init.ts        # tRPC initialization
│   │   ├── context.ts     # Request context
│   │   └── router.ts      # Root router
│   └── types.ts           # Shared types & Zod schemas
├── data/                  # Local development data (gitignored)
├── drizzle.config.ts      # Drizzle Kit config
├── wrangler.toml          # Cloudflare Workers config
├── tsconfig.json          # TypeScript config
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ (for Docker deployment)
- pnpm (package manager)
- SQLite (for local development)

### Installation

```bash
cd packages/api
pnpm install
```

### Environment Variables

Create a `.env` file in the package root:

```bash
# Required
BETTER_AUTH_SECRET=your-secure-secret-key-here

# Optional (defaults shown)
DATABASE_PATH=./data/tuvix.db
PORT=3001
RUNTIME=nodejs
```

### Database Setup

Generate and run migrations:

```bash
# Generate migration from schema
pnpm db:generate

# Apply migrations
pnpm db:migrate
```

### Development

#### Node.js (Docker)

```bash
# Start development server with hot reload
pnpm dev

# Server runs on http://localhost:3001
# tRPC endpoint: http://localhost:3001/trpc
# Health check: http://localhost:3001/health
```

The Express adapter automatically:

- Initializes the SQLite database
- Starts the tRPC server
- Starts cron jobs (RSS fetch every 15 minutes)

#### Cloudflare Workers (Local)

```bash
# Start local Workers environment
pnpm dev:workers

# Uses wrangler dev with:
# - Local D1 database
# - Cron trigger testing
```

### Production Deployment

#### Docker

```bash
# Build
pnpm build

# Run with environment variables
NODE_ENV=production BETTER_AUTH_SECRET=your-secret node dist/adapters/express.js
```

#### Cloudflare Workers

**Prerequisites:**

- Cloudflare Workers Paid plan ($5/month) - Required for password hashing CPU limits
- D1 database created: `wrangler d1 create tuvix`

**Required Secrets:**

```bash
# Authentication (minimum 32 characters)
wrangler secret put BETTER_AUTH_SECRET

# First user auto-promotion to admin
wrangler secret put ALLOW_FIRST_USER_ADMIN
# Enter: true

# Email service (Resend)
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_FROM
# Example: noreply@yourdomain.com

# Application URLs
wrangler secret put BASE_URL
# Example: https://yourdomain.com
wrangler secret put API_URL
# Example: https://api.yourdomain.com
wrangler secret put CORS_ORIGIN
# Example: https://yourdomain.com
wrangler secret put COOKIE_DOMAIN
# Example: .yourdomain.com

# Sentry (optional)
wrangler secret put SENTRY_DSN
wrangler secret put SENTRY_ENVIRONMENT
# Example: production
```

**Database Setup:**

```bash
# 1. Create database
wrangler d1 create tuvix

# 2. Configure for local development:
# Option A: Create wrangler.toml.local (recommended)
cp wrangler.toml.local.example wrangler.toml.local
# Edit wrangler.toml.local and add your database_id

# Option B: Set environment variable
export D1_DATABASE_ID="<database-id-from-step-1>"

# For CI/CD: Set GitHub secret
gh secret set D1_DATABASE_ID --body "<database-id-from-step-1>"

# 3. Run migrations
pnpm db:migrate:d1
```

**Deploy:**

```bash
# Deploy to Workers
pnpm deploy

# The deploy script automatically:
# - Creates wrangler.toml from wrangler.example.toml
# - Substitutes database_id from wrangler.toml.local or D1_DATABASE_ID env var
# - Deploys with CPU limits configured (30 seconds)
# - Applies cron trigger schedule (every 5 minutes)
```

**First Admin User:**

After deployment, the first user to sign up automatically becomes admin (when `ALLOW_FIRST_USER_ADMIN=true`):

1. Navigate to `https://yourdomain.com/sign-up`
2. Register with your email
3. You'll be assigned user ID 1 and admin role automatically
4. Email verification is **disabled by default** (can be enabled in settings)

## API Endpoints

### tRPC Procedures

All procedures are available under the `/trpc` endpoint using tRPC's batching and protocol.

#### Auth Router

- `auth.register` - Register new user
- `auth.login` - Login (Better Auth handles session via cookies)
- `auth.me` - Get current user (protected)

#### Articles Router

- `articles.list` - List articles with filters
- `articles.getById` - Get single article
- `articles.markRead` - Mark article as read
- `articles.markUnread` - Mark article as unread
- `articles.save` - Save article
- `articles.unsave` - Unsave article
- `articles.bulkMarkRead` - Bulk mark as read
- `articles.markAllRead` - Mark all as read
- `articles.refresh` - Trigger RSS refresh

#### Subscriptions Router

- `subscriptions.list` - List user subscriptions
- `subscriptions.getById` - Get subscription details
- `subscriptions.create` - Create subscription
- `subscriptions.update` - Update subscription
- `subscriptions.delete` - Delete subscription
- `subscriptions.discover` - Discover feeds from URL
- `subscriptions.preview` - Preview feed before subscribing
- `subscriptions.parseOpml` - Parse OPML content
- `subscriptions.import` - Import selected feeds from OPML
- `subscriptions.importStatus` - Check import progress
- `subscriptions.export` - Export subscriptions as OPML
- `subscriptions.listFilters` - List subscription filters
- `subscriptions.createFilter` - Create content filter
- `subscriptions.updateFilter` - Update content filter
- `subscriptions.deleteFilter` - Delete content filter
- `subscriptions.testFilter` - Test filter against content
- `subscriptions.reapplyFilters` - Reapply filters to articles

#### Categories Router

- `categories.list` - List user categories
- `categories.getById` - Get category details
- `categories.create` - Create category
- `categories.update` - Update category
- `categories.delete` - Delete category
- `categories.suggestions` - Get category suggestions from feed

#### Feeds Router

- `feeds.list` - List user's public feeds
- `feeds.getById` - Get feed details
- `feeds.create` - Create public feed
- `feeds.update` - Update feed
- `feeds.delete` - Delete feed
- `feeds.getPublicXml` - Get RSS 2.0 XML (public endpoint)

#### User Settings Router

- `userSettings.get` - Get user settings
- `userSettings.update` - Update settings

### Authentication

Protected procedures require authentication via Better Auth session cookies. Sessions are automatically managed by Better Auth - no manual token handling needed.

Login by calling `auth.login` or `auth.register`. Better Auth handles session creation automatically.

## Development Guide

### Adding New Procedures

1. **Define types in `types.ts`**:

```typescript
export const MyInputSchema = z.object({
  field: z.string(),
});

export const MyOutputSchema = z.object({
  result: z.string(),
});
```

2. **Add procedure to router**:

```typescript
// src/routers/my-router.ts
export const myRouter = router({
  myProcedure: protectedProcedure
    .input(MyInputSchema)
    .output(MyOutputSchema)
    .query(async ({ ctx, input }) => {
      // Implementation
      return { result: "success" };
    }),
});
```

3. **Add router to root**:

```typescript
// src/trpc/router.ts
export const appRouter = router({
  // ... existing routers
  myRouter: myRouter,
});
```

### Adding New Features

When adding new features:

1. **Define types and schemas** in `src/types/`
2. **Add router procedures** in `src/routers/`
3. **Implement business logic** in `src/services/` if needed
4. **Add tests** in `__tests__/` directories
5. **Update this README** with new endpoints

### Testing

```bash
# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Test with actual client
# Use @trpc/client or create a simple test script
```

### Database Migrations

When you modify `src/db/schema.ts`:

```bash
# Generate migration
pnpm db:generate

# Review the generated SQL in drizzle/migrations/

# Apply migration
pnpm db:migrate
```

## Frontend Integration

### Install tRPC Client

```bash
# In your frontend package
pnpm add @trpc/client @trpc/react-query @tanstack/react-query
```

### Setup tRPC Client

```typescript
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@tuvix/api";

export const trpc = createTRPCReact<AppRouter>();
```

### Use in React

```typescript
function MyComponent() {
  const { data, isLoading } = trpc.articles.list.useQuery({
    filter: 'unread',
    limit: 20,
  });

  return (
    <div>
      {data?.articles.map(article => (
        <div key={article.id}>{article.title}</div>
      ))}
    </div>
  );
}
```

## Deployment Targets

### Docker (Self-Hosted)

**Pros:**

- Full control
- No cold starts
- Larger resource limits

**Cons:**

- Server maintenance required
- Single region (add CDN for multi-region)
- Manual scaling

**Best for:** Self-hosting, privacy-focused users, higher traffic

### Cloudflare Workers (Cloud)

**Pros:**

- Global edge deployment (300+ locations)
- Auto-scaling
- Zero maintenance
- Built-in DDoS protection
- Free tier available

**Cons:**

- 128MB memory limit
- 30s CPU time limit
- Requires D1 setup

**Best for:** Public hosting, global users, low-maintenance

## Troubleshooting

### Database Locked Error

SQLite with WAL mode is enabled. If you see "database is locked":

```bash
# Check for stale WAL files
rm data/tuvix.db-wal

# Or restart the server
```

### CORS Issues

The adapters include CORS headers. If you need to customize:

```typescript
// In express.ts or cloudflare.ts
headers.set("Access-Control-Allow-Origin", "https://yourdomain.com");
```

### Better Auth Secret Warning

Always set a strong `BETTER_AUTH_SECRET` in production:

```bash
# Generate a secure secret
openssl rand -base64 32
```

## Related Documentation

### This Package

- [Admin Guide](../../docs/admin-guide.md) - Admin operations and user management

### Project-Level

- [Documentation Index](../../docs/README.md) - Complete documentation index
- [Deployment Guide](../../docs/deployment.md) - Docker & Cloudflare Workers deployment
- [tRPC API Architecture](../../docs/trpc-api-architecture.md) - Complete API reference
- [Project Integration](../../docs/project-integration.md) - Frontend-backend integration guide

### External

- [tRPC Documentation](https://trpc.io)
- [Drizzle ORM](https://orm.drizzle.team)
- [Cloudflare Workers](https://developers.cloudflare.com/workers)

## License

Same as parent project (TuvixRSS)

## Status

✅ **Production Ready** - All core features are implemented and tested.

The API is fully functional with complete CRUD operations for articles, subscriptions, categories, feeds, and user settings. All endpoints are documented and type-safe.
