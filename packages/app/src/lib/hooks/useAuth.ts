/**
 * Better Auth React Hooks
 *
 * All authentication operations use Better Auth client directly.
 * This ensures proper cookie handling for session management.
 */

import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as Sentry from "@sentry/react";
import { authClient } from "@/lib/auth-client";

// Hook to get current user session
// Better Auth session includes all necessary user data via customSession plugin
export const useCurrentUser = () => {
  return authClient.useSession();
};

/**
 * Navigate after successful authentication
 * Checks if email verification is required and navigates accordingly
 */
const navigateAfterAuth = async (
  router: ReturnType<typeof useRouter>
): Promise<void> => {
  try {
    console.log("[Auth] 🔄 Starting post-login navigation...");

    // Get fresh session from Better Auth
    console.log("[Auth] 📡 Fetching fresh session from API...");
    const sessionResult = await authClient.getSession();
    console.log("[Auth] ✅ Session fetch result:", {
      hasData: !!sessionResult?.data,
      hasUser: !!sessionResult?.data?.user,
      userId: sessionResult?.data?.user?.id,
      hasSession: !!sessionResult?.data?.session,
    });

    // Log cookies for debugging
    console.log("[Auth] 🍪 Current cookies:", document.cookie);

    // Invalidate router to force root beforeLoad to re-run with fresh session
    console.log("[Auth] 🔄 Invalidating router...");
    await router.invalidate({ sync: true });

    // Navigate to articles page
    // Email verification can be checked on protected routes
    console.log("[Auth] 🚀 Navigating to /app/articles...");
    await router.navigate({
      to: "/app/articles",
      search: { category_id: undefined, subscription_id: undefined },
    });
    console.log("[Auth] ✅ Navigation completed successfully");
  } catch (error) {
    console.error("[Auth] ❌ Navigation failed:", error);
    console.log("[Auth] 🔄 Falling back to hard navigation...");
    // Fallback to hard navigation
    window.location.href = "/app/articles";
  }
};

// Hook for username or email-based login
// Uses Better Auth client directly to ensure session cookies are properly set
export const useLogin = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const mutate = async (values: { username: string; password: string }) => {
    setIsPending(true);
    try {
      console.log("[Auth] 🔐 Starting login...");
      // Detect if input is email or username
      const isEmail = values.username.includes("@");
      console.log("[Auth] 📧 Login type:", isEmail ? "email" : "username");

      let result;
      if (isEmail) {
        result = await authClient.signIn.email({
          email: values.username,
          password: values.password,
        });
      } else {
        result = await authClient.signIn.username({
          username: values.username,
          password: values.password,
        });
      }

      console.log("[Auth] 📥 Login result:", {
        hasError: !!result.error,
        hasData: !!result.data,
        dataKeys: result.data ? Object.keys(result.data) : [],
      });

      if (result.error) {
        console.error("[Auth] ❌ Login error:", result.error);
        toast.error(result.error.message || "Invalid credentials");
        return;
      }

      console.log("[Auth] ✅ Login successful!");
      toast.success("Welcome back!");
      await queryClient.invalidateQueries();
      await navigateAfterAuth(router);
    } catch (error) {
      console.error("[Auth] ❌ Login exception:", error);
      toast.error((error as Error).message || "Invalid credentials");
    } finally {
      setIsPending(false);
    }
  };

  return { mutate, isPending };
};

// Hook for email-based registration with username
// Uses Better Auth client directly to ensure session cookies are properly set
export const useRegister = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const mutate = async (values: {
    username: string;
    email: string;
    password: string;
  }) => {
    setIsPending(true);
    try {
      const result = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.username,
        username: values.username,
      });

      if (result.error) {
        // Handle specific error cases
        if (
          result.error.message?.includes(
            "Registration is currently disabled"
          ) ||
          result.error.message?.includes("FORBIDDEN")
        ) {
          toast.error(
            "Registration is currently disabled. Please contact an administrator."
          );
        } else {
          toast.error(result.error.message || "Failed to create account");
        }

        // Capture registration error to Sentry with context
        // Use captureMessage for API errors (no stack trace needed) to preserve error details
        Sentry.captureMessage(result.error.message || "Registration failed", {
          tags: {
            component: "register-hook",
            operation: "signup",
            flow: "registration",
          },
          level: "error",
          extra: {
            errorCode: result.error.code,
            errorStatus: result.error.status,
          },
        });
        return;
      }

      toast.success("Account created!");
      await queryClient.invalidateQueries();
      await navigateAfterAuth(router);
    } catch (error) {
      console.error("Registration error:", error);
      toast.error((error as Error).message || "Failed to create account");

      Sentry.captureException(error, {
        tags: {
          component: "register-hook",
          operation: "signup",
          flow: "registration",
        },
        level: "error",
      });
    } finally {
      setIsPending(false);
    }
  };

  return { mutate, isPending };
};

// Hook for logout
// Uses Better Auth client directly
export const useLogout = () => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const mutate = async () => {
    setIsPending(true);
    try {
      await authClient.signOut();
      Sentry.setUser(null);
      toast.success("Logged out");
      await router.navigate({ to: "/" });
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout");
    } finally {
      setIsPending(false);
    }
  };

  return { mutate, isPending };
};

// Hook to check email verification status
// Uses Better Auth session data
// Note: requiresVerification is hardcoded to true here as a safe default.
// The actual enforcement of email verification is done on the backend via
// protected route middleware. If email verification is disabled in global settings,
// the backend will allow access regardless of this frontend value.
export const useEmailVerification = () => {
  const session = authClient.useSession();

  return {
    data: session.data
      ? {
          // Always indicate verification is required on frontend (safe default)
          // Backend enforces actual policy based on global settings
          requiresVerification: true,
          emailVerified: session.data.user?.emailVerified ?? false,
        }
      : undefined,
    isLoading: session.isPending,
    error: session.error,
  };
};
