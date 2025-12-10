import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/test-utils";
import { RegisterForm } from "./register-form";
import * as useAuthModule from "@/lib/hooks/useAuth";

// Mock TanStack Router Link component
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock the useRegister hook
vi.mock("@/lib/hooks/useAuth", () => ({
  useRegister: vi.fn(),
}));

describe("RegisterForm", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    vi.mocked(useAuthModule.useRegister).mockReturnValue({
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

  it("renders registration form with all required fields", () => {
    render(<RegisterForm />);

    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("validates username format - too short", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const usernameInput = screen.getByLabelText(/username/i);
    await user.type(usernameInput, "ab");
    await user.tab(); // Trigger blur to show validation

    await waitFor(() => {
      expect(
        screen.getByText(/username must be at least 3 characters/i),
      ).toBeInTheDocument();
    });
  });

  it("validates username format - too long", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const usernameInput = screen.getByLabelText(/username/i);
    await user.type(usernameInput, "a".repeat(31));
    await user.tab(); // Trigger blur to show validation

    await waitFor(() => {
      expect(
        screen.getByText(/username must not exceed 30 characters/i),
      ).toBeInTheDocument();
    });
  });

  // Better Auth doesn't enforce character restrictions, so this test is removed

  it("validates email format", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const emailInput = screen.getByLabelText(/^email/i);
    await user.type(emailInput, "invalid-email");
    await user.tab(); // Trigger blur to show validation

    await waitFor(() => {
      expect(
        screen.getByText(/must be a valid email address/i),
      ).toBeInTheDocument();
    });
  });

  // Better Auth only requires minimum 8 characters, so complexity tests are removed

  it("enforces password complexity - too short", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    await user.type(passwordInput, "Pass1!");
    await user.tab(); // Trigger blur to show validation

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 8 characters/i),
      ).toBeInTheDocument();
    });
  });

  it("validates password confirmation match", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

    await user.type(passwordInput, "password123");
    await user.type(confirmPasswordInput, "password456");
    await user.tab(); // Trigger blur to show validation

    await waitFor(() => {
      expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
    });
  });

  it("calls register mutation on valid submission", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    const usernameInput = screen.getByLabelText(/username/i);
    const emailInput = screen.getByLabelText(/^email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });

    await user.type(usernameInput, "testuser");
    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "TestP@ssw0rd!"); // Meets all complexity requirements
    await user.type(confirmPasswordInput, "TestP@ssw0rd!");
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        name: "testuser", // Display name (Better Auth requirement)
        username: "testuser", // Username for login (username plugin)
        email: "test@example.com",
        password: "TestP@ssw0rd!",
      });
    });
  });

  it("disables submit button while loading", () => {
    vi.mocked(useAuthModule.useRegister).mockReturnValue({
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

    render(<RegisterForm />);

    const submitButton = screen.getByRole("button", {
      name: /creating account/i,
    });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveTextContent("Creating account...");
  });

  it("displays link to login page", () => {
    render(<RegisterForm />);

    const loginLink = screen.getByRole("link", { name: /login/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute("href", "/");
  });
});
