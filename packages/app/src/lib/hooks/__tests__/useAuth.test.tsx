/**
 * useAuth Hook Tests
 *
 * Tests for Better Auth React hooks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  useCurrentUser,
  useLogin,
  useRegister,
  useLogout,
  useEmailVerification,
} from "../useAuth";
import { createWrapper } from "@/test/test-utils";

// Mock dependencies first
vi.mock("@tanstack/react-router");
vi.mock("sonner");
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

// Create mock functions using vi.hoisted() to ensure they're available in vi.mock
const {
  mockUseSession,
  mockGetSession,
  mockSignInEmail,
  mockSignInUsername,
  mockSignUpEmail,
  mockSignOut,
} = vi.hoisted(() => {
  return {
    mockUseSession: vi.fn(),
    mockGetSession: vi.fn(),
    mockSignInEmail: vi.fn(),
    mockSignInUsername: vi.fn(),
    mockSignUpEmail: vi.fn(),
    mockSignOut: vi.fn(),
  };
});

// Mock auth-client with all Better Auth methods used by the hooks
vi.mock("@/lib/auth-client", () => {
  return {
    authClient: {
      useSession: () => mockUseSession(),
      getSession: mockGetSession,
      signIn: {
        email: mockSignInEmail,
        username: mockSignInUsername,
      },
      signUp: {
        email: mockSignUpEmail,
      },
      signOut: mockSignOut,
    },
  };
});

// Mock Sentry
vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
}));

type MockRouter = {
  navigate: ReturnType<typeof vi.fn>;
  invalidate: ReturnType<typeof vi.fn>;
};

type MockSessionResult = {
  data: {
    user: {
      id: number;
      name: string;
      email: string;
      username?: string;
      role?: string;
      plan?: string;
      emailVerified?: boolean;
    };
  } | null;
  isPending: boolean;
  error: Error | null;
};

describe("useAuth", () => {
  const mockRouter: MockRouter = {
    navigate: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInEmail.mockReset();
    mockSignInUsername.mockReset();
    mockSignUpEmail.mockReset();
    mockSignOut.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { user: { id: 1 } } });
    vi.mocked(useRouter).mockReturnValue(
      mockRouter as unknown as ReturnType<typeof useRouter>
    );
    vi.mocked(toast.success).mockImplementation(() => "1" as string | number);
    vi.mocked(toast.error).mockImplementation(() => "1" as string | number);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("useCurrentUser", () => {
    it("should return session data when session exists", () => {
      const mockSession: MockSessionResult = {
        data: {
          user: {
            id: 1,
            name: "testuser",
            email: "test@example.com",
            username: "testuser",
            role: "user",
            plan: "free",
          },
        },
        isPending: false,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toEqual({
        user: {
          id: 1,
          name: "testuser",
          email: "test@example.com",
          username: "testuser",
          role: "user",
          plan: "free",
        },
      });
      expect(result.current.isPending).toBe(false);
    });

    it("should return null when no session exists", () => {
      const mockSession: MockSessionResult = {
        data: null,
        isPending: false,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toBeNull();
      expect(result.current.isPending).toBe(false);
    });

    it("should return session with user fields including role and plan", () => {
      const mockSession: MockSessionResult = {
        data: {
          user: {
            id: 1,
            name: "testuser",
            email: "test@example.com",
            username: "testuser",
            role: "user",
            plan: "free",
          },
        },
        isPending: false,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toEqual({
        user: {
          id: 1,
          name: "testuser",
          email: "test@example.com",
          username: "testuser",
          role: "user",
          plan: "free",
        },
      });
    });
  });

  describe("useLogin", () => {
    it("should return mutate function and isPending state", () => {
      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      expect(result.current.mutate).toBeDefined();
      expect(typeof result.current.mutate).toBe("function");
      expect(result.current.isPending).toBe(false);
    });

    it("should handle successful login with username", async () => {
      mockSignInUsername.mockResolvedValue({
        data: { user: { id: 1 } },
        error: null,
      });

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "testuser",
          password: "password",
        });
      });

      expect(mockSignInUsername).toHaveBeenCalledWith({
        username: "testuser",
        password: "password",
      });
      expect(toast.success).toHaveBeenCalledWith("Welcome back!");
      expect(mockRouter.navigate).toHaveBeenCalledWith({
        to: "/app/articles",
        search: { category_id: undefined, subscription_id: undefined },
      });
    });

    it("should handle successful login with email", async () => {
      mockSignInEmail.mockResolvedValue({
        data: { user: { id: 1 } },
        error: null,
      });

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "test@example.com",
          password: "password",
        });
      });

      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password",
      });
      expect(toast.success).toHaveBeenCalledWith("Welcome back!");
    });

    it("should set isPending to true during login and false after", async () => {
      let resolveLogin: (value: unknown) => void;
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve;
      });
      mockSignInUsername.mockReturnValue(loginPromise);

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);

      // Start the login
      let mutatePromise: Promise<void>;
      act(() => {
        mutatePromise = result.current.mutate({
          username: "testuser",
          password: "password",
        });
      });

      // isPending should be true while waiting
      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      // Resolve the login
      await act(async () => {
        resolveLogin!({ data: { user: { id: 1 } }, error: null });
        await mutatePromise;
      });

      // isPending should be false after completion
      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });

    it("should handle login error from Better Auth", async () => {
      mockSignInUsername.mockResolvedValue({
        data: null,
        error: { message: "Invalid credentials" },
      });

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "testuser",
          password: "wrongpassword",
        });
      });

      expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it("should handle login exception", async () => {
      mockSignInUsername.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "testuser",
          password: "password",
        });
      });

      expect(toast.error).toHaveBeenCalledWith("Network error");
    });

    it("should detect email vs username based on @ symbol", async () => {
      mockSignInEmail.mockResolvedValue({
        data: { user: { id: 1 } },
        error: null,
      });
      mockSignInUsername.mockResolvedValue({
        data: { user: { id: 1 } },
        error: null,
      });

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      // With @ - should use email
      await act(async () => {
        await result.current.mutate({
          username: "user@example.com",
          password: "password",
        });
      });
      expect(mockSignInEmail).toHaveBeenCalled();
      expect(mockSignInUsername).not.toHaveBeenCalled();

      vi.clearAllMocks();
      mockGetSession.mockResolvedValue({ data: { user: { id: 1 } } });

      // Without @ - should use username
      await act(async () => {
        await result.current.mutate({
          username: "testuser",
          password: "password",
        });
      });
      expect(mockSignInUsername).toHaveBeenCalled();
      expect(mockSignInEmail).not.toHaveBeenCalled();
    });
  });

  describe("useRegister", () => {
    it("should return mutate function and isPending state", () => {
      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      expect(result.current.mutate).toBeDefined();
      expect(typeof result.current.mutate).toBe("function");
      expect(result.current.isPending).toBe(false);
    });

    it("should handle successful registration", async () => {
      mockSignUpEmail.mockResolvedValue({
        data: { user: { id: 1 } },
        error: null,
      });

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "newuser",
          email: "new@example.com",
          password: "password",
        });
      });

      expect(mockSignUpEmail).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "password",
        name: "newuser",
        username: "newuser",
      });
      expect(toast.success).toHaveBeenCalledWith("Account created!");
      expect(mockRouter.navigate).toHaveBeenCalledWith({
        to: "/app/articles",
        search: { category_id: undefined, subscription_id: undefined },
      });
    });

    it("should set isPending during registration", async () => {
      let resolveRegister: (value: unknown) => void;
      const registerPromise = new Promise((resolve) => {
        resolveRegister = resolve;
      });
      mockSignUpEmail.mockReturnValue(registerPromise);

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);

      let mutatePromise: Promise<void>;
      act(() => {
        mutatePromise = result.current.mutate({
          username: "newuser",
          email: "new@example.com",
          password: "password",
        });
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      await act(async () => {
        resolveRegister!({ data: { user: { id: 1 } }, error: null });
        await mutatePromise;
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });

    it("should handle registration error and capture to Sentry via captureMessage", async () => {
      const Sentry = await import("@sentry/react");
      mockSignUpEmail.mockResolvedValue({
        data: null,
        error: { message: "Email already exists", code: "USER_EXISTS" },
      });

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "newuser",
          email: "existing@example.com",
          password: "password",
        });
      });

      expect(toast.error).toHaveBeenCalledWith("Email already exists");
      // API errors use captureMessage (not captureException) to preserve error details
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Email already exists",
        expect.objectContaining({
          tags: expect.objectContaining({
            component: "register-hook",
            operation: "signup",
            flow: "registration",
          }),
          level: "error",
        })
      );
    });

    it("should handle registration disabled error", async () => {
      mockSignUpEmail.mockResolvedValue({
        data: null,
        error: { message: "Registration is currently disabled" },
      });

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "newuser",
          email: "new@example.com",
          password: "password",
        });
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Registration is currently disabled. Please contact an administrator."
      );
    });

    it("should handle registration exception and capture to Sentry", async () => {
      const Sentry = await import("@sentry/react");
      mockSignUpEmail.mockRejectedValue(new Error("Network connection failed"));

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "newuser",
          email: "new@example.com",
          password: "password",
        });
      });

      expect(toast.error).toHaveBeenCalledWith("Network connection failed");
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({
            flow: "registration",
          }),
          level: "error",
        })
      );
    });

    it("should handle FORBIDDEN error message", async () => {
      mockSignUpEmail.mockResolvedValue({
        data: null,
        error: { message: "FORBIDDEN: Cannot register" },
      });

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate({
          username: "newuser",
          email: "new@example.com",
          password: "password",
        });
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Registration is currently disabled. Please contact an administrator."
      );
    });
  });

  describe("useLogout", () => {
    it("should return mutate function and isPending state", () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      expect(result.current.mutate).toBeDefined();
      expect(typeof result.current.mutate).toBe("function");
      expect(result.current.isPending).toBe(false);
    });

    it("should handle successful logout", async () => {
      mockSignOut.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate();
      });

      expect(mockSignOut).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Logged out");
      expect(mockRouter.navigate).toHaveBeenCalledWith({ to: "/" });
    });

    it("should set isPending during logout", async () => {
      let resolveLogout: (value: unknown) => void;
      const logoutPromise = new Promise((resolve) => {
        resolveLogout = resolve;
      });
      mockSignOut.mockReturnValue(logoutPromise);

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isPending).toBe(false);

      let mutatePromise: Promise<void>;
      act(() => {
        mutatePromise = result.current.mutate();
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(true);
      });

      await act(async () => {
        resolveLogout!({ error: null });
        await mutatePromise;
      });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
    });

    it("should handle logout error", async () => {
      mockSignOut.mockRejectedValue(new Error("Logout failed"));

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.mutate();
      });

      expect(toast.error).toHaveBeenCalledWith("Failed to logout");
    });
  });

  describe("useEmailVerification", () => {
    it("should return verification data when session exists with verified email", () => {
      const mockSession: MockSessionResult = {
        data: {
          user: {
            id: 1,
            name: "testuser",
            email: "test@example.com",
            emailVerified: true,
          },
        },
        isPending: false,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useEmailVerification(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toEqual({
        requiresVerification: true,
        emailVerified: true,
      });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should return verification data when session exists with unverified email", () => {
      const mockSession: MockSessionResult = {
        data: {
          user: {
            id: 1,
            name: "testuser",
            email: "test@example.com",
            emailVerified: false,
          },
        },
        isPending: false,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useEmailVerification(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toEqual({
        requiresVerification: true,
        emailVerified: false,
      });
    });

    it("should return undefined data when no session exists", () => {
      const mockSession: MockSessionResult = {
        data: null,
        isPending: false,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useEmailVerification(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
    });

    it("should return loading state when session is pending", () => {
      const mockSession: MockSessionResult = {
        data: null,
        isPending: true,
        error: null,
      };
      mockUseSession.mockReturnValue(mockSession);

      const { result } = renderHook(() => useEmailVerification(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it("should return error when session has error", () => {
      const testError = new Error("Session error");
      mockUseSession.mockReturnValue({
        data: null,
        isPending: false,
        error: testError,
      });

      const { result } = renderHook(() => useEmailVerification(), {
        wrapper: createWrapper(),
      });

      expect(result.current.error).toBe(testError);
    });

    it("should default emailVerified to false when user field is undefined", () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: 1,
            name: "testuser",
            email: "test@example.com",
            // emailVerified is undefined
          },
        },
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useEmailVerification(), {
        wrapper: createWrapper(),
      });

      expect(result.current.data).toEqual({
        requiresVerification: true,
        emailVerified: false,
      });
    });
  });
});
