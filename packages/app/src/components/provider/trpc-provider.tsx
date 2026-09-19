import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/api/trpc";
import { transformer } from "@/lib/api/transformer";

import {
  shouldRetryQuery,
  calculateRetryDelay,
  createFetchWithCredentials,
} from "@/lib/api/query-options";

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
      })
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
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
