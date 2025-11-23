/**
 * Domain Checker Utility
 *
 * Functions for extracting, normalizing, and checking domains against blocked lists.
 * Supports wildcard patterns (*.example.com) and enterprise user bypass.
 */

import type { Database } from "@/db/client";
import * as schema from "@/db/schema";

/**
 * Extract domain from URL
 *
 * @param url - The URL to extract domain from
 * @returns Normalized domain string, or null if URL parsing fails
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalize domain string
 *
 * Converts to lowercase, removes www prefix, and trims whitespace.
 * Does not validate format - use domainValidator for that.
 *
 * @param domain - Domain string to normalize
 * @returns Normalized domain string
 */
export function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^www\./, "")
    .trim();
}

/**
 * Check if a domain is blocked
 *
 * Supports:
 * - Exact match: "example.com" blocks "example.com" and all subdomains
 * - Subdomain blocking: If "example.com" is blocked, "sub.example.com" is also blocked
 * - Wildcard patterns: "*.example.com" blocks any subdomain (e.g., "sub.example.com", "anything.example.com")
 * - Enterprise bypass: Enterprise users are not blocked
 *
 * @param domain - Domain to check (will be normalized)
 * @param blockedDomains - Array of blocked domain patterns
 * @param userPlan - User's plan (optional, for enterprise bypass)
 * @returns True if domain is blocked, false otherwise
 */
export function isDomainBlocked(
  domain: string,
  blockedDomains: string[],
  userPlan?: string
): boolean {
  // Enterprise users bypass blocking
  if (userPlan === "enterprise") {
    return false;
  }

  const normalizedDomain = normalizeDomain(domain);

  for (const blockedPattern of blockedDomains) {
    const normalizedPattern = normalizeDomain(blockedPattern);

    // Wildcard pattern: *.example.com
    if (normalizedPattern.startsWith("*.")) {
      const suffix = normalizedPattern.slice(2); // Remove '*.'
      if (
        normalizedDomain.endsWith(`.${suffix}`) ||
        normalizedDomain === suffix
      ) {
        return true;
      }
    } else {
      // Exact match or subdomain match
      // If blocked is "example.com", check if domain is "example.com" or ends with ".example.com"
      if (
        normalizedDomain === normalizedPattern ||
        normalizedDomain.endsWith(`.${normalizedPattern}`)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get blocked domain reason
 *
 * Checks if domain is blocked and returns the reason for user-facing error messages.
 * Respects enterprise user bypass.
 *
 * @param domain - Domain to check (will be normalized)
 * @param blockedDomains - Array of blocked domain objects with domain and reason
 * @param userPlan - User's plan (optional, for enterprise bypass)
 * @returns Object with blocked status and reason
 */
export function getBlockedDomainReason(
  domain: string,
  blockedDomains: Array<{ domain: string; reason: string | null }>,
  userPlan?: string
): { blocked: boolean; reason: string | null } {
  // Enterprise users bypass blocking
  if (userPlan === "enterprise") {
    return { blocked: false, reason: null };
  }

  const normalizedDomain = normalizeDomain(domain);

  for (const blocked of blockedDomains) {
    const normalizedPattern = normalizeDomain(blocked.domain);

    // Wildcard pattern: *.example.com
    if (normalizedPattern.startsWith("*.")) {
      const suffix = normalizedPattern.slice(2); // Remove '*.'
      if (
        normalizedDomain.endsWith(`.${suffix}`) ||
        normalizedDomain === suffix
      ) {
        return { blocked: true, reason: blocked.reason };
      }
    } else {
      // Exact match or subdomain match
      if (
        normalizedDomain === normalizedPattern ||
        normalizedDomain.endsWith(`.${normalizedPattern}`)
      ) {
        return { blocked: true, reason: blocked.reason };
      }
    }
  }

  return { blocked: false, reason: null };
}

/**
 * Get all blocked domains from database
 *
 * Safe migration: Returns empty array if table doesn't exist yet (migrations run after deployment).
 * This allows code to deploy before migrations without errors.
 *
 * @param db - Database instance
 * @returns Array of blocked domain objects with domain and reason
 */
export async function getBlockedDomains(
  db: Database
): Promise<Array<{ domain: string; reason: string | null }>> {
  try {
    const blocked = await db.select().from(schema.blockedDomains);
    return blocked.map((b) => ({
      domain: b.domain,
      reason: b.reason,
    }));
  } catch (error) {
    // Safe migration: If table doesn't exist yet, return empty array
    // This allows code to deploy before migrations without errors
    if (
      error instanceof Error &&
      (error.message.includes("no such table") ||
        error.message.includes("does not exist"))
    ) {
      console.warn(
        "blocked_domains table not found - migrations may not have run yet. Returning empty blocked domains list."
      );
      return [];
    }
    // Re-throw other errors
    throw error;
  }
}
