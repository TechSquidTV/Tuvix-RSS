# Sentry Integration Architecture

## Overview

TuvixRSS uses **build-time aliasing** to provide Sentry error tracking and performance monitoring in Cloudflare Workers while avoiding runtime incompatibilities in Node.js/Express deployments.

## Build-Time Aliasing Design

### Problem Statement

The codebase runs in multiple environments:

- **Cloudflare Workers** (production): Uses `@sentry/cloudflare`
- **Node.js/Docker** (local development): Uses `@sentry/node`
- **Tests** (vitest): Uses no-op implementation (fast, no external deps)

**Why can't we just use `@sentry/cloudflare` everywhere?**

The `@sentry/cloudflare` SDK is built specifically for the Cloudflare Workers runtime (`workerd`) and uses APIs that don't exist in Node.js:

```
Error: Cannot find module 'cloudflare:sockets'
```

When running the API locally via Docker Compose (`docker-compose up`), the app runs in Node.js, not Cloudflare Workers. Any shared code (routers, services) that statically imports `@sentry/cloudflare` will crash immediately.

### Solution: Build-Time SDK Selection

We use build-time aliasing to swap the Sentry implementation at compile time:

1. **Application code** imports from `@/utils/sentry`
2. **Build system** (tsup/esbuild/vitest) aliases this to the correct implementation:
   - **Node.js builds** (tsup): `sentry.node.ts` → `@sentry/node`
   - **Cloudflare builds**: `sentry.cloudflare.ts` → `@sentry/cloudflare`
   - **Tests** (vitest): `sentry.noop.ts` → no-ops
3. **Result**: Synchronous API, no runtime detection overhead, real Sentry in all environments

## Architecture

### File Structure

```
packages/api/src/utils/
├── sentry.cloudflare.ts    # Re-exports @sentry/cloudflare (used in Workers)
├── sentry.node.ts          # Re-exports @sentry/node (used in Docker/local dev)
├── sentry.noop.ts          # No-op implementations (used in tests)
└── sentry.types.ts         # Shared TypeScript types
```

### Build Configuration

**tsup.config.ts** (Node.js/Docker builds):

```typescript
import { defineConfig } from "tsup";
import path from "path";

export default defineConfig({
  // ...
  esbuildOptions(options) {
    options.alias = {
      "@/utils/sentry": path.resolve(__dirname, "./src/utils/sentry.node.ts"),
    };
  },
});
```

**vitest.config.ts** (tests - uses no-op for speed):

```typescript
resolve: {
  alias: {
    "@/utils/sentry": path.resolve(__dirname, "./src/utils/sentry.noop.ts"),
    // ... other aliases
  },
},
```

**Cloudflare Workers**: Uses `@sentry/cloudflare` directly in entry point, and application code imports are bundled as-is (resolving to `sentry.cloudflare.ts`).

## Usage

### Importing Sentry

Always import from the wrapper (never directly from `@sentry/cloudflare`):

```typescript
// ✅ CORRECT - Uses build-time aliasing
import * as Sentry from "@/utils/sentry";

// ❌ WRONG - Will crash in Node.js
import * as Sentry from "@sentry/cloudflare";
```

### API Reference

All Sentry methods are **synchronous** (no `await` needed):

```typescript
// Set user context
Sentry.setUser({ id: "123", email: "user@example.com" });

// Add breadcrumb
Sentry.addBreadcrumb({
  category: "user.action",
  message: "User clicked button",
  level: "info",
});

// Capture exception
Sentry.captureException(error, {
  tags: { component: "auth" },
  extra: { userId: "123" },
});

// Start span (only await if callback is async)
await Sentry.startSpan(
  { op: "db.query", name: "Fetch user" },
  async (span) => {
    span.setAttribute("user_id", userId);
    return await db.query(...);
  }
);

// Metrics
Sentry.metrics.count("api.request", 1, { attributes: { endpoint: "/users" } });
Sentry.metrics.distribution("response_time", 150, { unit: "millisecond" });
```

### `startSpan` Behavior

`Sentry.startSpan()` returns the result of its callback:

- If callback is **async** (`async () => {...}`): Returns `Promise<T>`, use `await`
- If callback is **sync** (`() => {...}`): Returns `T`, no `await` needed

```typescript
// Async callback - await the result
const user = await Sentry.startSpan({ name: "fetch-user" }, async (span) => {
  return await db.getUser(id);
});

// Sync callback - no await
const result = Sentry.startSpan({ name: "compute" }, (span) => {
  return heavyComputation();
});
```

## Runtime Behavior

### In Cloudflare Workers

- `@/utils/sentry` resolves to `sentry.cloudflare.ts`
- Full Sentry SDK functionality
- Errors, spans, and metrics sent to Sentry

### In Node.js / Docker

- `@/utils/sentry` resolves to `sentry.node.ts`
- Full `@sentry/node` SDK functionality
- Errors, spans, and metrics sent to Sentry (if `SENTRY_DSN` is set)

