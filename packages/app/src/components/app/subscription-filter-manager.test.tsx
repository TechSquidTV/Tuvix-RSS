import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { SubscriptionFilterManager } from "./subscription-filter-manager";
import * as useDataModule from "@/lib/hooks/useData";

// Mock the hooks
vi.mock("@/lib/hooks/useData");

describe("SubscriptionFilterManager", () => {
  const mockCreateFilter = vi.fn();
  const mockUpdateFilter = vi.fn();
  const mockDeleteFilter = vi.fn();
  const mockUpdateSubscription = vi.fn();

  const mockFilters = [
    {
      id: 1,
      subscriptionId: 1,
      field: "title",
      matchType: "contains",
      pattern: "test",
      caseSensitive: false,
    },
    {
      id: 2,
      subscriptionId: 1,
      field: "author",
      matchType: "exact",
      pattern: "John Doe",
      caseSensitive: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock subscription filter hooks
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);

    vi.mocked(useDataModule.useCreateSubscriptionFilter).mockReturnValue({
      mutate: mockCreateFilter,
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as any);

    vi.mocked(useDataModule.useUpdateSubscriptionFilter).mockReturnValue({
      mutate: mockUpdateFilter,
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as any);

    vi.mocked(useDataModule.useDeleteSubscriptionFilter).mockReturnValue({
      mutate: mockDeleteFilter,
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    } as any);

    vi.mocked(useDataModule.useUpdateSubscription).mockReturnValue({
      mutate: mockUpdateSubscription,
      isPending: false,
    } as any);
  });

  it("renders with filter toggle and initial collapsed state", () => {
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    expect(screen.getByText(/content filters/i)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByText(/off/i)).toBeInTheDocument();
  });

  it("toggles filter enabled/disabled", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    const toggle = screen.getByRole("switch");
    await user.click(toggle);

    await waitFor(() => {
      expect(mockUpdateSubscription).toHaveBeenCalledWith({
        id: 1,
        filterEnabled: true,
      });
    });
  });

  it("expands/collapses filter section", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Initially collapsed - no Add Filter button visible
    expect(
      screen.queryByRole("button", { name: /add filter/i })
    ).not.toBeInTheDocument();

    // Click to expand
    const expandButton = screen.getByRole("button", {
      name: /content filters/i,
    });
    await user.click(expandButton);

    // Now the content should be visible
    await waitFor(() => {
      expect(
        screen.getByText(/filter articles from this feed/i)
      ).toBeInTheDocument();
    });
  });

  it("displays existing filters", () => {
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: mockFilters,
      isLoading: false,
    } as any);

    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={true}
        filterMode="include"
      />
    );

    // Should show filter count in header
    expect(screen.getByText(/content filters \(2\)/i)).toBeInTheDocument();
  });

  it("shows empty state when no filters exist", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand the section
    await user.click(screen.getByRole("button", { name: /content filters/i }));

    await waitFor(() => {
      expect(screen.getByText(/no filters configured/i)).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching filters", async () => {
    const user = userEvent.setup();
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: [],
      isLoading: true,
    } as any);

    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand the section
    await user.click(screen.getByRole("button", { name: /content filters/i }));

    // Should show skeleton loaders
    await waitFor(() => {
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it("creates new filter with validation", async () => {
    const user = userEvent.setup();
    const mockMutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useDataModule.useCreateSubscriptionFilter).mockReturnValue({
      mutate: mockCreateFilter,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);

    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand and open add form
    await user.click(screen.getByRole("button", { name: /content filters/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add filter/i }));
    });
    await user.click(screen.getByRole("button", { name: /add filter/i }));

    // Fill in the form
    const patternInput = screen.getByPlaceholderText(/enter pattern to match/i);
    await user.type(patternInput, "test pattern");

    // Submit
    const createButton = screen.getByRole("button", { name: /create filter/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        subscriptionId: 1,
        field: "title",
        matchType: "contains",
        pattern: "test pattern",
        caseSensitive: false,
      });
    });
  });

  it("validates regex patterns", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand and open add form
    await user.click(screen.getByRole("button", { name: /content filters/i }));
    await user.click(screen.getByRole("button", { name: /add filter/i }));

    // Change match type to regex - find the select by its text content context
    const matchTypeSelects = screen.getAllByRole("combobox");
    const matchTypeSelect = matchTypeSelects.find((select) =>
      select.querySelector('option[value="regex"]')
    );
    expect(matchTypeSelect).toBeDefined();
    await user.selectOptions(matchTypeSelect!, "regex");

    // Enter invalid regex
    const patternInput = screen.getByPlaceholderText(/enter pattern to match/i);
    await user.type(patternInput, "(invalid");

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/invalid regex/i)).toBeInTheDocument();
    });

    // Create button should be disabled
    const createButton = screen.getByRole("button", { name: /create filter/i });
    expect(createButton).toBeDisabled();
  });

  it("edits existing filter", async () => {
    const user = userEvent.setup();
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: mockFilters,
      isLoading: false,
    } as any);

    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand the section
    await user.click(screen.getByRole("button", { name: /content filters/i }));

    // Wait for filters to be displayed
    await waitFor(() => {
      expect(screen.getByText("test")).toBeInTheDocument();
    });

    // Click edit button on first filter
    const editButtons = screen.getAllByTitle(/edit filter/i);
    await user.click(editButtons[0]);

    // Should show edit form
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /update/i })
      ).toBeInTheDocument();
    });
  });

  it("deletes filter", async () => {
    const user = userEvent.setup();
    const mockMutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: mockFilters,
      isLoading: false,
    } as any);
    vi.mocked(useDataModule.useDeleteSubscriptionFilter).mockReturnValue({
      mutate: mockDeleteFilter,
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);

    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand the section
    await user.click(screen.getByRole("button", { name: /content filters/i }));

    // Wait for filters to be displayed
    await waitFor(() => {
      expect(screen.getByText("test")).toBeInTheDocument();
    });

    // Click delete button on first filter
    const deleteButtons = screen.getAllByTitle(/delete filter/i);
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(1);
    });
  });

  it("switches between include/exclude modes", async () => {
    const user = userEvent.setup();
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: mockFilters,
      isLoading: false,
    } as any);

    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={true}
        filterMode="include"
      />
    );

    // Expand the section
    await user.click(screen.getByRole("button", { name: /content filters/i }));

    // Find and change the mode selector
    await waitFor(() => {
      expect(screen.getByText(/mode:/i)).toBeInTheDocument();
    });

    const modeSelect = screen.getByDisplayValue(/include/i);
    await user.selectOptions(modeSelect, "exclude");

    await waitFor(() => {
      expect(mockUpdateSubscription).toHaveBeenCalledWith({
        id: 1,
        filterMode: "exclude",
      });
    });
  });

  it("displays filter mode selector only when filters exist and enabled", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand the section
    await user.click(screen.getByRole("button", { name: /content filters/i }));

    // Mode selector should not be visible (no filters or not enabled)
    await waitFor(() => {
      expect(screen.queryByText(/mode:/i)).not.toBeInTheDocument();
    });

    // Re-render with filters and enabled
    vi.mocked(useDataModule.useSubscriptionFilters).mockReturnValue({
      data: mockFilters,
      isLoading: false,
    } as any);

    rerender(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={true}
        filterMode="include"
      />
    );

    // Now mode selector should be visible
    await waitFor(() => {
      expect(screen.getByText(/mode:/i)).toBeInTheDocument();
    });
  });

  it("validates empty pattern", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand and open add form
    await user.click(screen.getByRole("button", { name: /content filters/i }));
    await user.click(screen.getByRole("button", { name: /add filter/i }));

    // Try to submit without entering a pattern
    const createButton = screen.getByRole("button", { name: /create filter/i });
    await user.click(createButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/pattern is required/i)).toBeInTheDocument();
    });
  });

  it("cancels filter creation", async () => {
    const user = userEvent.setup();
    render(
      <SubscriptionFilterManager
        subscriptionId={1}
        filterEnabled={false}
        filterMode="include"
      />
    );

    // Expand and open add form
    await user.click(screen.getByRole("button", { name: /content filters/i }));
    await user.click(screen.getByRole("button", { name: /add filter/i }));

    // Enter some data
    const patternInput = screen.getByPlaceholderText(/enter pattern to match/i);
    await user.type(patternInput, "test");

    // Cancel
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelButton);

    // Form should be closed
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/enter pattern to match/i)
      ).not.toBeInTheDocument();
    });

    // Add Filter button should be visible again
    expect(
      screen.getByRole("button", { name: /add filter/i })
    ).toBeInTheDocument();
  });
});
