/**
 * Better Auth Configuration
 *
 * Main authentication instance using Better Auth library.
 * Supports both SQLite (Docker) and D1 (Cloudflare) via Drizzle adapter.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { admin } from "better-auth/plugins";
import { customSession } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { createDatabase } from "@/db/client";
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/services/email";
import { logSecurityEvent } from "@/auth/security";
import { getGlobalSettings } from "@/services/global-settings";
import { getClientIp, getUserAgent, extractHeaders } from "@/auth/security";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Env } from "@/types";
import type { BetterAuthUser } from "@/types/better-auth";
import * as Sentry from "@/utils/sentry";
import { emitCounter, emitDistribution } from "@/utils/metrics";

/**
 * Create Better Auth instance
 * This function creates a new auth instance with the database connection
 * @param env Environment configuration
 * @param db Optional database instance (for testing with in-memory DB)
 */
export function createAuth(env: Env, db?: ReturnType<typeof createDatabase>) {
  const database = db || createDatabase(env);

  // TODO: Replace per-request caching with Cloudflare KV for better performance
  // KV provides 1-2ms reads globally with built-in TTL expiration
  // Current approach: Cache settings per-request to avoid multiple DB calls
  // Future approach: Use KV namespace with 60s TTL, fallback to DB if KV unavailable
  // Per-request cache to avoid multiple getGlobalSettings calls
  // This cache is scoped to a single request and resets on each new request
  // Reduces DB queries from 3+ to 1 per signup request
  const requestCache: {
    settings?: Awaited<ReturnType<typeof getGlobalSettings>>;
  } = {};

  /**
   * Get global settings with per-request caching
   * Prevents multiple database calls within the same request
   */
  const getCachedSettings = async () => {
    if (!requestCache.settings) {
      requestCache.settings = await getGlobalSettings(database);
    }
    return requestCache.settings;
  };

  // Get base URL for Better Auth API endpoints
  // Priority: BETTER_AUTH_URL > API_URL > localhost:3001
  // In production: Set BETTER_AUTH_URL=https://api.tuvix.app
  // In development: Defaults to localhost:3001 (API server)
  const apiUrl = env.BETTER_AUTH_URL || env.API_URL || "http://localhost:3001";

  // Get frontend URL for redirects after email verification
  // In production: Set BASE_URL=https://feed.tuvix.app
  // In development: Defaults to localhost:5173 (frontend dev server)
  const frontendUrl = env.BASE_URL || "http://localhost:5173";

  // Configure trusted origins from CORS_ORIGIN (comma-separated)
  const trustedOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : [];

  // Configure cross-subdomain cookies if COOKIE_DOMAIN is set
  // This is needed when frontend and API are on different subdomains
  // (e.g., app.example.com and api.example.com)
  const crossSubDomainConfig = env.COOKIE_DOMAIN
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: env.COOKIE_DOMAIN, // Root domain (e.g., "example.com")
        },
      }
    : {};

  // Log Better Auth configuration (for debugging cross-domain issues)
  console.log("🔧 Better Auth Configuration:", {
    apiUrl,
    frontendUrl,
    trustedOrigins,
    hasCookieDomain: !!env.COOKIE_DOMAIN,
    cookieDomain: env.COOKIE_DOMAIN || "(not set)",
    crossSubDomainEnabled: !!env.COOKIE_DOMAIN,
  });

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        // rateLimit table removed - Better Auth rate limiting is disabled
      },
    }),
    secret: env.BETTER_AUTH_SECRET || "",
    baseURL: apiUrl,
    basePath: "/api/auth",
    // CRITICAL: Trust the host header in production (required for Cloudflare Workers)
    // This allows Better Auth to correctly set cookies when API and frontend are on different domains
    trustHost: true,
    trustedOrigins: trustedOrigins.length > 0 ? trustedOrigins : undefined,
    telemetry: {
      enabled: false,
    },
    session: {
      // Cookie cache reduces DB queries by storing session data in a signed cookie
      // This replaces the React Query 15-minute staleTime optimization on the client
      cookieCache: {
        enabled: true,
        maxAge: 15 * 60, // 15 minutes cache duration (in seconds)
        strategy: "compact", // Most efficient: base64url + HMAC-SHA256
      },
      // Session expires after 7 days (Better Auth default)
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      // Update session expiration every 24 hours when used
      updateAge: 60 * 60 * 24, // 1 day
    },
    advanced: {
      // Use integer IDs to match existing schema
      database: {
        useNumberId: true,
      },
      // Configure IP address headers for Cloudflare
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"],
      },
      // Cross-subdomain cookies configuration (for subdomains like auth.example.com and app.example.com)
      ...crossSubDomainConfig,
      // Cross-domain cookie attributes (for completely different domains)
      // Required when frontend and API are on different domains (e.g., staging.tuvix.app vs tuvix-api-staging.cf-93e.workers.dev)
      // Only set these if we're NOT using cross-subdomain cookies (different use case)
      ...(env.COOKIE_DOMAIN
        ? {}
        : {
            defaultCookieAttributes: {
              sameSite: "none" as const,
              secure: true,
              partitioned: true, // New browser standards mandate this for foreign cookies
            },
          }),
    },
    emailAndPassword: {
      enabled: true,
      // Registration and email verification controlled by globalSettings
      // Note: disableSignUp is checked dynamically in hooks
      // Email verification enforcement is handled in tRPC middleware, not here
      // Removing requireEmailVerification allows session creation during signup
      disableSignUp: false, // Checked dynamically in hooks
      // autoSignIn defaults to true - session created on signup
      sendResetPassword: async ({ user, url, token }) => {
        // Wrap password reset email in Sentry span
        return await Sentry.startSpan(
          {
            op: "email.password_reset",
            name: "Send Password Reset Email",
            attributes: {
              user_id: user.id,
              email_type: "password_reset",
            },
          },
          async (span) => {
            // Add breadcrumb for email sending attempt
            Sentry.addBreadcrumb({
              category: "email",
              message: "Sending password reset email",
              level: "info",
              data: {
                user_id: user.id,
                email_type: "password_reset",
              },
            });

            const userWithPlugins = user as BetterAuthUser;
            const emailResult = await sendPasswordResetEmail(env, {
              to: user.email,
              username:
                (userWithPlugins.username as string | undefined) ||
                user.name ||
                "User",
              resetToken: token,
              resetUrl: url,
            });

            // Track email result
            span?.setAttribute("email.sent", true);
            span?.setAttribute("email.success", emailResult?.success ?? false);
            if (!emailResult.success) {
              span?.setAttribute(
                "email.error",
                emailResult.error || "Unknown error"
              );

              // Add breadcrumb for failure
              Sentry.addBreadcrumb({
                category: "email",
                message: "Password reset email failed",
                level: "error",
                data: {
                  user_id: user.id,
                  error: emailResult.error,
                  email_type: "password_reset",
                },
              });
            } else {
              // Add breadcrumb for success
              Sentry.addBreadcrumb({
                category: "email",
                message: "Password reset email sent successfully",
                level: "info",
                data: {
                  user_id: user.id,
                  email_type: "password_reset",
                },
              });
            }

            // Log email result to security audit log
            try {
              // Get IP and user agent from request (if available in context)
              // Note: Better Auth doesn't pass full request context here
              await logSecurityEvent(database, {
                userId: Number(user.id),
                action: "password_reset_email_sent",
                ipAddress: undefined, // Not available in this callback
                userAgent: undefined, // Not available in this callback
                success: emailResult?.success ?? false,
                metadata: emailResult?.success
                  ? undefined
                  : { error: emailResult?.error || "Unknown error" },
              });
            } catch (error) {
              // If logging fails, continue silently
              console.error("Error logging password reset email:", error);
              Sentry.captureException(error, {
                tags: {
                  component: "better-auth",
                  operation: "password-reset-audit-log",
                },
                level: "warning",
              });
            }

            if (!emailResult.success) {
              console.error(
                "Failed to send password reset email:",
                emailResult.error
              );
              Sentry.captureException(
                new Error(emailResult.error || "Unknown error"),
                {
                  tags: {
                    component: "better-auth",
                    operation: "password-reset-email",
                    email_type: "password_reset",
                  },
                  extra: {
                    user_id: user.id,
                  },
                  level: "error",
                }
              );
            }
          }
        );
      },
    },
    plugins: [
      // Username plugin - enables username-based login
      username({
        // Better Auth defaults: 3-30 chars, alphanumeric + dots/underscores
        // We'll normalize existing usernames during migration
      }),
      // Admin plugin - provides role management and banning
      admin({
        // Uses existing role system ("user" | "admin")
      }),
      // Custom session plugin - includes banned status in session
      customSession(async ({ user, session }) => {
        // Fetch banned status from database
        // Note: This queries on every session check, but sessions are cached client-side
        try {
          const result = await database
            .select()
            .from(schema.user)
            .where(eq(schema.user.id, Number(user.id)))
            .limit(1);

          const banned = result[0]?.banned ?? false;

          return {
            user: {
              ...user,
              banned,
            },
            session,
          };
        } catch (error) {
          // Log error to Sentry but don't block session creation
          Sentry.captureException(error, {
            tags: {
              component: "better-auth",
              operation: "custom-session",
            },
            extra: {
              userId: user.id,
            },
          });

          // Fail open - return session without banned status
          console.error("Failed to fetch user banned status:", error);
          return {
            user: {
              ...user,
              banned: false,
            },
            session,
          };
        }
      }),
    ],
    // Additional fields for custom user data
    additionalFields: {
      plan: {
        type: "string",
        required: false,
        defaultValue: "free",
        input: false, // Not editable via auth API
      },
    },
    // Rate limiting disabled - using custom rate limiting system instead
    rateLimit: {
      enabled: false,
    },
    // Email verification configuration
    emailVerification: {
      sendVerificationEmail: async ({ user, token }, _request) => {
        // Send verification email and await completion
        // This ensures the email is sent before the response completes
        // Adds ~100-300ms latency but guarantees delivery and error capture

        try {
          // Check if email verification is required
          const settings = await getCachedSettings();
          if (!settings.requireEmailVerification) {
            return; // Skip sending if not required
          }

          const userWithPlugins = user as BetterAuthUser;

          // Create frontend verification URL instead of using backend URL
          // This ensures proper logo loading and post-verification redirect
          const frontendVerificationUrl = `${frontendUrl}/verify-email?token=${token}`;

          // Emit metric for verification email attempt
          emitCounter("email.verification_attempt", 1, {
            user_id: user.id,
          });

          // Send verification email with Sentry tracking (awaited)
          const startTime = Date.now();
          await Sentry.startSpan(
            {
              op: "email.verification",
              name: "Send Verification Email",
              attributes: {
                user_id: user.id,
              },
            },
            async (span) => {
              // Add breadcrumb for email sending attempt
              Sentry.addBreadcrumb({
                category: "email",
                message: "Sending verification email",
                level: "info",
                data: {
                  user_id: user.id,
                  email_type: "verification",
                },
              });

              try {
                const emailResult = await sendVerificationEmail(env, {
                  to: user.email,
                  username:
                    (userWithPlugins.username as string | undefined) ||
                    user.name ||
                    "User",
                  verificationToken: token,
                  verificationUrl: frontendVerificationUrl,
                });

                const duration = Date.now() - startTime;

                // Track result in span
                span?.setAttribute("email.success", emailResult.success);

                // Emit metrics for email delivery
                emitCounter("email.verification_sent", 1, {
                  success: emailResult.success ? "true" : "false",
                  user_id: user.id,
                });

                emitDistribution(
                  "email.verification_duration",
                  duration,
                  "millisecond",
                  {
                    success: emailResult.success ? "true" : "false",
                  }
                );

                // Check if email sending failed
                if (!emailResult.success) {
                  span?.setAttribute(
                    "email.error",
                    emailResult.error || "Unknown error"
                  );
                  span?.setStatus({ code: 2, message: "email failed" });

                  // Emit failure metric with error type
                  emitCounter("email.verification_failed", 1, {
                    error_type: emailResult.error || "unknown",
                    user_id: user.id,
                  });

                  // Add breadcrumb for failure
                  Sentry.addBreadcrumb({
                    category: "email",
                    message: "Verification email failed",
                    level: "error",
                    data: {
                      user_id: user.id,
                      error: emailResult.error,
                      email_type: "verification",
                    },
                  });

                  // Log critical email failures to Sentry
                  Sentry.captureException(
                    new Error(
                      emailResult.error || "Failed to send verification email"
                    ),
                    {
                      tags: {
                        component: "better-auth",
                        operation: "email-verification",
                        email_type: "verification",
                      },
                      extra: {
                        user_id: user.id,
                        errorMessage: emailResult.error,
                      },
                      level: "error",
                    }
                  );

                  console.error("Failed to send verification email:", {
                    user_id: user.id,
                    error: emailResult.error,
                  });
                } else {
                  span?.setStatus({ code: 1, message: "ok" });

                  // Add breadcrumb for success
                  Sentry.addBreadcrumb({
                    category: "email",
                    message: "Verification email sent successfully",
                    level: "info",
                    data: {
                      user_id: user.id,
                      email_type: "verification",
                    },
                  });
                }
              } catch (error) {
                const duration = Date.now() - startTime;

                span?.setAttribute(
                  "email.exception",
                  error instanceof Error ? error.message : String(error)
                );
                span?.setStatus({ code: 2, message: "exception" });

                // Emit exception metrics
                emitCounter("email.verification_exception", 1, {
                  error_type:
                    error instanceof Error ? error.name : "UnknownError",
                  user_id: user.id,
                });

                emitDistribution(
                  "email.verification_duration",
                  duration,
                  "millisecond",
                  {
                    success: "false",
                    exception: "true",
                  }
                );

                // Add breadcrumb for unexpected error
                Sentry.addBreadcrumb({
                  category: "email",
                  message: "Unexpected error sending verification email",
                  level: "error",
                  data: {
                    user_id: user.id,
                    error:
                      error instanceof Error ? error.message : String(error),
                    email_type: "verification",
                  },
                });

                // Log unexpected exceptions (e.g., network errors, timeouts)
                Sentry.captureException(error, {
                  tags: {
                    component: "better-auth",
                    operation: "email-verification",
                    email_type: "verification",
                  },
                  extra: {
                    user_id: user.id,
                  },
                  level: "error",
                });

                console.error("Unexpected error sending verification email:", {
                  user_id: user.id,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          );
        } catch (error) {
          console.error("Failed to check email verification settings:", error);
          Sentry.captureException(error, {
            tags: {
              component: "better-auth",
              operation: "check-verification-settings",
            },
            extra: {
              user_id: user.id,
            },
            level: "warning",
          });
        }
      },
      sendOnSignUp: true, // Callback checks requireEmailVerification setting dynamically
      autoSignInAfterVerification: true,
      expiresIn: 3600, // 1 hour
      // Redirect to frontend after successful verification
      callbackURL: frontendUrl,
    },
    // Hooks for security audit logging and welcome emails
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Check if registration is disabled before processing sign-up
        if (ctx.path.startsWith("/sign-up")) {
          try {
            const settings = await getCachedSettings();
            if (!settings.allowRegistration) {
              // Return error response to prevent registration
              return {
                status: 403,
                body: JSON.stringify({
                  error: {
                    message: "Registration is currently disabled",
                  },
                }),
              };
            }
          } catch (error) {
            // If we can't check settings, allow registration (fail open for availability)
            console.error("Failed to check registration settings:", error);
          }
        }
        // Continue with the request
        return;
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Handle sign-up events
        if (ctx.path.startsWith("/sign-up")) {
          const newSession = ctx.context.newSession;
          if (newSession?.user) {
            const user = newSession.user;

            // Note: Registration event logging is handled in the register endpoint
            // after the user is created in the user table, to avoid foreign key constraint issues

            // Send welcome email based on verification requirements (awaited)
            // Logic:
            // 1. If verification is NOT required: Send welcome email immediately
            // 2. If verification IS required but user is already verified: Send welcome email
            //    (This handles edge cases like admins or pre-verified emails)
            // 3. If verification IS required and user is NOT verified: Skip welcome email
            //    (User receives verification email instead; welcome email sent after verification)
            try {
              const settings = await getCachedSettings();
              const shouldSendWelcome =
                !settings.requireEmailVerification || user.emailVerified;

              if (shouldSendWelcome) {
                const appUrl = frontendUrl;
                const userWithPlugins = user as BetterAuthUser;

                // Emit metric for welcome email attempt
                emitCounter("email.welcome_attempt", 1, {
                  user_id: user.id,
                  verification_skipped: !settings.requireEmailVerification
                    ? "true"
                    : "false",
                });

                // Send welcome email with Sentry tracking (awaited)
                const startTime = Date.now();
                await Sentry.startSpan(
                  {
                    op: "email.welcome",
                    name: "Send Welcome Email",
                    attributes: {
                      user_id: user.id,
                    },
                  },
                  async (span) => {
                    // Add breadcrumb for email sending attempt
                    Sentry.addBreadcrumb({
                      category: "email",
                      message: "Sending welcome email",
                      level: "info",
                      data: {
                        user_id: user.id,
                        email_type: "welcome",
                      },
                    });

                    try {
                      const emailResult = await sendWelcomeEmail(env, {
                        to: user.email,
                        username:
                          (userWithPlugins.username as string | undefined) ||
                          user.name ||
                          "User",
                        appUrl,
                      });

                      const duration = Date.now() - startTime;

                      // Track result in span
                      span?.setAttribute("email.success", emailResult.success);

                      // Emit metrics for email delivery
                      emitCounter("email.welcome_sent", 1, {
                        success: emailResult.success ? "true" : "false",
                        user_id: user.id,
                        verification_skipped: !settings.requireEmailVerification
                          ? "true"
                          : "false",
                      });

                      emitDistribution(
                        "email.welcome_duration",
                        duration,
                        "millisecond",
                        {
                          success: emailResult.success ? "true" : "false",
                        }
                      );

                      // Check if email sending failed
                      if (!emailResult.success) {
                        span?.setAttribute(
                          "email.error",
                          emailResult.error || "Unknown error"
                        );
                        span?.setStatus({
                          code: 2,
                          message: "email failed",
                        });

                        // Emit failure metric with error type
                        emitCounter("email.welcome_failed", 1, {
                          error_type: emailResult.error || "unknown",
                          user_id: user.id,
                        });

                        // Add breadcrumb for failure
                        Sentry.addBreadcrumb({
                          category: "email",
                          message: "Welcome email failed",
                          level: "error",
                          data: {
                            user_id: user.id,
                            error: emailResult.error,
                            email_type: "welcome",
                          },
                        });

                        // Log email failures to Sentry
                        Sentry.captureException(
                          new Error(
                            emailResult.error || "Failed to send welcome email"
                          ),
                          {
                            tags: {
                              component: "better-auth",
                              operation: "welcome-email",
                              email_type: "welcome",
                            },
                            extra: {
                              user_id: user.id,
                              errorMessage: emailResult.error,
                            },
                            level: "error",
                          }
                        );

                        console.error(
                          `Failed to send welcome email to ${user.email}:`,
                          {
                            error: emailResult.error,
                          }
                        );
                      } else {
                        span?.setStatus({ code: 1, message: "ok" });

                        // Add breadcrumb for success
                        Sentry.addBreadcrumb({
                          category: "email",
                          message: "Welcome email sent successfully",
                          level: "info",
                          data: {
                            user_id: user.id,
                            email_type: "welcome",
                          },
                        });
                      }
                    } catch (error) {
                      const duration = Date.now() - startTime;

                      span?.setAttribute(
                        "email.exception",
                        error instanceof Error ? error.message : String(error)
                      );
                      span?.setStatus({ code: 2, message: "exception" });

                      // Emit exception metrics
                      emitCounter("email.welcome_exception", 1, {
                        error_type:
                          error instanceof Error ? error.name : "UnknownError",
                        user_id: user.id,
                      });

                      emitDistribution(
                        "email.welcome_duration",
                        duration,
                        "millisecond",
                        {
                          success: "false",
                          exception: "true",
                        }
                      );

                      // Add breadcrumb for unexpected error
                      Sentry.addBreadcrumb({
                        category: "email",
                        message: "Unexpected error sending welcome email",
                        level: "error",
                        data: {
                          user_id: user.id,
                          error:
                            error instanceof Error
                              ? error.message
                              : String(error),
                          email_type: "welcome",
                        },
                      });

                      // Log unexpected exceptions (e.g., network errors, timeouts)
                      Sentry.captureException(error, {
                        tags: {
                          component: "better-auth",
                          operation: "welcome-email",
                          email_type: "welcome",
                        },
                        extra: {
                          user_id: user.id,
                        },
                        level: "error",
                      });

                      console.error(
                        `Unexpected error sending welcome email to ${user.email}:`,
                        {
                          error:
                            error instanceof Error
                              ? error.message
                              : String(error),
                        }
                      );
                    }
                  }
                );
              }
            } catch (error) {
              console.error(
                `Error checking welcome email requirements:`,
                error
              );
              Sentry.captureException(error, {
                tags: {
                  component: "better-auth",
                  operation: "check-welcome-settings",
                },
                extra: {
                  user_id: user.id,
                },
                level: "warning",
              });
            }
          }
        }

        // Handle sign-in events
        // Note: Login audit logging is handled in auth.ts router for consistency with signup flow
        // and to have access to more request context

        // Handle sign-out events
        if (ctx.path.startsWith("/sign-out")) {
          const session = ctx.context.session;
          if (session?.user) {
            const user = session.user;

            // Get IP and user agent from headers
            const headers = extractHeaders(ctx.headers);
            const ipAddress = getClientIp(headers);
            const userAgent = getUserAgent(headers);

            // Log logout event (non-blocking - don't fail logout if logging fails)
            try {
              await logSecurityEvent(database, {
                userId: Number(user.id),
                action: "logout",
                ipAddress,
                userAgent,
                success: true,
              });
            } catch (error) {
              console.error(
                `Failed to log logout event for user ${user.id}:`,
                error instanceof Error ? error.message : "Unknown error"
              );
              // Don't throw - logging failures shouldn't prevent logout
            }
          }
        }

        // Handle password reset request events
        if (ctx.path.startsWith("/request-password-reset")) {
          // Get IP and user agent from headers
          const headers = extractHeaders(ctx.headers);
          const ipAddress = getClientIp(headers);
          const userAgent = getUserAgent(headers);

          // Try to find user by email from request body
          try {
            const body = ctx.context.body as { email?: string } | undefined;
            const email = body?.email;
            if (email && typeof email === "string") {
              const [userRecord] = await database
                .select()
                .from(schema.user)
                .where(eq(schema.user.email, email))
                .limit(1);

              if (userRecord) {
                // Log password reset request
                // Note: Email sent status is logged in sendResetPassword callback with actual result
                await logSecurityEvent(database, {
                  userId: Number(userRecord.id),
                  action: "password_reset_request",
                  ipAddress,
                  userAgent,
                  success: true,
                });
              }
            }
          } catch (error) {
            // If we can't find user or log, continue silently
            // Better Auth will still handle the request
            console.error("Error logging password reset request:", error);
          }
        }
      }),
    },
  });
}

// Export a function to get auth instance (for use in adapters)
// This will be called with env in each adapter
export type Auth = ReturnType<typeof createAuth>;
