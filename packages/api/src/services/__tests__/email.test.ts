/**
 * Email Service Tests
 *
 * Tests for email sending functionality with Resend integration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { sendPasswordResetEmail, sendWelcomeEmail } from "../email";
import type { Env } from "@/types";

// Mock Resend
vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn(),
      },
    })),
  };
});

// Mock react-email render
vi.mock("react-email", () => ({
  render: vi.fn().mockResolvedValue("<html>test</html>"),
}));

describe("Email Service", () => {
  let env: Env;

  beforeEach(() => {
    env = {
      BETTER_AUTH_SECRET: "test-secret",
      RUNTIME: "nodejs",
      RESEND_API_KEY: "re_test123",
      EMAIL_FROM: "noreply@test.com",
      BASE_URL: "https://test.com",
    } as Env;
  });

  describe("sendPasswordResetEmail", () => {
    it("should return success when email service is not configured", async () => {
      const envWithoutKey = {
        ...env,
        RESEND_API_KEY: undefined,
      } as Env;

      const result = await sendPasswordResetEmail(envWithoutKey, {
        to: "user@example.com",
        username: "testuser",
        resetToken: "token123",
        resetUrl: "https://test.com/reset?token=token123",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return success when EMAIL_FROM is not configured", async () => {
      const envWithoutFrom = {
        ...env,
        EMAIL_FROM: undefined,
      } as Env;

      const result = await sendPasswordResetEmail(envWithoutFrom, {
        to: "user@example.com",
        username: "testuser",
        resetToken: "token123",
        resetUrl: "https://test.com/reset?token=token123",
      });

      expect(result.success).toBe(true);
    });

    it("should send email when properly configured", async () => {
      const { Resend } = await import("resend");
      const mockSend = vi.fn().mockResolvedValue({
        data: { id: "email-id-123" },
        error: null,
      });

      // Mock the Resend instance
      (Resend as any).mockImplementation(() => ({
        emails: {
          send: mockSend,
        },
      }));

      const result = await sendPasswordResetEmail(env, {
        to: "user@example.com",
        username: "testuser",
        resetToken: "token123",
        resetUrl: "https://test.com/reset?token=token123",
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: env.EMAIL_FROM,
          to: "user@example.com",
          subject: "Reset Your TuvixRSS Password",
        })
      );
    });

    it("should handle Resend API errors", async () => {
      const { Resend } = await import("resend");
      const mockSend = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Invalid API key" },
      });

      (Resend as any).mockImplementation(() => ({
        emails: {
          send: mockSend,
        },
      }));

      const result = await sendPasswordResetEmail(env, {
        to: "user@example.com",
        username: "testuser",
        resetToken: "token123",
        resetUrl: "https://test.com/reset?token=token123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("should handle network errors", async () => {
      const { Resend } = await import("resend");
      const mockSend = vi.fn().mockRejectedValue(new Error("Network error"));

      (Resend as any).mockImplementation(() => ({
        emails: {
          send: mockSend,
        },
      }));

      const result = await sendPasswordResetEmail(env, {
        to: "user@example.com",
        username: "testuser",
        resetToken: "token123",
        resetUrl: "https://test.com/reset?token=token123",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("sendWelcomeEmail", () => {
    it("should return success when email service is not configured", async () => {
      const envWithoutKey = {
        ...env,
        RESEND_API_KEY: undefined,
      } as Env;

      const result = await sendWelcomeEmail(envWithoutKey, {
        to: "user@example.com",
        username: "testuser",
        appUrl: "https://test.com/app",
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should send welcome email when properly configured", async () => {
      const { Resend } = await import("resend");
      const mockSend = vi.fn().mockResolvedValue({
        data: { id: "email-id-456" },
        error: null,
      });

      (Resend as any).mockImplementation(() => ({
        emails: {
          send: mockSend,
        },
      }));

      const result = await sendWelcomeEmail(env, {
        to: "user@example.com",
        username: "testuser",
        appUrl: "https://test.com/app",
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: env.EMAIL_FROM,
          to: "user@example.com",
          subject: "Welcome to Tuvix!",
        })
      );
    });

    it("should handle errors gracefully", async () => {
      const { Resend } = await import("resend");
      const mockSend = vi
        .fn()
        .mockRejectedValue(new Error("Service unavailable"));

      (Resend as any).mockImplementation(() => ({
        emails: {
          send: mockSend,
        },
      }));

      const result = await sendWelcomeEmail(env, {
        to: "user@example.com",
        username: "testuser",
        appUrl: "https://test.com/app",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Service unavailable");
    });
  });
});
