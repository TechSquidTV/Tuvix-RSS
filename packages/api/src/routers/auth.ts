/**
 * Auth Router
 *
 * Handles user authentication with production-grade security:
 * - Password complexity validation
 * - Rate limiting and account lockout
 * - Security audit logging
 * - Password change and reset
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  router,
  publicProcedure,
  protectedProcedure,
  protectedProcedureWithoutVerification,
} from "@/trpc/init";
import { createAuth } from "@/auth/better-auth";
import { fromNodeHeaders } from "better-auth/node";
import { hasAdminUser } from "@/services/admin-init";
import { getGlobalSettings } from "@/services/global-settings";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_PLAN, ADMIN_PLAN } from "@/config/plans";
import { usernameValidator, emailValidator } from "@/types/validators";
import { getBaseUrl } from "@/utils/base-url";
import type {
  BetterAuthUser,
  SignUpEmailResult,
  SignInUsernameResult,
} from "@/types/better-auth";

export const authRouter = router({
  /**
   * Register a new user
   * Uses Better Auth signUp.email with username
   * Creates user account and default settings
   * Better Auth handles session management via cookies
   */
  register: publicProcedure
    .input(
      z.object({
        username: usernameValidator,
        email: emailValidator,
        password: z.string().min(8), // Better Auth default minimum
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if registration is allowed
      const settings = await getGlobalSettings(ctx.db);
      if (!settings.allowRegistration) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Registration is currently disabled",
        });
      }

      const auth = createAuth(ctx.env, ctx.db);

      // Convert headers for Better Auth
      const authHeaders =
        ctx.req.headers instanceof Headers
          ? ctx.req.headers
          : fromNodeHeaders(
              Object.fromEntries(
                Object.entries(ctx.req.headers || {}).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v[0] : v,
                ])
              ) as Record<string, string>
            );

      try {
        // Use Better Auth's signUp.email with username
        const result: SignUpEmailResult = await auth.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password,
            name: input.username, // Better Auth uses 'name' field
          },
          headers: authHeaders,
        });

        if (!result || !result.user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user",
          });
        }

        const userId = Number(result.user.id);
        const resultUser = result.user as Partial<BetterAuthUser>;

        // Get the created user from Better Auth user table
        const [dbUser] = await ctx.db
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);

        if (!dbUser) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "User created but not found in database",
          });
        }

        // Determine if this should be an admin user
        let role: "user" | "admin" =
          (dbUser.role as "user" | "admin") || "user";
        let plan: string = dbUser.plan || DEFAULT_USER_PLAN;

        const allowFirstUserAdmin = ctx.env.ALLOW_FIRST_USER_ADMIN !== "false";
        if (allowFirstUserAdmin) {
          const hasAdmin = await hasAdminUser(ctx.db);
          if (!hasAdmin) {
            role = "admin";
            plan = ADMIN_PLAN;
            console.log(
              "⚠️  First user registered - automatically promoted to admin"
            );

            // Update user role and plan in Better Auth user table
            await ctx.db
              .update(schema.user)
              .set({ role, plan })
              .where(eq(schema.user.id, userId));
          }
        } else {
          // Ensure plan is set even if not first admin
          if (!dbUser.plan) {
            await ctx.db
              .update(schema.user)
              .set({ plan: DEFAULT_USER_PLAN })
              .where(eq(schema.user.id, userId));
            plan = DEFAULT_USER_PLAN;
          }
        }

        // Create default user settings if not exists
        const [existingSettings] = await ctx.db
          .select()
          .from(schema.userSettings)
          .where(eq(schema.userSettings.userId, userId))
          .limit(1);

        if (!existingSettings) {
          await ctx.db.insert(schema.userSettings).values({
            userId: userId,
          });
        }

        // Initialize usage stats if not exists
        const [existingStats] = await ctx.db
          .select()
          .from(schema.usageStats)
          .where(eq(schema.usageStats.userId, userId))
          .limit(1);

        if (!existingStats) {
          await ctx.db.insert(schema.usageStats).values({
            userId: userId,
            sourceCount: 0,
            publicFeedCount: 0,
            categoryCount: 0,
            articleCount: 0,
            lastUpdated: new Date(),
          });
        }

        // Return user info (session is handled by Better Auth via cookies)
        return {
          user: {
            id: userId,
            username:
              (resultUser.username as string | undefined) ||
              result.user.name ||
              "",
            email: result.user.email,
            role: role,
            plan: plan,
            banned: dbUser.banned || false,
          },
        };
      } catch (error) {
        // Better Auth errors are already logged
        const authError = error as { status?: number; message?: string };
        throw new TRPCError({
          code:
            authError.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: authError.message || "Registration failed",
        });
      }
    }),

  /**
   * Login with username and password
   * Uses Better Auth signIn.username
   * Better Auth handles session management via cookies.
   * Rate limiting is handled by custom Cloudflare Workers rate limit bindings (Better Auth rate limiting is disabled).
   */
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const auth = createAuth(ctx.env, ctx.db);

      // Convert headers for Better Auth
      const authHeaders =
        ctx.req.headers instanceof Headers
          ? ctx.req.headers
          : fromNodeHeaders(
              Object.fromEntries(
                Object.entries(ctx.req.headers || {}).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v[0] : v,
                ])
              ) as Record<string, string>
            );

      try {
        // Use Better Auth's signIn with username plugin
        // Note: Username plugin adds signInUsername method
        const result: SignInUsernameResult = await auth.api.signInUsername({
          body: {
            username: input.username,
            password: input.password,
          },
          headers: authHeaders,
        });

        if (!result || !result.user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid credentials",
          });
        }

        const resultUser = result.user as Partial<BetterAuthUser>;

        // Get user from Better Auth user table for role/plan info
        const [dbUser] = await ctx.db
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, Number(result.user.id)))
          .limit(1);

        if (!dbUser) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "User not found",
          });
        }

        // Return user info (session is handled by Better Auth via cookies)
        return {
          user: {
            id: Number(result.user.id),
            username:
              (resultUser.username as string | undefined) ||
              result.user.name ||
              "",
            email: result.user.email,
            role: (dbUser.role as "user" | "admin") || "user",
            plan: dbUser.plan || DEFAULT_USER_PLAN,
            banned: dbUser.banned || false,
          },
        };
      } catch (error) {
        // Better Auth errors are already logged
        const authError = error as { status?: number; message?: string };
        throw new TRPCError({
          code:
            authError.status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: authError.message || "Login failed",
        });
      }
    }),

  /**
   * Get current authenticated user
   * Uses Better Auth session
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const [dbUser] = await ctx.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, ctx.user.userId))
      .limit(1);

    if (!dbUser) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    const response = {
      id: dbUser.id,
      username: dbUser.username || dbUser.name || "",
      email: dbUser.email,
      role: (dbUser.role as "user" | "admin") || "user",
      plan: dbUser.plan || DEFAULT_USER_PLAN,
      banned: dbUser.banned || false,
      emailVerified: dbUser.emailVerified || false,
    };

    return response;
  }),

  /**
   * Check email verification status
   * Returns whether verification is required and current verification status
   * Uses protectedProcedureWithoutVerification to allow unverified users to check their status
   */
  checkVerificationStatus: protectedProcedureWithoutVerification
    .output(
      z.object({
        requiresVerification: z.boolean(),
        emailVerified: z.boolean(),
      })
    )
    .query(async ({ ctx }) => {
      const settings = await getGlobalSettings(ctx.db);
      const [dbUser] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, ctx.user.userId))
        .limit(1);

      if (!dbUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return {
        requiresVerification: settings.requireEmailVerification,
        emailVerified: dbUser.emailVerified || false,
      };
    }),

  /**
   * Resend verification email
   * Sends a new verification email to the authenticated user
   * Rate limited: max 1 request per 5 minutes per user
   * Uses protectedProcedureWithoutVerification to allow unverified users to resend verification emails
   */
  resendVerificationEmail: protectedProcedureWithoutVerification
    .output(
      z.object({
        success: z.boolean(),
        message: z.string(),
      })
    )
    .mutation(async ({ ctx }) => {
      const { checkRateLimit } = await import("@/services/rate-limiter");

      // Check if email verification is required
      const settings = await getGlobalSettings(ctx.db);
      if (!settings.requireEmailVerification) {
        return {
          success: false,
          message: "Email verification is not required",
        };
      }

      // Check if user is already verified
      const [dbUser] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, ctx.user.userId))
        .limit(1);

      if (!dbUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (dbUser.emailVerified) {
        return {
          success: false,
          message: "Email is already verified",
        };
      }

      // Rate limit: max 1 request per 5 minutes
      // Get user's plan for rate limiting
      const [userRecord] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, ctx.user.userId))
        .limit(1);
      const planId = userRecord?.plan || "free";

      const rateLimitResult = await checkRateLimit(
        ctx.env,
        ctx.user.userId,
        planId,
        1,
        5 * 60 * 1000, // 5 minutes
        "api"
      );

      if (!rateLimitResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Please wait before requesting another verification email. You can request a new email in 5 minutes.",
        });
      }

      try {
        // Better Auth doesn't expose sendVerificationEmail on server-side API
        // We need to manually create a verification token and trigger the email callback
        // Import crypto for token generation
        const crypto = await import("crypto");
        const token = crypto.randomBytes(32).toString("hex");

        // Create verification token expiration (1 hour from now)
        const expiresAt = new Date(Date.now() + 3600 * 1000);

        // Get the base URL for the verification link
        const baseUrl = getBaseUrl(ctx.env, ctx.headers);
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

        // Store verification token in Better Auth's verification table
        // Better Auth expects: identifier (email), value (token), expiresAt
        const { verification } = await import("@/db/schema");
        await ctx.db.insert(verification).values({
          identifier: dbUser.email,
          value: token,
          expiresAt: expiresAt,
        });

        // Import email service to send verification email
        const { sendVerificationEmail } = await import("@/services/email");

        // Send verification email using dedicated verification email template
        const emailResult = await sendVerificationEmail(ctx.env, {
          to: dbUser.email,
          username: dbUser.username || dbUser.name || "User",
          verificationToken: token,
          verificationUrl: verificationUrl,
        });

        if (!emailResult.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: emailResult.error || "Failed to send verification email",
          });
        }

        return {
          success: true,
          message: "Verification email sent. Please check your inbox.",
        };
      } catch (error) {
        const authError = error as { status?: number; message?: string };
        throw new TRPCError({
          code:
            authError.status === 403
              ? "FORBIDDEN"
              : authError.status === 400
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR",
          message: authError.message || "Failed to resend verification email",
        });
      }
    }),

  /**
   * Change password for authenticated user
   * Uses Better Auth changePassword
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8), // Better Auth default minimum
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const auth = createAuth(ctx.env, ctx.db);

      // Convert headers for Better Auth
      const authHeaders =
        ctx.req.headers instanceof Headers
          ? ctx.req.headers
          : fromNodeHeaders(
              Object.fromEntries(
                Object.entries(ctx.req.headers || {}).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v[0] : v,
                ])
              ) as Record<string, string>
            );

      try {
        await auth.api.changePassword({
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
          headers: authHeaders,
        });

        return { success: true };
      } catch (error) {
        const authError = error as { status?: number; message?: string };
        throw new TRPCError({
          code:
            authError.status === 401 ? "UNAUTHORIZED" : "INTERNAL_SERVER_ERROR",
          message: authError.message || "Password change failed",
        });
      }
    }),

  /**
   * Request password reset token
   * Uses Better Auth requestPasswordReset
   * SECURITY: Token is sent via email, never returned in API response
   */
  requestPasswordReset: publicProcedure
    .input(
      z.object({
        email: emailValidator,
      })
    )
    .output(
      z.object({
        success: z.boolean(),
        message: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const auth = createAuth(ctx.env, ctx.db);
      const { logSecurityEvent, getClientIp, getUserAgent } = await import(
        "@/auth/security"
      );

      // Convert headers for Better Auth
      const authHeaders =
        ctx.req.headers instanceof Headers
          ? ctx.req.headers
          : fromNodeHeaders(
              Object.fromEntries(
                Object.entries(ctx.req.headers || {}).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v[0] : v,
                ])
              ) as Record<string, string>
            );

      // Try to find user for logging
      const [userRecord] = await ctx.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, input.email))
        .limit(1);

      const ipAddress = getClientIp(ctx.headers);
      const userAgent = getUserAgent(ctx.headers);

      try {
        await auth.api.requestPasswordReset({
          body: {
            email: input.email,
            redirectTo: `${getBaseUrl(ctx.env, ctx.headers)}/reset-password`,
          },
          headers: authHeaders,
        });

        // Log password reset request (if user exists)
        // Note: Email sent logging is handled in Better Auth's sendResetPassword callback
        if (userRecord) {
          await logSecurityEvent(ctx.db, {
            userId: Number(userRecord.id),
            action: "password_reset_request",
            ipAddress,
            userAgent,
            success: true,
          });
        }

        // Always return success to prevent email enumeration
        return {
          success: true,
          message:
            "If an account exists with this email, a password reset link has been sent.",
        };
      } catch (error) {
        // Log failure if user exists (only if Better Auth API call failed)
        // Note: Email failure logging is handled in Better Auth's sendResetPassword callback
        const authError = error as { message?: string };
        if (userRecord) {
          await logSecurityEvent(ctx.db, {
            userId: Number(userRecord.id),
            action: "password_reset_request",
            ipAddress,
            userAgent,
            success: false,
            metadata: {
              error: authError.message || "Failed to request password reset",
            },
          });
        }

        // Always return success to prevent email enumeration
        return {
          success: true,
          message:
            "If an account exists with this email, a password reset link has been sent.",
        };
      }
    }),

  /**
   * Reset password using token
   * Uses Better Auth resetPassword
   */
  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string(),
        newPassword: z.string().min(8), // Better Auth default minimum
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const auth = createAuth(ctx.env, ctx.db);

      // Convert headers for Better Auth
      const authHeaders =
        ctx.req.headers instanceof Headers
          ? ctx.req.headers
          : fromNodeHeaders(
              Object.fromEntries(
                Object.entries(ctx.req.headers || {}).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v[0] : v,
                ])
              ) as Record<string, string>
            );

      try {
        await auth.api.resetPassword({
          body: {
            token: input.token,
            newPassword: input.newPassword,
          },
          headers: authHeaders,
        });

        return { success: true };
      } catch (error) {
        const authError = error as { status?: number; message?: string };
        throw new TRPCError({
          code:
            authError.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: authError.message || "Password reset failed",
        });
      }
    }),
});
