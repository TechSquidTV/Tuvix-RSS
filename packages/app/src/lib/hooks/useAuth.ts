/**
 * Better Auth React Hooks
 *
 * Wrappers around Better Auth client hooks for use in React components.
 */

import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { toast } from "sonner";
import * as Sentry from "@sentry/react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/api/trpc";
import type { AppRouter } from "@tuvixrss/api";

// Better Auth uses cookies, so we don't need token management
// Session is automatically handled by Better Auth via HTTP-only cookies
// Session now includes all user fields: id, username, email, role, plan, banned

type VerificationStatus = {
  requiresVerification: boolean;
  emailVerified: boolean;
};

/**
 * Check email verification status and navigate accordingly
 * Shared logic extracted from useLogin and useRegister
 * SECURITY: Fails closed - defaults to verification page if check fails
 */
const checkVerificationAndNavigate = async (
  router: ReturnType<typeof useRouter>,
): Promise<void> => {
  let verificationStatus: VerificationStatus | null = null;

  try {
    const apiUrl = import.meta.env.VITE_API_URL || "/trpc";

    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: apiUrl,
          fetch: (url, options) => {
            return fetch(url, {
              ...options,
              credentials: "include",
              headers: {
                ...options?.headers, // Preserve Sentry trace headers
              },
            });
          },
        }),
      ],
    });

    verificationStatus = await client.auth.checkVerificationStatus.query();
  } catch (error) {
    // Don't log TanStack Router redirects as errors (they're not errors)
    const isRedirect =
      error && typeof error === "object" && "isRedirect" in error;
    if (!isRedirect) {
      console.error("Failed to check email verification status:", error);
    }
    // SECURITY: Fail closed - if we can't check verification status,
    // default to requiring verification to be safe
    console.warn("Defaulting to verification page due to status check failure");
  }

  // Invalidate router to force root beforeLoad to re-run with fresh session cookie
  // This is necessary because the root route's context was set before login
  // The { sync: true } ensures invalidation completes before navigation
  // Note: This triggers one getSession() call in root beforeLoad - this is intentional
  await router.invalidate({ sync: true });

  // Navigate based on verification status
  // If check failed (null), default to /verify-email for safety
  if (
    !verificationStatus ||
    (verificationStatus.requiresVerification &&
      !verificationStatus.emailVerified)
  ) {
    console.log("Email verification required, navigating to /verify-email");
    try {
      await router.navigate({
        to: "/verify-email",
        search: { token: undefined },
      });
    } catch (navError) {
      console.error("Navigation to /verify-email failed:", navError);
      window.location.href = "/verify-email";
    }
  } else {
    console.log("Attempting navigation to /app/articles");
    try {
      await router.navigate({
        to: "/app/articles",
        search: { category_id: undefined, subscription_id: undefined },
      });
    } catch (navError) {
      console.error("Navigation to /app/articles failed:", navError);
      window.location.href = "/app/articles";
    }
  }
};

// Hook to get current user session
// Better Auth session includes all necessary user data via customSession plugin
// Note: Better Auth's useSession hook doesn't accept options - caching is configured at the QueryClient level
export const useCurrentUser = () => {
  return authClient.useSession();
};

// Hook for username or email-based login
// Backend automatically detects @ symbol and routes to appropriate Better Auth method
export const useLogin = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const signIn = trpc.auth.login.useMutation({
    onSuccess: async () => {
      // Better Auth automatically updates session via HTTP-only cookies
      // and nanostore is updated automatically - no need to manually verify
      toast.success("Welcome back!");

      // Invalidate all queries to ensure fresh data
      await queryClient.invalidateQueries();

      // Check verification status and navigate accordingly
      // Session cookie is already set by Better Auth
      await checkVerificationAndNavigate(router);
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      toast.error(error.message || "Invalid credentials");
    },
  });

  return signIn;
};

// Hook for email-based registration with username
export const useRegister = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const signUp = trpc.auth.register.useMutation({
    onSuccess: async () => {
      // Better Auth automatically updates session via HTTP-only cookies
      // and nanostore is updated automatically - no need to manually verify
      toast.success("Account created!");

      // Invalidate all queries to ensure fresh data
      await queryClient.invalidateQueries();

      // Check verification status and navigate accordingly
      // Session cookie is already set by Better Auth
      await checkVerificationAndNavigate(router);
    },
    onError: (error: Error) => {
      // Capture registration errors to Sentry
      Sentry.captureException(error, {
        tags: {
          component: "register-hook",
          operation: "signup",
          flow: "registration",
        },
        extra: {
          errorMessage: error.message,
          errorName: error.name,
        },
        level: "error",
      });

      // Handle specific error cases
      if (
        error.message.includes("Registration is currently disabled") ||
        error.message.includes("FORBIDDEN")
      ) {
        toast.error(
          "Registration is currently disabled. Please contact an administrator.",
        );
      } else {
        toast.error(error.message || "Failed to create account");
      }
    },
  });

  return signUp;
};

// Hook for logout
export const useLogout = () => {
  const router = useRouter();

  const signOut = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      // Better Auth automatically clears session cookie
      // Clear Sentry user context
      Sentry.setUser(null);
      toast.success("Logged out");
      await router.navigate({ to: "/" });
    },
    onError: () => {
      toast.error("Failed to logout");
    },
  });

  return signOut;
};

// Hook to check email verification status
export const useEmailVerification = () => {
  return trpc.auth.checkVerificationStatus.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
};
