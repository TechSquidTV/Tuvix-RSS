import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({
      to: "/app/articles",
      search: {
        category_id: undefined,
        subscription_id: undefined,
      },
    });
  },
});
