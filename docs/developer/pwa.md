# Progressive Web App (PWA) Configuration

This document provides comprehensive documentation for TuvixRSS's Progressive Web App capabilities, including installation, offline support, and modern PWA features.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Modern 2025 PWA Capabilities](#modern-2025-pwa-capabilities)
  - [Caching Strategies](#caching-strategies)
- [File Structure](#file-structure)
- [Development](#development)
  - [Testing PWA Features Locally](#testing-pwa-features-locally)
  - [Building for Production](#building-for-production)
  - [Preview Production Build](#preview-production-build)
- [Icon Generation](#icon-generation)
- [Installation](#installation)
  - [Desktop (Chrome/Edge/Brave)](#desktop-chromeedgebrave)
  - [Mobile (iOS Safari)](#mobile-ios-safari)
  - [Mobile (Android Chrome)](#mobile-android-chrome)
- [Manifest Configuration](#manifest-configuration)
  - [Display Modes](#display-modes)
  - [App Shortcuts](#app-shortcuts)
  - [Protocol Handlers](#protocol-handlers)
  - [Share Target](#share-target)
  - [Edge Side Panel](#edge-side-panel)
- [Service Worker & Offline Support](#service-worker--offline-support)
  - [Service Worker (Asset Caching)](#service-worker-asset-caching)
  - [React Query (Network-Aware Data Management)](#react-query-network-aware-data-management)
  - [Auto-updates](#auto-updates)
  - [How They Work Together](#how-they-work-together)
- [Customization](#customization)
  - [Theme Colors](#theme-colors)
  - [Install Prompt Behavior](#install-prompt-behavior)
  - [Caching Strategies](#caching-strategies)
- [Browser Support](#browser-support)
  - [Full PWA Support](#full-pwa-support)
  - [Features by Browser](#features-by-browser)
- [Troubleshooting](#troubleshooting)
- [Monitoring](#monitoring)
- [Code References](#code-references)
- [Resources](#resources)

## Overview

TuvixRSS is configured as a modern 2025 Progressive Web App with offline capabilities, installability, and enhanced mobile experience. The PWA implementation provides:

- **Installable**: Users can install the app on their devices (desktop, mobile, tablet)
- **Offline Support**: Core functionality works without internet connection
- **Auto-updates**: Service worker automatically updates when new versions are available
- **App Shortcuts**: Quick access to common actions from the home screen/start menu
- **Protocol Handlers**: Handle `web+rss://` and `feed://` protocol links
- **Share Target**: Receive shares from other apps on mobile devices

## Features

### Modern 2025 PWA Capabilities

- **Installable**: Users can install the app on their devices (desktop, mobile, tablet)
- **Offline Support**: Core functionality works without internet connection
- **Auto-updates**: Service worker automatically updates when new versions are available
- **App Shortcuts**: Quick access to common actions from the home screen/start menu
- **Protocol Handlers**: Handle `web+rss://` and `feed://` protocol links
- **Share Target**: Receive shares from other apps on mobile devices
- **Window Controls Overlay**: Modern desktop window appearance on supported platforms
- **Maskable Icons**: Adaptive icons that work across all platforms

### Caching Strategies

The app uses intelligent caching strategies for optimal performance:

- **Static Assets**: Cache-first for CSS, JS, images (precached)
- **API Calls**: Network-first with 5-minute fallback cache
- **External Fonts**: Cache-first with 1-year expiration
- **Images**: Cache-first with 30-day expiration

## File Structure

```
packages/app/
├── public/
│   ├── manifest.webmanifest      # Web app manifest with modern features
│   ├── browserconfig.xml         # Microsoft tile configuration
│   ├── icons/                    # Generated PWA icons
│   │   ├── icon-*x*.png          # Standard icons (72-512px)
│   │   ├── icon-maskable-*.png   # Maskable icons for adaptive displays
│   │   ├── apple-touch-icon.png  # Apple device icon (180x180)
│   │   └── shortcut-*.png        # Icons for app shortcuts
│   └── favicon.ico               # Browser favicon
├── src/
│   ├── hooks/
│   │   └── use-pwa-install.ts    # Hook for PWA installation logic
│   ├── components/
│   │   └── pwa-install-prompt.tsx # Install prompt UI component
│   └── pwa-register.ts           # Service worker registration
└── scripts/
    └── generate-icons.mjs        # Icon generation from SVG
```

## Development

### Testing PWA Features Locally

PWA features are enabled in development mode:

```bash
pnpm dev
```

The app will be available at `http://localhost:5173` with service worker support.

### Building for Production

```bash
pnpm build
```

The build process will:

1. Generate optimized service worker
2. Precache all static assets
3. Create manifest with correct asset paths

### Preview Production Build

```bash
pnpm preview
```

This serves the production build locally to test PWA features.

## Icon Generation

Icons are generated from the `tuvixrss.svg` logo:

```bash
pnpm generate:icons
```

This creates:

- Standard PWA icons (72x72 to 512x512)
- Maskable icons with safe zone padding
- Apple touch icon (180x180)
- Shortcut icons (96x96)
- Favicon (32x32)

To customize, edit `scripts/generate-icons.mjs` or replace the source SVG.

## Installation

### Desktop (Chrome/Edge/Brave)

1. Navigate to the app
2. Look for the install icon in the address bar
3. Click "Install" or use the install prompt
4. The app will open in its own window

### Mobile (iOS Safari)

1. Open the app in Safari
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

### Mobile (Android Chrome)

1. Open the app in Chrome
2. Tap the three dots menu
3. Tap "Install app" or "Add to Home Screen"
4. Tap "Install"

## Manifest Configuration

The `manifest.webmanifest` includes modern 2025 PWA features:

### Display Modes

- `window-controls-overlay`: Modern desktop appearance
- `standalone`: Full-screen app experience
- `minimal-ui`: Minimal browser UI

### App Shortcuts

Quick access to:

- View Feeds (`/app/feeds`)
- Unread Articles (`/app/articles?filter=unread`)
- Settings (`/app/settings`)

### Protocol Handlers

- `web+rss://`: RSS protocol handler
- `feed://`: Feed protocol handler

Both redirect to `/app/feeds/add?url=%s` for easy feed subscription.

### Share Target

The app can receive shares from other apps:

- Shared text, URLs, and titles
- Endpoint: `/share-target` (POST)
- Use case: Share articles/feeds from other apps

### Edge Side Panel

Optimized for Microsoft Edge side panel:

- Preferred width: 400px
- Compact layout for side-by-side browsing

## Service Worker & Offline Support

The app provides comprehensive offline support through two complementary systems:

### Service Worker (Asset Caching)

- Cached static assets (JS, CSS, images) work offline
- API calls cached with 5-minute expiration
- Smart cache strategies per resource type
- Auto-cleanup of outdated caches

### React Query (Network-Aware Data Management)

- Queries automatically pause when offline
- Polling stops to save battery/bandwidth
- Smart retry logic with exponential backoff
- Automatic data sync when reconnecting
- Previous data preserved during offline periods
- Clear UI feedback via offline indicator

**See [Offline Support Guide](./offline-support.md) for detailed documentation on network-aware query management.**

### Auto-updates

- Checks for updates every hour
- Prompts user when new version is available
- Seamless update with page reload

### How They Work Together

1. **User goes offline:**
   - Service worker serves cached app shell
   - React Query pauses all queries
   - Offline banner appears
   - Previous data remains visible

2. **User comes back online:**
   - Offline banner shows "Back online!"
   - React Query automatically refetches stale data
   - Service worker syncs new assets
   - Everything updates seamlessly

## Customization

### Theme Colors

Edit `index.html` and `manifest.webmanifest`:

```html
<!-- index.html -->
<meta name="theme-color" content="#000000" />
```

```json
// manifest.webmanifest
{
  "theme_color": "#000000",
  "background_color": "#000000"
}
```

### Install Prompt Behavior

Edit `src/components/pwa-install-prompt.tsx`:

- Delay before showing: Change `setTimeout` delay (default: 3 seconds)
- Re-prompt interval: Modify `daysSinceDismissed` check (default: 7 days)
- UI customization: Update component JSX

### Caching Strategies

Edit `vite.config.ts` `workbox.runtimeCaching`:

```typescript
{
  urlPattern: /\/api\/.*/i,
  handler: "NetworkFirst", // or "CacheFirst", "StaleWhileRevalidate"
  options: {
    cacheName: "api-cache",
    expiration: {
      maxEntries: 100,
      maxAgeSeconds: 60 * 5, // 5 minutes
    },
  },
}
```

## Browser Support

### Full PWA Support

- Chrome/Edge/Brave: Desktop & Mobile
- Safari: iOS 11.3+ (with limitations)
- Firefox: Limited support
- Opera: Desktop & Mobile

### Features by Browser

| Feature           | Chrome/Edge | Safari   | Firefox |
| ----------------- | ----------- | -------- | ------- |
| Install prompt    | ✅          | iOS only | ❌      |
| Service worker    | ✅          | ✅       | ✅      |
| Offline           | ✅          | ✅       | ✅      |
| App shortcuts     | ✅          | ❌       | ❌      |
| Protocol handlers | ✅          | ❌       | ❌      |
| Share target      | ✅          | ✅ (iOS) | ❌      |
| Window controls   | ✅          | ❌       | ❌      |

## Troubleshooting

### Service Worker Not Registering

1. Check console for errors
2. Ensure HTTPS (or localhost)
3. Clear browser cache and reload
4. Check DevTools > Application > Service Workers

### Install Prompt Not Showing

1. App must be served over HTTPS
2. Must have valid manifest
3. Must have service worker
4. Chrome requires "engagement" (2 visits, 5 minutes apart)
5. User may have previously dismissed

### Offline Not Working

1. Visit pages while online first (to cache)
2. Check Network tab in DevTools (throttle to offline)
3. Verify service worker is active
4. Check cache contents in Application tab

### Icons Not Loading

1. Run `pnpm generate:icons`
2. Check `public/icons/` directory
3. Verify paths in `manifest.webmanifest`
4. Clear browser cache

## Monitoring

### Service Worker Status

Open DevTools > Application > Service Workers to:

- View registration status
- Force update
- Skip waiting
- Unregister for testing

### Cache Inspection

Open DevTools > Application > Cache Storage to:

- View cached resources
- Delete specific caches
- Monitor cache size

### PWA Audit

Use Lighthouse in DevTools:

1. Open DevTools
2. Go to Lighthouse tab
3. Select "Progressive Web App"
4. Run audit

Target scores:

- PWA: 100/100
- Performance: 90+
- Accessibility: 90+

## Code References

- **Service Worker Registration**: `packages/app/src/pwa-register.ts`
- **PWA Install Hook**: `packages/app/src/hooks/use-pwa-install.ts`
- **Install Prompt Component**: `packages/app/src/components/pwa-install-prompt.tsx`
- **Manifest**: `packages/app/public/manifest.webmanifest`
- **Icon Generation**: `packages/app/scripts/generate-icons.mjs`
- **Vite PWA Config**: `packages/app/vite.config.ts` (workbox configuration)

## Resources

- [MDN PWA Guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [web.dev PWA](https://web.dev/progressive-web-apps/)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
