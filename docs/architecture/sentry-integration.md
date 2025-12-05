# Sentry Integration Architecture

## Overview

TuvixRSS uses a runtime-agnostic Sentry wrapper to provide error tracking and performance monitoring in Cloudflare Workers while avoiding runtime incompatibilities in Node.js/Express deployments.

## Runtime-Agnostic Design

### Problem Statement

The codebase runs in two different environments:

- **Cloudflare Workers**: Uses `@sentry/cloudflare`
- **Node.js/Express**: Does not require Sentry (development/testing only)

Statically importing `@sentry/cloudflare` in shared code breaks Node.js deployments because the Cloudflare SDK is not compatible with Node.js.

### Solution: Sentry Wrapper

We created a runtime-agnostic wrapper (`packages/api/src/utils/sentry.ts`) that:

1. **Detects the runtime** using `process.env.RUNTIME`
2. **Dynamically imports** `@sentry/cloudflare` only in Cloudflare Workers
3. **Provides no-op stubs** for Node.js environments

## Architecture

### Runtime Detection

```typescript
// In Express adapter (packages/api/src/adapters/express.ts)
// Set BEFORE any imports that might use Sentry
process.env.RUNTIME = "nodejs";

// In Sentry wrapper (packages/api/src/utils/sentry.ts)
const isCloudflare = process.env?.RUNTIME !== "nodejs";
```

### Lazy Loading

The Sentry SDK is lazy-loaded on first use to avoid blocking startup:

```typescript
async function loadSentry() {
  if (isCloudflare) {
    return await import("@sentry/cloudflare");
  }
  return null;
}
```

### Unified API

The wrapper provides async functions that match Sentry's API:

```typescript
export const Sentry = {
  setUser: async (user) => {
    /* ... */
  },
  addBreadcrumb: async (breadcrumb) => {
    /* ... */
  },
  captureException: async (error, context) => {
    /* ... */
  },
  startSpan: async (options, callback) => {
    /* ... */
  },
};
```

## Usage

### Importing Sentry

All shared code imports from the wrapper instead of the SDK directly:

```typescript
// ✅ Correct - use the wrapper
import * as Sentry from "@/utils/sentry";

// ❌ Wrong - breaks Node.js
import * as Sentry from "@sentry/cloudflare";
```

### Using Sentry Functions

All Sentry functions are async and should be awaited:

```typescript
// Set user context
await Sentry.setUser({ id: userId.toString() });

// Add breadcrumb
await Sentry.addBreadcrumb({
  category: "feed.fetch",
  message: "Fetching feed",
  level: "info",
});

// Capture exception
await Sentry.captureException(error, {
  level: "error",
  tags: { operation: "feed_fetch" },
});

// Start performance span
await Sentry.startSpan(
  { op: "feed.fetch", name: "Fetch RSS Feed" },
  async (span) => {
    span.setAttribute("feed_url", url);
    // ... your code ...
  }
);
```

## Configuration

### Cloudflare Workers

Sentry is initialized via `Sentry.withSentry()` in the Cloudflare adapter:

```typescript
// packages/api/src/adapters/cloudflare.ts
export default Sentry.withSentry((env: Env) => {
  const config = getSentryConfig(env);
  return config || { dsn: undefined };
}, workerHandler);
```

**Required Environment Variables:**

- `SENTRY_DSN`: Your Sentry project DSN
- `SENTRY_ENVIRONMENT`: Environment name (e.g., "production")
- `SENTRY_RELEASE`: Optional release version

### Node.js/Express

Sentry is **disabled** in Node.js environments. All Sentry calls become no-ops:

```typescript
// packages/api/src/adapters/express.ts
// Set runtime identifier early (before any imports)
process.env.RUNTIME = "nodejs";
```

## Behavior by Runtime

### In Cloudflare Workers

- ✅ Full Sentry functionality
- ✅ Error tracking
- ✅ Performance monitoring
- ✅ Breadcrumbs and user context
- ✅ Distributed tracing

### In Node.js/Express

- ✅ No runtime errors
- ✅ All Sentry calls are no-ops
- ✅ No performance overhead
- ✅ Code works identically (returns undefined/no-op)

