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

/**
 * Create Better Auth instance
 * This function creates a new auth instance with the database connection
 * @param env Environment configuration
 * @param db Optional database instance (for testing with in-memory DB)
 */
export function createAuth(env: Env, db?: ReturnType<typeof createDatabase>) {
  const database = db || createDatabase(env);

  // Get base URL for email links
  const baseUrl =
    env.BASE_URL || env.BETTER_AUTH_URL || "http://localhost:5173";

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
    baseURL: baseUrl,
    basePath: "/api/auth",
    trustedOrigins: trustedOrigins.length > 0 ? trustedOrigins : undefined,
    telemetry: {
      enabled: false,
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
      // Note: disableSignUp and requireEmailVerification are checked dynamically
      // Better Auth doesn't support dynamic config, so we check in hooks/middleware
      disableSignUp: false, // Checked dynamically in hooks
      requireEmailVerification: false, // Checked dynamically in hooks
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
        const result = await database
          .select()
          .from(schema.user)
          .where(eq(schema.user.id, Number(user.id)))
          .limit(1);
        const dbUser = result[0];

        return {
          user: {
            ...user,
            banned: dbUser?.banned ?? false,
          },
          session,
        };
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
      sendVerificationEmail: async ({ user, url, token }) => {
        // Check if email verification is required
        try {
          const settings = await getGlobalSettings(database);
          if (!settings.requireEmailVerification) {
            // Skip sending if not required
            return;
          }
        } catch (error) {
          // If settings don't exist, skip verification
          console.error("Failed to get global settings:", error);
          return;
        }

        // Send verification email using dedicated verification email template
        const userWithPlugins = user as BetterAuthUser;
        const emailResult = await sendVerificationEmail(env, {
          to: user.email,
          username:
            (userWithPlugins.username as string | undefined) ||
            user.name ||
            "User",
          verificationToken: token,
          verificationUrl: url,
        });

        if (!emailResult.success) {
          console.error(
            "Failed to send verification email:",
            emailResult.error
          );
        }
      },
      sendOnSignUp: false, // Will be checked dynamically in hooks
      autoSignInAfterVerification: true,
      expiresIn: 3600, // 1 hour
    },
    // Hooks for security audit logging and welcome emails
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Check if registration is disabled before processing sign-up
        if (ctx.path.startsWith("/sign-up")) {
          try {
            const settings = await getGlobalSettings(database);
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

            // Create user in legacy users table for foreign key compatibility
            // The old migrations reference users.id, so we need to maintain both tables
            try {
              const userWithPlugins = user as BetterAuthUser;
              const username = userWithPlugins.username || user.name || "";
              const role = userWithPlugins.role || "user";
              const plan =
                (userWithPlugins.plan as string | undefined) || "free";
              const now = Date.now();

              // Get the account password if available (for email/password signups)
              const account = await database
                .select()
                .from(schema.account)
                .where(eq(schema.account.userId, Number(user.id)))
                .limit(1);

              const password = account[0]?.password || "";

              // Access the underlying SQLite client for raw SQL execution
              // Only works for better-sqlite3, not D1
              // Type assertion needed because Database type is a union of D1 and SQLite
              const sqliteClient = (
                database as unknown as {
                  $client?: {
                    prepare: (sql: string) => {
                      run: (...args: unknown[]) => void;
                    };
                  };
                }
              ).$client;
              if (sqliteClient) {
                sqliteClient
                  .prepare(
                    `INSERT OR IGNORE INTO users (id, username, email, password, role, plan, banned, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                  )
                  .run(
                    Number(user.id),
                    username,
                    user.email,
                    password,
                    role,
                    plan,
                    0, // banned as integer (false)
                    now,
                    now
                  );
              }
            } catch (error) {
              // If users table doesn't exist or insert fails, log but don't fail registration
              // This is a compatibility layer for old migrations
              console.warn(
                `Failed to create user in legacy users table: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            }

            // Note: Registration event logging is handled in the register endpoint
            // after the user is created in the user table, to avoid foreign key constraint issues

            // Send verification email if required
            try {
              const settings = await getGlobalSettings(database);
              if (settings.requireEmailVerification && !user.emailVerified) {
                // Trigger verification email by creating a verification token
                // Better Auth's emailVerification.sendVerificationEmail will be called
                // We need to manually trigger it since sendOnSignUp is false
                const crypto = await import("crypto");
                const token = crypto.randomBytes(32).toString("hex");
                const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

                // Store verification token
                await database.insert(schema.verification).values({
                  identifier: user.email,
                  value: token,
                  expiresAt: expiresAt,
                });

                // Generate verification URL
                const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

                // Send verification email using the configured callback
                const userWithPlugins = user as BetterAuthUser;
                await sendVerificationEmail(env, {
                  to: user.email,
                  username:
                    (userWithPlugins.username as string | undefined) ||
                    user.name ||
                    "User",
                  verificationToken: token,
                  verificationUrl: verificationUrl,
                });
              }

              // Send welcome email (only if email verification is not required or already verified)
              if (!settings.requireEmailVerification || user.emailVerified) {
                const appUrl = baseUrl;
                const userWithPlugins = user as BetterAuthUser;
                const emailResult = await sendWelcomeEmail(env, {
                  to: user.email,
                  username: userWithPlugins.username || user.name || "User",
                  appUrl,
                });

                if (!emailResult.success) {
                  console.error(
                    `Failed to send welcome email to ${user.email}:`,
                    emailResult.error
                  );
                }
              }
            } catch (error) {
              console.error(`Error sending emails to ${user.email}:`, error);
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
        if (ctx.path.startsWith("/forget-password")) {
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
