import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCategories,
  useUpdateCategory,
  useDeleteCategory,
  useCreateFeed,
  useFeedByCategoryId,
} from "@/lib/hooks/useData";
import { useCurrentUser } from "@/lib/hooks/useAuth";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getPublicBaseUrl } from "@/lib/utils";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
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
import {
  Highlight,
  HighlightItem,
} from "@/components/animate-ui/primitives/effects/highlight";
import { CATEGORY_COLOR_PALETTE } from "@/lib/utils/colors";
import { useState } from "react";
import { Pencil, Trash2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/categories")({
  component: CategoriesPage,
});

interface Category {
  id: number;
  name: string;
  color?: string;
  discovered_from_rss?: boolean;
}

// Helper function to generate URL-friendly slug
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
};

// Component to show feed status for a category
function CategoryFeedStatus({
  category,
  onCreateFeed,
}: {
  category: Category;
  onCreateFeed: () => void;
}) {
  const { data: feed, isLoading } = useFeedByCategoryId(category.id);
  const { data: user } = useCurrentUser();

  if (isLoading) {
    return <span className="text-xs text-muted-foreground">Loading...</span>;
  }

  if (feed) {
    const publicUrl = user?.username
      ? `${getPublicBaseUrl()}/public/${user.username}/${feed.slug}`
      : "";

    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <ExternalLink className="size-3" />
          Public Feed
        </Badge>
        {publicUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(publicUrl, "_blank")}
            className="h-6 px-2 text-xs"
          >
            View
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onCreateFeed}
      className="h-7 gap-1"
    >
      <Plus className="size-3" />
      Create Feed
    </Button>
  );
}

function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const navigate = useNavigate();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const createFeed = useCreateFeed();

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null
  );
  const [createFeedDialogOpen, setCreateFeedDialogOpen] = useState(false);
  const [feedCategory, setFeedCategory] = useState<Category | null>(null);
  const [feedTitle, setFeedTitle] = useState("");
  const [feedSlug, setFeedSlug] = useState("");
  const [feedDescription, setFeedDescription] = useState("");

  // Check for associated feed when deleting
  const { data: associatedFeed } = useFeedByCategoryId(
    categoryToDelete?.id ?? 0
  );

  const handleEditClick = (category: Category) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditColor(category.color || "");
  };

  const handleSaveEdit = async () => {
    if (!editingCategory) return;

    try {
      await updateCategory.mutateAsync({
        id: editingCategory.id,
        name: editName,
        color: editColor,
      });
      setEditingCategory(null);
    } catch (error) {
      console.error("Failed to update category:", error);
    }
  };

  const handleDelete = async (category: Category) => {
    setCategoryToDelete(category);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;

    try {
      await deleteCategory.mutateAsync({ id: categoryToDelete.id });
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error("Failed to delete category:", error);
    }
  };

  const handleCreateFeedClick = (category: Category) => {
    setFeedCategory(category);
    setFeedTitle(category.name);
    setFeedSlug(generateSlug(category.name));
    setFeedDescription(`All articles from ${category.name}`);
    setCreateFeedDialogOpen(true);
  };

  const handleCreateFeed = async () => {
    if (!feedCategory) return;

    try {
      await createFeed.mutateAsync({
        title: feedTitle,
        slug: feedSlug,
        description: feedDescription,
        public: true,
        categoryIds: [feedCategory.id],
      });
      setCreateFeedDialogOpen(false);
      setFeedCategory(null);
      toast.success("Public feed created! Redirecting to feeds page...");
      setTimeout(() => navigate({ to: "/app/feeds" }), 1000);
    } catch (error) {
      console.error("Failed to create feed:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading categories...</div>
      </div>
    );
  }

  const categoryList = Array.isArray(categories) ? categories : [];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Categories</h1>
        <p className="text-muted-foreground mt-2">
          Manage your categories to organize subscriptions and filter articles
        </p>
      </div>

      {categoryList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No categories yet</CardTitle>
            <CardDescription>
              Categories help you organize your feeds. Create categories
              manually or let us suggest them based on RSS feed categories.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <Highlight
              mode="parent"
              controlledItems
              hover
              enabled
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Public Feed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryList.map((category) => (
                    <HighlightItem
                      key={category.id}
                      activeClassName="bg-muted/50 rounded-md"
                      asChild
                    >
                      <TableRow className="hover:!bg-transparent">
                        <TableCell>
                          <CategoryBadge
                            category={
                              category as {
                                id: number;
                                name: string;
                                color?: string;
                              }
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <CategoryFeedStatus
                            category={category as Category}
                            onCreateFeed={() =>
                              handleCreateFeedClick(category as Category)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleEditClick(
                                  category as {
                                    id: number;
                                    name: string;
                                    color?: string;
                                  }
                                )
                              }
                              aria-label={`Edit category ${category.name}`}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                              <span className="sr-only">Edit category</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(category as Category)}
                              aria-label={`Delete category ${category.name}`}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              <span className="sr-only">Delete category</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </HighlightItem>
                  ))}
                </TableBody>
              </Table>
            </Highlight>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog
        open={!!editingCategory}
        onOpenChange={() => setEditingCategory(null)}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Edit Category</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Change the category name or choose a different color
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Category name"
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="grid grid-cols-6 gap-2">
                {CATEGORY_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`size-10 rounded-md transition-transform hover:scale-110 ${
                      editColor === color
                        ? "ring-2 ring-primary ring-offset-2"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEditColor(color)}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Label>Preview</Label>
              <div className="mt-2">
                <CategoryBadge
                  category={{ id: 0, name: editName, color: editColor }}
                />
              </div>
            </div>
          </div>

          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editName}>
              Save Changes
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Delete Confirmation Dialog */}
      <ResponsiveAlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>
              Delete category
            </ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete "{categoryToDelete?.name}"? This
                action cannot be undone.
              </p>
              {associatedFeed && (
                <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="font-semibold text-destructive">Warning:</p>
                  <p className="text-sm mt-1">
                    This category has an associated public feed "
                    {associatedFeed.title}" that will also be deleted.
                  </p>
                </div>
              )}
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction onClick={confirmDelete}>
              Delete
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>

      {/* Create Feed Dialog */}
      <ResponsiveDialog
        open={createFeedDialogOpen}
        onOpenChange={setCreateFeedDialogOpen}
      >
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Create Public Feed</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Create a public RSS feed for "{feedCategory?.name}". You can
              customize the details below.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feed-title">Feed Title</Label>
              <Input
                id="feed-title"
                value={feedTitle}
                onChange={(e) => setFeedTitle(e.target.value)}
                placeholder="My Feed"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-slug">Slug</Label>
              <Input
                id="feed-slug"
                value={feedSlug}
                onChange={(e) =>
                  setFeedSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-")
                      .replace(/^-|-$/g, "")
                  )
                }
                placeholder="my-feed"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, hyphens only)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-description">Description (Optional)</Label>
              <textarea
                id="feed-description"
                value={feedDescription}
                onChange={(e) => setFeedDescription(e.target.value)}
                placeholder="A description for your feed"
                className="w-full p-2 border rounded-md min-h-[80px]"
              />
            </div>
          </div>

          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateFeedDialogOpen(false);
                setFeedCategory(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFeed}
              disabled={!feedTitle || !feedSlug || createFeed.isPending}
            >
              {createFeed.isPending ? "Creating..." : "Create Feed"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
