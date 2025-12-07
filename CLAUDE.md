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

## Observability with Sentry

TuvixRSS uses Sentry for comprehensive observability: error tracking, performance monitoring, and custom metrics.

### When to Add Instrumentation

Add Sentry instrumentation to:

- **Database-heavy operations** - Complex queries, aggregations, bulk operations
- **External API calls** - RSS fetching, email sending, favicon fetching
- **Business-critical paths** - User registration, authentication, feed subscriptions
- **Performance-sensitive endpoints** - Feed fetching, article retrieval

### Instrumentation Tools

Located in `packages/api/src/utils/metrics.ts`:

#### 1. `withTiming` - Automatic Performance Tracking

Wraps async functions to measure execution time and emit distribution metrics:

```typescript
import { withTiming } from "@/utils/metrics";

.query(async ({ ctx, input }) => {
  return withTiming(
    'admin.getUserGrowth',
    async () => {
      // Your logic here
      const data = await fetchData();
      return data;
    },
    { days: input.days }  // Optional attributes for filtering
  );
})
```

**Automatically tracks:**

- Execution duration (milliseconds)
- Success/failure status
- Distribution metrics (p50, p95, p99) in Sentry

**Use for:** Database queries, API endpoints, external service calls

#### 2. `Sentry.startSpan` - Detailed Trace Context

Creates named spans for distributed tracing with nested operations:

```typescript
import * as Sentry from "@/utils/sentry";

return Sentry.startSpan(
  {
    name: "auth.signup",
    op: "auth.register",
    attributes: {
      "auth.method": "email_password",
      "auth.has_username": !!input.username,
    },
  },
  async (parentSpan) => {
    // Main logic
    const user = await createUser();

    // Nested span
    await Sentry.startSpan(
      { name: "auth.send_welcome_email", op: "email.send" },
      async () => {
        await sendWelcomeEmail(user);
      }
    );

    return user;
  }
);
```

**Use for:** Complex operations with multiple steps, distributed tracing

#### 3. Custom Metrics

Direct metric emission for counters, gauges, and distributions:

```typescript
import { emitCounter, emitGauge, emitDistribution } from "@/utils/metrics";

// Count occurrences
emitCounter("email.sent", 1, {
  type: "verification",
  status: "success",
});

// Track current state
emitGauge("subscriptions.active", activeCount, {
  plan: "free",
});

// Measure value distribution
emitDistribution("rss.fetch_time", 150, "millisecond", {
  format: "atom",
  domain: "example.com",
});
```

### Best Practices

1. **Start simple** - Use `withTiming` for most cases
2. **Add attributes** - Include contextual data (user plan, operation type, resource count)
3. **Avoid over-instrumentation** - Focus on critical paths and performance bottlenecks
4. **Low-volume endpoints** - Admin endpoints can use lighter instrumentation
5. **High-volume endpoints** - Use sampling or metrics instead of full spans

### Example Patterns

**Database query timing:**

```typescript
return withTiming('feeds.getUserFeeds', async () => {
  return await ctx.db.query.feeds.findMany({ where: ... });
}, { userId: ctx.user.id });
```

**Multi-step operation:**

```typescript
return Sentry.startSpan({ name: "rss.fetch", op: "http.fetch" }, async () => {
  const feed = await fetchFeed(url);
  return await Sentry.startSpan({ name: "rss.parse" }, async () => {
    return parseFeed(feed);
  });
});
```
