# URL-Based Subscription & PWA Integration

## Overview

Tuvix supports multiple ways to subscribe to RSS feeds and import OPML files, including URL parameters, native device sharing, protocol handlers, and file associations.

## Usage

### Basic URL Format

```
https://feedsmith.dev/app/subscriptions?subscribe=<encoded_feed_url>
```

### Examples

```
# Subscribe to a blog feed
https://feedsmith.dev/app/subscriptions?subscribe=https%3A%2F%2Fblog.example.com%2Ffeed.xml

# Subscribe from a website URL (auto-discovery)
https://feedsmith.dev/app/subscriptions?subscribe=https%3A%2F%2Fblog.example.com
```

## How It Works

1. User clicks a subscribe link with the `subscribe` parameter
2. Tuvix opens the subscriptions page
3. The add form automatically opens with the URL pre-populated
4. Feed discovery/preview runs automatically
5. User reviews the feed details and confirms subscription
6. URL parameter is cleared from browser history

## Implementation Details

### Frontend (React/TanStack Router)

**File**: `packages/app/src/routes/app/subscriptions.tsx`

- Route accepts optional `subscribe` search parameter
- On mount, checks for the parameter and validates the URL
- Pre-populates the subscription form
- Clears parameter from URL after processing

### Security

- URL validation ensures proper HTTP/HTTPS format
- Leverages existing feed discovery rate limits
- Uses existing blocked domains list
- Properly encodes/decodes URL parameters

## Integration Ideas

### Bookmarklet

Create a browser bookmarklet for one-click subscriptions:

```javascript
javascript:(function(){
  const tuvixUrl = 'https://feedsmith.dev/app/subscriptions';
  const currentUrl = encodeURIComponent(window.location.href);
  window.open(`${tuvixUrl}?subscribe=${currentUrl}`, '_blank');
})();
```

### Website Integration

Add "Subscribe in Tuvix" buttons to your blog:

```html
<a href="https://feedsmith.dev/app/subscriptions?subscribe=https%3A%2F%2Fyourblog.com%2Ffeed.xml">
  Subscribe in Tuvix
</a>
```

### Browser Extension

Use the URL format in browser extensions to detect feeds on pages and provide quick subscribe actions.

### Marketing Examples

```html
<!-- Blog homepage -->
<a href="https://feedsmith.dev/app/subscriptions?subscribe=https://blog.example.com/feed">
  📰 Follow our blog in Tuvix
</a>

<!-- Documentation site -->
<a href="https://feedsmith.dev/app/subscriptions?subscribe=https://docs.example.com/changelog.xml">
  🔔 Get changelog updates
</a>
```

## PWA Integration Features

### Native Device Sharing (Share Target API)

Users can share URLs directly to TuvixRSS from other apps on mobile devices.

**Configuration**: `packages/app/public/manifest.webmanifest`

```json
"share_target": {
  "action": "/app/subscriptions",
  "method": "GET",
  "encType": "application/x-www-form-urlencoded",
  "params": {
    "url": "subscribe"
  }
}
```

**Usage Examples**:
- iOS: Long-press a link in Safari → Share → Select "TuvixRSS"
- Android: Share from Chrome → Select "TuvixRSS"
- From any app: Share menu → Select "TuvixRSS"

### Protocol Handlers

TuvixRSS registers custom protocol handlers for RSS and feed URLs.

**Supported Protocols**:
- `web+rss://` - Opens RSS feed URLs
- `web+feed://` - Opens feed URLs

**Configuration**: `packages/app/public/manifest.webmanifest`

```json
"protocol_handlers": [
  {
    "protocol": "web+rss",
    "url": "/app/subscriptions?subscribe=%s"
  },
  {
    "protocol": "web+feed",
    "url": "/app/subscriptions?subscribe=%s"
  }
]
```

**Usage Example**:
```html
<a href="web+rss://feeds.example.com/rss.xml">Subscribe with TuvixRSS</a>
```

### File Handling (OPML Import)

Double-click OPML files to open them directly in TuvixRSS (requires PWA installation).

**Configuration**: `packages/app/public/manifest.webmanifest`

```json
"file_handlers": [
  {
    "action": "/app/subscriptions",
    "accept": {
      "application/xml": [".opml"],
      "text/xml": [".opml"],
      "application/x-opml": [".opml"]
    }
  }
]
```

**Implementation**: `packages/app/src/routes/app/subscriptions.tsx:213-259`

The File Handling API handler:
1. Detects when OPML files are opened via file association
2. Reads and parses the file content
3. Opens the import preview dialog
4. Allows user to review and confirm import

**User Experience**:
- Double-click an OPML file → Opens in TuvixRSS
- Drag OPML file onto TuvixRSS icon → Opens in app
- Right-click OPML → "Open with TuvixRSS"

### Browser Support

| Feature | Chrome/Edge | Safari | Firefox |
|---------|-------------|--------|---------|
| URL Subscribe | ✅ | ✅ | ✅ |
| Share Target | ✅ | ✅ (iOS 15.4+) | ❌ |
| Protocol Handlers | ✅ | ✅ | ✅ |
| File Handlers | ✅ (93+) | ❌ | ❌ |

## Future Enhancements

- ✅ ~~Support for feed:// and rss:// URL schemes~~ (Implemented via protocol handlers)
- "Subscribe" overlay button when viewing public feeds
- Share functionality to generate subscription links
- ✅ ~~Deep linking support for mobile PWA~~ (Implemented via share target)
- Multiple feed subscription (comma-separated URLs)
- Desktop drag-and-drop for OPML files
