/**
 * Better Auth React Hooks
 *
 * Wrappers around Better Auth client hooks for use in React components.
 */

import { useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { toast } from "sonner";
import * as Sentry from "@sentry/react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/api/trpc";
import type { AppRouter } from "@tuvix/api";

// Better Auth uses cookies, so we don't need token management
// Session is automatically handled by Better Auth via HTTP-only cookies
// Session now includes all user fields: id, username, email, role, plan, banned

// Types for Better Auth responses
type AuthResult = {
  user?: unknown;
  error?: {
    message?: string;
  };
};

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

  // Invalidate router to force beforeLoad to re-run with fresh session
  // Await with { sync: true } to ensure invalidation completes before navigation
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

// Simple email detection - checks if input contains @ symbol
// Better Auth username validation only allows alphanumeric + dots/underscores
// So if input contains @, it's definitely an email, not a username
const isEmail = (input: string): boolean => {
  return input.includes("@");
};

// Hook for username or email-based login
// Detects if input is email and uses appropriate endpoint
// Tries username first for non-email inputs, falls back to email if username fails
export const useLogin = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const signIn = useMutation({
    mutationFn: async (input: { username: string; password: string }) => {
      // If input looks like an email, skip username attempt and use email endpoint directly
      // This prevents 422 validation errors when users enter their email address
      if (isEmail(input.username)) {
        try {
          const emailResult = (await authClient.signIn.email({
            email: input.username,
            password: input.password,
          })) as AuthResult;
          if (!emailResult || emailResult.error) {
            throw new Error(
              emailResult.error?.message || "Invalid credentials",
            );
          }
          return emailResult;
        } catch (error) {
          throw new Error(
            error instanceof Error ? error.message : "Invalid credentials",
          );
        }
      }

      // For non-email inputs, try username login first
      // Username plugin adds this method at runtime
      // TypeScript doesn't know about username method, but it exists at runtime
      try {
        const signInWithUsername = (
          authClient.signIn as typeof authClient.signIn & {
            username?: (input: {
              username: string;
              password: string;
            }) => Promise<unknown>;
          }
        ).username;
        if (signInWithUsername) {
          const result = (await signInWithUsername(input)) as AuthResult;
          // Check if the response indicates an error
          if (result && !result.error) {
            return result;
          }
        }
      } catch {
        // Username login failed or method doesn't exist, continue to email fallback
      }

      // Fallback to email login (input might be an email that doesn't contain @)
      // This handles edge cases where email format might be unusual
      try {
        const emailResult = (await authClient.signIn.email({
          email: input.username, // Treat username field as email
          password: input.password,
        })) as AuthResult;
        if (!emailResult || emailResult.error) {
          throw new Error(emailResult.error?.message || "Invalid credentials");
        }
        return emailResult;
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Invalid credentials",
        );
      }
    },
    onSuccess: async () => {
      // Better Auth automatically updates session via HTTP-only cookies
      toast.success("Welcome back!");

      // Invalidate all queries to ensure fresh data (including session query)
      await queryClient.invalidateQueries();

      // Better Auth sets session cookie synchronously, no polling needed
      const session = await authClient.getSession();
      console.log("Session after login:", session);

      if (!session?.data?.user) {
        console.error("Session not available after login", session);

        // Clear any stale cookies
        try {
          await authClient.signOut();
        } catch (error) {
          // Ignore signout errors - session is already broken
          console.warn("Failed to sign out broken session:", error);
        }

        // Show helpful error message with recovery instructions
        toast.error("Session error. Please try logging in again.", {
          description:
            "If this persists, clear your browser cookies and try again.",
          duration: 5000,
        });

        // Redirect to login page for clean retry
        await router.navigate({ to: "/" });
        return;
      }

      // Check verification status and navigate accordingly
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

  const signUp = useMutation({
    mutationFn: (input: { email: string; password: string; name: string }) =>
      authClient.signUp.email(input),
    onSuccess: async () => {
      // Better Auth automatically updates session via HTTP-only cookies
      toast.success("Account created!");

      // Invalidate all queries to ensure fresh data (including session query)
      await queryClient.invalidateQueries();

      // Better Auth sets session cookie synchronously, no polling needed
      const session = await authClient.getSession();
      console.log("Session after registration:", session);

      if (!session?.data?.user) {
        console.error("Session not available after registration", session);

        // Clear any stale cookies
        try {
          await authClient.signOut();
        } catch (error) {
          // Ignore signout errors - session is already broken
          console.warn("Failed to sign out broken session:", error);
        }

        // Show helpful error message with recovery instructions
        toast.error("Session error. Please try registering again.", {
          description:
            "If this persists, clear your browser cookies and try again.",
          duration: 5000,
        });

        // Redirect to register page for clean retry
        await router.navigate({ to: "/register" });
        return;
      }

      // Check verification status and navigate accordingly
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

  const signOut = useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: async () => {
      // Better Auth automatically clears session cookie
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
