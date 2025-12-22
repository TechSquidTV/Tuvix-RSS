import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { LoginForm } from "./login-form";
import * as useAuthModule from "@/lib/hooks/useAuth";

// Mock TanStack Router Link component
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock the useLogin hook
vi.mock("@/lib/hooks/useAuth", () => ({
  useLogin: vi.fn(),
}));

describe("LoginForm", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    vi.mocked(useAuthModule.useLogin).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      status: "idle",
      variables: undefined,
      context: undefined,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      submittedAt: 0,
    } as any);
  });

  it("renders login form with username and password fields", () => {
    render(<LoginForm />);

    expect(screen.getByText("Login to your account")).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
  });

  it("shows validation errors for empty fields", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const submitButton = screen.getByRole("button", { name: /login/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("Username or email is required")
      ).toBeInTheDocument();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });

    // Should not call login mutation with empty fields
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("disables submit button while loading", () => {
    vi.mocked(useAuthModule.useLogin).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      status: "pending",
      variables: undefined,
      context: undefined,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      submittedAt: 0,
    } as any);

    render(<LoginForm />);

    const submitButton = screen.getByRole("button", { name: /logging in/i });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveTextContent("Logging in...");
  });

  it("calls login mutation with correct values on valid submission", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /^login$/i });

    await user.type(usernameInput, "testuser");
    await user.type(passwordInput, "testpassword");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        username: "testuser",
        password: "testpassword",
      });
    });
  });

  it("displays link to registration page", () => {
    render(<LoginForm />);

    const signUpLink = screen.getByRole("link", { name: /sign up/i });
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink).toHaveAttribute("href", "/register");
  });
});
