# Build-Time Sentry SDK Migration Plan

## Problem Statement

### Current Issues

The codebase uses a runtime-agnostic Sentry wrapper (`packages/api/src/utils/sentry.ts`) that:

1. **Makes all methods async** - Even sync methods like `addBreadcrumb()` return Promises due to lazy-loading via `await import()`
2. **Requires `await` everywhere** - 118+ call sites must use `await Sentry.method()`
3. **Needs `.catch(() => {})` workaround** - Sync functions calling Sentry need fire-and-forget pattern
4. **Adds cognitive load** - Forgetting `await` silently skips monitoring (no crash, no warning)
5. **Runtime overhead** - Runtime detection and dynamic imports on every call

### Root Cause

The wrapper exists because `@sentry/cloudflare` cannot be imported in Node.js (crashes with `Cannot find module 'cloudflare:sockets'`). The current solution detects runtime at execution time, but this forces async patterns throughout.

## Proposed Solution

Replace **runtime detection** with **build-time aliasing**:

- Create two implementations: `sentry.cloudflare.ts` (real SDK) and `sentry.noop.ts` (no-ops)
- Configure tsup/esbuild to alias `@/utils/sentry` to the correct file at build time
- Result: **Sync API everywhere**, no await needed, smaller bundles

## SDK API Comparison

Both `@sentry/cloudflare` and `@sentry/node` share the same API (Sentry JavaScript SDK v8+):

| Method              | `@sentry/cloudflare` | `@sentry/node` | Our Wrapper     | After Migration |
| ------------------- | -------------------- | -------------- | --------------- | --------------- |
| `setUser()`         | sync (void)          | sync (void)    | async (Promise) | sync (void)     |
| `addBreadcrumb()`   | sync (void)          | sync (void)    | async (Promise) | sync (void)     |
| `captureException()`| sync (string)        | sync (string)  | async (Promise) | sync (string)   |
| `startSpan()`       | sync (returns T)     | sync (returns T)| async (Promise)| sync (returns T)|
| `flush()`           | async (Promise)      | async (Promise)| async (Promise) | async (Promise) |
| `metrics.*`         | sync (void)          | sync (void)    | sync (void)     | sync (void)     |

Source: [Sentry JavaScript APIs](https://docs.sentry.io/platforms/javascript/guides/cloudflare/apis/)

## Files Requiring Changes

### Phase 1: Create New Sentry Implementations

**New Files:**

- `packages/api/src/utils/sentry.cloudflare.ts` - Re-exports from `@sentry/cloudflare`
- `packages/api/src/utils/sentry.noop.ts` - No-op implementations (sync)
- `packages/api/src/utils/sentry.types.ts` - Shared type definitions

### Phase 2: Update Build Configuration

**Files to Modify:**

- `packages/api/tsup.config.ts` - Add esbuild alias for Node.js build
- `packages/api/vitest.config.ts` - Alias to noop for tests
- `packages/api/package.json` - Update build scripts

### Phase 3: Update All Sentry Call Sites (118+ calls across 14 files)

**Files with `await Sentry.*` calls (must remove `await`):**

| File                                          | Await Count | Notes                  |
| --------------------------------------------- | ----------- | ---------------------- |
| `routers/subscriptions.ts`                    | 29          | Largest file           |
| `routers/auth.ts`                             | 17          | Auth flows             |
| `services/rss-fetcher.ts`                     | 10          | Feed fetching          |
| `services/feed-discovery/apple-discovery.ts`  | 8           | Apple podcast discovery|
| `services/feed-discovery/registry.ts`         | 7           | Discovery registry     |
| `services/email.ts`                           | 7           | Email service          |
| `services/feed-discovery/standard-discovery.ts`| 5          | Standard discovery     |
| `routers/articles.ts`                         | 4           | Article operations     |
| `cron/handlers.ts`                            | 3           | Cron jobs              |
| `routers/admin.ts`                            | 2           | Admin operations       |
| `adapters/sentry-telemetry.ts`                | 2           | Telemetry adapter      |
| `utils/db-metrics.ts`                         | 1           | DB metrics             |

**Files with `.catch(() => {})` pattern (can remove):**

- `services/comment-link-extraction/registry.ts` - 3 occurrences

### Phase 4: Update Direct SDK Imports

**Files importing SDK directly (need conditional handling):**

| File                   | Current Import         | Solution                          |
| ---------------------- | ---------------------- | --------------------------------- |
| `entries/cloudflare.ts`| `@sentry/cloudflare`   | Keep as-is (entry point)          |
| `entries/node.ts`      | `@sentry/node`         | Keep as-is (entry point)          |
| `auth/better-auth.ts`  | `@sentry/node`         | Use `@/utils/sentry` wrapper      |
| `trpc/init.ts`         | Dynamic `@sentry/cloudflare` | Use build-time conditional  |
| `hono/app.ts`          | Type imports only      | Update type imports               |

### Phase 5: Update Tests

**Test files affected:**

- `routers/__tests__/http-integration.test.ts` - Uses `@sentry/node` directly
- All test files will use noop implementation via vitest alias

## Implementation Details

### New File: `sentry.cloudflare.ts`

```typescript
// Re-export everything from @sentry/cloudflare
export * from "@sentry/cloudflare";
import * as Sentry from "@sentry/cloudflare";
export default Sentry;
```

### New File: `sentry.noop.ts`

```typescript
// No-op implementations for Node.js/testing
import type { Breadcrumb, User, Span } from "./sentry.types";

export const setUser = (_user: User | null): void => {};
export const addBreadcrumb = (_breadcrumb: Breadcrumb): void => {};
export const captureException = (_error: unknown, _context?: unknown): string | undefined => undefined;
export const startSpan = <T>(_options: unknown, callback: (span: Span) => T): T => {
  const noopSpan = { setAttribute: () => noopSpan, setStatus: () => noopSpan } as Span;
  return callback(noopSpan);
};
export const flush = async (_timeout?: number): Promise<boolean> => true;
export const metrics = {
  count: () => {},
  gauge: () => {},
  distribution: () => {},
};
```

### Updated: `tsup.config.ts`

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "entries/node": "src/entries/node.ts",
    "db/migrate-local": "src/db/migrate-local.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  bundle: true,
  external: ["better-sqlite3", "bcrypt"],
  noExternal: ["@tuvixrss/tricorder"],
  splitting: false,
  treeshake: true,
  // BUILD-TIME ALIAS: Use noop Sentry for Node.js builds
  esbuildOptions(options) {
    options.alias = {
      "@/utils/sentry": "./src/utils/sentry.noop.ts",
    };
  },
});
```

### Updated: `vitest.config.ts`

```typescript
resolve: {
  alias: {
    // Existing aliases...
    "@/utils/sentry": path.resolve(__dirname, "./src/utils/sentry.noop.ts"),
  },
},
```

### Updated: `package.json` scripts

No changes needed - existing `pnpm build` uses tsup which will pick up the alias.

## Migration Script

Create a codemod script to automate the `await` removal:

```bash
# packages/api/scripts/migrate-sentry-await.sh
# Remove 'await' before Sentry calls (except flush which remains async)

