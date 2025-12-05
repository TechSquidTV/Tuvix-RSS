# Offline Support & Network-Aware React Query Configuration

This document explains how TuvixRSS handles offline scenarios and network-aware query management.

## Table of Contents

- [Overview](#overview)
- [Components](#components)
  - [Network Status Detection](#1-network-status-detection)
  - [QueryClient Configuration](#2-queryclient-configuration)
  - [Polling Query Management](#3-polling-query-management)
  - [Offline UI Indicator](#4-offline-ui-indicator)
  - [Auth Retry Improvements](#5-auth-retry-improvements)
- [How It Works Together](#how-it-works-together)
  - [Scenario 1: User Goes Offline](#scenario-1-user-goes-offline)
  - [Scenario 2: User Comes Back Online](#scenario-2-user-comes-back-online)
  - [Scenario 3: Network Error During API Call](#scenario-3-network-error-during-api-call)
  - [Scenario 4: User Switches Tabs](#scenario-4-user-switches-tabs)
- [Service Worker Integration](#service-worker-integration)
- [Configuration Summary](#configuration-summary)
- [Testing Offline Behavior](#testing-offline-behavior)
- [Best Practices for New Queries](#best-practices-for-new-queries)
  - [Standard Query](#standard-query-no-special-configuration)
  - [Query with Custom Stale Time](#query-with-custom-stale-time)
  - [Polling Query (Network-Aware)](#polling-query-network-aware)
  - [Mutation with Network Check](#mutation-with-network-check)
  - [Optimistic Update](#optimistic-update-for-better-offline-ux)
- [Performance Impact](#performance-impact)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements](#future-enhancements)
- [Code References](#code-references)
- [References](#references)

## Overview

The app is fully configured to gracefully handle offline states, with intelligent query management that:

- **Pauses queries when offline** to prevent wasted requests and battery drain
- **Automatically resumes when reconnected** to sync the latest data
- **Shows clear UI feedback** when offline or reconnecting
- **Preserves data** during network interruptions
- **Smart retry logic** that distinguishes between network errors and client errors

This system works in conjunction with the [PWA service worker](../developer/pwa.md#service-worker--offline-support) to provide comprehensive offline support.

## Components

### 1. Network Status Detection

**File:** `packages/app/src/hooks/use-network-status.ts`

This hook monitors the browser's network status using the `navigator.onLine` API and Network Information API.

```typescript
const { isOnline, effectiveType, downlink, rtt } = useNetworkStatus();
```

**Features:**

- Real-time online/offline detection
- Connection quality information (4G, 3G, etc.)
- Download speed estimation
- Round-trip time (latency)
- Automatic event listener cleanup

**Helper:**

```typescript
const isSlowConnection = useIsSlowConnection(); // true for 2G or high latency
```

### 2. QueryClient Configuration

**File:** `packages/app/src/components/provider/trpc-provider.tsx`

The QueryClient is configured with network-aware defaults:

#### Query Configuration

```typescript
queries: {
  staleTime: 5 * 60 * 1000, // 5 minutes

  // Network-aware refetching
  refetchOnWindowFocus: false, // Disabled to prevent aggressive refetching
  refetchOnReconnect: true,    // Enabled to sync when coming back online

  // Smart retry logic
  retry: (failureCount, error) => {
    // Don't retry 4xx errors (client errors like 401, 404)
    if (error?.data?.httpStatus >= 400 && error?.data?.httpStatus < 500) {
      return false;
    }
    // Retry up to 3 times for network/server errors (500+)
    return failureCount < 3;
  },

  // Exponential backoff: 1s, 2s, 4s (max 30s)
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

  // Only run queries when online
  networkMode: "online",
}
```

#### Mutation Configuration

```typescript
mutations: {
  networkMode: "online", // Mutations also respect network status
  retry: false,          // Don't auto-retry mutations (user should retry manually)
}
```

#### Online Manager Sync

The QueryClient's online manager is synced with browser events:

```typescript
useEffect(() => {
  const handleOnline = () => onlineManager.setOnline(true);
  const handleOffline = () => onlineManager.setOnline(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}, []);
```

### 3. Polling Query Management

**File:** `packages/app/src/lib/hooks/useUserSettings.ts`

The `useUserUsage` hook polls every 10 seconds for live rate limit updates, but now respects offline state:

```typescript
export const useUserUsage = () => {
  const { isOnline } = useNetworkStatus();

  return trpc.userSettings.getUsage.useQuery(undefined, {
    staleTime: 1000 * 10, // 10 seconds

    // Smart polling that pauses when offline or tab is hidden
    refetchInterval: (query) => {
      if (!isOnline || document.hidden) {
        return false; // Pause polling
      }
      return 10000; // Poll every 10 seconds when active and online
    },

    // Keep showing last data when offline
    placeholderData: (previousData) => previousData,
  });
};
```

**Polling Behavior:**

- ✅ Polls every 10 seconds when online and tab is visible
- ⏸️ Pauses when offline (prevents wasted requests)
- ⏸️ Pauses when tab is hidden (saves battery/data)
- 💾 Preserves last known data during pause
- ▶️ Automatically resumes when conditions are met

### 4. Offline UI Indicator

**File:** `packages/app/src/components/offline-indicator.tsx`

A prominent banner that shows at the top of the screen when offline:

**Offline State:**

```
┌─────────────────────────────────────────┐
│ 📵 You are offline. Some features may   │
│    be unavailable.                      │
└─────────────────────────────────────────┘
```

**Reconnected State (shows for 3 seconds):**

```
┌─────────────────────────────────────────┐
│ 🌐 Back online! Syncing your data...    │
└─────────────────────────────────────────┘
```

**Features:**

- Slides in from top when offline
- Shows reconnection confirmation
- Auto-dismisses after 3 seconds when back online
- Accessible with semantic HTML
- Styled with destructive/success colors

### 5. Auth Retry Improvements

**File:** `packages/app/src/lib/hooks/useAuth.ts`

The `useCurrentUser` hook now uses the global smart retry logic instead of `retry: false`:

**Before:**

```typescript
retry: false, // Never retried, even on network errors
```

**After:**

```typescript
// Uses global retry logic:
// - Retries network errors (up to 3 times with exponential backoff)
// - Doesn't retry 4xx errors (like 401 unauthorized)
```

**Why this matters:**

- **Network hiccups** during auth check are now handled gracefully
- **Invalid tokens (401)** still immediately fail without retries
- **Server errors (500+)** are retried before giving up

## How It Works Together

### Scenario 1: User Goes Offline

1. Browser fires `offline` event
2. `useNetworkStatus` hook detects and updates `isOnline = false`
3. QueryClient's `onlineManager` is notified
4. `OfflineIndicator` shows the offline banner
5. All queries pause (networkMode: "online")
6. Polling in `useUserUsage` stops
7. Previous data remains visible

**Result:** User sees offline banner and can browse cached data. No wasted requests.

### Scenario 2: User Comes Back Online

1. Browser fires `online` event
2. `useNetworkStatus` hook detects and updates `isOnline = true`
3. QueryClient's `onlineManager` is notified
4. All queries with `refetchOnReconnect: true` automatically refetch
5. `OfflineIndicator` shows "Back online!" for 3 seconds
6. Polling in `useUserUsage` resumes
7. Data syncs with server

**Result:** Seamless reconnection with user feedback and data sync.

### Scenario 3: Network Error During API Call

1. Query makes request
2. Network error occurs (timeout, DNS failure, etc.)
3. Smart retry logic checks error type
4. If network/server error: retry with exponential backoff (1s, 2s, 4s)
5. If client error (4xx): immediately fail
6. After 3 retries, mark as failed
7. User sees error toast

**Result:** Transient network issues are handled automatically. Real errors fail fast.

### Scenario 4: User Switches Tabs

1. Tab becomes hidden (`document.hidden = true`)
2. Polling in `useUserUsage` detects and pauses
3. User switches back
4. Polling resumes
5. Fresh data is fetched

**Result:** Battery and bandwidth are preserved when app isn't visible.

## Service Worker Integration

The app also has a service worker (via vite-plugin-pwa) that provides:

### Asset Caching

- **Static assets** (JS, CSS, images): Cached and served offline
- **API responses**: Cached with 5-minute expiration, network-first strategy
- **Fonts**: Cached with 1-year expiration

### Offline Behavior

1. User visits app while online
2. Service worker caches app shell and assets
3. User goes offline
4. App shell loads from cache
5. React Query pauses API queries
6. Cached API responses serve as fallback (if available)
7. UI shows offline indicator

**Result:** App remains functional offline with cached data.

**See [PWA Guide](../developer/pwa.md) for detailed service worker configuration.**

## Configuration Summary

| Feature                  | Configuration                 | File                               |
| ------------------------ | ----------------------------- | ---------------------------------- |
| Network detection        | `useNetworkStatus` hook       | `hooks/use-network-status.ts`      |
| Query pause when offline | `networkMode: "online"`       | `provider/trpc-provider.tsx`       |
| Smart retries            | Custom retry function         | `provider/trpc-provider.tsx`       |
| Exponential backoff      | `retryDelay` function         | `provider/trpc-provider.tsx`       |
| Refetch on reconnect     | `refetchOnReconnect: true`    | `provider/trpc-provider.tsx`       |
| Disabled focus refetch   | `refetchOnWindowFocus: false` | `provider/trpc-provider.tsx`       |
| Network-aware polling    | `refetchInterval` function    | `hooks/useUserSettings.ts`         |
| Offline UI               | `OfflineIndicator` component  | `components/offline-indicator.tsx` |
| Auth retry fix           | Removed `retry: false`        | `hooks/useAuth.ts`                 |

## Testing Offline Behavior

### Method 1: DevTools Network Throttling

1. Open DevTools (F12)
2. Go to Network tab
3. Change throttling dropdown to "Offline"
4. Observe:
   - Offline banner appears at top
   - Console shows "📵 Network: Offline"
   - Queries pause (check Network tab - no new requests)
   - Previous data remains visible

5. Change back to "Online"
6. Observe:
   - "Back online!" banner shows briefly
   - Console shows "🌐 Network: Online"
   - Queries resume and refetch
   - Data syncs

### Method 2: Browser API

Open console and run:

```javascript
// Simulate offline
window.dispatchEvent(new Event("offline"));

// Simulate online
window.dispatchEvent(new Event("online"));
```

### Method 3: Actual Network Disconnect

1. Disconnect WiFi/Ethernet
2. App shows offline banner
3. Try navigating - cached pages load, API calls pause
4. Reconnect network
5. App syncs automatically

## Best Practices for New Queries

When adding new queries or mutations, follow these patterns:

### Standard Query (No Special Configuration)

```typescript
// Uses global defaults - network-aware, smart retry, 5min stale time
export const useFeeds = () => {
  return trpc.feeds.list.useQuery();
};
```

### Query with Custom Stale Time

```typescript
export const useFeed = (id: number) => {
  return trpc.feeds.getById.useQuery(
    { id },
    {
      staleTime: 1000 * 60 * 30, // 30 minutes (rarely changes)
    }
  );
};
```

### Polling Query (Network-Aware)

```typescript
export const useLiveData = () => {
  const { isOnline } = useNetworkStatus();

  return trpc.data.live.useQuery(undefined, {
    refetchInterval: (query) => {
      // Pause when offline or tab hidden
      if (!isOnline || document.hidden) return false;

      // Poll every N seconds when active
      return 5000;
    },
    placeholderData: (prev) => prev, // Keep showing last data
  });
};
```

### Mutation with Network Check

```typescript
export const useCreateFeed = () => {
  const { isOnline } = useNetworkStatus();
  const utils = trpc.useUtils();

  return trpc.feeds.create.useMutation({
    onMutate: () => {
      // Warn if trying to mutate while offline
      if (!isOnline) {
        toast.error(
          "You're offline. Changes will be saved when you reconnect."
        );
      }
    },
    onSuccess: (data) => {
      utils.feeds.list.invalidate();
      toast.success("Feed added!");
    },
    onError: (error) => {
      // Check if it's a network error
      const isNetworkError = !error?.data?.httpStatus;
      toast.error(
        isNetworkError
          ? "Network error. Please check your connection."
          : "Failed to add feed."
      );
    },
  });
};
```

### Optimistic Update (For Better Offline UX)

```typescript
export const useMarkAsRead = () => {
  const utils = trpc.useUtils();

  return trpc.articles.markRead.useMutation({
    onMutate: async ({ articleId }) => {
      // Cancel outgoing queries
      await utils.articles.list.cancel();

      // Snapshot previous value
      const previous = utils.articles.list.getData();

      // Optimistically update
      utils.articles.list.setData(undefined, (old) =>
        old?.map((article) =>
          article.id === articleId ? { ...article, read: true } : article
        )
      );

      return { previous };
    },
    onError: (err, vars, context) => {
      // Rollback on error
      utils.articles.list.setData(undefined, context?.previous);
      toast.error("Failed to mark as read");
    },
    onSettled: () => {
      // Refetch to sync with server
      utils.articles.list.invalidate();
    },
  });
};
```

## Performance Impact

### Before Offline Support

- ❌ Polling continues when offline (wasted requests, battery drain)
- ❌ All queries refetch on window focus (15+ simultaneous requests)
- ❌ No retry for auth queries (users logged out on temporary network issues)
- ❌ Generic retry for all errors (including 404s, 401s)
- ❌ No user feedback for offline state

### After Offline Support

- ✅ Polling pauses when offline or tab hidden (saves battery/bandwidth)
- ✅ Window focus refetch disabled (prevents request storms)
- ✅ Smart retry only for network errors (faster failures for real errors)
- ✅ Exponential backoff prevents server hammering
- ✅ Clear UI feedback for network status
- ✅ Queries automatically resume when online
- ✅ Previous data preserved during offline periods

### Metrics

| Scenario               | Before                    | After                |
| ---------------------- | ------------------------- | -------------------- |
| Requests while offline | Continuous retries        | 0 (paused)           |
| Requests on tab switch | All queries refetch       | 0 (disabled)         |
| Battery impact         | High (continuous polling) | Low (smart pause)    |
| User confusion         | High (silent failures)    | Low (clear feedback) |

## Troubleshooting

### Queries Not Pausing When Offline

1. Check console for "📵 Network: Offline" message
2. Verify `networkMode: "online"` in QueryClient config
3. Check `onlineManager.setOnline()` is being called

### Offline Banner Not Showing

1. Verify `OfflineIndicator` is in `__root.tsx`
2. Check browser console for errors
3. Test with `window.dispatchEvent(new Event('offline'))`

### Polling Still Running When Offline

1. Verify query uses `refetchInterval` function (not number)
2. Check `useNetworkStatus` hook is imported and used
3. Verify `if (!isOnline)` check in `refetchInterval`

### Data Not Syncing on Reconnect

1. Check `refetchOnReconnect: true` in query config
2. Verify `onlineManager.setOnline(true)` is called
3. Check Network tab for outgoing requests

## Future Enhancements

Potential improvements for even better offline support:

1. **IndexedDB Persistence**
   - Store query cache in IndexedDB
   - Survive page refreshes
   - Larger storage capacity

2. **Offline Mutation Queue**
   - Queue mutations when offline
   - Automatically replay when online
   - Conflict resolution

3. **Background Sync**
   - Use Service Worker Background Sync API
   - Guaranteed mutation delivery
   - Works even after app is closed

4. **Differential Sync**
   - Only fetch changed data
   - Reduce bandwidth usage
   - Faster sync times

5. **Connection Quality Adaptation**
   - Reduce polling frequency on slow connections
   - Lower image quality on 2G/3G
   - Progressive enhancement

## Code References

- **Network Status Hook**: `packages/app/src/hooks/use-network-status.ts`
- **QueryClient Config**: `packages/app/src/components/provider/trpc-provider.tsx`
- **Polling Query**: `packages/app/src/lib/hooks/useUserSettings.ts`
- **Offline Indicator**: `packages/app/src/components/offline-indicator.tsx`
- **Auth Hook**: `packages/app/src/lib/hooks/useAuth.ts`

## References

- [TanStack Query Network Mode](https://tanstack.com/query/latest/docs/react/guides/network-mode)
- [TanStack Query Online Manager](https://tanstack.com/query/latest/docs/react/reference/onlineManager)
- [MDN: Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [MDN: Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
