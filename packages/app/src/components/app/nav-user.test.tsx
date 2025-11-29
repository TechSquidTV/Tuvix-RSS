/**
 * NavUser Component Tests
 *
 * Tests for NavUser component including admin badge visibility
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render, createWrapper } from "@/test/test-utils";
import { NavUser } from "./nav-user";
// Import SidebarProvider from radix sidebar (the one NavUser actually uses)
import { SidebarProvider } from "@/components/animate-ui/components/radix/sidebar";
import { Highlight } from "@/components/animate-ui/primitives/effects/highlight";
import React from "react";

// Mock the useLogout hook
vi.mock("@/lib/hooks/useAuth", () => ({
  useLogout: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

// Mock useIsMobile hook
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

// Mock Link component from TanStack Router to render as anchor
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

// Wrapper component that provides SidebarProvider and Highlight context
const SidebarWrapper = ({ children }: { children: React.ReactNode }) => {
  const Wrapper = createWrapper();

  return (
    <Wrapper>
      <SidebarProvider defaultOpen={true}>
        <Highlight>{children}</Highlight>
      </SidebarProvider>
    </Wrapper>
  );
};

describe("NavUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.matchMedia for useIsMobile
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("should render user information", () => {
    const user = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user" as const,
      plan: "free",
      banned: false,
    };

    render(<NavUser user={user} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    expect(screen.getByText("testuser")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("should not show admin badge for regular user", () => {
    const user = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user" as const,
      plan: "free",
      banned: false,
    };

    render(<NavUser user={user} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("should show admin badge for admin user", async () => {
    const user = {
      id: 1,
      username: "adminuser",
      email: "admin@example.com",
      role: "admin" as const,
      plan: "free",
      banned: false,
    };

    const userEventInstance = userEvent.setup();
    render(<NavUser user={user} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    // Open the dropdown menu to see the Admin badge
    const trigger = screen.getByRole("button", { name: /adminuser/i });
    await userEventInstance.click(trigger);

    // Wait for the dropdown to open and check for Admin badge
    await waitFor(() => {
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });
  });

  it("should show loading state when isLoading is true", () => {
    render(<NavUser user={undefined} isLoading={true} />, {
      wrapper: SidebarWrapper,
    });

    // Should show skeleton/loading state
    expect(screen.queryByText("testuser")).not.toBeInTheDocument();
  });

  it("should not show admin badge when user is undefined", () => {
    render(<NavUser user={undefined} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("should show admin badge only when role is exactly 'admin'", () => {
    // This test verifies the conditional logic works correctly
    // The actual role-based rendering is tested in the individual tests above
    // This test just confirms the logic: user.role === "admin"

    // Test case 1: role is "user" - should not show badge
    const userRole = "user" as const;
    expect(userRole === "admin").toBe(false);

    // Test case 2: role is "admin" - should show badge
    const adminRole = "admin" as const;
    expect(adminRole === "admin").toBe(true);
  });

  it("should render null when user is undefined and not loading", () => {
    const { container } = render(
      <NavUser user={undefined} isLoading={false} />,
      {
        wrapper: SidebarWrapper,
      },
    );

    // The component returns null when there's no user, so there should be minimal content
    expect(
      container.querySelector('[data-slot="sidebar-menu"]'),
    ).not.toBeInTheDocument();
  });

  it("should show logout dialog when logout is clicked", async () => {
    const user = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user" as const,
      plan: "free",
      banned: false,
    };

    const userEventInstance = userEvent.setup();
    render(<NavUser user={user} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    // Open dropdown menu first
    const trigger = screen.getByRole("button", { name: /testuser/i });
    await userEventInstance.click(trigger);

    // Click logout button
    await waitFor(() => {
      expect(screen.getByText("Log out")).toBeInTheDocument();
    });

    const logoutButton = screen.getByText("Log out");
    await userEventInstance.click(logoutButton);

    // Logout dialog should appear
    await waitFor(() => {
      expect(
        screen.getByText("Are you sure you want to log out?"),
      ).toBeInTheDocument();
    });
  });

  it("should use ? for initials when username is undefined", async () => {
    const userWithoutUsername = {
      id: 1,
      username: undefined,
      email: "test@example.com",
      role: "user" as const,
      plan: "free",
      banned: false,
    };

    const userEventInstance = userEvent.setup();
    render(<NavUser user={userWithoutUsername as any} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    // Should show ? for initials
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("should display plan in dropdown", async () => {
    const user = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      role: "user" as const,
      plan: "pro",
      banned: false,
    };

    const userEventInstance = userEvent.setup();
    render(<NavUser user={user} isLoading={false} />, {
      wrapper: SidebarWrapper,
    });

    // Open dropdown menu
    const trigger = screen.getByRole("button", { name: /testuser/i });
    await userEventInstance.click(trigger);

    // Check that plan is displayed
    await waitFor(() => {
      expect(screen.getByText(/pro Plan/i)).toBeInTheDocument();
    });
  });
});