### In Tests (vitest)

- `@/utils/sentry` resolves to `sentry.noop.ts`
- All functions are no-ops (do nothing)
- Tests run fast without external dependencies

## Entry Points

### Cloudflare Entry (`cloudflare.ts`)

```typescript
import * as Sentry from "@sentry/cloudflare";

// Initialize Sentry at the top level
Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

// Wrap worker with Sentry
export default Sentry.withSentry((env) => env.SENTRY_DSN, worker);
```

### Node.js Entry (`node.ts`)

```typescript
import * as Sentry from "@sentry/node";

// Initialize Sentry (if DSN provided)
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Node-specific integrations
  });
}

// Create app and inject Sentry SDK
const app = createHonoApp({
  env,
  sentry: Sentry,  // Pass initialized SDK to shared code
  runtime: "nodejs",
});
```

## Import Patterns

### When to Import SDK Directly vs Using Shim

| Location | Import Pattern | Reason |
|----------|---------------|---------|
| **Entry Points** | Direct SDK import | Runtime-specific, safe to import directly |
| `entries/node.ts` | `import * as Sentry from "@sentry/node"` | Only runs in Node.js |
| `entries/cloudflare.ts` | `import * as Sentry from "@sentry/cloudflare"` | Only runs in Cloudflare |
| **Shared Application Code** | Shim via `@/utils/sentry` | Runs in both environments |
| `routers/*.ts` | `import * as Sentry from "@/utils/sentry"` | Build-time aliasing |
| `services/*.ts` | `import * as Sentry from "@/utils/sentry"` | Build-time aliasing |
| **Shared Infrastructure** | Dependency injection | Gets initialized SDK instance |
| `hono/app.ts` | `c.get("sentry")` from context | Receives SDK from entry point |

### Dependency Injection Pattern

`hono/app.ts` receives the Sentry SDK via dependency injection rather than importing:

```typescript
// hono/app.ts - receives SDK via context
app.onError(async (err, c) => {
  const sentry = c.get("sentry");  // Injected SDK instance
  if (sentry && env.SENTRY_DSN) {
    sentry.captureException(err);  // Use injected SDK
  }
});
```

This pattern ensures the same initialized SDK instance is used throughout the request lifecycle.

## Cron Job Monitoring

Cron handlers use direct SDK import for `withMonitor` (Cloudflare-specific):

```typescript
// cron/handlers.ts
export async function handleRSSFetch(env: Env): Promise<void> {
  if (env.RUNTIME === "cloudflare" && env.SENTRY_DSN) {
    try {
      const Sentry = await import("@sentry/cloudflare");
      await Sentry.withMonitor("rss-fetch", () => _handleRSSFetch(env), {
        schedule: { type: "crontab", value: "*/5 * * * *" },
      });
      return;
    } catch {
      // Sentry not available, use regular handler
    }
  }
  return _handleRSSFetch(env);
}
```

## Migration from Runtime Detection

The previous implementation used runtime detection with async wrappers. The new build-time approach:

| Aspect      | Old (Runtime)                    | New (Build-time)                         |
| ----------- | -------------------------------- | ---------------------------------------- |
| Detection   | `process.env.RUNTIME` at runtime | Build-time aliasing                      |
| API         | All methods `async`              | Methods match native SDK                 |
| `await`     | Required everywhere              | Only for `startSpan` with async callback |
| `.catch()`  | Needed for sync contexts         | Not needed                               |
| Bundle size | Larger (wrapper code)            | Smaller (direct SDK or noop)             |

### Migration Checklist

When migrating existing code:

1. Change import to `import * as Sentry from "@/utils/sentry"`
2. Remove `await` from:
   - `Sentry.setUser()`
   - `Sentry.addBreadcrumb()`
   - `Sentry.captureException()`
3. Keep `await` for `Sentry.startSpan()` when callback is async
4. Remove `.catch(() => {})` workarounds

## Troubleshooting

### "Cannot find module 'cloudflare:sockets'"

You're importing `@sentry/cloudflare` directly in code that runs in Node.js.

**Fix**: Use `import * as Sentry from "@/utils/sentry"` instead.

### Sentry calls not working in tests

Ensure `vitest.config.ts` has the Sentry alias configured before other `@/utils` aliases.

### Metrics not appearing in Sentry

In Node.js/tests, metrics are no-ops. They only work in Cloudflare Workers with a valid `SENTRY_DSN`.

## Best Practices

1. **Always use the wrapper**: Import from `@/utils/sentry`, never directly from SDK
2. **Don't await sync methods**: `setUser`, `addBreadcrumb`, `captureException` are void
3. **Use spans for async operations**: Wrap database queries, API calls, etc.
4. **Add breadcrumbs for debugging**: They help trace issues in production
5. **Tag errors appropriately**: Use `tags` for filtering, `extra` for context
