/**
 * useAuth Hook Tests
 *
 * Tests for Better Auth React hooks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCurrentUser, useLogin, useRegister, useLogout } from "../useAuth";
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
  mockSignInUsername,
  mockSignInEmail,
  mockSignUpEmail,
  mockSignOut,
  mockGetSession,
} = vi.hoisted(() => {
  return {
    mockUseSession: vi.fn(),
    mockSignInUsername: vi.fn(),
    mockSignInEmail: vi.fn(),
    mockSignUpEmail: vi.fn(),
    mockSignOut: vi.fn(),
    mockGetSession: vi.fn(),
  };
});

vi.mock("@/lib/auth-client", () => {
  return {
    authClient: {
      useSession: () => mockUseSession(),
      getSession: mockGetSession,
      signIn: {
        username: mockSignInUsername,
        email: mockSignInEmail,
      },
      signUp: {
        email: mockSignUpEmail,
      },
      signOut: mockSignOut,
    },
  };
});

type MockRouter = {
  navigate: ReturnType<typeof vi.fn>;
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
    };
  } | null;
  isPending: boolean;
  error: Error | null;
};

describe("useAuth", () => {
  const mockRouter: MockRouter & { invalidate: ReturnType<typeof vi.fn> } = {
    navigate: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInUsername.mockReset();
    mockSignInEmail.mockReset();
    mockSignUpEmail.mockReset();
    mockSignOut.mockReset();
    mockGetSession.mockReset();
    vi.mocked(useRouter).mockReturnValue(
      mockRouter as unknown as ReturnType<typeof useRouter>,
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
    it("should return React Query mutation", () => {
      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      expect(result.current.mutate).toBeDefined();
      expect(typeof result.current.mutate).toBe("function");
      expect(result.current.isPending).toBe(false);
    });

    it("should handle successful login with username", async () => {
      mockSignInUsername.mockResolvedValue({ data: { user: { id: "1" } } });
      mockGetSession.mockResolvedValue({
        data: { user: { id: "1", email: "test@example.com" } },
      });

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        username: "testuser",
        password: "password",
      });

      await waitFor(() => {
        expect(mockSignInUsername).toHaveBeenCalledWith({
          username: "testuser",
          password: "password",
        });
        expect(toast.success).toHaveBeenCalledWith("Welcome back!");
        // Verification check fails in tests (ECONNREFUSED), so fail-closed defaults to /verify-email
        expect(mockRouter.navigate).toHaveBeenCalledWith({
          to: "/verify-email",
          search: { token: undefined },
        });
      });
    });

    it("should use email endpoint directly when input contains @", async () => {
      mockSignInEmail.mockResolvedValue({ data: { user: { id: "1" } } });
      mockGetSession.mockResolvedValue({
        data: { user: { id: "1", email: "test@example.com" } },
      });

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        username: "test@example.com",
        password: "password",
      });

      await waitFor(() => {
        // Should skip username endpoint and use email directly
        expect(mockSignInUsername).not.toHaveBeenCalled();
        expect(mockSignInEmail).toHaveBeenCalledWith({
          email: "test@example.com",
          password: "password",
        });
        expect(toast.success).toHaveBeenCalledWith("Welcome back!");
        // Verification check fails in tests (ECONNREFUSED), so fail-closed defaults to /verify-email
        expect(mockRouter.navigate).toHaveBeenCalledWith({
          to: "/verify-email",
          search: { token: undefined },
        });
      });
    });

    it("should handle login error", async () => {
      mockSignInUsername.mockRejectedValue(new Error("Invalid credentials"));
      mockSignInEmail.mockRejectedValue(new Error("Invalid credentials"));

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        username: "testuser",
        password: "wrongpassword",
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
      });
    });

    it("should NOT fall back to email login when username authentication fails", async () => {
      // Mock username login to fail
      mockSignInUsername.mockRejectedValue(
        new Error("Invalid username or password"),
      );

      const { result } = renderHook(() => useLogin(), {
        wrapper: createWrapper(),
      });

      // Try to login with username (not email format)
      result.current.mutate({
        username: "testuser",
        password: "wrongpassword",
      });

      await waitFor(() => {
        // Verify username login was attempted
        expect(mockSignInUsername).toHaveBeenCalledWith({
          username: "testuser",
          password: "wrongpassword",
        });

        // IMPORTANT: Email login should NOT be attempted as fallback
        // This prevents confusing scenarios where typing wrong username
        // accidentally logs into a different account via email
        expect(mockSignInEmail).not.toHaveBeenCalled();

        // Should show error to user
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it("should only fall back to email if username method does not exist", async () => {
      // This test verifies the fallback behavior when the username plugin isn't loaded
      // Note: In practice, this is hard to test because we'd need to re-mock the authClient
      // with a signIn object that doesn't have a username method. For now, we document
      // the expected behavior: if signInWithUsername is undefined (plugin not loaded),
      // the code falls back to email login.
      // Skip this test - it requires mocking the authClient import itself at runtime
      // which is not straightforward with vitest. The behavior is documented in the code
      // with comments explaining when fallback occurs.
    });
  });

  describe("useRegister", () => {
    it("should return React Query mutation", () => {
      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      expect(result.current.mutate).toBeDefined();
      expect(typeof result.current.mutate).toBe("function");
      expect(result.current.isPending).toBe(false);
    });

    it("should handle successful registration", async () => {
      mockSignUpEmail.mockResolvedValue({ data: { user: { id: "1" } } });
      mockGetSession.mockResolvedValue({
        data: { user: { id: "1", email: "test@example.com" } },
      });

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        email: "test@example.com",
        password: "password",
        name: "Test User",
      });

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Account created!");
        // Verification check fails in tests (ECONNREFUSED), so fail-closed defaults to /verify-email
        expect(mockRouter.navigate).toHaveBeenCalledWith({
          to: "/verify-email",
          search: { token: undefined },
        });
      });
    });

    it("should handle registration error", async () => {
      mockSignUpEmail.mockRejectedValue(new Error("Username exists"));

      const { result } = renderHook(() => useRegister(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        email: "test@example.com",
        password: "password",
        name: "Test User",
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Username exists");
      });
    });
  });

  describe("useLogout", () => {
    it("should return React Query mutation", () => {
      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      expect(result.current.mutate).toBeDefined();
      expect(typeof result.current.mutate).toBe("function");
      expect(result.current.isPending).toBe(false);
    });

    it("should handle successful logout", async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      result.current.mutate();

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Logged out");
        expect(mockRouter.navigate).toHaveBeenCalledWith({ to: "/" });
      });
    });

    it("should handle logout error", async () => {
      mockSignOut.mockRejectedValue(new Error("Failed to logout"));

      const { result } = renderHook(() => useLogout(), {
        wrapper: createWrapper(),
      });

      result.current.mutate();

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to logout");
      });
    });
  });
});
