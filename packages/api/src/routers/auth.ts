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
import { initializeNewUser } from "@/services/user-init";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_USER_PLAN, ADMIN_PLAN } from "@/config/plans";
import {
  usernameValidator,
  emailValidator,
  passwordValidator,
} from "@/types/validators";
import { getBaseUrl } from "@/utils/base-url";
import * as Sentry from "@/utils/sentry";
import { emitCounter, emitMetrics } from "@/utils/metrics";
import {
  logSecurityEvent,
  getRequestMetadata,
  getClientIp,
  getUserAgent,
} from "@/auth/security";
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
        password: passwordValidator,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Wrap entire signup in a parent span
      return Sentry.startSpan(
        {
          name: "auth.signup",
          op: "auth.register",
          attributes: {
            "auth.method": "email_password",
            "auth.has_username": !!input.username,
          },
        },
        async (parentSpan) => {
          const startTime = Date.now();
          let userId: number | undefined;
          let isFirstUser = false;

          try {
            // Check if registration is allowed
            const settings = await getGlobalSettings(ctx.db);
            if (!settings.allowRegistration) {
              parentSpan?.setAttribute("auth.registration_disabled", true);
              emitCounter("auth.signup_blocked", 1, {
                reason: "registration_disabled",
              });

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

            // STEP 1: Better Auth User Creation
            const result = await Sentry.startSpan(
              {
                name: "auth.signup.create_user",
                op: "auth.api_call",
              },
              async (span) => {
                try {
                  const result: SignUpEmailResult = await auth.api.signUpEmail({
                    body: {
                      email: input.email,
                      password: input.password,
                      name: input.username,
                    },
                    headers: authHeaders,
                  });

                  span?.setAttributes({
                    "auth.user_created": !!result.user,
                  });

                  return result;
                } catch (error) {
                  span?.setAttribute("auth.error", (error as Error).message);
                  await Sentry.captureException(error, {
                    tags: {
                      flow: "signup",
                      step: "create_user",
                    },
                    contexts: {
                      signup: {
                        email: input.email,
                        username: input.username,
                      },
                    },
                  });
                  throw error;
                }
              }
            );

            if (!result || !result.user) {
              throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to create user",
              });
            }

            userId = Number(result.user.id);
            const resultUser = result.user as Partial<BetterAuthUser>;

            // Update Sentry user context with ID
            await Sentry.setUser({
              id: userId.toString(),
            });

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

            // STEP 2: Determine Role and Plan
            const roleData = await Sentry.startSpan(
              {
                name: "auth.signup.determine_role",
                op: "db.query",
              },
              async (span) => {
                let role: "user" | "admin" =
                  (dbUser.role as "user" | "admin") || "user";
                let plan: string = dbUser.plan || DEFAULT_USER_PLAN;

                const allowFirstUserAdmin =
                  ctx.env.ALLOW_FIRST_USER_ADMIN !== "false";
                if (allowFirstUserAdmin) {
                  const hasAdmin = await hasAdminUser(ctx.db);
                  if (!hasAdmin) {
                    role = "admin";
                    plan = ADMIN_PLAN;
                    isFirstUser = true;
                  }
                }

                span?.setAttributes({
                  "auth.is_first_user": isFirstUser,
                  "auth.role_assigned": role,
                  "auth.plan": plan,
                });

                return { role, plan };
              }
            );

            // STEP 3: Atomic User Initialization (role + settings + usage stats)
            // Uses D1 batch for atomic operations - all succeed or all fail
            await Sentry.startSpan(
              {
                name: "auth.signup.init_user",
                op: "db.batch",
              },
              async (span) => {
                try {
                  await initializeNewUser(ctx.db, userId!, {
                    role: roleData.role,
                    plan: roleData.plan,
                  });

                  span?.setAttributes({
                    "auth.user_initialized": true,
                    "auth.role": roleData.role,
                    "auth.plan": roleData.plan,
                  });
                } catch (initError) {
                  // Capture error with full context for debugging
                  span?.setAttributes({
                    "auth.init_error": true,
                    "auth.error_message": (initError as Error).message,
                  });

                  console.error(
                    "User initialization failed, rolling back user creation:",
                    initError
                  );

                  await Sentry.captureException(initError, {
                    tags: {
                      flow: "signup",
                      step: "init_rollback",
                    },
                    extra: {
                      userId: userId!,
                      email: input.email,
                      role: roleData.role,
                      plan: roleData.plan,
                    },
                  });

                  // Rollback: Delete the incomplete user
                  await ctx.db
                    .delete(schema.user)
                    .where(eq(schema.user.id, userId!));

                  throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message:
                      "Failed to complete registration. Please try again.",
                    cause: initError,
                  });
                }
              }
            );

            // STEP 4: Security Audit Logging
            await Sentry.startSpan(
              {
                name: "auth.signup.audit_log",
                op: "db.insert",
              },
              async (span) => {
                // Extract IP and user agent from request headers
                const headers: Record<string, string | undefined> = {};
                if (ctx.req.headers) {
                  if (ctx.req.headers instanceof Headers) {
                    ctx.req.headers.forEach((value, key) => {
                      headers[key.toLowerCase()] = value;
                    });
                  } else {
                    Object.entries(ctx.req.headers).forEach(([key, value]) => {
                      headers[key.toLowerCase()] = String(value);
                    });
                  }
                }

                const ipAddress = getClientIp(headers);
                const userAgent = getUserAgent(headers);

                // Log successful registration
                await logSecurityEvent(ctx.db, {
                  userId: userId!,
                  action: isFirstUser ? "admin_first_user" : "register",
                  ipAddress,
                  userAgent,
                  success: true,
                  metadata: {
                    method: "email_password",
                    is_first_user: isFirstUser,
                    verification_required: settings.requireEmailVerification,
                  },
                });

                span?.setAttribute("auth.audit_logged", true);
              }
            );

            const totalDuration = Date.now() - startTime;

            // Set attributes on parent span
            parentSpan?.setAttributes({
              "auth.signup_success": true,
              "auth.user_id": userId.toString(),
              "auth.is_first_user": isFirstUser,
              "auth.role": roleData.role,
              "auth.plan": roleData.plan,
              "auth.verification_required": settings.requireEmailVerification,
              "auth.total_duration_ms": totalDuration,
            });

            // Emit comprehensive metrics
            emitMetrics([
              {
                type: "counter",
                name: "auth.signup_completed",
                value: 1,
                attributes: {
                  is_first_user: isFirstUser ? "true" : "false",
                  verification_required: settings.requireEmailVerification
                    ? "true"
                    : "false",
                  role: roleData.role,
                },
              },
              {
                type: "distribution",
                name: "auth.signup_duration",
                value: totalDuration,
                unit: "millisecond",
                attributes: {
                  verification_required: settings.requireEmailVerification
                    ? "true"
                    : "false",
                },
              },
            ]);

            // Return user info
            return {
              user: {
                id: userId,
                username:
                  (resultUser.username as string | undefined) ||
                  result.user.name ||
                  "",
                email: result.user.email,
                role: roleData.role,
                plan: roleData.plan,
                banned: dbUser.banned || false,
              },
            };
          } catch (error) {
            const totalDuration = Date.now() - startTime;

            // Set error attributes
            parentSpan?.setAttributes({
              "auth.signup_success": false,
              "auth.error": (error as Error).message,
              "auth.error_code": (error as TRPCError).code || "unknown",
              "auth.total_duration_ms": totalDuration,
            });

            // Emit failure metrics
            emitCounter("auth.signup_failed", 1, {
              error_code: (error as TRPCError).code || "unknown",
              error_type: (error as Error).constructor.name,
            });

            // Capture error with rich context
            await Sentry.captureException(error, {
              tags: {
                flow: "signup",
                step: "overall",
              },
              contexts: {
                signup: {
                  email: input.email,
                  username: input.username,
                  user_id: userId?.toString(),
                  duration_ms: totalDuration,
                },
              },
              user: userId ? { id: userId.toString() } : undefined,
            });

            // Better Auth errors are already logged
            const authError = error as { status?: number; message?: string };
            throw new TRPCError({
              code:
                authError.status === 400
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR",
              message: authError.message || "Registration failed",
            });
          }
        }
      );
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
      // Wrap entire login in Sentry span
      return Sentry.startSpan(
        {
          name: "auth.login",
          op: "auth.signin",
          attributes: {
            "auth.method": "username_password",
            "auth.username": input.username,
          },
        },
        async (parentSpan) => {
          const startTime = Date.now();
          let userId: number | undefined;

          // Add breadcrumb for login attempt
          await Sentry.addBreadcrumb({
            category: "auth",
            message: "Login attempt",
            level: "info",
            data: {
              username: input.username,
              method: "username_password",
            },
          });

          const auth = createAuth(ctx.env, ctx.db);
          const { logSecurityEvent, getRequestMetadata } =
            await import("@/auth/security");

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

            userId = Number(result.user.id);
            const resultUser = result.user as Partial<BetterAuthUser>;

            // Get user from Better Auth user table for role/plan info
            const [dbUser] = await ctx.db
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, userId))
              .limit(1);

            if (!dbUser) {
              throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "User not found",
              });
            }

            // Log successful login to security audit
            const { ipAddress, userAgent } = getRequestMetadata(
              ctx.req.headers
            ) as { ipAddress: string | undefined; userAgent: string | undefined };

            try {
              await logSecurityEvent(ctx.db, {
                userId,
                action: "login_success",
                ipAddress,
                userAgent,
                success: true,
              });
            } catch (auditError) {
              // Don't fail login if audit logging fails
              console.error("Failed to log login event:", auditError);
              await Sentry.captureException(auditError, {
                tags: {
                  flow: "login",
                  step: "audit_log",
                },
                level: "warning",
              });
            }

            // Add success breadcrumb
            await Sentry.addBreadcrumb({
              category: "auth",
              message: "Login successful",
              level: "info",
              data: {
                userId: userId.toString(),
                username: input.username,
                role: dbUser.role,
              },
            });

            const totalDuration = Date.now() - startTime;

            // Set success attributes on span
            parentSpan?.setAttributes({
              "auth.login_success": true,
              "auth.user_id": userId.toString(),
              "auth.role": dbUser.role || "user",
              "auth.duration_ms": totalDuration,
            });

            // Emit metrics
            emitMetrics([
              {
                type: "counter",
                name: "auth.login_success",
                value: 1,
                attributes: {
                  role: dbUser.role || "user",
                },
              },
              {
                type: "distribution",
                name: "auth.login_duration",
                value: totalDuration,
                unit: "millisecond",
              },
            ]);

            // Return user info (session is handled by Better Auth via cookies)
            return {
              user: {
                id: userId,
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
            const totalDuration = Date.now() - startTime;

            // Add failure breadcrumb
            await Sentry.addBreadcrumb({
              category: "auth",
              message: "Login failed",
              level: "error",
              data: {
                username: input.username,
                error: (error as Error).message,
                errorType: (error as Error).constructor.name,
              },
            });

            // Log failed login attempt to security audit (if not a generic auth error)
            const { ipAddress, userAgent } = getRequestMetadata(
              ctx.req.headers
            ) as { ipAddress: string | undefined; userAgent: string | undefined };

            try {
              await logSecurityEvent(ctx.db, {
                userId,
                action: "login_failed",
                ipAddress,
                userAgent,
                success: false,
                metadata: {
                  username: input.username,
                  error: (error as Error).message,
                },
              });
            } catch (auditError) {
              // Don't fail login if audit logging fails
              console.error("Failed to log failed login event:", auditError);
            }

            // Set error attributes on span
            parentSpan?.setAttributes({
              "auth.login_success": false,
              "auth.error": (error as Error).message,
              "auth.error_code": (error as TRPCError).code || "unknown",
              "auth.duration_ms": totalDuration,
            });

            // Capture in Sentry
            await Sentry.captureException(error, {
              tags: {
                flow: "login",
                step: "overall",
              },
              contexts: {
                login: {
                  username: input.username,
                  user_id: userId?.toString(),
                  duration_ms: totalDuration,
                },
              },
              user: userId ? { id: userId.toString() } : undefined,
            });

            // Emit failure metrics
            emitCounter("auth.login_failed", 1, {
              error_code: (error as TRPCError).code || "unknown",
              error_type: (error as Error).constructor.name,
            });

            // Better Auth errors are already logged
            const authError = error as { status?: number; message?: string };
            throw new TRPCError({
              code:
                authError.status === 401
                  ? "UNAUTHORIZED"
                  : "INTERNAL_SERVER_ERROR",
              message: authError.message || "Login failed",
            });
          }
        }
      );
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
        // Use Better Auth's official server-side API to send verification email
        // This leverages the sendVerificationEmail callback configured in better-auth.ts
        const auth = createAuth(ctx.env, ctx.db);

        // Get the frontend URL for the callback redirect
        const frontendUrl = ctx.env.BASE_URL || "http://localhost:5173";

        // Call Better Auth's server-side API
        // This will create a verification token and trigger the sendVerificationEmail callback
        // Better Auth API returns a plain object with { status: boolean }
        const result = await auth.api.sendVerificationEmail({
          body: {
            email: dbUser.email,
            callbackURL: `${frontendUrl}/app/articles`, // Redirect after verification
          },
        });

        // Check if the operation was successful
        if (!result.status) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send verification email",
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
        newPassword: passwordValidator,
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

      // Extract IP and user agent for audit logging
      const { ipAddress, userAgent } = getRequestMetadata(
        ctx.req.headers
      ) as { ipAddress: string | undefined; userAgent: string | undefined };

      try {
        await auth.api.changePassword({
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
          headers: authHeaders,
        });

        // Log successful password change
        try {
          await logSecurityEvent(ctx.db, {
            userId: ctx.user.userId,
            action: "password_change",
            ipAddress,
            userAgent,
            success: true,
          });
        } catch (auditError) {
          // Don't fail password change if audit logging fails
          console.error("Failed to log password change event:", auditError);
          await Sentry.captureException(auditError, {
            tags: {
              flow: "password_change",
              step: "audit_log",
            },
            level: "warning",
          });
        }

        return { success: true };
      } catch (error) {
        // Log failed password change attempt
        try {
          await logSecurityEvent(ctx.db, {
            userId: ctx.user.userId,
            action: "password_change",
            ipAddress,
            userAgent,
            success: false,
            metadata: {
              error: (error as Error).message,
            },
          });
        } catch (auditError) {
          console.error(
            "Failed to log failed password change event:",
            auditError
          );
        }

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
        newPassword: passwordValidator,
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

      // Extract IP and user agent for audit logging
      const { ipAddress, userAgent } = getRequestMetadata(
        ctx.req.headers
      ) as { ipAddress: string | undefined; userAgent: string | undefined };

      // Find user by verification token BEFORE resetting (token is deleted after use)
      let userId: number | undefined;
      try {
        const [verification] = await ctx.db
          .select()
          .from(schema.verification)
          .where(eq(schema.verification.value, input.token))
          .limit(1);

        if (verification) {
          // identifier is the user's email
          const [userRecord] = await ctx.db
            .select()
            .from(schema.user)
            .where(eq(schema.user.email, verification.identifier))
            .limit(1);

          if (userRecord) {
            userId = Number(userRecord.id);
          }
        }
      } catch (error) {
        // Continue even if we can't find the user
        console.error("Failed to find user for password reset logging:", error);
      }

      try {
        await auth.api.resetPassword({
          body: {
            token: input.token,
            newPassword: input.newPassword,
          },
          headers: authHeaders,
        });

        // Log successful password reset with actual user ID
        try {
          await logSecurityEvent(ctx.db, {
            userId,
            action: "password_reset_success",
            ipAddress,
            userAgent,
            success: true,
          });
        } catch (auditError) {
          // Don't fail password reset if audit logging fails
          console.error("Failed to log password reset event:", auditError);
          await Sentry.captureException(auditError, {
            tags: {
              flow: "password_reset",
              step: "audit_log",
            },
            level: "warning",
          });
        }

        return { success: true };
      } catch (error) {
        // Log failed password reset attempt
        try {
          await logSecurityEvent(ctx.db, {
            userId,
            action: "password_reset_failed",
            ipAddress,
            userAgent,
            success: false,
            metadata: {
              error: (error as Error).message,
              note: "Invalid or expired token",
            },
          });
        } catch (auditError) {
          console.error(
            "Failed to log failed password reset event:",
            auditError
          );
        }

        const authError = error as { status?: number; message?: string };
        throw new TRPCError({
          code:
            authError.status === 400 ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: authError.message || "Password reset failed",
        });
      }
    }),
});
