import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { TuvixLogo } from "@/components/app/tuvix-logo";
import { RegisterForm } from "@/components/app/register-form";
import { useCurrentUser } from "@/lib/hooks/useAuth";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const { data: user, isPending } = useCurrentUser();

  // Redirect to app if user is already logged in
  useEffect(() => {
    if (!isPending && user) {
      navigate({
        to: "/app/articles",
        search: { category_id: undefined, subscription_id: undefined },
      });
    }
  }, [isPending, user, navigate]);

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <TuvixLogo className="size-4" />
            </div>
            TuvixRSS
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <RegisterForm />
          </div>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:flex flex-col items-center justify-center">
        <TuvixLogo className="w-96 h-72" />
        <h1 className="text-6xl font-bold text-logo-primary">TuvixRSS</h1>
        <p className="text-lg text-muted-foreground"></p>
      </div>
    </div>
  );
}
