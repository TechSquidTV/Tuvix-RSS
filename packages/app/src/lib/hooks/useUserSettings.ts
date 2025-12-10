// tRPC Hooks for User Settings
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/api/trpc";
import { useNetworkStatus } from "@/hooks/use-network-status";

// User Settings type (matching backend model)
export interface UserSettings {
  userId: number;
  theme: string; // Theme ID: 'system', 'light', 'dark', 'nord', or any other registered theme
  autoAgeDays: number;
  defaultFilter: "all" | "unread" | "read" | "saved";
  shareEmail: boolean;
  shareHackernews: boolean;
  shareReddit: boolean;
  shareTwitter: boolean;
  shareBluesky: boolean;
  shareMastodon: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Type for user usage data from tRPC
export type UserUsageData = RouterOutputs["userSettings"]["getUsage"];

// Hooks
export const useUserSettings = () => {
  return trpc.userSettings.get.useQuery(undefined, {
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useUpdateUserSettings = () => {
  const utils = trpc.useUtils();

  return trpc.userSettings.update.useMutation({
    onSuccess: (data) => {
      utils.userSettings.get.setData(undefined, data);
      toast.success("Settings updated");
    },
    onError: () => {
      toast.error("Failed to update settings");
    },
  });
};

export const useUserUsage = () => {
  const { isOnline } = useNetworkStatus();

  return trpc.userSettings.getUsage.useQuery(undefined, {
    staleTime: 1000 * 10, // 10 seconds
    // Only poll when online and when the query is enabled
    refetchInterval: () => {
      // Pause polling when offline or when tab is not visible
      if (!isOnline || document.hidden) {
        return false;
      }
      // Poll every 10 seconds for live rate limit updates when active
      return 10000;
    },
    // Keep last data when going offline
    placeholderData: (previousData) => previousData,
  });
};
