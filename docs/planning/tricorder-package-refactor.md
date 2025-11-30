# Tricorder Package Refactor Plan

## Overview

Refactor the RSS auto-discovery service from the API package into a standalone `@tuvix/tricorder` package that can be used by both the API and a future browser extension for local RSS feed discovery.

## Key Innovation: Zero-Overhead Optional Telemetry

The core design challenge was maintaining rich Sentry tracing in the API while ensuring **zero performance overhead** in the browser extension. Our solution:

- **API Server**: Full Sentry integration with nested spans, breadcrumbs, and exception capture
- **Browser Extension**: Same codebase, zero telemetry calls, zero overhead (~0.01ms from undefined checks)
- **Implementation**: Optional dependency injection with conditional execution (no no-op functions)

This means the browser extension runs the exact same discovery logic without any privacy concerns, network overhead, or performance impact from telemetry infrastructure.

See [Performance and Telemetry Patterns](#performance-and-telemetry-patterns) for detailed analysis.

## Current State Analysis

### Existing Feed Discovery System

Located in: `packages/api/src/services/feed-discovery/`

**Core Files:**
- `index.ts` - Public API and singleton registry
- `types.ts` - TypeScript interfaces and types
- `registry.ts` - Discovery service orchestration
- `standard-discovery.ts` - Standard RSS/Atom discovery via URL patterns and HTML parsing
- `apple-discovery.ts` - Apple Podcasts-specific discovery via iTunes API
- `feed-validator.ts` - Feed validation and deduplication logic

**Supporting Utilities:**
- `packages/api/src/utils/domain-matcher.ts` - Domain/subdomain matching
- `packages/api/src/utils/url-normalize.ts` - URL normalization for deduplication
- `packages/api/src/utils/text-sanitizer.ts` - HTML sanitization and stripping

**External Dependencies:**
- `feedsmith` (v2.6.0) - RSS/Atom feed parsing
- `sanitize-html` (v2.17.0) - HTML sanitization
- `@sentry/node` / `@sentry/cloudflare` - Telemetry and error tracking
- `@trpc/server` - TRPCError for error handling

### Current Architecture

1. **Plugin-based Discovery**: Extensible service registry with priority-based execution
2. **Domain-Specific Services**: Apple Podcasts, with fallback to standard discovery
3. **Deduplication**: URL normalization and Atom feed ID tracking
4. **Telemetry**: Sentry integration throughout

## Goals

1. Create standalone `@tuvix/tricorder` package usable in:
   - Node.js environment (API)
   - Browser environment (extension)
   - Both Docker and Cloudflare Workers (API)

2. Maintain extensibility for custom discovery services

3. Remove server-side dependencies (Sentry, TRPC) from core package

4. Provide both lightweight (browser) and full (server) feature sets

## Package Design

### Package Structure

```
packages/tricorder/
├── src/
│   ├── core/
│   │   ├── types.ts              # Core interfaces and types
│   │   ├── registry.ts           # Discovery registry (no Sentry)
│   │   ├── discovery-context.ts  # Shared discovery context
│   │   └── errors.ts             # Custom error classes
│   ├── services/
│   │   ├── standard-discovery.ts # Standard URL-based discovery
│   │   ├── apple-discovery.ts    # Apple Podcasts discovery
│   │   └── index.ts              # Export all services
│   ├── validators/
│   │   ├── feed-validator.ts     # Feed validation logic
│   │   └── index.ts
│   ├── utils/
│   │   ├── domain-matcher.ts     # Domain matching utilities
│   │   ├── url-normalize.ts      # URL normalization
│   │   └── text-sanitizer.ts     # HTML sanitization
│   ├── telemetry/
│   │   ├── types.ts              # Telemetry interface
│   │   ├── noop-telemetry.ts     # No-op implementation for browser
│   │   └── index.ts
│   ├── index.ts                  # Main package export
│   └── browser.ts                # Browser-specific export (no server deps)
├── package.json
├── tsconfig.json
├── tsconfig.build.json           # Build config for dual exports
└── README.md
```

### API Design

#### Core Types

```typescript
// Core discovery types (platform-agnostic)
export interface DiscoveredFeed {
  url: string;
  title: string;
  type: 'rss' | 'atom' | 'rdf' | 'json';
  description?: string;
}

export interface DiscoveryService {
  canHandle(url: string): boolean;
  discover(url: string, context: DiscoveryContext): Promise<DiscoveredFeed[]>;
  priority: number;
}

export interface DiscoveryContext {
  seenUrls: Set<string>;
  seenFeedIds: Set<string>;
  validateFeed(feedUrl: string): Promise<DiscoveredFeed | null>;
  telemetry?: TelemetryAdapter;
}

// Telemetry abstraction (all methods optional for flexibility)
export interface TelemetryAdapter {
  startSpan?<T>(
    options: {
      op?: string;
      name: string;
      attributes?: Record<string, unknown>;
    },
    callback: () => Promise<T>
  ): Promise<T>;

  addBreadcrumb?(breadcrumb: {
    message: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    category?: string;
    data?: unknown;
  }): void;

  captureException?(error: Error, context?: {
    level?: 'debug' | 'info' | 'warning' | 'error';
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }): void;
}

// Error types
export class FeedDiscoveryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FeedDiscoveryError';
  }
}

export class NoFeedsFoundError extends FeedDiscoveryError {
  constructor(message = 'No RSS or Atom feeds found') {
    super(message, 'NO_FEEDS_FOUND');
  }
}
```

#### Main Export (Node.js + Browser)

```typescript
// packages/tricorder/src/index.ts
export { DiscoveryRegistry } from './core/registry';
export { StandardDiscoveryService } from './services/standard-discovery';
export { AppleDiscoveryService } from './services/apple-discovery';
export { createFeedValidator } from './validators/feed-validator';
export { createDefaultRegistry } from './factories';

// Utilities
export * from './utils';

// Types
export type {
  DiscoveredFeed,
  DiscoveryService,
  DiscoveryContext,
  TelemetryAdapter,
} from './core/types';

export {
  FeedDiscoveryError,
  NoFeedsFoundError,
} from './core/errors';

// Factory for quick setup
export function createDefaultRegistry(options?: {
  telemetry?: TelemetryAdapter;
}): DiscoveryRegistry {
  const registry = new DiscoveryRegistry(options?.telemetry);
  registry.register(new AppleDiscoveryService());
  registry.register(new StandardDiscoveryService());
  return registry;
}

// Convenience function
export async function discoverFeeds(
  url: string,
  options?: { telemetry?: TelemetryAdapter }
): Promise<DiscoveredFeed[]> {
  const registry = createDefaultRegistry(options);
  return registry.discover(url);
}
```

#### Browser-Specific Export

```typescript
// packages/tricorder/src/browser.ts
// Re-export everything except server-specific features
export * from './index';

// Browser might have stricter CORS limitations
// Could provide browser-optimized versions or adapters
```

### Key Design Decisions

#### 1. Telemetry Abstraction

**Problem**: Sentry is deeply integrated but not needed in browser context. We need rich tracing in the API but zero overhead in the browser extension.

**Solution**: Optional telemetry via dependency injection with zero runtime overhead when not provided

**Design Principles**:
1. **Telemetry is completely optional** - `undefined` by default
2. **No runtime overhead without telemetry** - Only simple `undefined` checks, no no-op function calls
3. **API gets full Sentry tracing** - Injects Sentry adapter
4. **Browser gets zero overhead** - No telemetry provided, no performance impact

**Implementation Pattern**:

```typescript
// Core Registry with Optional Telemetry
export class DiscoveryRegistry {
  constructor(private telemetry?: TelemetryAdapter) {}

  // Helper: Conditional span wrapper (zero overhead if no telemetry)
  private async span<T>(
    name: string,
    attributes: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    if (this.telemetry) {
      return this.telemetry.startSpan({ name, attributes }, fn);
    }
    return fn();
  }

  // Helper: Optional breadcrumb (no-op if no telemetry)
  private breadcrumb(message: string, data?: unknown): void {
    this.telemetry?.addBreadcrumb?.({ message, level: 'info', data });
  }

  // Public API: Thin wrapper for tracing
  async discover(url: string): Promise<DiscoveredFeed[]> {
    return this.span('feed.discovery', { url }, async () => {
      this.breadcrumb('Starting feed discovery', { url });

      try {
        const result = await this.discoverInternal(url);
        this.breadcrumb('Discovery completed', {
          feedCount: result.length
        });
        return result;
      } catch (error) {
        this.telemetry?.captureException?.(error, {
          tags: { operation: 'feed_discovery' },
          extra: { url }
        });
        throw error;
      }
    });
  }

  // Private: Core logic without telemetry concerns
  private async discoverInternal(url: string): Promise<DiscoveredFeed[]> {
    // Pure discovery logic - no telemetry calls
    // ...
  }
}
```

**API Integration Example**:

```typescript
// packages/api/src/adapters/sentry-telemetry.ts
import * as Sentry from '@/utils/sentry';
import type { TelemetryAdapter } from '@tuvix/tricorder';

export const sentryAdapter: TelemetryAdapter = {
  startSpan: (options, callback) =>
    Sentry.startSpan({
      op: options.op,
      name: options.name,
      attributes: options.attributes,
    }, callback),

  addBreadcrumb: (breadcrumb) =>
    Sentry.addBreadcrumb({
      category: 'feed.discovery',
      message: breadcrumb.message,
      level: breadcrumb.level,
      data: breadcrumb.data,
    }),

  captureException: (error, context) =>
    Sentry.captureException(error, {
      level: context?.level || 'error',
      tags: context?.tags,
      extra: context?.extra,
    }),
};

// Usage in API
import { createDefaultRegistry } from '@tuvix/tricorder';
import { sentryAdapter } from '@/adapters/sentry-telemetry';

const registry = createDefaultRegistry({ telemetry: sentryAdapter });
```

**Browser Extension Usage**:

```typescript
// In browser extension - no telemetry
import { createDefaultRegistry } from '@tuvix/tricorder';

// No telemetry provided = zero overhead
const registry = createDefaultRegistry();
const feeds = await registry.discover(url);
```

**Performance Impact**:
- **With telemetry**: Full Sentry tracing, breadcrumbs, exception capture
- **Without telemetry**: Only `if (this.telemetry)` checks and optional chaining - negligible overhead (~1-2 CPU cycles per check)

**Why Not No-Op Implementation?**

We considered providing a no-op telemetry implementation (empty functions), but rejected it because:
1. **Function call overhead**: Even no-op functions add stack frame creation/destruction
2. **Memory allocation**: Creating breadcrumb objects that get immediately discarded
3. **Code clarity**: `undefined` check makes intent explicit - "no telemetry"
4. **Bundle size**: No need to ship no-op code to browser

The optional chaining approach (`this.telemetry?.addBreadcrumb?.()`) is:
- **Faster**: Branch prediction optimizes the `undefined` check
- **Cleaner**: No unnecessary object creation
- **Smaller**: No no-op code in bundle

#### 2. Error Handling

**Problem**: TRPC errors are API-specific

**Solution**: Custom error classes that API can wrap

```typescript
// In API package
try {
  const feeds = await discoverFeeds(url, { telemetry: sentryAdapter });
} catch (error) {
  if (error instanceof NoFeedsFoundError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }
  throw error;
}
```

#### 3. Dependencies Management

**Required for core functionality:**
- `feedsmith` - Feed parsing (works in browser and Node.js)
- `sanitize-html` - HTML sanitization (works in both environments)

**Optional peer dependencies:**
- Telemetry implementation (Sentry, etc.)

**Removed from core:**
- `@trpc/server`
- `@sentry/node`
- `@sentry/cloudflare`

#### 4. Dual Package Export

Use package.json exports for conditional loading:

```json
{
  "name": "@tuvix/tricorder",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./browser": {
      "types": "./dist/browser.d.ts",
      "import": "./dist/browser.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "feedsmith": "^2.6.0",
    "sanitize-html": "^2.17.0"
  },
  "peerDependencies": {},
  "devDependencies": {
    "@types/sanitize-html": "^2.16.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.13"
  }
}
```

## Migration Plan

### Phase 1: Create Tricorder Package Structure

1. **Create package directory and config**
   - Create `packages/tricorder/` directory
   - Set up `package.json` with correct dependencies
   - Set up `tsconfig.json` for standalone build
   - Create directory structure

2. **Copy and adapt core files**
   - Copy `types.ts` → remove TRPC/Sentry dependencies
   - Copy `registry.ts` → inject telemetry adapter
   - Copy `errors.ts` → create custom error classes
   - Copy utilities (domain-matcher, url-normalize, text-sanitizer)

3. **Copy discovery services**
   - Copy `standard-discovery.ts` → adapt telemetry
   - Copy `apple-discovery.ts` → adapt telemetry
   - Copy `feed-validator.ts` → adapt telemetry

4. **Add telemetry abstraction**
   - Create `TelemetryAdapter` interface
   - Create no-op implementation
   - Update all services to use injected telemetry

### Phase 2: Update API Package

1. **Add tricorder dependency**
   - Add `@tuvix/tricorder` to API's package.json workspace reference
   - Update pnpm workspace config

2. **Create Sentry adapter**
   - Create `packages/api/src/adapters/sentry-telemetry.ts`
   - Implement `TelemetryAdapter` for Sentry

3. **Update feed-discovery service**
   - Replace local feed-discovery imports with `@tuvix/tricorder`
   - Inject Sentry telemetry adapter
   - Wrap errors for TRPC compatibility

4. **Update subscriptions router**
   - Update import statements
   - Handle new error types

5. **Remove old files**
   - Delete `packages/api/src/services/feed-discovery/` directory
   - Delete duplicate utility files (if not used elsewhere)

### Phase 3: Testing and Validation

1. **Unit tests for tricorder**
   - Port existing tests to tricorder package
   - Add tests for telemetry abstraction
   - Add tests for error handling

2. **Integration tests for API**
   - Test RSS discovery endpoints
   - Test error handling
   - Test telemetry integration

3. **Manual testing**
   - Test various RSS feed URLs
   - Test Apple Podcasts URLs
   - Test error cases (no feeds found, invalid URLs)

### Phase 4: Documentation and Publishing

1. **Documentation**
   - README for tricorder package
   - API documentation for public interfaces
   - Migration guide for API integration
   - Browser extension usage examples

2. **NPM publishing setup** (future)
   - Configure for NPM registry
   - Set up versioning strategy
   - CI/CD for automated publishing

## File Changes Checklist

### New Files to Create

- [ ] `packages/tricorder/package.json`
- [ ] `packages/tricorder/tsconfig.json`
- [ ] `packages/tricorder/tsconfig.build.json`
- [ ] `packages/tricorder/README.md`
- [ ] `packages/tricorder/src/index.ts`
- [ ] `packages/tricorder/src/browser.ts`
- [ ] `packages/tricorder/src/core/types.ts`
- [ ] `packages/tricorder/src/core/registry.ts`
- [ ] `packages/tricorder/src/core/discovery-context.ts`
- [ ] `packages/tricorder/src/core/errors.ts`
- [ ] `packages/tricorder/src/services/standard-discovery.ts`
- [ ] `packages/tricorder/src/services/apple-discovery.ts`
- [ ] `packages/tricorder/src/services/index.ts`
- [ ] `packages/tricorder/src/validators/feed-validator.ts`
- [ ] `packages/tricorder/src/validators/index.ts`
- [ ] `packages/tricorder/src/utils/domain-matcher.ts`
- [ ] `packages/tricorder/src/utils/url-normalize.ts`
- [ ] `packages/tricorder/src/utils/text-sanitizer.ts`
- [ ] `packages/tricorder/src/utils/index.ts`
- [ ] `packages/tricorder/src/telemetry/types.ts`
- [ ] `packages/tricorder/src/telemetry/noop-telemetry.ts`
- [ ] `packages/tricorder/src/telemetry/index.ts`
- [ ] `packages/api/src/adapters/sentry-telemetry.ts`

### Files to Modify

- [ ] `packages/api/package.json` - Add tricorder dependency
- [ ] `packages/api/src/routers/subscriptions.ts` - Update imports and error handling
- [ ] Root `package.json` - Add tricorder workspace
- [ ] Root `pnpm-workspace.yaml` - Ensure tricorder is included

### Files to Delete (after migration)

- [ ] `packages/api/src/services/feed-discovery/index.ts`
- [ ] `packages/api/src/services/feed-discovery/types.ts`
- [ ] `packages/api/src/services/feed-discovery/registry.ts`
- [ ] `packages/api/src/services/feed-discovery/standard-discovery.ts`
- [ ] `packages/api/src/services/feed-discovery/apple-discovery.ts`
- [ ] `packages/api/src/services/feed-discovery/feed-validator.ts`
- [ ] `packages/api/src/utils/domain-matcher.ts` (if not used elsewhere)
- [ ] `packages/api/src/utils/url-normalize.ts` (if not used elsewhere)
- [ ] `packages/api/src/utils/text-sanitizer.ts` (if not used elsewhere)

## Performance and Telemetry Patterns

### Discovery Service Implementation Pattern

Each discovery service follows this pattern for optional telemetry:

```typescript
export class StandardDiscoveryService implements DiscoveryService {
  readonly priority = 100;

  canHandle(_url: string): boolean {
    return true;
  }

  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    // If telemetry provided, wrap in span
    if (context.telemetry?.startSpan) {
      return context.telemetry.startSpan(
        {
          op: 'feed.discovery.standard',
          name: 'Standard Feed Discovery',
          attributes: { input_url: url },
        },
        () => this.discoverInternal(url, context)
      );
    }

    // No telemetry = direct execution
    return this.discoverInternal(url, context);
  }

  private async discoverInternal(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    const discoveredFeeds: DiscoveredFeed[] = [];

    try {
      const siteUrl = new URL(url);
      // ... discovery logic ...

      // Optional breadcrumb - only if telemetry exists
      context.telemetry?.addBreadcrumb?.({
        message: 'Starting standard discovery',
        data: { url },
      });

      // ... more discovery logic ...

      return discoveredFeeds;
    } catch (error) {
      // Optional exception capture
      context.telemetry?.captureException?.(error, {
        level: 'warning',
        tags: { operation: 'standard_discovery' },
        extra: { input_url: url },
      });
      return [];
    }
  }
}
```

### Performance Comparison

**Browser Extension (no telemetry)**:
```typescript
// Execution path
discover(url)
  → if (context.telemetry?.startSpan) // false, skip
  → discoverInternal(url, context)
    → context.telemetry?.addBreadcrumb?.(...) // no-op chain
    → context.telemetry?.captureException?.(...) // no-op chain

// Overhead: ~3-5 undefined checks per discovery operation
// Impact: < 0.01ms on modern browsers
```

**API Server (with Sentry)**:
```typescript
// Execution path
discover(url)
  → if (context.telemetry?.startSpan) // true
  → Sentry.startSpan({ ... }, callback)
    → discoverInternal(url, context)
      → Sentry.addBreadcrumb({ ... }) // full tracing
      → Sentry.captureException({ ... }) // full capture

// Overhead: Sentry span creation, serialization, network
// Impact: 1-5ms (acceptable for server-side tracing)
```

### Telemetry Throughout Discovery Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                       │
│                    (no telemetry)                           │
├─────────────────────────────────────────────────────────────┤
│ discoverFeeds(url)                                          │
│   if (telemetry) // false → skip span                      │
│   └─ for each service                                       │
│      ├─ service.discover(url)                               │
│      │  if (telemetry?.startSpan) // false → skip          │
│      │  └─ discoverInternal()                               │
│      │     ├─ telemetry?.addBreadcrumb() // no-op          │
│      │     └─ telemetry?.captureException() // no-op       │
│      └─ return feeds                                        │
│                                                              │
│ Total overhead: ~10 undefined checks                        │
│ Performance impact: negligible (<0.01ms)                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        API Server                           │
│                  (Sentry telemetry)                         │
├─────────────────────────────────────────────────────────────┤
│ discoverFeeds(url)                                          │
│   Sentry.startSpan("feed.discovery")                       │
│   └─ for each service                                       │
│      ├─ service.discover(url)                               │
│      │  Sentry.startSpan("feed.discovery.apple")           │
│      │  └─ discoverInternal()                               │
│      │     ├─ Sentry.addBreadcrumb("Trying Apple API")     │
│      │     ├─ Sentry.addBreadcrumb("Found feed URL")       │
│      │     └─ Sentry.captureException(error)               │
│      └─ return feeds                                        │
│                                                              │
│ Full distributed tracing with nested spans                  │
│ Performance impact: 1-5ms (acceptable for observability)    │
└─────────────────────────────────────────────────────────────┘
```

### Memory and Bundle Impact

**Without telemetry (browser)**:
- No telemetry code bundled
- No span objects created
- No breadcrumb objects allocated
- No exception context objects created
- **Bundle savings**: ~2-3KB (gzipped)

**With telemetry (API)**:
- Sentry adapter bundled (~5KB)
- Rich span metadata
- Detailed breadcrumbs
- Full exception context
- **Bundle increase**: Acceptable for server

### Real-World Example: Apple Podcasts Discovery

**Browser Extension** (no telemetry overhead):
```typescript
import { createDefaultRegistry } from '@tuvix/tricorder';

const registry = createDefaultRegistry(); // No telemetry

// User clicks "Subscribe to this podcast" on Apple Podcasts page
const feeds = await registry.discover('https://podcasts.apple.com/us/podcast/id123');

// Execution:
// ✓ Registry.discover() - no span wrapper
// ✓ AppleDiscoveryService.discover() - no span wrapper
// ✓ Fetch iTunes API - standard fetch
// ✓ Validate feed - standard fetch
// ✓ Return feed

// Total time: ~300ms (network-bound)
// Overhead from optional telemetry: ~0.01ms (negligible)
```

**API Server** (full Sentry tracing):
```typescript
import { createDefaultRegistry } from '@tuvix/tricorder';
import { sentryAdapter } from '@/adapters/sentry-telemetry';

const registry = createDefaultRegistry({ telemetry: sentryAdapter });

// User submits subscription via API
const feeds = await registry.discover('https://podcasts.apple.com/us/podcast/id123');

// Execution with Sentry spans:
// ✓ Span: "feed.discovery" (parent)
//   ├─ Breadcrumb: "Starting feed discovery"
//   ├─ Span: "feed.discovery.apple" (child)
//   │  ├─ Breadcrumb: "Trying Apple iTunes API"
//   │  ├─ Breadcrumb: "Found feed URL"
//   │  └─ Attribute: podcast_name="The Daily"
//   └─ Breadcrumb: "Discovery completed"

// Sentry UI shows:
// - Timeline of nested spans
// - Total duration: 305ms
//   - iTunes API: 120ms
//   - Feed validation: 180ms
// - Podcast metadata as span attributes
// - Full error context if anything fails

// Total time: ~305ms (network-bound + 5ms Sentry overhead)
```

**What You See in Sentry** (API only):
```
Transaction: POST /api/subscriptions.discover
Duration: 305ms

├─ feed.discovery (305ms)
│  ├─ feed.discovery.apple (300ms)
│  │  ├─ fetch iTunes API (120ms)
│  │  └─ feed validation (180ms)
│  └─ attributes:
│     ├─ service_used: "AppleDiscoveryService"
│     ├─ feeds_found: 1
│     ├─ podcast_name: "The Daily"
│     └─ feed_url: "https://feeds.simplecast.com/..."

Breadcrumbs:
1. Starting feed discovery (url: podcasts.apple.com...)
2. Trying service AppleDiscoveryService (priority: 10)
3. Trying Apple iTunes API (podcast_id: 123)
4. Found feed URL for The Daily
5. Discovery completed (feeds_found: 1)
```

**What Browser Extension Does** (no telemetry):
- Exact same discovery logic
- No Sentry spans created
- No breadcrumbs logged
- No data sent to Sentry
- Zero privacy concerns
- Zero performance overhead

## Risks and Mitigations

### Risk 1: Breaking Changes in API

**Mitigation**:
- Maintain API compatibility during migration
- Use feature flags if needed
- Thorough testing before removing old code

### Risk 2: Browser Compatibility Issues

**Mitigation**:
- Test feed parsing libraries in browser context
- Check CORS implications for HTTP requests
- Provide clear documentation for browser limitations

### Risk 3: Bundle Size for Browser Extension

**Mitigation**:
- Use tree-shaking friendly exports
- Minimize dependencies
- Consider making some services optional

### Risk 4: Telemetry Performance Impact

**Mitigation**:
- Make telemetry fully optional
- No-op implementation has zero overhead
- Document performance implications

## Success Criteria

1. ✅ Tricorder package builds successfully
2. ✅ All existing RSS discovery tests pass
3. ✅ API endpoints continue to work without changes
4. ✅ Package can be imported in browser context
5. ✅ No regression in error handling or telemetry
6. ✅ Documentation is clear and complete
7. ✅ Zero breaking changes to API behavior

## Future Enhancements

1. **Additional Discovery Services**
   - YouTube channel/playlist RSS
   - Reddit subreddit feeds
   - Medium publication feeds
   - GitHub release feeds

2. **Browser Extension Integration**
   - Context menu for "Subscribe to RSS"
   - Auto-detection of feeds on page
   - Feed preview before subscribing

3. **Advanced Features**
   - Feed content preview
   - Feed validation and health checks
   - Feed format conversion

4. **NPM Package**
   - Publish as public NPM package
   - Versioned releases
   - Changelog maintenance

## Timeline Estimate

- **Phase 1**: 4-6 hours (package creation and core migration)
- **Phase 2**: 2-3 hours (API integration)
- **Phase 3**: 2-3 hours (testing)
- **Phase 4**: 1-2 hours (documentation)

**Total**: ~10-14 hours of development work

## Questions to Resolve

1. ✅ **RESOLVED**: Should telemetry be in tricorder?
   - **Decision**: Yes, via optional dependency injection with zero overhead when not provided
   - API gets full Sentry tracing, browser extension gets zero performance impact

2. Should text-sanitizer be included in tricorder or kept in API?
   - **Recommendation**: Include in tricorder - it's used for feed descriptions and needed in browser too
   - **Decision needed**: Confirm this approach

3. Should we support additional feed formats (JSON Feed, etc.)?
   - **Current**: feedsmith already supports RSS, Atom, RDF, and JSON Feed
   - **Recommendation**: Yes, expose all formats feedsmith supports
   - **Decision needed**: Confirm this is acceptable

4. What level of browser compatibility do we need?
   - **Recommendation**: Target ES2022+ (modern browsers from 2022+)
   - Covers Chrome 94+, Firefox 93+, Safari 15.4+, Edge 94+
   - **Decision needed**: Or do we need wider support?

5. ✅ **RESOLVED**: Should we include rate limiting in tricorder?
   - **Decision**: No, that's an API concern. Tricorder is pure discovery logic.

6. How should browser extension handle CORS for feed fetching?
   - **Options**:
     - Use Chrome extension permissions to bypass CORS (recommended)
     - Provide optional proxy configuration
     - Document CORS limitations for web contexts
   - **Decision needed**: Likely Chrome extension with proper permissions

7. Should domain-matcher, url-normalize utilities stay in tricorder?
   - **Recommendation**: Yes, they're core to feed discovery logic
   - Used by multiple discovery services
   - **Decision needed**: Confirm these should be included

## Next Steps

After plan approval:

1. Create tricorder package structure
2. Migrate core files with telemetry abstraction
3. Update API to use new package
4. Run full test suite
5. Deploy and monitor
