/**
 * tRPC Context Creation
 *
 * Creates the context object for each request.
 * Portable: works with both Express and Cloudflare Workers.
 * Uses Better Auth for session management.
 */

import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { fromNodeHeaders } from "better-auth/node";
import { createDatabase } from "../db/client";
import { createAuth } from "../auth/better-auth";
import type { Env, AuthUser } from "../types";
import type { BetterAuthUser } from "../types/better-auth";
import type { UserLimits } from "../services/limits";
import type * as schema from "../db/schema";

/**
 * Request-scoped cache to prevent N+1 queries
 * Stores user data and limits fetched during middleware execution
 */
export interface RequestCache {
  userRecord?: typeof schema.user.$inferSelect;
  userLimits?: UserLimits;
}

/**
 * Create context for each request
 *
 * This function is called for every tRPC request.
 * It sets up:
 * - Database connection (portable: SQLite or D1)
 * - User authentication (from Better Auth session)
 */
export const createContext = async (
  opts: FetchCreateContextFnOptions & { env: Env }
) => {
  const { req, env } = opts;

  // Initialize database (automatically selects SQLite or D1)
  const db = createDatabase(env);

  // Get Better Auth instance
  const auth = createAuth(env);

  // Extract and verify Better Auth session (if present)
  let user: AuthUser | null = null;

  try {
    // Convert headers to format Better Auth expects
    // For Cloudflare Workers, headers are already a Headers object
    // For Express, we need to convert from Node.js headers
    const authHeaders =
      req.headers instanceof Headers
        ? req.headers
        : fromNodeHeaders(
            Object.fromEntries(
              Object.entries(req.headers).map(([k, v]) => [
                k,
                Array.isArray(v) ? v[0] : v,
              ])
            ) as Record<string, string>
          );

    const session = await auth.api.getSession({ headers: authHeaders });

    if (session?.user) {
      // Map Better Auth user to AuthUser type
      // Username and role come from plugins
      const userWithPlugins: BetterAuthUser = session.user;
      user = {
        userId: Number(session.user.id),
        username:
          (userWithPlugins.username as string | undefined) ||
          session.user.name ||
          "",
        role: (userWithPlugins.role as "user" | "admin" | undefined) || "user",
      };
    }
  } catch (err) {
    // Invalid session, user stays null
    // This is NOT an error - public procedures exist
  }

  // Extract headers for security logging
  const headers: Record<string, string | undefined> = {};
  if (req.headers instanceof Headers) {
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  } else {
    Object.entries(req.headers).forEach(([key, value]) => {
      let headerValue: string | undefined;
      if (Array.isArray(value)) {
        headerValue = typeof value[0] === "string" ? value[0] : undefined;
      } else {
        headerValue = typeof value === "string" ? value : undefined;
      }
      headers[key.toLowerCase()] = headerValue;
    });
  }

  // Initialize request-scoped cache to prevent N+1 queries
  const cache: RequestCache = {};

  return {
    db,
    user,
    env,
    headers,
    req,
    cache,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
