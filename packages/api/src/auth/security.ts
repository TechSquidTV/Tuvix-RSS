/**
 * Security Utilities
 *
 * Provides audit logging and password reset token management
 */

import { randomBytes } from "crypto";
import { eq, and, lt } from "drizzle-orm";
import { passwordResetTokens, securityAuditLog } from "@/db/schema";
import type { Database } from "@/db/client";

/**
 * Security audit event types
 */
export type SecurityAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "register"
  | "password_change"
  | "password_reset_request"
  | "password_reset_email_sent"
  | "password_reset_success"
  | "account_locked"
  | "account_unlocked"
  | "token_expired"
  | "invalid_token"
  | "admin_created"
  | "admin_first_user"
  | "promoted_to_admin";

/**
 * Log a security event to the audit log
 */
export async function logSecurityEvent(
  db: Database,
  params: {
    userId?: number;
    action: SecurityAction;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
    success: boolean;
  }
): Promise<void> {
  try {
    await db.insert(securityAuditLog).values({
      userId: params.userId,
      action: params.action,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      success: params.success,
    });
  } catch (error) {
    // Log but don't throw - audit logging shouldn't break the app
    console.error("Failed to log security event:", error);
  }
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("hex");
}

/**
 * Create a password reset token
 * Expires in 1 hour by default
 */
export async function createPasswordResetToken(
  db: Database,
  userId: number,
  expiresInMinutes: number = 60
): Promise<string> {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  // Invalidate any existing unused tokens for this user
  await db
    .update(passwordResetTokens)
    .set({ used: true })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        eq(passwordResetTokens.used, false)
      )
    );

  // Create new token
  await db.insert(passwordResetTokens).values({
    userId,
    token,
    expiresAt,
    used: false,
  });

  return token;
}

/**
 * Validate and consume a password reset token
 * Returns userId if valid, null otherwise
 */
export async function validatePasswordResetToken(
  db: Database,
  token: string
): Promise<number | null> {
  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  if (!resetToken) {
    return null;
  }

  // Check if token is expired
  if (resetToken.expiresAt < new Date()) {
    return null;
  }

  // Check if token is already used
  if (resetToken.used) {
    return null;
  }

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ used: true })
    .where(eq(passwordResetTokens.id, resetToken.id));

  return resetToken.userId;
}

/**
 * Clean up expired password reset tokens
 * Should be run periodically (e.g., daily cron job)
 */
export async function cleanupExpiredTokens(db: Database): Promise<number> {
  const now = new Date();

  // Delete tokens that expired more than 24 hours ago
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const result = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, oneDayAgo))
    .returning();

  return result.length;
}

/**
 * Get client IP address from request headers
 * Handles various proxy headers
 */
export function getClientIp(
  headers: Record<string, string | undefined>
): string | undefined {
  // Check various headers in order of preference
  const candidates = [
    headers["cf-connecting-ip"], // Cloudflare
    headers["x-real-ip"], // Nginx
    headers["x-forwarded-for"]?.split(",")[0], // Standard proxy header (first IP)
    headers["x-client-ip"],
  ];

  for (const ip of candidates) {
    if (ip && ip.trim()) {
      return ip.trim();
    }
  }

  return undefined;
}

/**
 * Extract user agent from headers
 */
export function getUserAgent(
  headers: Record<string, string | undefined>
): string | undefined {
  return headers["user-agent"];
}
