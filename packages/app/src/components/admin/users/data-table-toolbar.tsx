import { Table } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "./data-table-view-options";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  disableFilters?: boolean;
}

export function DataTableToolbar<TData>({
  table,
  disableFilters = false,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {!disableFilters && (
          <>
            <Input
              placeholder="Filter users by username or email..."
              value={
                (table.getColumn("username")?.getFilterValue() as string) ?? ""
              }
              onChange={(event) =>
                table.getColumn("username")?.setFilterValue(event.target.value)
              }
              className="h-8 w-[250px] lg:w-[350px]"
            />
            {table.getColumn("role") && (
              <DataTableFacetedFilter
                column={table.getColumn("role")}
                title="Role"
                options={[
                  { label: "Admin", value: "admin" },
                  { label: "User", value: "user" },
                ]}
              />
            )}
            {table.getColumn("plan") && (
              <DataTableFacetedFilter
                column={table.getColumn("plan")}
                title="Plan"
                options={[
                  { label: "Free", value: "free" },
                  { label: "Pro", value: "pro" },
                  { label: "Enterprise", value: "enterprise" },
                  { label: "Custom", value: "custom" },
                ]}
              />
            )}
            {table.getColumn("banned") && (
              <DataTableFacetedFilter
                column={table.getColumn("banned")}
                title="Status"
                options={[
                  { label: "Active", value: "active" },
                  { label: "Banned", value: "banned" },
                ]}
              />
            )}
            {table.getColumn("emailVerified") && (
              <DataTableFacetedFilter
                column={table.getColumn("emailVerified")}
                title="Email"
                options={[
                  { label: "Verified", value: "verified" },
                  { label: "Unverified", value: "unverified" },
                ]}
              />
            )}
            {isFiltered && (
              <Button
                variant="ghost"
                onClick={() => table.resetColumnFilters()}
                className="h-8 px-2 lg:px-3"
              >
                Reset
                <X className="ml-2 h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  );
}
