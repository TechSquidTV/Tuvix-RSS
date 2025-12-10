import { trpc } from "@/lib/api/trpc";

export interface DiscoveredFeed {
  url: string;
  title: string;
  description?: string;
  type: string; // "rss" or "atom"
}

export function useFeedDiscovery() {
  return trpc.subscriptions.discover.useMutation();
}