## Type Safety

The wrapper maintains type safety through:

1. **Lazy imports with proper typing**: `typeof import("@sentry/cloudflare")`
2. **Async return types**: All functions return `Promise<T>`
3. **ESLint suppression**: Intentional `any` types in callbacks are documented

Some ESLint warnings are suppressed with comments:

```typescript
async (span) => {
  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  span.setAttribute("key", "value");
  span.setStatus({ code: 1 });
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
};
```

This is intentional because:

- The `span` object type varies between runtimes
- We use `any` for runtime abstraction
- The API is stable and well-tested

## Migration Guide

### For New Code

Always import from the wrapper:

```typescript
import * as Sentry from "@/utils/sentry";

// Use await with all Sentry calls
await Sentry.captureException(error);
```

### For Existing Code

If you see direct imports from `@sentry/cloudflare` or `@sentry/node`:

1. Change the import:

   ```typescript
   // Before
   import * as Sentry from "@sentry/cloudflare";

   // After
   import * as Sentry from "@/utils/sentry";
   ```

2. Add `await` to all Sentry calls:

   ```typescript
   // Before
   Sentry.captureException(error);

   // After
   await Sentry.captureException(error);
   ```

## Testing

### Unit Tests

The wrapper works in test environments (Node.js) by providing no-ops:

```typescript
// No special setup needed - just import and use
import * as Sentry from "@/utils/sentry";

test("captures errors", async () => {
  // Returns undefined in tests (no-op)
  const result = await Sentry.captureException(new Error("test"));
  expect(result).toBeUndefined();
});
```

### Integration Tests

Sentry is automatically disabled in Node.js, so integration tests run without side effects.

## Troubleshooting

### Issue: `@sentry/cloudflare` errors in Node.js

**Cause**: Code is importing `@sentry/cloudflare` directly instead of using the wrapper.

**Solution**: Change imports to use `@/utils/sentry`.

### Issue: Type errors on `span` object

**Cause**: ESLint complaining about `any` types in span callbacks.

**Solution**: Add ESLint disable comments around span operations (this is intentional).

### Issue: Sentry not capturing errors

**Causes**:

1. `SENTRY_DSN` not set in Cloudflare Workers secrets
2. Error thrown before Sentry wrapper is loaded
3. Running in Node.js environment (Sentry is disabled)

**Solution**:

- Verify `SENTRY_DSN` is configured in Cloudflare Workers
- Check environment with `process.env.RUNTIME`

## Best Practices

1. **Always use `await`**: All Sentry functions are async
2. **Import from wrapper**: Never import SDK directly in shared code
3. **Use in Cloudflare-specific code**: Cloudflare adapter can import SDK directly
4. **Add context**: Use tags, extra data, and breadcrumbs for rich error tracking
5. **Use spans**: Wrap expensive operations in spans for performance monitoring

## Alternative Approaches Considered

### Dynamic imports at call sites

- ❌ Too verbose, scattered logic
- ❌ Difficult to maintain

### Separate service versions

- ❌ Code duplication
- ❌ Increased maintenance burden

### Try/catch everywhere

- ❌ Error-prone
- ❌ Unclear intent
- ❌ Silent failures

The wrapper approach is **clean, type-safe, and keeps the abstraction in one place**.

## tRPC Error Capturing

### Overview

tRPC errors are automatically captured to Sentry through the `errorFormatter` in the tRPC initialization. This ensures all tRPC errors are tracked without requiring manual error capturing in each route.

### Implementation

**File**: `packages/api/src/trpc/init.ts:16-51`

The tRPC instance is configured with an `errorFormatter` that:

1. Logs all errors to console for debugging
2. Captures errors to Sentry (when configured)
3. Filters out noise (UNAUTHORIZED, NOT_FOUND)
4. Tags errors with tRPC-specific metadata

