import { trpc } from "@/lib/api/trpc";

export interface CategorySuggestion {
  name: string;
  count: number;
  color: string;
}

export interface FeedPreview {
  title: string;
  description?: string;
  siteUrl?: string;
  iconUrl?: string;
  suggestedCategories?: CategorySuggestion[];
}

export function useFeedPreview(url: string | null) {
  return trpc.subscriptions.preview.useQuery(
    { url: url || "" },
    {
      enabled: !!url && url.startsWith("http"),
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // Keep unused data in cache for 10 minutes
      retry: 1, // Only retry once on failure
      select: (data: FeedPreview) => {
        // Convert relative iconUrl to absolute URL if needed
        const result = data;
        if (result.iconUrl && !result.iconUrl.startsWith("http")) {
          const baseUrl =
            import.meta.env.VITE_API_URL || "http://localhost:3001/trpc";
          result.iconUrl = `${baseUrl.replace("/trpc", "")}${result.iconUrl}`;
        }

        return result;
      },
    },
  );
}
