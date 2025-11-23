import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/lib/api/trpc";
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/animate-ui/components/radix/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/animate-ui/components/radix/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Progress } from "@/components/animate-ui/components/radix/progress";
import {
  MoreHorizontal,
  Search,
  Trash2,
  Plus,
  Download,
  Upload,
  Edit,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";

export const Route = createFileRoute("/app/admin/blocked-domains")({
  component: AdminBlockedDomains,
});

const REASON_DISPLAY_NAMES: Record<string, string> = {
  illegal_content: "Illegal Content",
  excessive_automation: "Excessive Automation",
  spam: "Spam",
  malware: "Malware",
  copyright_violation: "Copyright Violation",
  other: "Other",
};

const REASON_COLORS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  illegal_content: "destructive",
  excessive_automation: "default",
  spam: "secondary",
  malware: "destructive",
  copyright_violation: "outline",
  other: "outline",
};

type BlockedDomain = {
  id: number;
  domain: string;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: number | null;
};

function AdminBlockedDomains() {
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBulkImportSheet, setShowBulkImportSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteDomainId, setDeleteDomainId] = useState<number | null>(null);
  const [editingDomain, setEditingDomain] = useState<BlockedDomain | null>(
    null,
  );
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportReason, setBulkImportReason] = useState<string | null>(null);
  const [bulkImportNotes, setBulkImportNotes] = useState<string | null>(null);

  // Form state
  const [domainInput, setDomainInput] = useState("");
  const [reasonInput, setReasonInput] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState("");

  const debouncedSearch = useDebounce(search, 500);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const {
    data: blockedDomains,
    isLoading,
    refetch,
  } = trpc.admin.listBlockedDomains.useQuery({
    limit,
    offset,
    search: debouncedSearch || undefined,
    reason: reasonFilter,
  });

  const addMutation = trpc.admin.addBlockedDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain blocked successfully");
      refetch();
      setShowAddDialog(false);
      setDomainInput("");
      setReasonInput(null);
      setNotesInput("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to block domain");
    },
  });

  const updateMutation = trpc.admin.updateBlockedDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain updated successfully");
      refetch();
      setShowEditDialog(false);
      setEditingDomain(null);
      setReasonInput(null);
      setNotesInput("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update domain");
    },
  });

  const removeMutation = trpc.admin.removeBlockedDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain removed from blocked list");
      refetch();
      setShowDeleteDialog(false);
      setDeleteDomainId(null);
      setSelectedIds(new Set());
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove domain");
    },
  });

  const bulkAddMutation = trpc.admin.bulkAddBlockedDomains.useMutation({
    onSuccess: (result: {
      added: number;
      skipped: number;
      errors: Array<{ domain: string; error: string }>;
    }) => {
      toast.success(
        `Imported ${result.added} domains${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`,
      );
      refetch();
      setShowBulkImportSheet(false);
      setBulkImportText("");
      setBulkImportReason(null);
      setBulkImportNotes(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to import domains");
    },
  });

  const bulkRemoveMutation = trpc.admin.bulkRemoveBlockedDomains.useMutation({
    onSuccess: (result: { removed: number }) => {
      toast.success(`Removed ${result.removed} domain(s)`);
      refetch();
      setSelectedIds(new Set());
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove domains");
    },
  });

  const exportMutation = trpc.admin.exportBlockedDomains.useQuery(
    { reason: reasonFilter },
    {
      enabled: false,
    },
  );

  const handleAdd = useCallback(() => {
    if (!domainInput.trim()) {
      toast.error("Domain is required");
      return;
    }

    addMutation.mutate({
      domain: domainInput.trim(),
      reason: reasonInput || null,
      notes: notesInput.trim() || null,
    });
  }, [domainInput, reasonInput, notesInput, addMutation]);

  const handleEdit = useCallback((domain: BlockedDomain) => {
    setEditingDomain(domain);
    setReasonInput(domain.reason);
    setNotesInput(domain.notes || "");
    setShowEditDialog(true);
  }, []);

  const handleUpdate = useCallback(() => {
    if (!editingDomain) return;

    updateMutation.mutate({
      id: editingDomain.id,
      reason: reasonInput || null,
      notes: notesInput.trim() || null,
    });
  }, [editingDomain, reasonInput, notesInput, updateMutation]);

  const handleDelete = useCallback((id: number) => {
    setDeleteDomainId(id);
    setShowDeleteDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deleteDomainId) {
      removeMutation.mutate({ id: deleteDomainId });
    }
  }, [deleteDomainId, removeMutation]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkRemoveMutation.mutate({ ids: Array.from(selectedIds) });
  }, [selectedIds, bulkRemoveMutation]);

  const handleBulkImport = useCallback(() => {
    if (!bulkImportText.trim()) {
      toast.error("Please enter at least one domain");
      return;
    }

    bulkAddMutation.mutate({
      domains: bulkImportText,
      reason: bulkImportReason || null,
      notes: bulkImportNotes || null,
    });
  }, [bulkImportText, bulkImportReason, bulkImportNotes, bulkAddMutation]);

  const handleExport = useCallback(async () => {
    try {
      const csv = await exportMutation.refetch();
      if (csv.data) {
        const blob = new Blob([csv.data], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `blocked-domains-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Domains exported successfully");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export domains",
      );
    }
  }, [exportMutation]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === blockedDomains?.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(
        new Set(blockedDomains?.items.map((d: BlockedDomain) => d.id) || []),
      );
    }
  }, [selectedIds.size, blockedDomains?.items]);

  const isAllSelected = useMemo(() => {
    return (
      blockedDomains?.items.length > 0 &&
      selectedIds.size === blockedDomains.items.length
    );
  }, [selectedIds.size, blockedDomains?.items.length]);

  const isIndeterminate = useMemo(() => {
    return (
      selectedIds.size > 0 &&
      selectedIds.size < (blockedDomains?.items.length || 0)
    );
  }, [selectedIds.size, blockedDomains?.items.length]);

  const formatDate = useCallback((date: Date) => {
    return new Date(date).toLocaleDateString();
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Blocked Domains
            </h2>
            <p className="text-muted-foreground">
              Manage blocked domains and prevent subscriptions
            </p>
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
          <h2 className="text-3xl font-bold tracking-tight">Blocked Domains</h2>
          <p className="text-muted-foreground">
            Manage blocked domains and prevent subscriptions
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {blockedDomains?.total || 0} total
        </Badge>
      </div>

      {/* Actions Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search domains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={reasonFilter || "all"}
          onValueChange={(value) =>
            setReasonFilter(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            {Object.entries(REASON_DISPLAY_NAMES).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Domain
        </Button>
        <Button variant="outline" onClick={() => setShowBulkImportSheet(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Bulk Import
        </Button>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Bulk Actions Toolbar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between p-3 bg-muted rounded-md"
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowDeleteDialog(true);
                  setDeleteDomainId(-1); // Special value for bulk delete
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="mr-2 h-4 w-4" />
                Clear Selection
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <CardHeader>
          <CardTitle>All Blocked Domains</CardTitle>
          <CardDescription>
            {blockedDomains?.total || 0} blocked domain(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        isIndeterminate ? "indeterminate" : isAllSelected
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blockedDomains?.items.map((domain: BlockedDomain) => (
                  <TableRow key={domain.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(domain.id)}
                        onCheckedChange={() => toggleSelect(domain.id)}
                        aria-label={`Select ${domain.domain}`}
                      />
                    </TableCell>
                    <TableCell>
                      <code className="text-sm font-mono">
                        {domain.domain}
                        {domain.domain.startsWith("*.") && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Wildcard
                          </Badge>
                        )}
                      </code>
                    </TableCell>
                    <TableCell>
                      {domain.reason ? (
                        <Badge
                          variant={REASON_COLORS[domain.reason] || "outline"}
                        >
                          {REASON_DISPLAY_NAMES[domain.reason] || domain.reason}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          No reason
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {domain.notes ? (
                        <span
                          className="text-sm truncate block max-w-[200px]"
                          title={domain.notes}
                        >
                          {domain.notes.length > 50
                            ? `${domain.notes.substring(0, 50)}...`
                            : domain.notes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(domain.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleEdit(domain)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(domain.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {blockedDomains?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      <p className="text-muted-foreground">
                        {search || reasonFilter
                          ? "No domains match your search"
                          : "No blocked domains yet. Click 'Add Domain' to get started."}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {blockedDomains && blockedDomains.hasMore && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {offset + 1}-{offset + blockedDomains.items.length} of{" "}
                {blockedDomains.total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOffset(offset + limit)}
                  disabled={!blockedDomains.hasMore}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Domain Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Blocked Domain</DialogTitle>
            <DialogDescription>
              Block a domain to prevent users from subscribing to feeds from it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="example.com or *.example.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use <code>*.example.com</code> to block all subdomains
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Select
                value={reasonInput || ""}
                onValueChange={(value) => setReasonInput(value || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No reason</SelectItem>
                  {Object.entries(REASON_DISPLAY_NAMES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes..."
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                maxLength={1000}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {notesInput.length}/1000 characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Domain"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Domain Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Blocked Domain</DialogTitle>
            <DialogDescription>
              Update the reason and notes for this blocked domain.
            </DialogDescription>
          </DialogHeader>
          {editingDomain && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Domain</Label>
                <Input value={editingDomain.domain} disabled />
                <p className="text-xs text-muted-foreground">
                  Domain cannot be changed. Delete and re-add to change.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reason">Reason (Optional)</Label>
                <Select
                  value={reasonInput || ""}
                  onValueChange={(value) => setReasonInput(value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No reason</SelectItem>
                    {Object.entries(REASON_DISPLAY_NAMES).map(
                      ([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes (Optional)</Label>
                <Textarea
                  id="edit-notes"
                  placeholder="Additional notes..."
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  maxLength={1000}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  {notesInput.length}/1000 characters
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                setEditingDomain(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Sheet */}
      <Sheet open={showBulkImportSheet} onOpenChange={setShowBulkImportSheet}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Bulk Import Domains</SheetTitle>
            <SheetDescription>
              Import multiple domains at once. Enter one domain per line or
              comma-separated.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-domains">Domains</Label>
              <Textarea
                id="bulk-domains"
                placeholder={`example.com\nspam-site.net\n*.malware.org`}
                value={bulkImportText}
                onChange={(e) => setBulkImportText(e.target.value)}
                className="font-mono min-h-[300px]"
                rows={15}
              />
              <p className="text-xs text-muted-foreground">
                Enter domains, one per line or comma-separated. Supports
                wildcard patterns like <code>*.example.com</code>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-reason">Reason (Optional)</Label>
              <Select
                value={bulkImportReason || ""}
                onValueChange={(value) => setBulkImportReason(value || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No reason</SelectItem>
                  {Object.entries(REASON_DISPLAY_NAMES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-notes">Notes (Optional)</Label>
              <Textarea
                id="bulk-notes"
                placeholder="Additional notes (applies to all imported domains)..."
                value={bulkImportNotes || ""}
                onChange={(e) => setBulkImportNotes(e.target.value || null)}
                maxLength={1000}
                rows={3}
              />
            </div>
            {bulkAddMutation.isPending && (
              <div className="space-y-2">
                <Progress value={undefined} />
                <p className="text-sm text-muted-foreground">
                  Importing domains...
                </p>
              </div>
            )}
          </div>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkImportSheet(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkImport}
              disabled={bulkAddMutation.isPending || !bulkImportText.trim()}
            >
              {bulkAddMutation.isPending ? "Importing..." : "Import Domains"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDomainId === -1
                ? "Delete Selected Domains"
                : "Remove Blocked Domain"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDomainId === -1 ? (
                <>
                  Are you sure you want to remove{" "}
                  <strong>{selectedIds.size}</strong> domain(s) from the blocked
                  list? Users will be able to subscribe to them again.
                </>
              ) : (
                <>
                  Are you sure you want to remove this domain from the blocked
                  list? Users will be able to subscribe to it again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDomainId === -1) {
                  handleBulkDelete();
                } else {
                  handleConfirmDelete();
                }
              }}
              disabled={
                removeMutation.isPending || bulkRemoveMutation.isPending
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isPending || bulkRemoveMutation.isPending
                ? "Deleting..."
                : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
