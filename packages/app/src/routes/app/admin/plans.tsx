import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/lib/api/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
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
import { MoreHorizontal, Plus, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";

export const Route = createFileRoute("/app/admin/plans")({
  component: AdminPlans,
});

function AdminPlans() {
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Form state for create/edit
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    maxSources: "",
    maxPublicFeeds: "",
    maxCategories: "",
    unlimited: false,
    apiRateLimitPerMinute: "",
    publicFeedRateLimitPerMinute: "",
    priceCents: "",
    features: "",
  });

  // Queries
  const {
    data: plans,
    isLoading,
    refetch,
  } = trpc.plans.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Mutations
  const createMutation = trpc.plans.create.useMutation({
    onSuccess: () => {
      toast.success("Plan created successfully");
      refetch();
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to create plan: ${error.message}`);
    },
  });

  const updateMutation = trpc.plans.update.useMutation({
    onSuccess: () => {
      toast.success("Plan updated successfully");
      refetch();
      setEditPlan(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(`Failed to update plan: ${error.message}`);
    },
  });

  const deleteMutation = trpc.plans.delete.useMutation({
    onSuccess: () => {
      toast.success("Plan deleted successfully");
      refetch();
      setDeletePlanId(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete plan: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      id: "",
      name: "",
      maxSources: "",
      maxPublicFeeds: "",
      maxCategories: "",
      unlimited: false,
      apiRateLimitPerMinute: "",
      publicFeedRateLimitPerMinute: "",
      priceCents: "",
      features: "",
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      id: formData.id,
      name: formData.name,
      maxSources: parseInt(formData.maxSources),
      maxPublicFeeds: parseInt(formData.maxPublicFeeds),
      maxCategories: formData.unlimited
        ? null
        : parseInt(formData.maxCategories),
      apiRateLimitPerMinute: parseInt(formData.apiRateLimitPerMinute),
      publicFeedRateLimitPerMinute: parseInt(
        formData.publicFeedRateLimitPerMinute
      ),
      priceCents: parseInt(formData.priceCents || "0"),
      features: formData.features || null,
    });
  };

  const handleUpdate = () => {
    if (!editPlan) return;

    updateMutation.mutate({
      id: editPlan,
      name: formData.name,
      maxSources: parseInt(formData.maxSources),
      maxPublicFeeds: parseInt(formData.maxPublicFeeds),
      maxCategories: formData.unlimited
        ? null
        : parseInt(formData.maxCategories),
      apiRateLimitPerMinute: parseInt(formData.apiRateLimitPerMinute),
      publicFeedRateLimitPerMinute: parseInt(
        formData.publicFeedRateLimitPerMinute
      ),
      priceCents: parseInt(formData.priceCents || "0"),
      features: formData.features || null,
    });
  };

  const handleDelete = () => {
    if (!deletePlanId) return;
    deleteMutation.mutate({ id: deletePlanId });
  };

  const openEditDialog = (plan: NonNullable<typeof plans>[0]) => {
    setFormData({
      id: plan.id,
      name: plan.name,
      maxSources: plan.maxSources.toString(),
      maxPublicFeeds: plan.maxPublicFeeds.toString(),
      maxCategories: plan.maxCategories?.toString() || "",
      unlimited: plan.maxCategories === null,
      apiRateLimitPerMinute: plan.apiRateLimitPerMinute.toString(),
      publicFeedRateLimitPerMinute:
        plan.publicFeedRateLimitPerMinute?.toString() || "",
      priceCents: plan.priceCents.toString(),
      features: plan.features || "",
    });
    setEditPlan(plan.id);
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)}/mo`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plans Management</h1>
          <p className="text-muted-foreground">
            Manage subscription plans and pricing tiers
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Plan
        </Button>
      </div>

      {/* Plans Table */}
      <Card>
        <CardHeader>
          <CardTitle>Available Plans</CardTitle>
          <CardDescription>
            All subscription tiers and their limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !plans || plans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No plans found. Create your first plan to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Public Feeds</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>API Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{plan.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {plan.id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          plan.priceCents === 0 ? "secondary" : "default"
                        }
                      >
                        {formatPrice(plan.priceCents)}
                      </Badge>
                    </TableCell>
                    <TableCell>{plan.maxSources.toLocaleString()}</TableCell>
                    <TableCell>
                      {plan.maxPublicFeeds.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {plan.maxCategories === null ? (
                        <Badge variant="outline">Unlimited</Badge>
                      ) : (
                        plan.maxCategories.toLocaleString()
                      )}
                    </TableCell>
                    <TableCell>{plan.apiRateLimitPerMinute}/min</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openEditDialog(plan)}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Plan
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletePlanId(plan.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Plan
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Plan Dialog */}
      <ResponsiveDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      >
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Create New Plan</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Add a new subscription tier with custom limits
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="grid gap-4 py-4">
            {/* Plan ID */}
            <div className="grid gap-2">
              <Label htmlFor="plan-id">Plan ID *</Label>
              <Input
                id="plan-id"
                placeholder="e.g., premium, starter"
                value={formData.id}
                onChange={(e) =>
                  setFormData({ ...formData, id: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier (lowercase, no spaces)
              </p>
            </div>

            {/* Plan Name */}
            <div className="grid gap-2">
              <Label htmlFor="plan-name">Display Name *</Label>
              <Input
                id="plan-name"
                placeholder="e.g., Premium, Starter"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            {/* Pricing */}
            <div className="grid gap-2">
              <Label htmlFor="price">Price (in cents)</Label>
              <Input
                id="price"
                type="number"
                placeholder="e.g., 999 for $9.99"
                value={formData.priceCents}
                onChange={(e) =>
                  setFormData({ ...formData, priceCents: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Enter 0 for free plans
              </p>
            </div>

            {/* Resource Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="max-sources">Max Sources *</Label>
                <Input
                  id="max-sources"
                  type="number"
                  placeholder="e.g., 100"
                  value={formData.maxSources}
                  onChange={(e) =>
                    setFormData({ ...formData, maxSources: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="max-feeds">Max Public Feeds *</Label>
                <Input
                  id="max-feeds"
                  type="number"
                  placeholder="e.g., 10"
                  value={formData.maxPublicFeeds}
                  onChange={(e) =>
                    setFormData({ ...formData, maxPublicFeeds: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Categories */}
            <div className="grid gap-2">
              <Label htmlFor="max-categories">Max Categories</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max-categories"
                  type="number"
                  placeholder="e.g., 50"
                  value={formData.maxCategories}
                  onChange={(e) =>
                    setFormData({ ...formData, maxCategories: e.target.value })
                  }
                  disabled={formData.unlimited}
                />
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="unlimited"
                    checked={formData.unlimited}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        unlimited: checked as boolean,
                      })
                    }
                  />
                  <Label htmlFor="unlimited" className="text-sm cursor-pointer">
                    Unlimited
                  </Label>
                </div>
              </div>
            </div>

            {/* Rate Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="api-rate">API Rate (per minute) *</Label>
                <Input
                  id="api-rate"
                  type="number"
                  placeholder="e.g., 60"
                  value={formData.apiRateLimitPerMinute}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      apiRateLimitPerMinute: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="feed-rate">Feed Rate (per minute) *</Label>
                <Input
                  id="feed-rate"
                  type="number"
                  placeholder="e.g., 10"
                  value={formData.publicFeedRateLimitPerMinute}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      publicFeedRateLimitPerMinute: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            {/* Features JSON */}
            <div className="grid gap-2">
              <Label htmlFor="features">Features (JSON)</Label>
              <Input
                id="features"
                placeholder='{"description": "Perfect for teams"}'
                value={formData.features}
                onChange={(e) =>
                  setFormData({ ...formData, features: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Optional metadata as JSON
              </p>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Plan"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Edit Plan Dialog */}
      <ResponsiveDialog
        open={!!editPlan}
        onOpenChange={() => setEditPlan(null)}
      >
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Edit Plan</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Update plan limits and pricing (ID cannot be changed)
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="grid gap-4 py-4">
            {/* Plan ID (read-only) */}
            <div className="grid gap-2">
              <Label>Plan ID</Label>
              <Input value={formData.id} disabled />
            </div>

            {/* Same fields as create */}
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Display Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-price">Price (in cents)</Label>
              <Input
                id="edit-price"
                type="number"
                value={formData.priceCents}
                onChange={(e) =>
                  setFormData({ ...formData, priceCents: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-sources">Max Sources *</Label>
                <Input
                  id="edit-sources"
                  type="number"
                  value={formData.maxSources}
                  onChange={(e) =>
                    setFormData({ ...formData, maxSources: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-feeds">Max Public Feeds *</Label>
                <Input
                  id="edit-feeds"
                  type="number"
                  value={formData.maxPublicFeeds}
                  onChange={(e) =>
                    setFormData({ ...formData, maxPublicFeeds: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-categories">Max Categories</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-categories"
                  type="number"
                  value={formData.maxCategories}
                  onChange={(e) =>
                    setFormData({ ...formData, maxCategories: e.target.value })
                  }
                  disabled={formData.unlimited}
                />
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-unlimited"
                    checked={formData.unlimited}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        unlimited: checked as boolean,
                      })
                    }
                  />
                  <Label
                    htmlFor="edit-unlimited"
                    className="text-sm cursor-pointer"
                  >
                    Unlimited
                  </Label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-api-rate">API Rate (per minute) *</Label>
                <Input
                  id="edit-api-rate"
                  type="number"
                  value={formData.apiRateLimitPerMinute}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      apiRateLimitPerMinute: e.target.value,
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-feed-rate">Feed Rate (per minute) *</Label>
                <Input
                  id="edit-feed-rate"
                  type="number"
                  value={formData.publicFeedRateLimitPerMinute}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      publicFeedRateLimitPerMinute: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-features">Features (JSON)</Label>
              <Input
                id="edit-features"
                value={formData.features}
                onChange={(e) =>
                  setFormData({ ...formData, features: e.target.value })
                }
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update Plan"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Delete Confirmation Dialog */}
      <ResponsiveAlertDialog
        open={!!deletePlanId}
        onOpenChange={() => setDeletePlanId(null)}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>Delete Plan</ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              Are you sure you want to delete the plan "{deletePlanId}"? This
              action cannot be undone. Users currently on this plan must be
              reassigned first.
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>
    </div>
  );
}
