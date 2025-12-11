import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/api/trpc";
import { transformer } from "@/lib/api/transformer";

// Exported for testing
export type TRPCError = { data?: { httpStatus?: number } };

/**
 * Retry logic for tRPC queries
 * - Don't retry on 4xx errors (client errors like validation, auth failures)
 * - Retry up to 3 times for network/server errors (5xx, timeouts)
 */
export function shouldRetryQuery(
  failureCount: number,
  error: TRPCError,
): boolean {
  // Don't retry on 4xx errors (client errors)
  if (
    error?.data?.httpStatus &&
    error.data.httpStatus >= 400 &&
    error.data.httpStatus < 500
  ) {
    return false;
  }
  // Retry up to 3 times for network/server errors
  return failureCount < 3;
}

/**
 * Exponential backoff delay for retries
 * 1s -> 2s -> 4s -> ... capped at 30s
 */
export function calculateRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}

/**
 * Custom fetch wrapper that includes credentials for session cookies
 * and preserves any existing headers (like Sentry trace headers)
 */
export function createFetchWithCredentials(
  url: URL | RequestInfo,
  options?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: "include", // Required for HTTP-only session cookies
    headers: {
      ...options?.headers, // Preserve Sentry trace headers (sentry-trace, baggage)
    },
  });
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Caching
            staleTime: 5 * 60 * 1000, // 5 minutes

            // Network-aware refetching
            refetchOnWindowFocus: false, // Disable aggressive refetching
            refetchOnReconnect: true, // Refetch when coming back online

            // Retry configuration
            retry: shouldRetryQuery,
            retryDelay: calculateRetryDelay,

            // Network mode - pause queries when offline
            networkMode: "online",
          },
          mutations: {
            // Mutations also respect network status
            networkMode: "online",
            retry: false, // Don't auto-retry mutations
          },
        },
      }),
  );

  // Sync React Query's online manager with browser's navigator.onLine
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

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        // Using httpBatchLink with SuperJSON transformer
        // This batches multiple tRPC calls into a single HTTP request for better performance
        // Requires:
        // - @hono/trpc-server adapter on backend (handles batched requests properly)
        // - SuperJSON transformer on both client and server (consistent serialization)
        // Note: In tRPC v11, transformer must be passed to httpBatchLink directly
        httpBatchLink({
          url: import.meta.env.VITE_API_URL || "http://localhost:3001/trpc",
          fetch: createFetchWithCredentials,
          headers() {
            return {};
          },
          transformer,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
