import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import * as Sentry from "@sentry/react";

import { TuvixLogo } from "@/components/app/tuvix-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/api/trpc";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/verify-email")({
  component: VerifyEmailPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || undefined,
    };
  },
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { data: user, isPending: userPending } = useCurrentUser();
  const search = useSearch({ from: "/verify-email" });
  const { data: verificationStatus, isLoading: statusLoading } =
    trpc.auth.checkVerificationStatus.useQuery(undefined, {
      retry: false,
    });

  // Check if user is admin (admins may bypass verification)
  const isAdmin = user?.role === "admin";

  // Fetch global settings to check if admin bypass is enabled
  const { data: globalSettings } = trpc.admin.getGlobalSettings.useQuery(
    undefined,
    {
      enabled: isAdmin, // Only fetch if user is admin
      retry: false,
    },
  );

  // Determine if admin bypass is allowed
  const adminBypass = globalSettings?.adminBypassEmailVerification ?? true;

  const resendMutation = trpc.auth.resendVerificationEmail.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Verification email sent!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send verification email");
    },
  });

  // Redirect if user is not logged in
  useEffect(() => {
    if (!userPending && !user) {
      navigate({ to: "/" });
    }
  }, [userPending, user, navigate]);

  // Redirect if email is already verified or verification is not required
  useEffect(() => {
    if (
      !statusLoading &&
      verificationStatus &&
      (!verificationStatus.requiresVerification ||
        verificationStatus.emailVerified)
    ) {
      navigate({ to: "/app/articles", search: { category_id: undefined } });
    }
  }, [statusLoading, verificationStatus, navigate]);

  // Handle email verification if token is provided
  useEffect(() => {
    if (search.token) {
      // Wrap email verification in Sentry span for tracking
      const verifyEmailTransaction = Sentry.startSpan(
        {
          op: "auth.verify_email",
          name: "Verify Email with Token",
        },
        async (span) => {
          try {
            // Better Auth handles verification via the URL
            // The token will be processed by Better Auth's verify-email endpoint
            await authClient.verifyEmail({
              query: {
                token: search.token,
              },
            });

            // Track success
            span.setAttribute("verification.success", true);
            span.setStatus({ code: 1, message: "ok" });

            toast.success("Email verified successfully!");
            navigate({
              to: "/app/articles",
              search: { category_id: undefined },
            });
          } catch (error) {
            // Track failure
            span.setAttribute("verification.success", false);
            span.setAttribute(
              "verification.error",
              error instanceof Error ? error.message : String(error),
            );
            span.setStatus({ code: 2, message: "error" });

            // Capture exception to Sentry
            Sentry.captureException(error, {
              tags: {
                component: "verify-email-page",
                operation: "email_verification",
                flow: "signup",
              },
              extra: {
                hasToken: !!search.token,
              },
              level: "error",
            });

            toast.error(
              error?.message ||
                "Failed to verify email. The link may have expired.",
            );
          }
        },
      );

      // Return the span (React doesn't wait for it, but Sentry will track it)
      return () => {
        // Cleanup if component unmounts during verification
        verifyEmailTransaction?.then((result) => {
          if (result) {
            // Span completed successfully
          }
        });
      };
    }
  }, [search.token, navigate]);

  // Show loading state
  if (userPending || statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-svh">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Don't render if user is not logged in or already verified
  if (!user || (verificationStatus && verificationStatus.emailVerified)) {
    return null;
  }

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
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Verify Your Email</CardTitle>
              <CardDescription>
                Please verify your email address to continue using TuvixRSS
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                We've sent a verification link to <strong>{user?.email}</strong>
                . Please check your inbox and click the link to verify your
                email address.
              </p>

              <div className="space-y-2">
                <Button
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  className="w-full"
                >
                  {resendMutation.isPending
                    ? "Sending..."
                    : "Resend Verification Email"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Didn't receive the email? Check your spam folder or click the
                  button above to resend.
                </p>
              </div>

              {/* Only show Continue button if verification not required OR (admin AND bypass enabled) */}
              {(!verificationStatus?.requiresVerification ||
                (isAdmin && adminBypass)) && (
                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => navigate({ to: "/app/articles" })}
                    className="w-full"
                  >
                    Continue to App
                  </Button>
                  {isAdmin &&
                    adminBypass &&
                    verificationStatus?.requiresVerification && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        As an admin, you can access the app without verifying
                        your email.
                      </p>
                    )}
                  {!verificationStatus?.requiresVerification && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Email verification is not required for your account.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="bg-muted relative hidden lg:flex flex-col items-center justify-center">
        <TuvixLogo className="w-96 h-72" />
        <h1 className="text-6xl font-bold text-logo-primary">TuvixRSS</h1>
      </div>
    </div>
  );
}
