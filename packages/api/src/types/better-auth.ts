/**
 * Better Auth Type Definitions
 *
 * Uses Better Auth's $Infer system to get proper types from the auth instance.
 * Plugins (username, admin, customSession) automatically extend these types.
 *
 * These types are extracted from the Auth type returned by createAuth().
 * Import Auth from @/auth/better-auth and use these helper types.
 */

import type { Auth } from "@/auth/better-auth";

/**
 * Helper type to extract $Infer types from Auth instance
 */
type AuthInfer<T extends keyof Auth["$Infer"]> = Auth["$Infer"][T];

/**
 * Better Auth Session type (includes user and session)
 * - user: BetterAuthUser (with all plugin extensions)
 * - session: Session object
 */
export type BetterAuthSession = AuthInfer<"Session">;

/**
 * Better Auth User type (includes plugin extensions)
 * Extracted from Session type since $Infer only exposes Session
 * - username plugin adds: username
 * - admin plugin adds: role
 * - customSession adds: banned
 * - additionalFields adds: plan
 *
 * Note: Plugin fields may be optional depending on when the user object is accessed
 */
export type BetterAuthUser = BetterAuthSession extends { user: infer U }
  ? U extends {
      banned?: infer B;
      role?: infer R;
      username?: infer UN;
      plan?: infer P;
    }
    ? U & { banned?: B; role?: R; username?: UN; plan?: P }
    : U
  : never;

/**
 * Better Auth API method types
 */
export type BetterAuthAPI = Auth["api"];

/**
 * Sign up email input type
 */
export type SignUpEmailInput = Parameters<Auth["api"]["signUpEmail"]>[0];

/**
 * Sign up email result type
 */
export type SignUpEmailResult = Awaited<ReturnType<Auth["api"]["signUpEmail"]>>;

/**
 * Sign in username input type
 */
export type SignInUsernameInput = Parameters<Auth["api"]["signInUsername"]>[0];

/**
 * Sign in username result type
 */
export type SignInUsernameResult = Awaited<
  ReturnType<Auth["api"]["signInUsername"]>
>;

/**
 * Sign in email input type
 */
export type SignInEmailInput = Parameters<Auth["api"]["signInEmail"]>[0];

/**
 * Sign in email result type
 */
export type SignInEmailResult = Awaited<ReturnType<Auth["api"]["signInEmail"]>>;

/**
 * Get session result type
 */
export type GetSessionResult = Awaited<ReturnType<Auth["api"]["getSession"]>>;