```typescript
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error, ctx }) {
    // Console logging
    console.error("❌ tRPC Error:", {
      code: error.code,
      message: error.message,
      cause: error.cause,
      stack: error.stack,
    });

    // Sentry capturing (Cloudflare only)
    if (
      ctx?.env?.SENTRY_DSN &&
      error.code !== "UNAUTHORIZED" &&
      error.code !== "NOT_FOUND"
    ) {
      import("@sentry/cloudflare")
        .then((Sentry) => {
          Sentry.captureException(error, {
            tags: {
              trpc_code: error.code,
              trpc_path: shape.data.path,
            },
            level: error.code === "INTERNAL_SERVER_ERROR" ? "error" : "warning",
          });
        })
        .catch(() => {
          // Sentry not available - ignore silently
        });
    }

    return shape;
  },
});
```

### Error Filtering

Not all tRPC errors are captured to reduce noise:

- ✅ **Captured**: `FORBIDDEN`, `TOO_MANY_REQUESTS`, `INTERNAL_SERVER_ERROR`, `BAD_REQUEST`
- ❌ **Filtered**: `UNAUTHORIZED` (expected when not logged in), `NOT_FOUND` (expected for missing resources)

### Error Levels

Errors are tagged with appropriate severity levels:

- **Error**: `INTERNAL_SERVER_ERROR` (code 500)
- **Warning**: All other captured errors (FORBIDDEN, TOO_MANY_REQUESTS, etc.)

### Error Tags

All captured tRPC errors include these tags for filtering in Sentry:

- `trpc_code`: The tRPC error code (e.g., "FORBIDDEN", "TOO_MANY_REQUESTS")
- `trpc_path`: The tRPC route path (e.g., "categories.list", "articles.list")

### Example Sentry Issues

#### FORBIDDEN Error (Email Verification)

When a user without email verification tries to access protected routes:

```
TRPCError: Email verification required. Please check your email for a verification link.

Tags:
  trpc_code: FORBIDDEN
  trpc_path: categories.list
Level: warning
```

#### Rate Limit Error

When a user exceeds their API rate limit:

```
TRPCError: Rate limit exceeded. 60 requests per minute allowed.

Tags:
  trpc_code: TOO_MANY_REQUESTS
  trpc_path: feeds.create
Level: warning
```

### tRPC Middleware Integration

The tRPC initialization also includes **Sentry tRPC middleware** for enhanced tracing:

**File**: `packages/api/src/trpc/init.ts:34-58`

```typescript
// Import Sentry's tRPC middleware (Cloudflare Workers only)
const SentryModule = await import("@sentry/cloudflare");
if (SentryModule.trpcMiddleware) {
  sentryMiddleware = t.middleware(
    SentryModule.trpcMiddleware({
      attachRpcInput: true, // Include RPC input in error context
    })
  );
}
```

This middleware:

- Creates performance spans for each tRPC call
- Attaches request input to error context
- Improves distributed tracing across tRPC procedures

### Hono tRPC Handler

The Hono app also has an `onError` handler for tRPC routes:

**File**: `packages/api/src/hono/app.ts:158-163`

```typescript
onError: ({ error, type, path }) => {
  console.error("❌ tRPC Error:", { type, path, error });

  // Note: Error capturing is handled in errorFormatter in trpc/init.ts
  // This onError is just for additional logging
},
```

This handler provides additional logging but doesn't duplicate Sentry capturing (which is already handled by the `errorFormatter`).

## Error Capturing Flow

### 1. Entry Points

#### Cloudflare Workers

**File**: `packages/api/src/entries/cloudflare.ts:1-165`

```typescript
import * as Sentry from "@sentry/cloudflare";

// Wrap entire worker with Sentry
export default Sentry.withSentry((env: Env) => {
  const config = getSentryConfig(env);
  return config || { dsn: undefined };
}, workerHandler);

// Instrument D1 database
if (env.DB && env.SENTRY_DSN) {
  const instrumentedD1 = Sentry.instrumentD1WithSentry(env.DB);
  workerEnv = { ...workerEnv, DB: instrumentedD1 };
}
```

#### Node.js

**File**: `packages/api/src/entries/node.ts:1-105`

```typescript
// Set runtime FIRST (before any imports)
process.env.RUNTIME = "nodejs";

import * as Sentry from "@sentry/node";

// Initialize Sentry with Node.js integrations
if (env.SENTRY_DSN) {
  const sentryConfig = getSentryConfig(env);
  if (sentryConfig) {
    Sentry.init({
      ...sentryConfig,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.nativeNodeFetchIntegration(),
      ],
    });
  }
}
```

