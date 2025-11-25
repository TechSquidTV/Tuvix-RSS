/**
 * Email Service
 *
 * Handles sending transactional emails via Resend.
 * Supports both Node.js and Cloudflare Workers environments.
 *
 * Features:
 * - Email verification emails
 * - Password reset emails
 * - Welcome emails
 * - Graceful fallback when API key is missing (dev mode)
 * - Comprehensive error handling and logging
 */

import { Resend } from "resend";
import type { Env } from "@/types";
import {
  PasswordResetEmail,
  WelcomeEmail,
  VerificationEmail,
} from "./email-templates";
import type React from "react";
import * as Sentry from "@/utils/sentry";

// ============================================================================
// TYPES
// ============================================================================

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export interface VerificationEmailParams {
  to: string;
  username: string;
  verificationToken: string;
  verificationUrl: string;
}

export interface PasswordResetEmailParams {
  to: string;
  username: string;
  resetToken: string;
  resetUrl: string;
}

export interface WelcomeEmailParams {
  to: string;
  username: string;
  appUrl: string;
}

type EmailType = "verification" | "password-reset" | "welcome";

interface SendEmailOptions {
  env: Env;
  to: string;
  subject: string;
  template: React.ReactElement;
  type: EmailType;
  details: Record<string, unknown>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if email service is configured
 */
function isEmailConfigured(env: Env): boolean {
  return !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
}

/**
 * Log email attempt (for development when API key is missing)
 */
function logEmailAttempt(
  type: EmailType,
  to: string,
  details: Record<string, unknown>
): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(`📧 Email (${type}) would be sent to: ${to}`);
    console.log(`   Details:`, JSON.stringify(details, null, 2));
    console.log(
      `   ⚠️  Configure RESEND_API_KEY and EMAIL_FROM to send emails`
    );
  }
}

/**
 * Shared email sending logic
 * Handles configuration check, Resend client initialization, sending, and error handling
 */
async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { env, to, subject, template, type, details } = options;

  // Check if email service is configured
  if (!isEmailConfigured(env)) {
    logEmailAttempt(type, to, details);
    return { success: true }; // Return success in dev mode
  }

  // Wrap email sending in Sentry span for observability
  const sendEmailWithSentry = async (): Promise<SendEmailResult> => {
    try {
      // Initialize Resend client
      const resend = new Resend(env.RESEND_API_KEY);

      // Send email via Resend (using React Email component directly)
      const { data, error } = await resend.emails.send({
        from: env.EMAIL_FROM!,
        to,
        subject,
        react: template,
      });

      if (error) {
        const errorMessage = `Failed to send ${type} email: ${error.message || "Unknown error"}`;
        console.error(errorMessage, {
          type,
          to,
          error: error,
          errorCode: (error as { code?: string })?.code,
          errorStatus: (error as { status?: number })?.status,
        });

        // Log to Sentry if available (using runtime-agnostic wrapper)
        if (env.SENTRY_DSN) {
          await Sentry.captureException(
            new Error(errorMessage),
            {
              tags: {
                "email.type": type,
                "email.status": "error",
              },
              extra: {
                recipient: to,
                errorCode: (error as { code?: string })?.code,
                errorStatus: (error as { status?: number })?.status,
              },
            }
          );
        }

        return {
          success: false,
          error: error.message || "Failed to send email",
        };
      }

      // Log success (in development)
      if (process.env.NODE_ENV !== "production") {
        console.log(`✅ ${type} email sent to ${to} (ID: ${data?.id})`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error(`Error sending ${type} email:`, {
        errorMessage,
        errorStack,
        type,
        to,
        error,
      });

      // Log to Sentry if available (using runtime-agnostic wrapper)
      if (env.SENTRY_DSN) {
        await Sentry.captureException(
          error instanceof Error ? error : new Error(errorMessage),
          {
            tags: {
              "email.type": type,
              "email.status": "exception",
            },
            extra: {
              recipient: to,
              errorMessage,
              errorStack,
            },
          }
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  // Use Sentry span if available (using wrapper for runtime-agnostic support)
  if (env.SENTRY_DSN) {
    return await Sentry.startSpan(
      {
        op: "email.send",
        name: `Send ${type} Email`,
        attributes: {
          "email.type": type,
          "email.to": to,
          "email.subject": subject,
        },
      },
      sendEmailWithSentry
    );
  }

  // No Sentry configured, send email without span
  return await sendEmailWithSentry();
}

// ============================================================================
// EMAIL SENDING FUNCTIONS
// ============================================================================

/**
 * Send email verification email
 *
 * @param env Environment configuration
 * @param params Email parameters
 * @returns Result indicating success or failure
 */
export async function sendVerificationEmail(
  env: Env,
  params: VerificationEmailParams
): Promise<SendEmailResult> {
  const { to, username, verificationUrl } = params;

  return sendEmail({
    env,
    to,
    subject: "Verify Your TuvixRSS Email Address",
    template: VerificationEmail({
      username,
      verificationUrl,
    }) as React.ReactElement,
    type: "verification",
    details: { username, verificationUrl },
  });
}

/**
 * Send password reset email
 *
 * @param env Environment configuration
 * @param params Email parameters
 * @returns Result indicating success or failure
 */
export async function sendPasswordResetEmail(
  env: Env,
  params: PasswordResetEmailParams
): Promise<SendEmailResult> {
  const { to, username, resetUrl } = params;

  return sendEmail({
    env,
    to,
    subject: "Reset Your TuvixRSS Password",
    template: PasswordResetEmail({ username, resetUrl }) as React.ReactElement,
    type: "password-reset",
    details: { username, resetUrl },
  });
}

/**
 * Send welcome email to new user
 *
 * @param env Environment configuration
 * @param params Email parameters
 * @returns Result indicating success or failure
 */
export async function sendWelcomeEmail(
  env: Env,
  params: WelcomeEmailParams
): Promise<SendEmailResult> {
  const { to, username, appUrl } = params;

  return sendEmail({
    env,
    to,
    subject: "Welcome to Tuvix!",
    template: WelcomeEmail({ username, appUrl }) as React.ReactElement,
    type: "welcome",
    details: { username, appUrl },
  });
}
