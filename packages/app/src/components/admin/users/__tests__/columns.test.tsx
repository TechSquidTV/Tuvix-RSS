import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render, createWrapper } from "@/test/test-utils";
import { createColumns } from "../columns";
import type { AdminUser } from "../columns";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

import { toast } from "sonner";

describe("Admin Users Columns - Copy ID", () => {
  const mockActions = {
    onBan: vi.fn(),
    onDelete: vi.fn(),
    onChangePlan: vi.fn(),
    onCustomLimits: vi.fn(),
    onRecalculateUsage: vi.fn(),
    onResendVerificationEmail: vi.fn(),
  };

  const mockUser: AdminUser = {
    id: 12345,
    username: "testuser",
    email: "test@example.com",
    emailVerified: true,
    role: "user",
    plan: "free",
    banned: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    lastSeenAt: new Date("2024-01-15"),
    usage: {
      sourceCount: 5,
      publicFeedCount: 2,
      categoryCount: 3,
      articleCount: 100,
      lastUpdated: new Date("2024-01-15"),
    },
    limits: {
      maxSources: 10,
      maxPublicFeeds: 5,
      maxCategories: 10,
      apiRateLimitPerMinute: 60,
    },
    customLimits: null,
    rateLimitEnabled: true,
  };

  const mockClipboard = {
    writeText: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.writeText.mockClear().mockResolvedValue(undefined);
    vi.mocked(toast.success).mockClear();

    // Mock clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });
  });

  it("renders Copy ID action in the dropdown menu", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    expect(actionsColumn).toBeDefined();

    // Render the actions cell
    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: mockUser,
          getValue: (key: string) => mockUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Check if Copy ID menu item exists
    await waitFor(() => {
      expect(screen.getByText("Copy ID")).toBeInTheDocument();
    });
  });

  it.skip("copies user ID to clipboard when Copy ID is clicked", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: mockUser,
          getValue: (key: string) => mockUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Click Copy ID
    const copyIdButton = await screen.findByText("Copy ID");
    await user.click(copyIdButton);

    // Verify clipboard.writeText was called with the user ID
    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalledWith("12345");
    });
  });

  it("shows success toast when ID is copied", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: mockUser,
          getValue: (key: string) => mockUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Click Copy ID
    const copyIdButton = await screen.findByText("Copy ID");
    await user.click(copyIdButton);

    // Verify success toast was shown
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("User ID copied to clipboard");
    });
  });

  it("Copy ID appears before other actions in the menu", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: mockUser,
          getValue: (key: string) => mockUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Get all menu items
    await waitFor(() => {
      const copyId = screen.getByText("Copy ID");
      const changePlan = screen.getByText("Change Plan");

      // Copy ID should appear in the DOM before Change Plan
      expect(
        copyId.compareDocumentPosition(changePlan) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("includes Copy icon in the menu item", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: mockUser,
          getValue: (key: string) => mockUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // Find the Copy ID menu item
      const copyIdItem = screen.getByText("Copy ID").closest("div");
      // Check if it contains an svg icon (lucide Copy icon)
      expect(copyIdItem?.querySelector("svg")).toBeInTheDocument();
    });
  });
});

describe("Admin Users Columns - Resend Verification Email", () => {
  const mockActions = {
    onBan: vi.fn(),
    onDelete: vi.fn(),
    onChangePlan: vi.fn(),
    onCustomLimits: vi.fn(),
    onRecalculateUsage: vi.fn(),
    onResendVerificationEmail: vi.fn(),
  };

  const unverifiedUser: AdminUser = {
    id: 54321,
    username: "unverifieduser",
    email: "unverified@example.com",
    emailVerified: false,
    role: "user",
    plan: "free",
    banned: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    lastSeenAt: new Date("2024-01-15"),
    usage: {
      sourceCount: 3,
      publicFeedCount: 1,
      categoryCount: 2,
      articleCount: 50,
      lastUpdated: new Date("2024-01-15"),
    },
    limits: {
      maxSources: 10,
      maxPublicFeeds: 5,
      maxCategories: 10,
      apiRateLimitPerMinute: 60,
    },
    customLimits: null,
    rateLimitEnabled: true,
  };

  const verifiedUser: AdminUser = {
    ...unverifiedUser,
    id: 12345,
    username: "verifieduser",
    email: "verified@example.com",
    emailVerified: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Resend Verification Email action for unverified users", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    expect(actionsColumn).toBeDefined();

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: unverifiedUser,
          getValue: (key: string) => unverifiedUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Check if Resend Verification Email menu item exists
    await waitFor(() => {
      expect(screen.getByText("Resend Verification Email")).toBeInTheDocument();
    });
  });

  it("does not render Resend Verification Email for verified users", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: verifiedUser,
          getValue: (key: string) => verifiedUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Check that Resend Verification Email menu item does NOT exist
    await waitFor(() => {
      expect(
        screen.queryByText("Resend Verification Email"),
      ).not.toBeInTheDocument();
    });
  });

  it("calls onResendVerificationEmail when clicked", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: unverifiedUser,
          getValue: (key: string) => unverifiedUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    // Click Resend Verification Email
    const resendButton = await screen.findByText("Resend Verification Email");
    await user.click(resendButton);

    // Verify callback was called with the user ID
    await waitFor(() => {
      expect(mockActions.onResendVerificationEmail).toHaveBeenCalledWith(54321);
    });
  });

  it("includes Mail icon in the menu item", async () => {
    const user = userEvent.setup();
    const columns = createColumns(mockActions);
    const actionsColumn = columns.find((col) => col.id === "actions");

    const ActionsCell = actionsColumn!.cell as any;
    render(
      <ActionsCell
        row={{
          original: unverifiedUser,
          getValue: (key: string) => unverifiedUser[key as keyof AdminUser],
        }}
      />,
      { wrapper: createWrapper() },
    );

    // Open the dropdown menu
    const menuButton = screen.getByRole("button", { name: /open menu/i });
    await user.click(menuButton);

    await waitFor(() => {
      // Find the Resend Verification Email menu item
      const resendItem = screen
        .getByText("Resend Verification Email")
        .closest("div");
      // Check if it contains an svg icon (lucide Mail icon)
      expect(resendItem?.querySelector("svg")).toBeInTheDocument();
    });
  });
});