### 2. Error Capture Points

```
┌─────────────────────────────────────────────────────────────┐
│                     Error Capture Flow                       │
└─────────────────────────────────────────────────────────────┘

1. Application Error
   ↓
2. Error Type Detection
   ├─ tRPC Error → errorFormatter → Sentry (filtered)
   ├─ Hono Error → app.onError → Sentry
   └─ Unhandled → Sentry.captureException (manual)
   ↓
3. Sentry Processing
   ├─ Add tags (trpc_code, trpc_path, runtime, etc.)
   ├─ Add context (user, breadcrumbs, span)
   └─ Filter PII (via beforeSendMetric, beforeSendSpan)
   ↓
4. Transport
   ├─ Cloudflare: Immediate (withSentry wrapper)
   └─ Node.js: Batched (Sentry.init())
```

### 3. Manual Error Capturing

For errors outside of tRPC/Hono error handlers:

```typescript
import * as Sentry from "@/utils/sentry";

try {
  await riskyOperation();
} catch (error) {
  await Sentry.captureException(error, {
    tags: {
      operation: "risky_operation",
      component: "feed-fetcher",
    },
    level: "error",
  });
  throw error; // Re-throw if needed
}
```

## Configuration Deep Dive

### Common Configuration

**File**: `packages/api/src/config/sentry.ts:34-108`

The `getSentryConfig()` function provides shared configuration for both runtimes:

```typescript
export function getSentryConfig(env: Env): Record<string, unknown> | null {
  const dsn = env.SENTRY_DSN as string | undefined;
  if (!dsn) {
    return null; // Sentry is optional
  }

  const environment = (env.SENTRY_ENVIRONMENT ||
    env.NODE_ENV ||
    "development") as string;
  const release = env.SENTRY_RELEASE as string | undefined;

  const runtime: "nodejs" | "cloudflare" =
    env.RUNTIME ||
    (typeof process !== "undefined" && process.env ? "nodejs" : "cloudflare");

  return {
    dsn,
    environment,
    release,
    tracesSampleRate: 0.1, // 10% sampling
    enableMetrics: true,
    enableLogs: true,
    debug: environment === "development",
    beforeSendMetric: (metric) => {
      /* PII filtering */
    },
    beforeSendSpan: (span) => {
      /* Add global context */
    },
  };
}
```

### Configuration Options

| Option             | Value                                            | Description                                             |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------- |
| `dsn`              | `env.SENTRY_DSN`                                 | Project DSN (required)                                  |
| `environment`      | `env.SENTRY_ENVIRONMENT`                         | Environment name (production, staging, etc.)            |
| `release`          | `env.SENTRY_RELEASE` or `CF_VERSION_METADATA.id` | Release version for tracking                            |
| `tracesSampleRate` | `0.1`                                            | Sample 10% of transactions for performance monitoring   |
| `enableMetrics`    | `true`                                           | Enable Sentry Metrics (counters, gauges, distributions) |
| `enableLogs`       | `true`                                           | Enable logs for better debugging                        |
| `debug`            | `environment === "development"`                  | Verbose logging in development                          |

### Callbacks

#### beforeSendMetric

Filters sensitive data from metrics before sending to Sentry:

```typescript
beforeSendMetric: (metric: SentryMetric): SentryMetric | null => {
  // Remove any PII from metric attributes
  if (metric.attributes?.email) {
    delete metric.attributes.email;
  }

  // Don't send test metrics in production
  if (metric.name.startsWith("test.") && environment === "production") {
    return null;
  }

  return metric;
};
```

#### beforeSendSpan

Adds global context to all spans (traces):

```typescript
beforeSendSpan: (span: SpanJSON): SpanJSON => {
  if (!span.data) {
    span.data = {};
  }

  // Add global context
  span.data.runtime = runtime;
  if (release) {
    span.data["app.version"] = release;
  }
  span.data["app.environment"] = environment;

  return span;
};
```

### Environment Variables

#### Required (for Sentry to be enabled)

- `SENTRY_DSN`: Your Sentry project DSN

#### Optional

