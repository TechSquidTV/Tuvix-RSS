import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useMatches,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/animate-ui/components/radix/sidebar";
import type { AppRouter } from "@tuvix/api";
import * as Sentry from "@sentry/react";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context }) => {
    // Get session from router context (already fetched in root)
    const session = context.auth.session;
    console.debug("App route beforeLoad - session from context:", session);

    // Redirect if no session
    if (!session?.user) {
      console.debug("No user in session, redirecting to /");
      throw redirect({ to: "/" });
    }
    console.debug("Session check passed, allowing navigation");

    // Skip API validation if offline - session is cached
    if (!navigator.onLine) {
      return;
    }

    // Check email verification status when online
    try {
      // Create a tRPC caller for server-side check
      // Note: In beforeLoad, we need to use the tRPC client directly
      const { createTRPCClient, httpBatchLink } = await import("@trpc/client");
      const apiUrl = import.meta.env.VITE_API_URL || "/trpc";

      const client = createTRPCClient<AppRouter>({
        links: [
          httpBatchLink({
            url: apiUrl,
            // Include cookies for authentication
            fetch: (url, options) => {
              return fetch(url, {
                ...options,
                credentials: "include",
              });
            },
          }),
        ],
      });

      const verificationStatus =
        await client.auth.checkVerificationStatus.query();

      // If verification is required but email is not verified, redirect to verification page
      if (
        verificationStatus.requiresVerification &&
        !verificationStatus.emailVerified
      ) {
        // Check if user is admin (admins bypass verification)
        const userRole = (session.user as { role?: string }).role;
        if (userRole !== "admin") {
          throw redirect({ to: "/verify-email" });
        }
      }
    } catch (error) {
      // Re-throw redirects, allow access on other errors
      if (error && typeof error === "object" && "isRedirect" in error) {
        throw error;
      }

      // Log verification check failures to Sentry
      Sentry.captureException(error, {
        tags: {
          component: "app-route",
          operation: "email-verification-check",
        },
        extra: {
          userId: session.user?.id,
          userEmail: session.user?.email,
          online: navigator.onLine,
        },
        level: "warning",
      });

      console.warn("Failed to check email verification status:", error);
    }
  },
  component: AppLayout,
  pendingComponent: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-muted-foreground">Verifying authentication...</div>
    </div>
  ),
});

function AppLayout() {
  const matches = useMatches();

  // Get the current route segments for breadcrumbs
  const breadcrumbs = matches
    .filter((match) => match.pathname !== "/")
    .map((match) => ({
      path: match.pathname,
      title: match.pathname.split("/").pop()?.replace(/-/g, " ") || "App",
    }));

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        {/* Skip to main content link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to main content
        </a>
        <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 bg-background/80 backdrop-blur-sm border-b">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  const title =
                    crumb.title.charAt(0).toUpperCase() + crumb.title.slice(1);

                  return (
                    <div key={crumb.path} className="contents">
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage>{title}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.path}>{title}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </div>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <SidebarInset>
          <main
            id="main-content"
            className="flex flex-1 flex-col gap-4 p-4 w-full max-w-full min-w-0"
          >
            <div className="[view-transition-name:main-content] w-full max-w-full min-w-0">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
