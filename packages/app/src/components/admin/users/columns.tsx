import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import {
  MoreHorizontal,
  UserX,
  UserCheck,
  Trash2,
  RefreshCw,
  CreditCard,
  Settings,
} from "lucide-react";
import { DataTableColumnHeader } from "./data-table-column-header";
import { getRelativeTime, getLastSeenStatusColor } from "@/lib/utils/date";

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "admin";
  plan: string;
  banned: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
  usage: {
    sourceCount: number;
    publicFeedCount: number;
    categoryCount: number;
    articleCount: number;
    lastUpdated: Date;
  };
  limits: {
    maxSources: number;
    maxPublicFeeds: number;
    maxCategories: number | null;
    apiRateLimitPerMinute: number;
  };
  customLimits: {
    maxSources: number | null;
    maxPublicFeeds: number | null;
    maxCategories: number | null;
    apiRateLimitPerMinute: number | null;
    publicFeedRateLimitPerMinute: number | null;
    notes: string | null;
  } | null;
  rateLimitEnabled: boolean;
};

type ColumnActions = {
  onBan: (userId: number) => void;
  onDelete: (userId: number) => void;
  onChangePlan: (userId: number, currentPlan: string) => void;
  onCustomLimits: (userId: number) => void;
  onRecalculateUsage: (userId: number) => void;
};

export const createColumns = (
  actions: ColumnActions,
): ColumnDef<AdminUser>[] => [
  {
    accessorKey: "username",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="User" />
    ),
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div>
          <div className="font-medium">{user.username}</div>
          <div className="text-sm text-muted-foreground">{user.email}</div>
        </div>
      );
    },
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const role = row.getValue("role") as string;
      return (
        <Badge variant={role === "admin" ? "default" : "secondary"}>
          {role}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
    enableSorting: true,
  },
  {
    accessorKey: "plan",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Plan" />
    ),
    cell: ({ row }) => {
      const plan = row.getValue("plan") as string;
      return (
        <Badge variant="outline" className="capitalize">
          {plan}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
    enableSorting: true,
  },
  {
    accessorKey: "banned",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const banned = row.getValue("banned") as boolean;
      return banned ? (
        <Badge variant="destructive">Banned</Badge>
      ) : (
        <Badge variant="outline" className="text-green-600">
          Active
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      if (value === "all") return true;
      const banned = row.getValue(id) as boolean;
      return value === "banned" ? banned : !banned;
    },
    enableSorting: true,
  },
  {
    id: "usage",
    header: "Usage",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="text-sm">
          <div>
            {user.usage.sourceCount} / {user.limits.maxSources} sources
          </div>
          <div className="text-muted-foreground">
            {user.usage.publicFeedCount} / {user.limits.maxPublicFeeds} feeds
          </div>
        </div>
      );
    },
    enableSorting: false,
  },
  {
    accessorKey: "emailVerified",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email Verified" />
    ),
    cell: ({ row }) => {
      const verified = row.getValue("emailVerified") as boolean;
      return verified ? (
        <Badge variant="outline" className="text-green-600">
          Verified
        </Badge>
      ) : (
        <Badge variant="outline" className="text-yellow-600">
          Unverified
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      if (value === "all") return true;
      const verified = row.getValue(id) as boolean;
      return value === "verified" ? verified : !verified;
    },
    enableSorting: true,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Join Date" />
    ),
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as Date;
      return <div>{new Date(date).toLocaleDateString()}</div>;
    },
    enableSorting: true,
  },
  {
    accessorKey: "lastSeenAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Seen" />
    ),
    cell: ({ row }) => {
      const date = row.getValue("lastSeenAt") as Date | null;
      const relativeTime = getRelativeTime(date);
      const colorClass = getLastSeenStatusColor(date);
      return <div className={colorClass}>{relativeTime}</div>;
    },
    enableSorting: true,
    sortingFn: (rowA, rowB) => {
      const a = rowA.getValue("lastSeenAt") as Date | null;
      const b = rowB.getValue("lastSeenAt") as Date | null;
      // Sort nulls last
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;

      return (
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
            <DropdownMenuItem
              onClick={() => actions.onChangePlan(user.id, user.plan)}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Change Plan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onCustomLimits(user.id)}>
              <Settings className="mr-2 h-4 w-4" />
              Custom Limits
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actions.onRecalculateUsage(user.id)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recalculate Usage
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onBan(user.id)}>
              {user.banned ? (
                <>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Unban
                </>
              ) : (
                <>
                  <UserX className="mr-2 h-4 w-4" />
                  Ban
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => actions.onDelete(user.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];
