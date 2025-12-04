# TuvixRSS - Claude Code Guidelines

TuvixRSS is a modern RSS reader with AI features, built on Cloudflare Workers.

## Tech Stack

- **API**: Hono (Cloudflare Workers), tRPC, Drizzle ORM, Cloudflare D1
- **Frontend**: React, TanStack Router, TanStack Query, Tailwind CSS
- **Auth**: Better Auth (email/password)
- **Observability**: Sentry (errors, performance, metrics)
- **Email**: Resend
- **Monorepo**: pnpm workspaces (`packages/api`, `packages/app`, `packages/tricorder`)

## Project Structure

```
packages/
  api/          # Cloudflare Workers API (Hono + tRPC)
    src/
      routers/  # tRPC route handlers
      services/ # Business logic (RSS fetching, email, etc.)
      auth/     # Better Auth configuration
      db/       # Drizzle schema and migrations
  app/          # React frontend (Vite + TanStack)
  tricorder/    # RSS/Atom feed discovery library
```

## Critical Rules

### Production Database Operations

**⛔ NEVER run production database migrations or modifications without explicit user permission.**

This includes but is not limited to:

- `wrangler d1 execute <db> --remote`
- Any SQL migrations against production databases
- Schema alterations on live systems
- Data modifications in production

**Required Process:**

1. Generate migrations locally
2. Show the user what will change
3. Explain impact and safety
4. **ASK FOR PERMISSION**
5. Only after explicit approval, proceed

**Rationale:** Production database operations are irreversible and can cause data loss, service disruption, or schema conflicts. Always give the user control over these decisions.

**Exception:** Local/dev database operations (`--local`, `db:migrate:local`) are safe to run without asking.

### Production Deployments

**⛔ NEVER deploy to production. Only local development is allowed.**

Deployment is explicitly forbidden and handled by CI/CD pipelines.

## Common Workflows

### Database Changes

1. Modify schema in `packages/api/src/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Review generated SQL in `packages/api/drizzle/`
4. Apply locally: `pnpm db:migrate:local`

### Running Tests

- API: `pnpm --filter @tuvixrss/api test`
- App: `pnpm --filter @tuvixrss/app test`
- All: `pnpm test`

### Type Checking & Linting

- `pnpm type-check` - Check all packages
- `pnpm lint` - Lint all packages
- `pnpm format` - Format with Prettier

## Key Architecture Decisions

- **Fire-and-forget emails**: Email sending doesn't block API responses; uses Sentry spans for tracking
- **Admin dashboard**: User management at `packages/api/src/routers/admin.ts`
- **Security audit logging**: All auth events logged to `security_audit_log` table
- **Rate limiting**: Cloudflare Workers rate limit API per plan tier
