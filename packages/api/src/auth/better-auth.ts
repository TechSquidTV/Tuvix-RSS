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
import { getClientIp, getUserAgent } from "@/auth/security";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Env } from "@/types";
import type { BetterAuthUser } from "@/types/better-auth";
import * as Sentry from "@sentry/node";

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
  // In production: This should be the API URL (e.g., https://api.tuvix.app)
  // In development: This can be the frontend URL since both run on localhost
  const apiUrl = env.BETTER_AUTH_URL || "http://localhost:5173";

  // Get frontend URL for redirects after email verification
  // In production: This should be the frontend URL (e.g., https://feed.tuvix.app)
  // In development: Same as API URL
  const frontendUrl = env.BASE_URL || apiUrl;

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
      // Cross-subdomain cookies configuration
      ...crossSubDomainConfig,
    },
    emailAndPassword: {
      enabled: true,
      // Registration and email verification controlled by globalSettings
      // Note: disableSignUp is checked dynamically in hooks
      // requireEmailVerification must be true to enable the /api/auth/verify-email endpoint
      // The actual enforcement of verification is handled in tRPC middleware
      disableSignUp: false, // Checked dynamically in hooks
      requireEmailVerification: true, // Enables the verify-email endpoint
      sendResetPassword: async ({ user, url, token }) => {
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
        }

        if (!emailResult.success) {
          console.error(
            "Failed to send password reset email:",
            emailResult.error
          );
        }
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
          await Sentry.captureException(error, {
            tags: {
              component: "better-auth",
              operation: "custom-session",
            },
            extra: {
              userId: user.id,
              userEmail: user.email,
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
      sendVerificationEmail: async ({ user, url, token }, request) => {
        // Check if email verification is required
        let requireVerification = false;
        try {
          const settings = await getCachedSettings();
          requireVerification = settings.requireEmailVerification;
        } catch (error) {
          console.error("Failed to get global settings:", error);
          return; // Skip if settings unavailable
        }

        if (!requireVerification) {
          return; // Skip sending if not required
        }

        const userWithPlugins = user as BetterAuthUser;

        // Create email sending promise
        const emailPromise = sendVerificationEmail(env, {
          to: user.email,
          username:
            (userWithPlugins.username as string | undefined) ||
            user.name ||
            "User",
          verificationToken: token,
          verificationUrl: url,
        }).catch((error) => {
          // Log critical email failures to Sentry
          Sentry.captureException(error, {
            tags: {
              component: "better-auth",
              operation: "email-verification",
              email_type: "verification",
            },
            extra: {
              userEmail: user.email,
              userId: user.id,
            },
            level: "error",
          });

          console.error("Failed to send verification email:", {
            userEmail: user.email,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });

        // For Cloudflare Workers: Use waitUntil to ensure email sends without blocking
        // For Node.js: This property won't exist, fire-and-forget is acceptable
        const requestWithWaitUntil = request as {
          waitUntil?: (promise: Promise<unknown>) => void;
        };
        if (requestWithWaitUntil && requestWithWaitUntil.waitUntil) {
          requestWithWaitUntil.waitUntil(emailPromise);
        }

        // Return immediately to avoid blocking signup
        return;
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

            // Get IP and user agent from headers
            const headers: Record<string, string | undefined> = {};
            if (ctx.headers) {
              if (ctx.headers instanceof Headers) {
                ctx.headers.forEach((value, key) => {
                  headers[key.toLowerCase()] = value;
                });
              } else {
                Object.entries(ctx.headers).forEach(([key, value]) => {
                  headers[key.toLowerCase()] = String(value);
                });
              }
            }

            // Note: Registration event logging is handled in the register endpoint
            // after the user is created in the user table, to avoid foreign key constraint issues

            // Send welcome email based on verification requirements
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

                // Create welcome email promise
                const welcomePromise = sendWelcomeEmail(env, {
                  to: user.email,
                  username:
                    (userWithPlugins.username as string | undefined) ||
                    user.name ||
                    "User",
                  appUrl,
                }).catch((error) => {
                  // Log email failures
                  console.error(
                    `Failed to send welcome email to ${user.email}:`,
                    {
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  );
                });

                // Use waitUntil if available (Cloudflare Workers)
                const ctxWithWaitUntil = ctx as {
                  waitUntil?: (promise: Promise<unknown>) => void;
                };
                if (ctx.headers && ctxWithWaitUntil.waitUntil) {
                  ctxWithWaitUntil.waitUntil(welcomePromise);
                }
              }
            } catch (error) {
              console.error(`Error sending welcome email:`, error);
            }
          }
        }

        // Handle sign-in events
        if (ctx.path.startsWith("/sign-in")) {
          const session = ctx.context.session;
          if (session?.user) {
            const user = session.user;

            // Get IP and user agent from headers
            const headers: Record<string, string | undefined> = {};
            if (ctx.headers) {
              if (ctx.headers instanceof Headers) {
                ctx.headers.forEach((value, key) => {
                  headers[key.toLowerCase()] = value;
                });
              } else {
                Object.entries(ctx.headers).forEach(([key, value]) => {
                  headers[key.toLowerCase()] = String(value);
                });
              }
            }

            const ipAddress = getClientIp(headers);
            const userAgent = getUserAgent(headers);

            // Log successful login (non-blocking - don't fail login if logging fails)
            try {
              await logSecurityEvent(database, {
                userId: Number(user.id),
                action: "login_success",
                ipAddress,
                userAgent,
                success: true,
              });
            } catch (error) {
              console.error(
                `Failed to log login event for user ${user.id}:`,
                error instanceof Error ? error.message : "Unknown error"
              );
              // Don't throw - logging failures shouldn't prevent login
            }
          }
        }

        // Handle sign-out events
        if (ctx.path.startsWith("/sign-out")) {
          const session = ctx.context.session;
          if (session?.user) {
            const user = session.user;

            // Get IP and user agent from headers
            const headers: Record<string, string | undefined> = {};
            if (ctx.headers) {
              if (ctx.headers instanceof Headers) {
                ctx.headers.forEach((value, key) => {
                  headers[key.toLowerCase()] = value;
                });
              } else {
                Object.entries(ctx.headers).forEach(([key, value]) => {
                  headers[key.toLowerCase()] = String(value);
                });
              }
            }

            const ipAddress = getClientIp(headers);
            const userAgent = getUserAgent(headers);

            // Log logout event
            await logSecurityEvent(database, {
              userId: Number(user.id),
              action: "logout",
              ipAddress,
              userAgent,
              success: true,
            });
          }
        }

        // Handle password reset request events
        if (ctx.path.startsWith("/request-password-reset")) {
          // Get IP and user agent from headers
          const headers: Record<string, string | undefined> = {};
          if (ctx.headers) {
            if (ctx.headers instanceof Headers) {
              ctx.headers.forEach((value, key) => {
                headers[key.toLowerCase()] = value;
              });
            } else {
              Object.entries(ctx.headers).forEach(([key, value]) => {
                headers[key.toLowerCase()] = String(value);
              });
            }
          }

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
                await logSecurityEvent(database, {
                  userId: Number(userRecord.id),
                  action: "password_reset_request",
                  ipAddress,
                  userAgent,
                  success: true,
                });

                // Log password reset email sent (if email was sent successfully)
                // Note: We can't determine email success here, so we'll log it as success
                // The actual email result is handled in sendResetPassword callback
                await logSecurityEvent(database, {
                  userId: Number(userRecord.id),
                  action: "password_reset_email_sent",
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
