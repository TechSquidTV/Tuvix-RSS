import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/admin")({
  beforeLoad: async ({ context }) => {
    // Get session from router context (inherited from /app route)
    const session = context.auth.session;

    if (!session?.user) {
      throw redirect({ to: "/" });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "admin") {
      throw redirect({ to: "/app" });
    }
  },
  component: () => <Outlet />,
});
