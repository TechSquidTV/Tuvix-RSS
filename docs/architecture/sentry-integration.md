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
  setUser: async (user) => { /* ... */ },
  addBreadcrumb: async (breadcrumb) => { /* ... */ },
  captureException: async (error, context) => { /* ... */ },
  startSpan: async (options, callback) => { /* ... */ },
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
}
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

## References

- [Sentry Cloudflare Docs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)
- [Sentry Node.js Docs](https://docs.sentry.io/platforms/javascript/guides/node/)
- Wrapper implementation: `packages/api/src/utils/sentry.ts`
- Cloudflare adapter: `packages/api/src/adapters/cloudflare.ts`
- Express adapter: `packages/api/src/adapters/express.ts`