rg -l "await Sentry\.(setUser|addBreadcrumb|captureException|startSpan)" src/ | \
  xargs sed -i '' 's/await Sentry\.setUser/Sentry.setUser/g'
# ... etc for each method
```

## Testing Strategy

1. **Unit Tests**: Will use noop implementation via vitest alias - no changes needed
2. **Integration Tests**: Same as unit tests
3. **Manual Testing**:
   - Docker Compose (`pnpm dev`): Should work with noop Sentry
   - Cloudflare Workers (`wrangler dev`): Real Sentry active
   - Production deploy: Real Sentry active

## Rollback Plan

If issues arise:

1. Revert tsup.config.ts alias
2. Revert vitest.config.ts alias
3. Keep new sentry files (they don't break anything)
4. Old wrapper still works

## Risk Assessment

| Risk                    | Likelihood | Impact | Mitigation                              |
| ----------------------- | ---------- | ------ | --------------------------------------- |
| Missed await removal    | Medium     | Low    | Codemod + grep verification             |
| Type mismatches         | Low        | Medium | Shared types file                       |
| Build config issues     | Low        | High   | Test in CI first                        |
| tRPC middleware breaks  | Medium     | Medium | Keep dynamic import for middleware only |

## Success Criteria

1. All tests pass
2. `pnpm build` succeeds
3. Docker Compose starts without errors
4. `wrangler dev` works with real Sentry
5. No `await Sentry.` calls remain (except `flush`)
6. No `.catch(() => {})` workarounds remain

## Timeline Estimate

- Phase 1 (New files): 30 minutes
- Phase 2 (Build config): 30 minutes
- Phase 3 (Call sites): 2-3 hours (mostly automated)
- Phase 4 (Direct imports): 1 hour
- Phase 5 (Tests): 30 minutes
- Verification: 1 hour

**Total: ~6 hours**

## Implementation Checklist

### Phase 1: Create New Sentry Implementations

- [ ] Create `sentry.types.ts` with shared type definitions (Breadcrumb, Span, User, etc.)
- [ ] Create `sentry.cloudflare.ts` that re-exports from `@sentry/cloudflare`
- [ ] Create `sentry.noop.ts` with sync no-op implementations

### Phase 2: Update Build Configuration

- [ ] Update `tsup.config.ts` with esbuild alias for Node.js builds
- [ ] Update `vitest.config.ts` with alias to noop for tests

### Phase 3: Update All Sentry Call Sites

- [ ] Create and run codemod script to remove `await` from Sentry calls
- [ ] Manually verify all 118+ call sites updated correctly
- [ ] Remove `.catch(() => {})` workarounds from `comment-link-extraction/registry.ts`

### Phase 4: Update Direct SDK Imports

- [ ] Update `auth/better-auth.ts` to use `@/utils/sentry` instead of `@sentry/node`
- [ ] Update `trpc/init.ts` to conditionally import tRPC middleware at build time
- [ ] Update `hono/app.ts` type imports

### Phase 5: Update Tests

- [ ] Update `http-integration.test.ts` to use wrapper instead of direct SDK
- [ ] Run full test suite to verify no regressions

### Verification

- [ ] Verify `pnpm build` succeeds for both targets
- [ ] Test Docker Compose local development works
- [ ] Test `wrangler dev` works with real Sentry

### Cleanup

- [ ] Delete old `sentry.ts` wrapper after migration complete
- [ ] Update `docs/architecture/sentry-integration.md` with new approach
