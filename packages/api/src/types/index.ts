/**
 * Type Definitions for TuvixRSS
 *
 * Central export file for all types. Database schemas are auto-generated
 * from Drizzle ORM via drizzle-zod - use them directly!
 *
 * @example
 * ```ts
 * import { selectUserSchema, insertUserSchema } from '@/types';
 *
 * // Use schemas for validation
 * const user = selectUserSchema.parse(data);
 *
 * // Infer types where needed
 * type User = z.infer<typeof selectUserSchema>;
 * ```
 */

import { z } from "zod";
import * as dbSchemas from "@/db/schemas.zod";

// ============================================================================
// DATABASE SCHEMAS - Auto-generated from Drizzle
// ============================================================================

// Re-export all Zod schemas from drizzle-zod
export {
  // User schemas
  selectUserSchema,
  insertUserSchema,
  updateUserSchema,
  // User settings schemas
  selectUserSettingsSchema,
  insertUserSettingsSchema,
  updateUserSettingsSchema,
  // Source schemas
  selectSourceSchema,
  insertSourceSchema,
  updateSourceSchema,
  // Category schemas
  selectCategorySchema,
  insertCategorySchema,
  updateCategorySchema,
  // Subscription schemas
  selectSubscriptionSchema,
  insertSubscriptionSchema,
  updateSubscriptionSchema,
  // Subscription filter schemas
  selectSubscriptionFilterSchema,
  insertSubscriptionFilterSchema,
  updateSubscriptionFilterSchema,
  // Article schemas
  selectArticleSchema,
  insertArticleSchema,
  updateArticleSchema,
  articleWithSourceSchema,
  // User article state schemas
  selectUserArticleStateSchema,
  insertUserArticleStateSchema,
  updateUserArticleStateSchema,
  // Feed schemas
  selectFeedSchema,
  insertFeedSchema,
  updateFeedSchema,
} from "@/db/schemas.zod";

// ============================================================================
// CUSTOM VALIDATORS & APPLICATION TYPES
// ============================================================================

export * from "./validators";
export * from "./feed";

// ============================================================================
// ENVIRONMENT & RUNTIME TYPES
// ============================================================================

/**
 * Environment configuration for both Cloudflare Workers and Node.js
 */
export interface Env {
  // Runtime
  RUNTIME?: "cloudflare" | "nodejs";

  // Database
  DB?: D1Database; // Cloudflare D1
  DATABASE_PATH?: string; // Node.js SQLite path

  // Authentication
  BETTER_AUTH_SECRET?: string; // Better Auth secret
  BETTER_AUTH_URL?: string; // API URL where Better Auth is hosted (e.g., https://api.tuvix.app)
  API_URL?: string; // API server URL (e.g., http://localhost:3001 or https://api.tuvix.app)

  // Admin Bootstrap
  ADMIN_USERNAME?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  ALLOW_FIRST_USER_ADMIN?: string; // "true" or "false"

  // Rate Limiting (Plan-specific API rate limiting)
  FREE_API_RATE_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }; // Cloudflare Workers rate limit binding for free plan (60/min)
  PRO_API_RATE_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }; // Cloudflare Workers rate limit binding for pro plan (180/min)
  ENTERPRISE_API_RATE_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }; // Cloudflare Workers rate limit binding for enterprise/admin plan (600/min)
  FEED_RATE_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  }; // Cloudflare Workers rate limit binding for public feed requests
  SKIP_RATE_LIMIT?: string; // "true" or "false" - skip rate limiting (for tests)
  RATE_LIMIT_DEBUG?: string; // "true" or "false" - enable debug logging for rate limits

  // Optional Services
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  BASE_URL?: string; // Frontend URL for redirects after verification (e.g., https://feed.tuvix.app)

  // Optional
  PORT?: string;
  NODE_ENV?: string;
  CORS_ORIGIN?: string;

  // Cross-subdomain cookies (for Cloudflare deployments with different subdomains)
  // Set to root domain (e.g., "example.com") to enable cross-subdomain cookies
  COOKIE_DOMAIN?: string; // Root domain for cross-subdomain cookies

  // Sentry
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  CF_VERSION_METADATA?: { id: string }; // Cloudflare version metadata for release tracking
}

/**
 * Authenticated user context (from Better Auth session)
 */
export interface AuthUser {
  userId: number;
  username: string;
  role: "user" | "admin";
}

// ============================================================================
// CONVENIENCE TYPE ALIASES
// ============================================================================
// These make code more readable - infer directly from schemas where you need other types

export type User = z.infer<typeof dbSchemas.selectUserSchema>;
export type Source = z.infer<typeof dbSchemas.selectSourceSchema>;
export type Category = z.infer<typeof dbSchemas.selectCategorySchema>;
export type Subscription = z.infer<typeof dbSchemas.selectSubscriptionSchema>;
export type SubscriptionFilter = z.infer<
  typeof dbSchemas.selectSubscriptionFilterSchema
>;
export type Article = z.infer<typeof dbSchemas.selectArticleSchema>;
export type Feed = z.infer<typeof dbSchemas.selectFeedSchema>;
export type SubscriptionFilterType = SubscriptionFilter;
