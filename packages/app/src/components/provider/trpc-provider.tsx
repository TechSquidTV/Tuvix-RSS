import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/api/trpc";

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
            retry: (
              failureCount,
              error: { data?: { httpStatus?: number } },
            ) => {
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
            },
            retryDelay: (attemptIndex) =>
              Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff

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
        httpBatchLink({
          url: import.meta.env.VITE_API_URL || "http://localhost:3001/trpc",
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: "include", // Required for HTTP-only session cookies
              headers: {
                ...options?.headers, // Preserve Sentry trace headers (sentry-trace, baggage)
              },
            });
          },
          headers() {
            return {};
          },
        }),
      ],
      // SuperJSON transformer for proper serialization of:
      // - Date objects (preserved as Date, not ISO strings)
      // - Maps, Sets, and other JS built-ins
      // - Batched request/response bodies
      transformer: superjson,
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
