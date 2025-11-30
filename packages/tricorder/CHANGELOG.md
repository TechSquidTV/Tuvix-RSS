# Changelog

All notable changes to the @tuvixrss/tricorder package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-01-30

### Added

#### Core Features
- Initial release of @tuvixrss/tricorder RSS/Atom feed discovery library
- Platform-agnostic design supporting Node.js, browsers, and Chrome extensions
- Zero-overhead optional telemetry via dependency injection
- Extensible plugin-based architecture for discovery services

#### Discovery Services
- **AppleDiscoveryService** - iTunes Search API integration for Apple Podcasts
- **StandardDiscoveryService** - Universal feed discovery via:
  - Path extension detection (`.rss`, `.atom`, `.xml`)
  - Common feed path checking (`/feed`, `/rss`, `/atom`, etc.)
  - HTML link tag parsing (`<link type="application/rss+xml">`)

#### Core Components
- **DiscoveryRegistry** - Main orchestrator with priority-based service execution
- **Feed Validator** - URL validation, parsing, and deduplication
- **Telemetry Adapter** - Interface for pluggable observability (Sentry, custom)

#### Utility Functions
- `isSubdomainOf()` - Domain relationship checking
- `normalizeFeedUrl()` - URL normalization for deduplication
- `stripHtml()` - HTML sanitization for descriptions

#### Types & Interfaces
- `DiscoveredFeed` - Feed metadata structure
- `DiscoveryService` - Interface for custom discovery services
- `DiscoveryContext` - Shared context for deduplication
- `TelemetryAdapter` - Telemetry interface
- Custom error classes: `NoFeedsFoundError`, `FeedValidationError`

#### Developer Experience
- Full TypeScript support with comprehensive type definitions
- Detailed JSDoc comments on all public APIs
- README with usage examples and API documentation
- ARCHITECTURE.md explaining design decisions and patterns
- Browser-specific export (`@tuvixrss/tricorder/browser`)

### Fixed
- Error type checking now uses proper `instanceof NoFeedsFoundError` instead of fragile string comparison
- This ensures error handling works correctly after minification/bundling

## [1.0.0] - 2025-01-30 (Historical Reference - Not Published)

### Added

#### Core Features
- Initial release of @tuvixrss/tricorder RSS/Atom feed discovery library
- Platform-agnostic design supporting Node.js, browsers, and Chrome extensions
- Zero-overhead optional telemetry via dependency injection
- Extensible plugin-based architecture for discovery services

#### Discovery Services
- **AppleDiscoveryService** - iTunes Search API integration for Apple Podcasts
- **StandardDiscoveryService** - Universal feed discovery via:
  - Path extension detection (`.rss`, `.atom`, `.xml`)
  - Common feed path checking (`/feed`, `/rss`, `/atom`, etc.)
  - HTML link tag parsing (`<link type="application/rss+xml">`)

#### Core Components
- **DiscoveryRegistry** - Main orchestrator with priority-based service execution
- **Feed Validator** - URL validation, parsing, and deduplication
- **Telemetry Adapter** - Interface for pluggable observability (Sentry, custom)

#### Utility Functions
- `isSubdomainOf()` - Domain relationship checking
- `normalizeFeedUrl()` - URL normalization for deduplication
- `stripHtml()` - HTML sanitization for descriptions

#### Types & Interfaces
- `DiscoveredFeed` - Feed metadata structure
- `DiscoveryService` - Interface for custom discovery services
- `DiscoveryContext` - Shared context for deduplication
- `TelemetryAdapter` - Telemetry interface
- Custom error classes: `NoFeedsFoundError`, `FeedValidationError`

#### Developer Experience
- Full TypeScript support with comprehensive type definitions
- Detailed JSDoc comments on all public APIs
- README with usage examples and API documentation
- ARCHITECTURE.md explaining design decisions and patterns
- Browser-specific export (`@tuvixrss/tricorder/browser`)

### Performance
- Early exit optimization (stops at first service that finds feeds)
- Parallel feed validation (concurrent URL checking)
- Request deduplication (never fetches same URL twice)
- 10-second timeout protection on all HTTP requests
- Zero telemetry overhead when not used (<0.01ms)
- ~5ms Sentry overhead when telemetry enabled

### Supported Feed Types
- RSS 2.0
- Atom 1.0
- RDF/RSS 1.0
- JSON Feed

### Dependencies
- `feedsmith` (^2.6.0) - Feed parsing
- `sanitize-html` (^2.17.0) - HTML sanitization

### Technical Details
- TypeScript 5.9.3
- Target: ES2022
- Module: ESNext
- Works in Node.js 20+ and modern browsers (2022+)

## Extracted From

This package was extracted from the TuvixRSS API package as part of refactoring
to support both server-side and browser-side feed discovery. The original code
was located at `packages/api/src/services/feed-discovery/` and has been
refactored with:

- Removed hard dependencies on Sentry and TRPC
- Added optional telemetry via dependency injection
- Enhanced type safety and documentation
- Made fully platform-agnostic

## Migration Notes

If migrating from the old TuvixRSS feed-discovery service:

### Breaking Changes
- Import path changed from `@/services/feed-discovery` to `@tuvixrss/tricorder`
- Error type changed from `TRPCError` to `NoFeedsFoundError`
- Sentry integration now via adapter pattern (not hardcoded)

### Migration Example

**Before:**
```typescript
import { discoverFeeds } from '@/services/feed-discovery';

try {
  const feeds = await discoverFeeds(url);
} catch (error) {
  throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
}
```

**After:**
```typescript
import { discoverFeeds, NoFeedsFoundError } from '@tuvixrss/tricorder';
import { sentryAdapter } from './sentry-adapter';

try {
  const feeds = await discoverFeeds(url, { telemetry: sentryAdapter });
} catch (error) {
  if (error instanceof NoFeedsFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
  }
  throw error;
}
```

## Future Plans

### Potential Features
- Additional discovery services (YouTube, Reddit, Medium, GitHub)
- Discovery result caching with TTL
- Batch discovery (multiple URLs at once)
- Structured logging
- Discovery metrics and analytics

### Non-Goals
- Feed fetching/parsing (use `feedsmith` directly)
- Feed aggregation (application-level concern)
- Feed storage (persistence layer)

---

[1.0.0]: https://github.com/TechSquidTV/TuvixRSS/releases/tag/tricorder-v1.0.0
