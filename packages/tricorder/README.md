# @tuvixrss/tricorder

RSS and Atom feed discovery library for Node.js and browsers.

## Features

- 🔍 **Automatic Feed Discovery**: Finds RSS/Atom feeds from any URL
- 🎯 **Domain-Specific Services**: Special handling for Apple Podcasts, with extensible architecture
- 🌐 **Platform Agnostic**: Works in Node.js, browsers, and Chrome extensions
- 📊 **Optional Telemetry**: Zero-overhead when not used, full Sentry integration when needed
- 🔌 **Extensible**: Plugin-based architecture for adding custom discovery services

## Installation

```bash
pnpm add @tuvixrss/tricorder
```

## Usage

### Browser Extension (Zero Telemetry)

```typescript
import { discoverFeeds } from '@tuvixrss/tricorder';

// No telemetry = zero overhead
const feeds = await discoverFeeds('https://example.com');
console.log(`Found ${feeds.length} feeds`);
```

### API Server (With Sentry)

```typescript
import { createDefaultRegistry, TelemetryAdapter } from '@tuvixrss/tricorder';
import * as Sentry from '@sentry/node';

// Create Sentry adapter
const sentryAdapter: TelemetryAdapter = {
  startSpan: (options, callback) =>
    Sentry.startSpan({ ...options }, callback),
  addBreadcrumb: (breadcrumb) => Sentry.addBreadcrumb(breadcrumb),
  captureException: (error, context) =>
    Sentry.captureException(error, context),
};

// Create registry with telemetry
const registry = createDefaultRegistry({ telemetry: sentryAdapter });

// Full Sentry tracing
const feeds = await registry.discover('https://podcasts.apple.com/...');
```

### Custom Discovery Service

```typescript
import {
  DiscoveryService,
  DiscoveryContext,
  DiscoveredFeed,
  createDefaultRegistry,
} from '@tuvixrss/tricorder';

class YouTubeDiscoveryService implements DiscoveryService {
  readonly priority = 20; // Run before standard discovery

  canHandle(url: string): boolean {
    return url.includes('youtube.com');
  }

  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    // Extract channel/playlist ID and construct feed URL
    // ...
    return [feed];
  }
}

// Register custom service
const registry = createDefaultRegistry();
registry.register(new YouTubeDiscoveryService());
```

## API

### `discoverFeeds(url, options?)`

Convenience function to discover feeds from a URL.

- `url`: URL to discover feeds from
- `options.telemetry`: Optional telemetry adapter
- Returns: `Promise<DiscoveredFeed[]>`
- Throws: `NoFeedsFoundError` if no feeds found

### `createDefaultRegistry(options?)`

Creates a registry with standard discovery services (Apple Podcasts + Standard).

- `options.telemetry`: Optional telemetry adapter
- Returns: `DiscoveryRegistry`

### `DiscoveryRegistry`

Main orchestrator for feed discovery.

```typescript
const registry = new DiscoveryRegistry(telemetryAdapter?);
registry.register(new CustomService());
const feeds = await registry.discover(url);
```

### `DiscoveredFeed`

```typescript
interface DiscoveredFeed {
  url: string;           // Feed URL
  title: string;         // Feed title
  type: 'rss' | 'atom' | 'rdf' | 'json';
  description?: string;  // Feed description (optional)
}
```

## Architecture

### Zero-Overhead Telemetry

The library uses optional dependency injection for telemetry:

- **No telemetry**: Only `undefined` checks (~0.01ms overhead)
- **With telemetry**: Full span tracing, breadcrumbs, exception capture

This approach avoids the overhead of no-op function calls while maintaining clean code.

### Discovery Priority

Services execute in priority order (lower = higher priority):

1. **Apple Podcasts** (priority: 10) - iTunes Search API
2. **Standard Discovery** (priority: 100) - Common paths + HTML parsing

Services run until one finds feeds (early exit for performance).

### Standard Discovery Methods

1. Path extensions: `/path.rss`, `/path.atom`, `/path.xml`
2. Common paths: `/feed`, `/rss`, `/atom`, `/feed.xml`, etc.
3. HTML link tags: `<link type="application/rss+xml">`

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Run tests
pnpm run test

# Type check
pnpm run type-check
```

## Advanced Usage

### Error Handling

```typescript
import { discoverFeeds, NoFeedsFoundError } from '@tuvixrss/tricorder';

try {
  const feeds = await discoverFeeds('https://example.com');
  console.log(`Found ${feeds.length} feeds`);
} catch (error) {
  if (error instanceof NoFeedsFoundError) {
    console.log('No feeds found on this website');
  } else {
    console.error('Discovery failed:', error);
  }
}
```

### Using Individual Services

```typescript
import { StandardDiscoveryService, DiscoveryRegistry } from '@tuvixrss/tricorder';
import { createFeedValidator } from '@tuvixrss/tricorder';

// Create registry with only standard discovery
const registry = new DiscoveryRegistry();
registry.register(new StandardDiscoveryService());

// Create discovery context
const context = {
  seenUrls: new Set(),
  seenFeedIds: new Set(),
  validateFeed: createFeedValidator(new Set(), new Set()),
};

// Run discovery
const feeds = await registry.discover('https://example.com');
```

### Custom Telemetry Adapter

```typescript
import { TelemetryAdapter } from '@tuvixrss/tricorder';

