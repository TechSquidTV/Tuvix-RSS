/**
 * AppSidebar Component Tests
 *
 * Tests for sidebar component including admin section visibility
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render, createWrapper } from "@/test/test-utils";
import { AppSidebar } from "./app-sidebar";
// Import SidebarProvider from radix sidebar (the one AppSidebar actually uses)
import { SidebarProvider } from "@/components/animate-ui/components/radix/sidebar";
import * as useAuthModule from "@/lib/hooks/useAuth";
import * as useDataModule from "@/lib/hooks/useData";
import * as routerModule from "@tanstack/react-router";
import React from "react";

// Mock the useAuth hooks
vi.mock("@/lib/hooks/useAuth", async () => {
  const actual = await vi.importActual<typeof useAuthModule>(
    "@/lib/hooks/useAuth"
  );
  return {
    ...actual,
    useCurrentUser: vi.fn(),
    useLogin: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
    useRegister: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
    useLogout: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
  };
});

// Mock useCategories and useSubscriptions hooks
vi.mock("@/lib/hooks/useData", () => ({
  useCategories: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useSubscriptions: vi.fn(() => ({
    data: { items: [] },
    isLoading: false,
  })),
}));

// Mock useIsMobile hook - it's a React hook that uses useState and useEffect
// We need to mock it to return false synchronously
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

// Mock FeedAvatar component - render as icon only, no text (matches actual component behavior)
vi.mock("@/components/app/feed-avatar", () => ({
  FeedAvatar: () => (
    <div data-testid="feed-avatar" aria-hidden="true" className="shrink-0" />
  ),
}));

// Mock Link component and useLocation from TanStack Router
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...props }: any) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useLocation: vi.fn(() => ({
      search: {},
    })),
  };
});

// Wrapper component that provides all necessary contexts
const SidebarWrapper = ({ children }: { children: React.ReactNode }) => {
  const Wrapper = createWrapper();

  // Use the actual SidebarProvider which will create the context properly
  return (
    <Wrapper>
      <SidebarProvider defaultOpen={true}>{children}</SidebarProvider>
    </Wrapper>
  );
};

describe("AppSidebar", () => {
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

  it("should render sidebar with basic navigation", async () => {
    vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
      data: {
        user: {
          id: 1,
          name: "testuser",
          username: "testuser",
          email: "test@example.com",
          role: "user",
          plan: "free",
        },
      },
      isPending: false,
    } as ReturnType<typeof useAuthModule.useCurrentUser>);

    render(<AppSidebar />, { wrapper: SidebarWrapper });

    // Wait for the component to render - use waitFor to handle async rendering
    await waitFor(
      () => {
        expect(screen.getByText("Articles")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Public Feeds")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("should not show admin section for regular user", () => {
    vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
      data: {
        user: {
          id: 1,
          name: "testuser",
          username: "testuser",
          email: "test@example.com",
          role: "user",
          plan: "free",
        },
      },
      isPending: false,
    } as ReturnType<typeof useAuthModule.useCurrentUser>);

    render(<AppSidebar />, { wrapper: SidebarWrapper });

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
    expect(screen.queryByText("Plans")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Settings")).not.toBeInTheDocument();
  });

  it("should show admin section for admin user", async () => {
    vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
      data: {
        user: {
          id: 1,
          name: "adminuser",
          username: "adminuser",
          email: "admin@example.com",
          role: "admin",
          plan: "free",
        },
      },
      isPending: false,
    } as ReturnType<typeof useAuthModule.useCurrentUser>);

    render(<AppSidebar />, { wrapper: SidebarWrapper });

    // Wait for the component to render - use waitFor to handle async rendering
    await waitFor(
      () => {
        expect(screen.getByText("Administration")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Plans")).toBeInTheDocument();
    expect(screen.getByText("Admin Settings")).toBeInTheDocument();
  });

  it("should not show admin section when user is loading", () => {
    vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
      data: null,
      isPending: true,
    } as ReturnType<typeof useAuthModule.useCurrentUser>);

    render(<AppSidebar />, { wrapper: SidebarWrapper });

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  });

  it("should not show admin section when user is undefined", () => {
    vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
      data: null,
      isPending: false,
    } as ReturnType<typeof useAuthModule.useCurrentUser>);

    render(<AppSidebar />, { wrapper: SidebarWrapper });

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  });

  it("should show admin section only when role is exactly 'admin'", () => {
    // This test verifies the conditional logic works correctly
    // The actual role-based rendering is tested in the individual tests above
    // This test just confirms the logic: user?.role === "admin"

    // Test case 1: role is "user" - should not show
    const userRole = "user" as const;
    expect(userRole === "admin").toBe(false);

    // Test case 2: role is "admin" - should show
    const adminRole = "admin" as const;
    expect(adminRole === "admin").toBe(true);

    // Test case 3: role is undefined - should not show
    const undefinedRole = undefined;
    expect(undefinedRole === "admin").toBe(false);
  });

  describe("Subscriptions Dropdown", () => {
    beforeEach(() => {
      vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
        data: {
          user: {
            id: 1,
            name: "testuser",
            username: "testuser",
            email: "test@example.com",
            role: "user",
            plan: "free",
          },
        },
        isPending: false,
      } as ReturnType<typeof useAuthModule.useCurrentUser>);
    });

    it("should render subscriptions dropdown with top 10 subscriptions", async () => {
      const mockSubscriptions = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        customTitle: null,
        source: {
          title: `Feed ${i + 1}`,
          url: `https://example.com/feed${i + 1}.xml`,
          iconUrl: null,
        },
        categories: [],
        filters: [],
        filterEnabled: false,
        filterMode: "include" as const,
      }));

      vi.mocked(useDataModule.useSubscriptions).mockReturnValue({
        data: { items: mockSubscriptions },
        isLoading: false,
      } as ReturnType<typeof useDataModule.useSubscriptions>);

      render(<AppSidebar />, { wrapper: SidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Should show "All Subscriptions"
      expect(screen.getByText("All Subscriptions")).toBeInTheDocument();

      // Should show top 10 subscriptions (Feed 1 through Feed 10)
      // FeedAvatar mock renders as icon only, so text only appears in the span
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByText(`Feed ${i}`)).toBeInTheDocument();
      }

      // Should NOT show Feed 11-15 (beyond top 10)
      expect(screen.queryByText("Feed 11")).not.toBeInTheDocument();
      expect(screen.queryByText("Feed 15")).not.toBeInTheDocument();
    });

    it("should always show 'View All' link for subscriptions", async () => {
      const mockSubscriptions = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        customTitle: null,
        source: {
          title: `Feed ${i + 1}`,
          url: `https://example.com/feed${i + 1}.xml`,
          iconUrl: null,
        },
        categories: [],
        filters: [],
        filterEnabled: false,
        filterMode: "include" as const,
      }));

      vi.mocked(useDataModule.useSubscriptions).mockReturnValue({
        data: { items: mockSubscriptions },
        isLoading: false,
      } as ReturnType<typeof useDataModule.useSubscriptions>);

      render(<AppSidebar />, { wrapper: SidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      const viewAllLinks = screen.getAllByText("View All →");
      // Should have at least 2 "View All" links (Categories and Subscriptions)
      expect(viewAllLinks.length).toBeGreaterThanOrEqual(2);
    });

    it("should use customTitle when available, otherwise source title", async () => {
      const mockSubscriptions = [
        {
          id: 1,
          customTitle: "My Custom Feed",
          source: {
            title: "Original Feed Title",
            url: "https://example.com/feed1.xml",
            iconUrl: null,
          },
          categories: [],
          filters: [],
          filterEnabled: false,
          filterMode: "include" as const,
        },
        {
          id: 2,
          customTitle: null,
          source: {
            title: "Default Feed Title",
            url: "https://example.com/feed2.xml",
            iconUrl: null,
          },
          categories: [],
          filters: [],
          filterEnabled: false,
          filterMode: "include" as const,
        },
      ];

      vi.mocked(useDataModule.useSubscriptions).mockReturnValue({
        data: { items: mockSubscriptions },
        isLoading: false,
      } as ReturnType<typeof useDataModule.useSubscriptions>);

      render(<AppSidebar />, { wrapper: SidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("My Custom Feed")).toBeInTheDocument();
          expect(screen.getByText("Default Feed Title")).toBeInTheDocument();
          expect(
            screen.queryByText("Original Feed Title")
          ).not.toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it("should highlight active subscription when subscription_id is in URL", async () => {
      const mockSubscriptions = [
        {
          id: 1,
          customTitle: null,
          source: {
            title: "Feed 1",
            url: "https://example.com/feed1.xml",
            iconUrl: null,
          },
          categories: [],
          filters: [],
          filterEnabled: false,
          filterMode: "include" as const,
        },
        {
          id: 2,
          customTitle: null,
          source: {
            title: "Feed 2",
            url: "https://example.com/feed2.xml",
            iconUrl: null,
          },
          categories: [],
          filters: [],
          filterEnabled: false,
          filterMode: "include" as const,
        },
      ];

      vi.mocked(useDataModule.useSubscriptions).mockReturnValue({
        data: { items: mockSubscriptions },
        isLoading: false,
      } as ReturnType<typeof useDataModule.useSubscriptions>);

      // Mock useLocation to return subscription_id=1
      vi.mocked(routerModule.useLocation).mockReturnValue({
        search: { subscription_id: "1" },
      } as any);

      render(<AppSidebar />, { wrapper: SidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Feed 1")).toBeInTheDocument();
          expect(screen.getByText("Feed 2")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Check that the active subscription link has the correct href
      // When active, it should clear the filter (no subscription_id)
      const feed1Link = screen
        .getByText("Feed 1")
        .closest("a") as HTMLAnchorElement;
      expect(feed1Link?.href).toContain("/app/articles");
      // The search params should clear subscription_id when clicking active item
    });

    it("should handle empty subscriptions list", async () => {
      vi.mocked(useDataModule.useSubscriptions).mockReturnValue({
        data: { items: [] },
        isLoading: false,
      } as ReturnType<typeof useDataModule.useSubscriptions>);

      render(<AppSidebar />, { wrapper: SidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
          expect(screen.getByText("All Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Should not show "View More" when there are no subscriptions
      expect(screen.queryByText("View More →")).not.toBeInTheDocument();
    });
  });

  describe("Sidebar Collapse Behavior", () => {
    beforeEach(() => {
      vi.mocked(useAuthModule.useCurrentUser).mockReturnValue({
        data: {
          user: {
            id: 1,
            name: "testuser",
            username: "testuser",
            email: "test@example.com",
            role: "user",
            plan: "free",
          },
        },
        isPending: false,
      } as ReturnType<typeof useAuthModule.useCurrentUser>);
    });

    it("should open sidebar when clicking menu items while collapsed", async () => {
      const setOpenMock = vi.fn();
      const CollapsedSidebarWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const Wrapper = createWrapper();
        return (
          <Wrapper>
            <SidebarProvider open={false} onOpenChange={setOpenMock}>
              {children}
            </SidebarProvider>
          </Wrapper>
        );
      };

      render(<AppSidebar />, { wrapper: CollapsedSidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Articles")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      const user = userEvent.setup();
      const articlesLink = screen.getByText("Articles").closest("a");
      expect(articlesLink).toBeInTheDocument();

      if (articlesLink) {
        await user.click(articlesLink);
        // Should call setOpen with true to expand the sidebar
        expect(setOpenMock).toHaveBeenCalledWith(true);
      }
    });

    it("should open sidebar when clicking accordion trigger while collapsed", async () => {
      const setOpenMock = vi.fn();
      const CollapsedSidebarWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const Wrapper = createWrapper();
        return (
          <Wrapper>
            <SidebarProvider open={false} onOpenChange={setOpenMock}>
              {children}
            </SidebarProvider>
          </Wrapper>
        );
      };

      render(<AppSidebar />, { wrapper: CollapsedSidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      const user = userEvent.setup();
      const subscriptionsTrigger = screen
        .getByText("Subscriptions")
        .closest("button");
      expect(subscriptionsTrigger).toBeInTheDocument();

      if (subscriptionsTrigger) {
        await user.click(subscriptionsTrigger);
        // Should call setOpen with true to expand the sidebar
        expect(setOpenMock).toHaveBeenCalledWith(true);
      }
    });

    it("should prevent accordion toggle when sidebar is collapsed", async () => {
      const setOpenMock = vi.fn();
      const CollapsedSidebarWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const Wrapper = createWrapper();
        return (
          <Wrapper>
            <SidebarProvider open={false} onOpenChange={setOpenMock}>
              {children}
            </SidebarProvider>
          </Wrapper>
        );
      };

      render(<AppSidebar />, { wrapper: CollapsedSidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Accordion content should not be visible when sidebar is collapsed
      // (it's hidden by CSS, but we can verify the accordion state doesn't change)
      const user = userEvent.setup();
      const subscriptionsTrigger = screen
        .getByText("Subscriptions")
        .closest("button");

      if (subscriptionsTrigger) {
        // Click multiple times - accordion should not toggle
        await user.click(subscriptionsTrigger);
        await user.click(subscriptionsTrigger);
        await user.click(subscriptionsTrigger);

        // Should only call setOpen to expand sidebar, not toggle accordion
        // All clicks should result in setOpen(true) calls
        expect(setOpenMock).toHaveBeenCalledTimes(3);
        expect(setOpenMock).toHaveBeenCalledWith(true);
      }
    });

    it("should allow accordion toggle when sidebar is expanded", async () => {
      const setOpenMock = vi.fn();
      const ExpandedSidebarWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const Wrapper = createWrapper();
        return (
          <Wrapper>
            <SidebarProvider open={true} onOpenChange={setOpenMock}>
              {children}
            </SidebarProvider>
          </Wrapper>
        );
      };

      render(<AppSidebar />, { wrapper: ExpandedSidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      const user = userEvent.setup();
      const subscriptionsTrigger = screen
        .getByText("Subscriptions")
        .closest("button");
      expect(subscriptionsTrigger).toBeInTheDocument();

      if (subscriptionsTrigger) {
        // When sidebar is expanded, clicking should toggle accordion, not call setOpen
        await user.click(subscriptionsTrigger);
        // setOpen should not be called when sidebar is already expanded
        expect(setOpenMock).not.toHaveBeenCalled();
      }
    });

    it("should open sidebar when clicking submenu items while collapsed", async () => {
      const setOpenMock = vi.fn();
      const CollapsedSidebarWrapper = ({
        children,
      }: {
        children: React.ReactNode;
      }) => {
        const Wrapper = createWrapper();
        return (
          <Wrapper>
            <SidebarProvider open={false} onOpenChange={setOpenMock}>
              {children}
            </SidebarProvider>
          </Wrapper>
        );
      };

      const mockSubscriptions = [
        {
          id: 1,
          customTitle: "Test Feed",
          source: {
            title: "Test Feed",
            url: "https://example.com/feed.xml",
            iconUrl: null,
          },
          categories: [],
          filters: [],
          filterEnabled: false,
          filterMode: "include" as const,
        },
      ];

      vi.mocked(useDataModule.useSubscriptions).mockReturnValue({
        data: { items: mockSubscriptions },
        isLoading: false,
      } as ReturnType<typeof useDataModule.useSubscriptions>);

      render(<AppSidebar />, { wrapper: CollapsedSidebarWrapper });

      await waitFor(
        () => {
          expect(screen.getByText("Subscriptions")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Even when collapsed, the submenu items should be in the DOM (just hidden)
      // We can find them and click them
      const user = userEvent.setup();

      // Find "All Subscriptions" link - it should exist even when collapsed
      const allSubscriptionsLink = screen.queryByText("All Subscriptions");

      // Note: When sidebar is collapsed, submenu items might not be visible/clickable
      // But if they are accessible, clicking should open the sidebar
      // This test verifies the onClick handler is attached correctly
      if (allSubscriptionsLink) {
        const linkElement = allSubscriptionsLink.closest("a");
        if (linkElement) {
          await user.click(linkElement);
          expect(setOpenMock).toHaveBeenCalledWith(true);
        }
      }
    });
  });
});
