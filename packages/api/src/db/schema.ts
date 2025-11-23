/**
 * Database Schema Definitions
 *
 * This schema matches the existing Go API database structure.
 * Compatible with both better-sqlite3 (Docker) and Cloudflare D1 (Workers).
 */

import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  unique,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// BETTER AUTH TABLES
// ============================================================================
// These tables are required by Better Auth library

export const user = sqliteTable("user", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  role: text("role"),
  plan: text("plan").default("free"), // User plan (Better Auth additionalFields)
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
});

export const session = sqliteTable("session", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = sqliteTable("account", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp_ms",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp_ms",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = sqliteTable("verification", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

// Rate limiting table removed - Better Auth rate limiting is disabled
// The rate_limit table was previously used by Better Auth for database-backed
// rate limiting, but we've disabled Better Auth's internal rate limiting
// in favor of our custom Cloudflare Workers rate limit bindings system.

// ============================================================================
// SOURCES (RSS Feeds)
// ============================================================================

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    siteUrl: text("site_url"),
    iconUrl: text("icon_url"), // External icon URL (e.g., DuckDuckGo favicon API)
    iconType: text("icon_type", {
      enum: ["auto", "custom", "none"],
    }).default("auto"),
    iconUpdatedAt: integer("icon_updated_at", { mode: "timestamp" }),
    lastFetched: integer("last_fetched", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_sources_url").on(table.url),
    index("idx_sources_icon_url").on(table.iconUrl),
  ]
);

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    customTitle: text("custom_title"),
    filterEnabled: integer("filter_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    filterMode: text("filter_mode", {
      enum: ["include", "exclude"],
    })
      .notNull()
      .default("include"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_subscriptions_user_id").on(table.userId),
    index("idx_subscriptions_source_id").on(table.sourceId),
  ]
);

// ============================================================================
// SUBSCRIPTION FILTERS
// ============================================================================

export const subscriptionFilters = sqliteTable(
  "subscription_filters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    field: text("field", {
      enum: ["title", "content", "description", "author", "any"],
    }).notNull(),
    matchType: text("match_type", {
      enum: ["contains", "regex", "exact"],
    }).notNull(),
    pattern: text("pattern").notNull(),
    caseSensitive: integer("case_sensitive", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_subscription_filters_subscription_id").on(table.subscriptionId),
  ]
);

// ============================================================================
// ARTICLES
// ============================================================================

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    link: text("link"),
    description: text("description"),
    content: text("content"),
    author: text("author"),
    imageUrl: text("image_url"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_articles_source_id").on(table.sourceId),
    index("idx_articles_published_at").on(table.publishedAt),
    index("idx_articles_guid").on(table.guid),
    unique().on(table.sourceId, table.guid),
  ]
);

// ============================================================================
// USER ARTICLE STATES (Read/Saved Status)
// ============================================================================

export const userArticleStates = sqliteTable(
  "user_article_states",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.articleId] }),
    index("idx_user_article_states_user_id").on(table.userId),
    index("idx_user_article_states_read").on(table.read),
    index("idx_user_article_states_saved").on(table.saved),
  ]
);

// ============================================================================
// CATEGORIES (Tags)
// ============================================================================

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(), // Hex color code
    icon: text("icon"), // Emoji or icon identifier
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_categories_user_id").on(table.userId),
    uniqueIndex("idx_categories_user_id_name_normalized").on(
      table.userId,
      sql`LOWER(${table.name})`
    ),
  ]
);

// ============================================================================
// SUBSCRIPTION CATEGORIES (Many-to-Many)
// ============================================================================

export const subscriptionCategories = sqliteTable(
  "subscription_categories",
  {
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId, table.categoryId] }),
    index("idx_subscription_categories_subscription_id").on(
      table.subscriptionId
    ),
    index("idx_subscription_categories_category_id").on(table.categoryId),
  ]
);

// ============================================================================
// FEEDS (User-Generated Public Feeds)
// ============================================================================

export const feeds = sqliteTable(
  "feeds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    public: integer("public", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_feeds_user_id").on(table.userId),
    index("idx_feeds_slug").on(table.slug),
    unique().on(table.userId, table.slug),
  ]
);

// ============================================================================
// FEED CATEGORIES (Many-to-Many)
// ============================================================================

export const feedCategories = sqliteTable(
  "feed_categories",
  {
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.feedId, table.categoryId] }),
    index("idx_feed_categories_feed_id").on(table.feedId),
    index("idx_feed_categories_category_id").on(table.categoryId),
  ]
);

// ============================================================================
// USER SETTINGS
// ============================================================================

export const userSettings = sqliteTable(
  "user_settings",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    theme: text("theme").notNull().default("system"), // 'system', 'light', 'dark'
    autoAgeDays: integer("auto_age_days").notNull().default(7), // Auto-mark as read after X days
    defaultFilter: text("default_filter").notNull().default("all"), // 'all', 'unread', 'read', 'saved'
    shareEmail: integer("share_email", { mode: "boolean" })
      .notNull()
      .default(true),
    shareHackernews: integer("share_hackernews", { mode: "boolean" })
      .notNull()
      .default(false),
    shareReddit: integer("share_reddit", { mode: "boolean" })
      .notNull()
      .default(false),
    shareTwitter: integer("share_twitter", { mode: "boolean" })
      .notNull()
      .default(false),
    shareBluesky: integer("share_bluesky", { mode: "boolean" })
      .notNull()
      .default(false),
    shareMastodon: integer("share_mastodon", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("idx_user_settings_user_id").on(table.userId)]
);