- `SENTRY_ENVIRONMENT`: Environment name (defaults to `NODE_ENV` or "development")
- `SENTRY_RELEASE`: Release version (defaults to `CF_VERSION_METADATA.id` in Cloudflare)

#### Runtime Detection

- `RUNTIME`: Set to "nodejs" or "cloudflare" to control which SDK is used

## Instrumentation

### D1 Database Instrumentation (Cloudflare Only)

The D1 database is automatically instrumented to track query performance:

```typescript
// packages/api/src/entries/cloudflare.ts:19-26
if (env.DB && env.SENTRY_DSN) {
  try {
    const instrumentedD1 = Sentry.instrumentD1WithSentry(env.DB);
    workerEnv = { ...workerEnv, DB: instrumentedD1 };
  } catch {
    // Sentry instrumentation failed, continue with regular D1
  }
}
```

This creates performance spans for every D1 query, making it easy to identify slow queries in Sentry.

### HTTP Instrumentation (Node.js Only)

Node.js uses built-in HTTP integrations:

```typescript
// packages/api/src/entries/node.ts:51-57
Sentry.init({
  ...sentryConfig,
  integrations: [
    Sentry.httpIntegration(), // Track HTTP requests
    Sentry.nativeNodeFetchIntegration(), // Track fetch() calls
  ],
});
```

## Performance Monitoring

### Automatic Spans

Sentry automatically creates spans for:

- **HTTP requests** (both incoming and outgoing)
- **Database queries** (D1 in Cloudflare, SQLite in Node.js)
- **tRPC calls** (via tRPC middleware)

### Manual Spans

Create custom spans for expensive operations:

```typescript
import * as Sentry from "@/utils/sentry";

await Sentry.startSpan(
  {
    op: "feed.fetch",
    name: "Fetch RSS Feed",
    attributes: {
      feed_url: url,
      feed_id: feedId,
    },
  },
  async (span) => {
    // Your code here
    const result = await fetchFeed(url);

    span.setAttribute("article_count", result.items.length);
    span.setStatus({ code: 1 }); // Success

    return result;
  }
);
```

## Metrics

### Using Sentry Metrics

```typescript
import { emitCounter } from "@/utils/metrics";

// Increment a counter
emitCounter("feed.fetch.success", 1, {
  feed_type: "rss",
  has_images: "true",
});

// Distribution (for timing, sizes, etc.)
emitDistribution("feed.parse_time", parseTimeMs, {
  unit: "millisecond",
  feed_format: "rss2.0",
});

// Gauge (for current values)
emitGauge("queue.size", queueLength, {
  queue_name: "article_processing",
});
```

### Metrics Filtering

Metrics go through `beforeSendMetric` callback for PII filtering before being sent to Sentry.

## Debugging

### Debug Mode

Enable debug mode in development by setting:

```bash
SENTRY_ENVIRONMENT=development
```

This will log all Sentry operations to the console:

```
[Sentry] Capturing exception: Error: Something went wrong
[Sentry] Event sent: abc123
```

### Test Endpoint

Use the `/debug-sentry` endpoint to test Sentry integration:

```bash
curl http://localhost:3001/debug-sentry
```

This will:

1. Capture a test error to Sentry
2. Return the Sentry event ID
3. Confirm runtime (nodejs or cloudflare)

### Wrangler Tail

Monitor Cloudflare Workers logs in real-time:

```bash
wrangler tail
```

Look for:

- `❌ tRPC Error:` - tRPC errors (always logged)
- Sentry event IDs - Confirms errors were captured

## References

- [Sentry Cloudflare Docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)
- [Sentry Node.js Docs](https://docs.sentry.io/platforms/javascript/guides/node/)
- [Sentry tRPC Middleware](https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/integrations/trpc/)
- Wrapper implementation: `packages/api/src/utils/sentry.ts`
- Common config: `packages/api/src/config/sentry.ts`
- Cloudflare entry: `packages/api/src/entries/cloudflare.ts`
- Node.js entry: `packages/api/src/entries/node.ts`
- tRPC initialization: `packages/api/src/trpc/init.ts`
- Hono app: `packages/api/src/hono/app.ts`
