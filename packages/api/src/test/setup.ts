/**
 * Test Database Setup
 *
 * Utilities for creating in-memory SQLite databases for testing
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import type { Database as AppDatabase } from "@/db/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create an in-memory test database with schema
 *
 * Note: We apply migrations first, then create the drizzle instance with schema.
 * This ensures migrations run on a clean database without schema interference.
 */
export function createTestDb(): BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
} {
  const sqlite = new Database(":memory:");

  // Apply migrations FIRST (before creating drizzle instance with schema)
  // This ensures migrations create tables with the correct structure
  const migrationsPath = path.resolve(__dirname, "../../drizzle");

  // Create a temporary drizzle instance without schema for migrations
  // This prevents Drizzle from auto-creating tables from schema before migrations run
  const dbForMigrations = drizzle(sqlite);

  try {
    migrate(dbForMigrations, { migrationsFolder: migrationsPath });
  } catch (error: unknown) {
    // Re-throw migration errors - they should be fixed in migrations, not here
    throw error;
  }

  // Now create the final db instance WITH schema for type-safe queries
  // The tables already exist from migrations, so schema is just for types
  const db = drizzle(sqlite, { schema });

  return db;
}

/**
 * Seed a test user with a plan
 */
export async function seedTestUser(
  db: AppDatabase,
  overrides?: {
    username?: string;
    email?: string;
    password?: string;
    role?: "user" | "admin";
    plan?: string;
    emailVerified?: boolean;
  }
) {
  const username = overrides?.username || "testuser";
  const email = overrides?.email || "test@example.com";
  const password = overrides?.password || "TestPass123!";
  const role = overrides?.role || "user";
  const plan = overrides?.plan || "free";
  const emailVerified = overrides?.emailVerified ?? true;

  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user in Better Auth user table
  const [user] = await db
    .insert(schema.user)
    .values({
      name: username,
      email,
      username,
      role,
      plan,
      banned: false,
      emailVerified,
    })
    .returning();

  // Also create user in legacy users table (for foreign key compatibility)
  // The old migrations reference users.id, so we need to maintain both tables
  // Migration 0008 keeps the users table for backward compatibility
  try {
    // Access the underlying SQLite client for raw SQL execution
    const sqliteClient = (db as { $client?: Database.Database }).$client;
    if (sqliteClient) {
      const now = Date.now();
      sqliteClient
        .prepare(
          `INSERT INTO users (id, username, email, password, role, plan, banned, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          user.id,
          username,
          email,
          hashedPassword,
          role,
          plan,
          0, // banned as integer (false)
          now,
          now
        );
    }
  } catch (error) {
    // If users table doesn't exist or insert fails, that's okay
    // Some test databases might not have the legacy users table
    // The foreign keys will be updated in a future migration
  }

  // Create account entry for Better Auth (email/password provider)
  await db.insert(schema.account).values({
    accountId: email,
    providerId: "credential",
    userId: user.id,
    password: hashedPassword,
  });

  // Create usage stats for the user (references user.id)
  await db.insert(schema.usageStats).values({
    userId: user.id,
    sourceCount: 0,
    publicFeedCount: 0,
    categoryCount: 0,
    articleCount: 0,
    lastUpdated: new Date(),
  });

  return { user, plainPassword: password };
}

/**
 * Seed a test plan
 */
export async function seedTestPlan(
  db: AppDatabase,
  overrides?: {
    id?: string;
    name?: string;
    maxSources?: number;
    maxPublicFeeds?: number;
    maxCategories?: number;
    apiRateLimitPerMinute?: number;
    publicFeedRateLimitPerMinute?: number;
    priceCents?: number;
    features?: string[];
  }
) {
  const planId = overrides?.id || "test-plan";
  const planName = overrides?.name || "Test Plan";
  const maxSources = overrides?.maxSources || 10;
  const maxPublicFeeds = overrides?.maxPublicFeeds || 5;
  const maxCategories = overrides?.maxCategories || 20;
  const apiRateLimitPerMinute = overrides?.apiRateLimitPerMinute || 60;
  const publicFeedRateLimitPerMinute =
    overrides?.publicFeedRateLimitPerMinute || 2;
  const priceCents = overrides?.priceCents || 0;
  const features = overrides?.features || [];

  const [plan] = await db
    .insert(schema.plans)
    .values({
      id: planId,
      name: planName,
      maxSources,
      maxPublicFeeds,
      maxCategories,
      apiRateLimitPerMinute,
      publicFeedRateLimitPerMinute,
      priceCents,
      features: JSON.stringify(features),
    })
    .returning();

  return plan;
}

/**
 * Seed a test source (RSS feed)
 */
export async function seedTestSource(
  db: any,
  overrides?: {
    url?: string;
    title?: string;
    description?: string;
  }
) {
  const [source] = await db
    .insert(schema.sources)
    .values({
      url: overrides?.url || "https://example.com/feed.xml",
      title: overrides?.title || "Test Feed",
      description: overrides?.description || "A test RSS feed",
      siteUrl: "https://example.com",
    })
    .returning();

  return source;
}

/**
 * Seed a test subscription
 */
export async function seedTestSubscription(
  db: any,
  userId: number,
  sourceId: number,
  overrides?: {
    customTitle?: string;
    filterEnabled?: boolean;
    filterMode?: "include" | "exclude";
  }
) {
  const [subscription] = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      sourceId,
      customTitle: overrides?.customTitle,
      filterEnabled: overrides?.filterEnabled ?? false,
      filterMode: overrides?.filterMode,
    })
    .returning();

  return subscription;
}

/**
 * Seed a test category
 */
export async function seedTestCategory(
  db: any,
  userId: number,
  overrides?: {
    name?: string;
    color?: string;
  }
) {
  const [category] = await db
    .insert(schema.categories)
    .values({
      userId,
      name: overrides?.name || "Test Category",
      color: overrides?.color || "#3B82F6",
    })
    .returning();

  return category;
}

/**
 * Seed global settings for tests
 */
export async function seedGlobalSettings(db: any) {
  // Check if settings already exist
  const [existing] = await db
    .select()
    .from(schema.globalSettings)
    .where(eq(schema.globalSettings.id, 1))
    .limit(1);

  if (!existing) {
    await db.insert(schema.globalSettings).values({
      id: 1,
      maxLoginAttempts: 5,
      loginAttemptWindowMinutes: 15,
      lockoutDurationMinutes: 30,
      allowRegistration: true,
      requireEmailVerification: false,
      passwordResetTokenExpiryHours: 1,
      fetchIntervalMinutes: 60,
      pruneDays: 30,
      lastRssFetchAt: null,
      lastPruneAt: null,
      updatedAt: new Date(),
      updatedBy: null,
    });
  }
}

/**
 * Seed a test article for a source
 */
export async function seedTestArticle(
  db: any,
  sourceId: number,
  overrides?: {
    title?: string;
    link?: string;
    guid?: string;
    description?: string;
    publishedAt?: Date;
  }
) {
  const [article] = await db
    .insert(schema.articles)
    .values({
      sourceId,
      guid: overrides?.guid || `article-${Date.now()}`,
      title: overrides?.title || "Test Article",
      link: overrides?.link || "https://example.com/article",
      description: overrides?.description || "A test article",
      publishedAt: overrides?.publishedAt || new Date(),
    })
    .returning();

  return article;
}

/**
 * Clean up database after tests
 */
export function cleanupTestDb(db: any) {
  // Close the database connection
  // Handle both better-sqlite3 (has $client) and D1 (different structure)
  if (db?.$client) {
    db.$client.close();
  } else if (db?.client) {
    db.client.close();
  }
}
