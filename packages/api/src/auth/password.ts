/**
 * Password Hashing Utility
 *
 * Minimal password hashing utility for admin initialization and tests.
 * Better Auth handles password hashing for regular authentication flows.
 */

import bcrypt from "bcrypt";

const DEFAULT_SALT_ROUNDS = 12;

/**
 * Hash a plain text password
 * Used for admin initialization and test setup only
 */
export async function hashPassword(
  password: string,
  saltRounds: number = DEFAULT_SALT_ROUNDS
): Promise<string> {
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    throw new Error(
      `Password hashing failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Verify a password against a hash
 * Used for admin initialization and test setup only
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    return false;
  }
}