// ============================================================================
// PASSWORD RESET TOKENS
// ============================================================================

export const passwordResetTokens = sqliteTable(
  "password_reset_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    used: integer("used", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_password_reset_tokens_token").on(table.token),
    index("idx_password_reset_tokens_user_id").on(table.userId),
  ]
);

// ============================================================================
// SECURITY AUDIT LOG
// ============================================================================

export const securityAuditLog = sqliteTable(
  "security_audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // 'login', 'logout', 'password_change', 'failed_login', 'account_locked', etc.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: text("metadata"), // JSON string for additional data
    success: integer("success", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_security_audit_log_user_id").on(table.userId),
    index("idx_security_audit_log_action").on(table.action),
    index("idx_security_audit_log_created_at").on(table.createdAt),
  ]
);

// ============================================================================
// GLOBAL SETTINGS (Singleton table for admin-configurable settings)
// ============================================================================

export const globalSettings = sqliteTable("global_settings", {
  id: integer("id")
    .primaryKey()
    .$defaultFn(() => 1), // Always 1 (singleton)

  // Authentication rate limiting
  maxLoginAttempts: integer("max_login_attempts").notNull().default(5),
  loginAttemptWindowMinutes: integer("login_attempt_window_minutes")
    .notNull()
    .default(15),
  lockoutDurationMinutes: integer("lockout_duration_minutes")
    .notNull()
    .default(30),

  // Registration settings
  allowRegistration: integer("allow_registration", { mode: "boolean" })
    .notNull()
    .default(true),
  requireEmailVerification: integer("require_email_verification", {
    mode: "boolean",
  })
    .notNull()
    .default(false),

  // Password reset
  passwordResetTokenExpiryHours: integer("password_reset_token_expiry_hours")
    .notNull()
    .default(1),

  // System settings
  fetchIntervalMinutes: integer("fetch_interval_minutes").notNull().default(60),
  pruneDays: integer("prune_days").notNull().default(30),

  // Operational timestamps (for Cloudflare Workers)
  lastRssFetchAt: integer("last_rss_fetch_at", { mode: "timestamp" }),
  lastPruneAt: integer("last_prune_at", { mode: "timestamp" }),

  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: integer("updated_by").references(() => user.id),
});

// ============================================================================
// PLANS
// ============================================================================

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(), // 'free', 'pro', 'enterprise', 'custom'
  name: text("name").notNull(),
  maxSources: integer("max_sources").notNull(),
  maxPublicFeeds: integer("max_public_feeds").notNull(),
  maxCategories: integer("max_categories"),
  apiRateLimitPerMinute: integer("api_rate_limit_per_minute").notNull(),
  publicFeedRateLimitPerMinute: integer(
    "public_feed_rate_limit_per_minute"
  ).notNull(),
  priceCents: integer("price_cents").notNull(),
  features: text("features"), // JSON string
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// USER LIMITS (Custom Overrides)
// ============================================================================

export const userLimits = sqliteTable("user_limits", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  maxSources: integer("max_sources"),
  maxPublicFeeds: integer("max_public_feeds"),
  maxCategories: integer("max_categories"),
  apiRateLimitPerMinute: integer("api_rate_limit_per_minute"),
  publicFeedRateLimitPerMinute: integer("public_feed_rate_limit_per_minute"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// USAGE STATS
// ============================================================================

export const usageStats = sqliteTable("usage_stats", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  sourceCount: integer("source_count").notNull().default(0),
  publicFeedCount: integer("public_feed_count").notNull().default(0),
  categoryCount: integer("category_count").notNull().default(0),
  articleCount: integer("article_count").notNull().default(0),
  lastUpdated: integer("last_updated", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// PUBLIC FEED ACCESS LOG
// ============================================================================

export const publicFeedAccessLog = sqliteTable(
  "public_feed_access_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, {
        onDelete: "cascade",
      }),
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent"),
    accessedAt: integer("accessed_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_public_feed_access_log_feed_id").on(table.feedId),
    index("idx_public_feed_access_log_accessed_at").on(table.accessedAt),
  ]
);

// ============================================================================
// API USAGE LOG
// ============================================================================

export const apiUsageLog = sqliteTable(
  "api_usage_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    endpoint: text("endpoint").notNull(),
    method: text("method").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms"),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_api_usage_log_user_id").on(table.userId),
    index("idx_api_usage_log_created_at").on(table.createdAt),
    index("idx_api_usage_log_endpoint").on(table.endpoint),
  ]
);

// ============================================================================
// BLOCKED DOMAINS
// ============================================================================

export const blockedDomains = sqliteTable(
  "blocked_domains",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    domain: text("domain").notNull().unique(),
    reason: text("reason", {
      enum: [
        "illegal_content",
        "excessive_automation",
        "spam",
        "malware",
        "copyright_violation",
        "other",
      ],
    }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    createdBy: integer("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("idx_blocked_domains_domain").on(table.domain),
    index("idx_blocked_domains_reason").on(table.reason),
    index("idx_blocked_domains_created_at").on(table.createdAt),
  ]
);
