/**
 * Security Utilities
 *
 * Provides audit logging and request metadata extraction
 */

import { securityAuditLog } from "@/db/schema";
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
  | "password_reset_failed"
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
      // Explicitly set createdAt for consistency with app time
      // DB has SQL DEFAULT but we set it here for defense-in-depth
      createdAt: new Date(),
    });
  } catch (error) {
    // Log but don't throw - audit logging shouldn't break the app
    console.error("Failed to log security event:", error);
  }
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

/**
 * Extract request metadata for security audit logging
 * Convenience function that combines header extraction, IP, and user agent
 */
export function getRequestMetadata(
  reqHeaders:
    | Headers
    | Record<string, string | string[] | undefined>
    | undefined
): {
  headers: Record<string, string | undefined>;
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  const headers = extractHeaders(reqHeaders);
  const ipAddress = getClientIp(headers);
  const userAgent = getUserAgent(headers);

  return { headers, ipAddress, userAgent };
}

/**
 * Extract headers from request into a normalized Record
 * Handles both Headers object and plain object formats
 */
export function extractHeaders(
  reqHeaders:
    | Headers
    | Record<string, string | string[] | undefined>
    | undefined
): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};

  if (!reqHeaders) {
    return headers;
  }

  if (reqHeaders instanceof Headers) {
    reqHeaders.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  } else {
    Object.entries(reqHeaders).forEach(([key, value]) => {
      headers[key.toLowerCase()] =
        value === undefined
          ? undefined
          : Array.isArray(value)
            ? value[0]
            : String(value);
    });
  }

  return headers;
}