// Custom console-based telemetry
const consoleAdapter: TelemetryAdapter = {
  startSpan: async (options, callback) => {
    console.log(`[SPAN] ${options.name}`);
    const result = await callback();
    console.log(`[SPAN END] ${options.name}`);
    return result;
  },

  addBreadcrumb: (breadcrumb) => {
    console.log(`[BREADCRUMB] ${breadcrumb.message}`, breadcrumb.data);
  },

  captureException: (error, context) => {
    console.error(`[ERROR] ${error.message}`, context);
  },
};
```

### Browser Extension Example

```typescript
// In your Chrome extension's background script or content script
import { discoverFeeds } from '@tuvixrss/tricorder';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'discoverFeeds') {
    discoverFeeds(request.url)
      .then((feeds) => {
        sendResponse({ success: true, feeds });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });

    // Return true to indicate async response
    return true;
  }
});
```

### Utility Functions

The package also exports utility functions used internally:

```typescript
import {
  isSubdomainOf,
  normalizeFeedUrl,
  stripHtml,
} from '@tuvixrss/tricorder';

// Check domain relationships
isSubdomainOf('podcasts.apple.com', 'apple.com'); // true
isSubdomainOf('example.com', 'apple.com'); // false

// Normalize URLs for deduplication
normalizeFeedUrl('https://Example.com/feed/?utm_source=twitter');
// Returns: "https://example.com/feed"

// Strip HTML from text
stripHtml('<p>Hello <strong>world</strong>!</p>');
// Returns: "Hello world!"
```

## Supported Feed Types

Tricorder discovers and validates:

- **RSS 2.0**: Most common feed format
- **Atom 1.0**: Modern XML feed format
- **RDF/RSS 1.0**: Older RSS format
- **JSON Feed**: JSON-based feed format

All formats are normalized to a consistent `DiscoveredFeed` interface.

## Discovery Strategies

### Apple Podcasts

1. Extracts podcast ID from URL
2. Calls iTunes Search API
3. Retrieves official RSS feed URL
4. Validates feed availability

**Supported URLs**:
- `https://podcasts.apple.com/us/podcast/name/id123`
- `https://itunes.apple.com/us/podcast/name/id123`

### Standard Discovery

1. **Path Extensions**: Tries appending `.rss`, `.atom`, `.xml` to the URL path
2. **Common Paths**: Checks standard feed locations:
   - `/feed`, `/rss`, `/atom`
   - `/feed.xml`, `/rss.xml`, `/atom.xml`
   - `/blog/feed`, `/blog/rss`
   - And more...
3. **HTML Parsing**: Scans HTML for `<link>` tags:
   - `<link type="application/rss+xml">`
   - `<link type="application/atom+xml">`

### Feed Validation

All discovered URLs are validated by:

1. HTTP fetch with 10-second timeout
2. Feed parsing with `feedsmith`
3. Deduplication by normalized URL
4. Deduplication by Atom feed ID (content-based)

## Performance

### Benchmarks

- **Browser (no telemetry)**: ~300ms (network-bound)
  - Tricorder overhead: <0.01ms
  - Pure discovery logic

- **Server (with Sentry)**: ~305ms (network-bound)
  - Tricorder overhead: <0.01ms
  - Sentry overhead: ~5ms
  - Full distributed tracing

### Optimization Features

- **Early exit**: Returns immediately when first service finds feeds
- **Parallel validation**: Validates multiple feed URLs concurrently
- **Request deduplication**: Never fetches the same URL twice
- **Timeout protection**: 10-second timeout on all HTTP requests

## Troubleshooting

### No Feeds Found

If discovery returns `NoFeedsFoundError`:

1. **Check URL**: Ensure the URL is accessible and returns HTML
2. **Check robots.txt**: Some sites block feed discovery
3. **Manual search**: Look for RSS/Atom links in the page HTML
4. **Try variants**: Try homepage, blog section, or specific paths

### CORS Issues (Browser)

In browser contexts, you may encounter CORS errors:

**Solution for Chrome Extensions**:
```json
{
  "permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

**Solution for Web Apps**:
- Use a CORS proxy
- Perform discovery server-side
- Request from same origin only

### TypeScript Errors

If you encounter TypeScript errors with imports:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"]
  }
}
```

## Contributing

Contributions are welcome! To add a new discovery service:

1. Implement the `DiscoveryService` interface
2. Set appropriate `priority` (lower = higher priority)
3. Implement `canHandle(url)` to filter URLs
4. Implement `discover(url, context)` for discovery logic
5. Add tests for your service
6. Submit a pull request

### Example Contribution

```typescript
// services/reddit-discovery.ts
export class RedditDiscoveryService implements DiscoveryService {
  readonly priority = 30;

  canHandle(url: string): boolean {
    return url.includes('reddit.com/r/');
  }

  async discover(
    url: string,
    context: DiscoveryContext
  ): Promise<DiscoveredFeed[]> {
    // Extract subreddit and construct feed URL
    const match = url.match(/reddit\.com\/r\/([^/]+)/);
    if (!match) return [];

    const subreddit = match[1];
    const feedUrl = `https://www.reddit.com/r/${subreddit}/.rss`;

    const feed = await context.validateFeed(feedUrl);
    return feed ? [feed] : [];
  }
}
```

## License

MIT
