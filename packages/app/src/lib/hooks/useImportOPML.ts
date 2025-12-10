import { trpc } from "@/lib/api/trpc";

type OPMLFeed = {
  title: string;
  url: string;
  description?: string;
  site_url?: string;
  folder?: string;
  filters?: Array<{
    field: "title" | "content" | "description" | "author" | "any";
    matchType: "contains" | "regex" | "exact";
    pattern: string;
    caseSensitive: boolean;
  }>;
  filterEnabled?: boolean;
  filterMode?: "include" | "exclude";
};

type ImportResult = {
  imported_count: number;
  skipped_count: number;
  error_count: number;
  errors: string[];
  categories_discovered: number;
  imported_feeds: ImportedFeedDetail[];
};

type ImportedFeedDetail = {
  title: string;
  url: string;
  status: "imported" | "skipped" | "error";
  categories?: string[];
  error_reason?: string;
};

// Step 1: Parse OPML
export const useParseOPML = () => {
  return trpc.subscriptions.parseOpml.useMutation();
};

// Step 2: Import selected feeds (synchronous in tRPC API)
export const useImportOPML = () => {
  return trpc.subscriptions.import.useMutation();
};

// Note: useImportStatus removed - tRPC API uses synchronous imports
// The import operation completes immediately and returns results

export type { OPMLFeed, ImportResult, ImportedFeedDetail };
