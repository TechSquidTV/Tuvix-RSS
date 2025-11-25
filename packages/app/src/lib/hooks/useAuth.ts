/**
 * Better Auth React Hooks
 *
 * Wrappers around Better Auth client hooks for use in React components.
 */

import { useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/api/trpc";

// Better Auth uses cookies, so we don't need token management
// Session is automatically handled by Better Auth via HTTP-only cookies
// Session now includes all user fields: id, username, email, role, plan, banned

// Hook to get current user session
// Better Auth session includes all necessary user data via customSession plugin
export const useCurrentUser = () => {
  return authClient.useSession({
    // Increase stale time from default 5min to 15min
    // Sessions rarely change, so longer cache is safe
    staleTime: 15 * 60 * 1000, // 15 minutes

    // Keep in cache for 30 minutes even if unused
    gcTime: 30 * 60 * 1000,

    // Don't refetch on component mount (already fetched in root)
    refetchOnMount: false,

    // Keep showing last session while refetching
    placeholderData: (prev) => prev,
  });
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
          const emailResult = await authClient.signIn.email({
            email: input.username,
            password: input.password,
          });
          if (!emailResult || (emailResult as { error?: unknown }).error) {
            throw new Error(
              (emailResult as { error?: { message?: string } })?.error
                ?.message || "Invalid email or password",
            );
          }
          return emailResult;
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? error.message
              : "Invalid email or password",
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
          const result = await signInWithUsername(input);
          // Check if the response indicates an error
          if (result && !(result as { error?: unknown }).error) {
            return result;
          }
        }
      } catch {
        // Username login failed or method doesn't exist, continue to email fallback
      }

      // Fallback to email login (input might be an email that doesn't contain @)
      // This handles edge cases where email format might be unusual
      try {
        const emailResult = await authClient.signIn.email({
          email: input.username, // Treat username field as email
          password: input.password,
        });
        if (!emailResult || (emailResult as { error?: unknown }).error) {
          throw new Error(
            (emailResult as { error?: { message?: string } })?.error?.message ||
              "Invalid username/email or password",
          );
        }
        return emailResult;
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : "Invalid username/email or password",
        );
      }
    },
    onSuccess: async () => {
      // Better Auth automatically updates session via HTTP-only cookies
      toast.success("Welcome back!");

      // Invalidate all queries to ensure fresh data (including session query)
      await queryClient.invalidateQueries();

      // Small delay to ensure cookie is set
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify session is available before navigating
      const session = await authClient.getSession();
      console.log("Session after login:", session);
      // Better Auth's getSession() returns {data: {user, session}, error: null}
      if (!session?.data?.user) {
        console.error("Session not available after login", session);
        toast.error("Session not available. Please try again.");
        return;
      }

      // Invalidate router to force beforeLoad to re-run with fresh session
      router.invalidate();

      // Navigate using router.navigate() - TanStack Router will handle the navigation
      // The beforeLoad will see the fresh session we just verified
      console.log("Attempting navigation to /app/articles");
      try {
        const result = await router.navigate({
          to: "/app/articles",
          search: { category_id: undefined, subscription_id: undefined },
        });
        console.log("Navigation result:", result);
      } catch (error) {
        console.error("Navigation error:", error);
        // Fallback to window.location if router navigation fails
        console.log("Falling back to window.location.href");
        window.location.href = "/app/articles";
      }
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

      // Small delay to ensure cookie is set
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify session is available before navigating
      const session = await authClient.getSession();
      console.log("Session after registration:", session);
      // Better Auth's getSession() returns {data: {user, session}, error: null}
      if (!session?.data?.user) {
        console.error("Session not available after registration", session);
        toast.error("Session not available. Please try again.");
        return;
      }

      // Invalidate router to force beforeLoad to re-run with fresh session
      router.invalidate();

      // Navigate using router.navigate() - TanStack Router will handle the navigation
      // The beforeLoad will see the fresh session we just verified
      console.log("Attempting navigation to /app/articles");
      try {
        const result = await router.navigate({
          to: "/app/articles",
          search: { category_id: undefined, subscription_id: undefined },
        });
        console.log("Navigation result:", result);
      } catch (error) {
        console.error("Navigation error:", error);
        // Fallback to window.location if router navigation fails
        console.log("Falling back to window.location.href");
        window.location.href = "/app/articles";
      }
    },
    onError: (error: Error) => {
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
