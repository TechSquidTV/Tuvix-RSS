import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import type { DataTableFeatures } from "./table-features";

type User = { username: string };
const columns: ColumnDef<DataTableFeatures, User>[] = [
  {
    accessorKey: "username",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="User" />
    ),
  },
];

describe("admin data table", () => {
  it("updates rendered rows when sorting and filtering", () => {
    render(
      <DataTable
        columns={columns}
        data={[{ username: "Zoe" }, { username: "Ada" }, { username: "Bea" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "User" }));
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByText("Ada")).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText("Filter users by username or email..."),
      { target: { value: "Bea" } }
    );
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Bea" })).toBeInTheDocument();
    expect(screen.getByText("1 row(s) total")).toBeInTheDocument();
  });

  it("paginates client data and updates the page indicator", () => {
    const data = Array.from({ length: 22 }, (_, index) => ({
      username: `user-${index}`,
    }));
    render(<DataTable columns={columns} data={data} />);
    expect(
      screen.queryByRole("cell", { name: "user-20" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByRole("cell", { name: "user-20" })).toBeInTheDocument();
    expect(
      screen.queryByRole("cell", { name: "user-0" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("keeps an empty server result in server pagination mode", () => {
    render(
      <DataTable columns={columns} data={[]} pageCount={0} totalCount={0} />
    );
    expect(screen.getByText("No results.")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Filter users by username or email...")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to next page" })
    ).toBeDisabled();
  });
});
