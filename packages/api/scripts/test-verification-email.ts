#!/usr/bin/env tsx
/**
 * Test script to verify email sending works
 *
 * This script manually triggers the sendVerificationEmail callback
 * to test if the email service and Better Auth integration work.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-verification-email.ts <email>
 *
 * Example:
 *   pnpm exec tsx scripts/test-verification-email.ts test@example.com
 */

import { createAuth } from "../src/auth/better-auth";
import { createDatabase } from "../src/db/client";
import type { Env } from "../src/types";

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("❌ Error: Please provide an email address");
    console.error(
      "Usage: pnpm exec tsx scripts/test-verification-email.ts <email>"
    );
    process.exit(1);
  }

  // Check required environment variables
  if (!process.env.BETTER_AUTH_SECRET) {
    console.error("❌ Error: BETTER_AUTH_SECRET not set");
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("❌ Error: RESEND_API_KEY not set");
    process.exit(1);
  }

  console.log("🔧 Testing verification email for:", email);
  console.log("");

  // Create mock env (uses local SQLite via D1_LOCAL_PATH or requires D1_DATABASE_ID)
  const env: Env = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM || "noreply@tuvix.app",
    BASE_URL: process.env.BASE_URL || "http://localhost:5173",
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:3001",
    API_URL: process.env.API_URL || "http://localhost:3001",
    CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
    RUNTIME: "nodejs",
  } as Env;

  try {
    // Create database connection (will use local SQLite if available)
    const db = createDatabase(env);

    // Create auth instance
    const auth = createAuth(env, db);

    console.log("📧 Calling sendVerificationEmail API...");

    // Call Better Auth's server-side API to send verification email
    const result = await auth.api.sendVerificationEmail({
      body: {
        email,
        callbackURL: `${env.BASE_URL}/app/articles`,
      },
    });

    console.log("");
    if (result.status) {
      console.log("✅ Success! Verification email should be sent.");
      console.log("   Check your console logs above for:");
      console.log("   [VERIFICATION EMAIL] CALLBACK INVOKED!");
      console.log("");
      console.log("   Check your email inbox for the verification link.");
    } else {
      console.log("❌ Failed to send verification email");
      console.log("   Result:", result);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
