/**
 * BASE_URL Helper Utility
 *
 * Constructs the base URL for generating absolute URLs (email links, public feeds, etc.)
 * Works in both Node.js and Cloudflare Workers environments.
 */

import type { Env } from "@/types";

/**
 * Get the base URL for the application
 *
 * Priority:
 * 1. BASE_URL environment variable (if set)
 * 2. Constructed from request headers (X-Forwarded-Host or Host)
 * 3. Development fallback (http://localhost:5173)
 *
 * @param env Environment configuration
 * @param headers Optional request headers for constructing URL
 * @returns Base URL string
 */
export function getBaseUrl(
  env: Env,
  headers?: Record<string, string | undefined>
): string {
  // Priority 1: Use BASE_URL from environment if set
  if (env.BASE_URL) {
    return env.BASE_URL;
  }

  // Priority 2: Construct from request headers (for dynamic detection)
  if (headers) {
    // Check X-Forwarded-Host first (common in proxy setups)
    const forwardedHost = headers["x-forwarded-host"];
    if (forwardedHost) {
      const protocol = headers["x-forwarded-proto"] || "https";
      return `${protocol}://${forwardedHost}`;
    }

    // Fall back to Host header
    const host = headers["host"];
    if (host) {
      // Determine protocol from headers or default to https
      const protocol =
        headers["x-forwarded-proto"] ||
        (headers["x-forwarded-ssl"] === "on" ? "https" : "http");
      return `${protocol}://${host}`;
    }
  }

  // Priority 3: Development fallback
  return "http://localhost:5173";
}
