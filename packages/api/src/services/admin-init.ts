/**
 * Admin Initialization Service
 *
 * Handles admin user creation and management:
 * - Initialize admin from environment variables
 * - Check if admin users exist
 * - Promote users to admin
 */

import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/db/client";
import type { Env } from "@/types";
import { ADMIN_PLAN } from "@/config/plans";
import { createAuth } from "@/auth/better-auth";
import { initializeNewUser } from "@/services/user-init";

/**
 * Initialize admin user from environment variables
 * Called on first deployment or manually via CLI
 *
 * @returns Result with created status and message
 */
export async function initializeAdmin(
  db: Database,
  env: Env
): Promise<{ created: boolean; message: string }> {
  // Check if admin credentials are provided
  const adminUsername = env.ADMIN_USERNAME;
  const adminEmail = env.ADMIN_EMAIL;
  const adminPassword = env.ADMIN_PASSWORD;

  if (!adminUsername || !adminEmail || !adminPassword) {
    return {
      created: false,
      message: "Admin credentials not provided in environment variables",
    };
  }

  // Check if admin user already exists (check both username and email)
  const existingAdmin = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, adminEmail))
    .limit(1);

  if (existingAdmin.length > 0) {
    return {
      created: false,
      message: "Admin user already exists",
    };
  }

  // Create admin user using Better Auth's API
  // This ensures password is hashed correctly (Better Auth uses scrypt)
  // We need to create a minimal env object for createAuth
  const minimalEnv: Env = {
    RUNTIME: "nodejs",
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET || "",
    DATABASE_PATH: env.DATABASE_PATH,
    PORT: env.PORT,
    CORS_ORIGIN: env.CORS_ORIGIN,
    NODE_ENV: env.NODE_ENV,
    BASE_URL: env.BASE_URL,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM,
  };

  // Create auth instance - it will use the same database connection
  // We pass undefined so createAuth creates its own connection, but we'll use the same db for queries
  const auth = createAuth(minimalEnv);

  // Use Better Auth's signUp API to create the user (handles password hashing correctly)
  // We'll create a fake request context for this
  const fakeHeaders = new Headers();
  fakeHeaders.set("content-type", "application/json");

  try {
    // Use Better Auth's signUpEmail with username field
    // According to Better Auth docs, username can be passed in signUpEmail body
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: adminUsername,
        username: adminUsername, // Pass username directly to signUpEmail
      },
      headers: fakeHeaders,
    });

    if (!signUpResult?.user) {
      return {
        created: false,
        message: "Failed to create admin user via Better Auth",
      };
    }

    const newAdmin = signUpResult.user;
    const adminUserId = Number(newAdmin.id);

    // Atomic initialization: role + settings + usage stats
    // Uses D1 batch for atomic operations - all succeed or all fail
    try {
      await initializeNewUser(db, adminUserId, {
        role: "admin",
        plan: ADMIN_PLAN,
      });

      // Log the creation (separate - not part of atomic init)
      await db.insert(schema.securityAuditLog).values({
        userId: adminUserId,
        action: "admin_created",
        metadata: JSON.stringify({
          method: "env_init",
          username: adminUsername,
        }),
        success: true,
      });

      return {
        created: true,
        message: `Admin user '${adminUsername}' created successfully. CHANGE PASSWORD IMMEDIATELY!`,
      };
    } catch (initError) {
      // Rollback: Delete the incomplete user
      console.error(
        "Admin initialization failed, rolling back user creation:",
        initError
      );

      await db.delete(schema.user).where(eq(schema.user.id, adminUserId));

      throw initError;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      created: false,
      message: `Failed to create admin user: ${errorMessage}`,
    };
  }
}

/**
 * Check if any admin users exist
 * Uses Better Auth user table
 *
 * @returns True if at least one admin exists
 */
export async function hasAdminUser(db: Database): Promise<boolean> {
  const admins = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.role, "admin"))
    .limit(1);

  return admins.length > 0;
}

/**
 * Promote user to admin (used by CLI or first-user logic)
 *
 * @param db Database connection
 * @param userId User ID to promote
 * @param reason Reason for promotion (for audit log)
 */
export async function promoteToAdmin(
  db: Database,
  userId: number,
  reason: string
): Promise<void> {
  await db
    .update(schema.user)
    .set({ role: "admin", plan: ADMIN_PLAN, updatedAt: new Date() })
    .where(eq(schema.user.id, userId));

  // Log the promotion
  await db.insert(schema.securityAuditLog).values({
    userId,
    action: "promoted_to_admin",
    metadata: JSON.stringify({ reason }),
    success: true,
  });
}
