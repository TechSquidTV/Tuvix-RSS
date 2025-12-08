import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/lib/api/trpc";
import { useState, useMemo, useCallback } from "react";
import type { PaginationState } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
} from "@/components/ui/responsive-alert-dialog";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/admin/users/data-table";
import { createColumns } from "@/components/admin/users/columns";

export const Route = createFileRoute("/app/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const [banUserId, setBanUserId] = useState<number | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [changePlanUserId, setChangePlanUserId] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [customLimitsUserId, setCustomLimitsUserId] = useState<number | null>(
    null,
  );
  const [customLimits, setCustomLimits] = useState({
    maxSources: "",
    maxPublicFeeds: "",
    maxCategories: "",
  });
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [sorting, setSorting] = useState<
    { id: string; desc: boolean }[] | undefined
  >(undefined);

  // Type-safe sorting field mapping - ensures only valid sort fields are passed to API
  const VALID_SORT_FIELDS = [
    "username",
    "email",
    "role",
    "plan",
    "banned",
    "emailVerified",
    "createdAt",
    "lastSeenAt",
  ] as const;
  type ValidSortField = (typeof VALID_SORT_FIELDS)[number];

  const sortField = sorting?.[0]?.id;
  const validatedSortBy: ValidSortField | undefined =
    sortField && VALID_SORT_FIELDS.includes(sortField as ValidSortField)
      ? (sortField as ValidSortField)
      : undefined;

  const {
    data: users,
    isLoading,
    refetch,
  } = trpc.admin.listUsers.useQuery({
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
    sortBy: validatedSortBy,
    sortOrder: sorting?.[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
  });

  type UserItem = NonNullable<typeof users>["items"][number];

  const banMutation = trpc.admin.banUser.useMutation({
    onSuccess: () => {
      toast.success("User status updated");
      refetch();
      setBanUserId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update user status");
    },
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("User deleted");
      refetch();
      setDeleteUserId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete user");
    },
  });

  const changePlanMutation = trpc.admin.changePlan.useMutation({
    onSuccess: () => {
      toast.success("User plan updated");
      refetch();
      setChangePlanUserId(null);
      setSelectedPlan("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update plan");
    },
  });

  const customLimitsMutation = trpc.admin.setCustomLimits.useMutation({
    onSuccess: () => {
      toast.success("Custom limits set");
      refetch();
      setCustomLimitsUserId(null);
      setCustomLimits({
        maxSources: "",
        maxPublicFeeds: "",
        maxCategories: "",
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to set custom limits");
    },
  });

  const recalculateUsageMutation = trpc.admin.recalculateUsage.useMutation({
    onSuccess: () => {
      toast.success("Usage recalculated");
      refetch();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to recalculate usage");
    },
  });

  const handleBan = (userId: number, banned: boolean) => {
    banMutation.mutate({ userId, banned });
  };

  const handleDelete = (userId: number) => {
    deleteMutation.mutate({ userId });
  };

  const handleChangePlan = () => {
    if (changePlanUserId && selectedPlan) {
      changePlanMutation.mutate({
        userId: changePlanUserId,
        plan: selectedPlan as "free" | "pro" | "enterprise" | "custom",
      });
    }
  };

  const handleSetCustomLimits = () => {
    if (customLimitsUserId) {
      customLimitsMutation.mutate({
        userId: customLimitsUserId,
        maxSources: customLimits.maxSources
          ? parseInt(customLimits.maxSources)
          : null,
        maxPublicFeeds: customLimits.maxPublicFeeds
          ? parseInt(customLimits.maxPublicFeeds)
          : null,
        maxCategories: customLimits.maxCategories
          ? parseInt(customLimits.maxCategories)
          : null,
      });
    }
  };

  const handleRecalculateUsage = useCallback(
    (userId: number) => {
      recalculateUsageMutation.mutate({ userId });
    },
    [recalculateUsageMutation],
  );

  const openCustomLimitsDialog = useCallback(
    (userId: number) => {
      const user = users?.items.find((u: UserItem) => u.id === userId);
      if (user?.customLimits) {
        setCustomLimits({
          maxSources: user.customLimits.maxSources?.toString() || "",
          maxPublicFeeds: user.customLimits.maxPublicFeeds?.toString() || "",
          maxCategories: user.customLimits.maxCategories?.toString() || "",
        });
      } else {
        setCustomLimits({
          maxSources: "",
          maxPublicFeeds: "",
          maxCategories: "",
        });
      }
      setCustomLimitsUserId(userId);
    },
    [users?.items],
  );

  const columns = useMemo(
    () =>
      createColumns({
        onBan: (userId: number) => setBanUserId(userId),
        onDelete: (userId: number) => setDeleteUserId(userId),
        onChangePlan: (userId: number, currentPlan: string) => {
          setChangePlanUserId(userId);
          setSelectedPlan(currentPlan);
        },
        onCustomLimits: (userId: number) => openCustomLimitsDialog(userId),
        onRecalculateUsage: (userId: number) => handleRecalculateUsage(userId),
      }),
    [handleRecalculateUsage, openCustomLimitsDialog],
  );

  const userToBan = users?.items.find((u: UserItem) => u.id === banUserId);
  const userToDelete = users?.items.find(
    (u: UserItem) => u.id === deleteUserId,
  );

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Users</h2>
            <p className="text-muted-foreground">Manage user accounts</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>{users?.total || 0} total users</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={users?.items || []}
            pageCount={Math.ceil((users?.total || 0) / pagination.pageSize)}
            pagination={pagination}
            onPaginationChange={setPagination}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </CardContent>
      </Card>

      {/* Ban/Unban Dialog */}
      <ResponsiveAlertDialog
        open={banUserId !== null}
        onOpenChange={() => setBanUserId(null)}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>
              {userToBan?.banned ? "Unban" : "Ban"} User
            </ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              Are you sure you want to {userToBan?.banned ? "unban" : "ban"}{" "}
              <strong>{userToBan?.username}</strong>?
              {!userToBan?.banned && (
                <span className="block mt-2">
                  This will prevent the user from accessing their account.
                </span>
              )}
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction
              onClick={() =>
                banUserId && handleBan(banUserId, !userToBan?.banned)
              }
              disabled={banMutation.isPending}
            >
              {banMutation.isPending
                ? "Processing..."
                : userToBan?.banned
                  ? "Unban"
                  : "Ban"}
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>

      {/* Delete Dialog */}
      <ResponsiveAlertDialog
        open={deleteUserId !== null}
        onOpenChange={() => setDeleteUserId(null)}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>Delete User</ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>{userToDelete?.username}</strong>? This action cannot be
              undone. All user data including subscriptions, feeds, and articles
              will be permanently deleted.
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction
              onClick={() => deleteUserId && handleDelete(deleteUserId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>

      {/* Change Plan Dialog */}
      <ResponsiveDialog
        open={changePlanUserId !== null}
        onOpenChange={() => setChangePlanUserId(null)}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Change User Plan</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Update the plan for{" "}
              <strong>
                {
                  users?.items.find((u: UserItem) => u.id === changePlanUserId)
                    ?.username
                }
              </strong>
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plan">Select Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setChangePlanUserId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangePlan}
              disabled={changePlanMutation.isPending || !selectedPlan}
            >
              {changePlanMutation.isPending ? "Updating..." : "Update Plan"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Custom Limits Dialog */}
      <ResponsiveDialog
        open={customLimitsUserId !== null}
        onOpenChange={() => setCustomLimitsUserId(null)}
      >
        <ResponsiveDialogContent className="max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Set Custom Limits</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Override plan limits for{" "}
              <strong>
                {
                  users?.items.find(
                    (u: UserItem) => u.id === customLimitsUserId,
                  )?.username
                }
              </strong>
              . Leave empty to use plan defaults.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="maxSources">Max Sources</Label>
              <Input
                id="maxSources"
                type="number"
                placeholder="Leave empty for default"
                value={customLimits.maxSources}
                onChange={(e) =>
                  setCustomLimits({
                    ...customLimits,
                    maxSources: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxPublicFeeds">Max Public Feeds</Label>
              <Input
                id="maxPublicFeeds"
                type="number"
                placeholder="Leave empty for default"
                value={customLimits.maxPublicFeeds}
                onChange={(e) =>
                  setCustomLimits({
                    ...customLimits,
                    maxPublicFeeds: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxCategories">
                Max Categories (0 = unlimited)
              </Label>
              <Input
                id="maxCategories"
                type="number"
                placeholder="Leave empty for default"
                value={customLimits.maxCategories}
                onChange={(e) =>
                  setCustomLimits({
                    ...customLimits,
                    maxCategories: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomLimitsUserId(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetCustomLimits}
              disabled={customLimitsMutation.isPending}
            >
              {customLimitsMutation.isPending ? "Saving..." : "Save Limits"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
