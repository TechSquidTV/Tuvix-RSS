/**
 * Custom Validators and Application Types
 *
 * SECURITY: All validators include maximum length limits to prevent:
 * - Database bloat
 * - DoS attacks via large payloads
 * - Buffer overflow vulnerabilities
 *
 * Zod validators and types that are NOT directly from the database schema.
 * For database-derived schemas, see db/schemas.zod.ts
 */

import { z } from "zod";

// ============================================================================
// STRING LENGTH LIMITS
// ============================================================================

export const STRING_LIMITS = {
  // User inputs
  USERNAME: { min: 3, max: 50 },
  EMAIL: { min: 3, max: 255 },

  // Content fields
  TITLE: { min: 1, max: 500 },
  CUSTOM_TITLE: { min: 0, max: 200 },
  DESCRIPTION: { min: 0, max: 5000 },
  CONTENT: { min: 0, max: 500000 }, // 500KB max for article content
  URL: { min: 1, max: 2048 },
  OPML_CONTENT: { min: 1, max: 10000000 }, // 10MB max for OPML imports

  // Metadata fields
  CATEGORY_NAME: { min: 1, max: 100 },
  SLUG: { min: 1, max: 100 },
  FILTER_PATTERN: { min: 1, max: 1000 },
  AUTHOR: { min: 0, max: 255 },

  // Color and icon
  COLOR: 7, // #RRGGBB
  ICON: 100, // Emoji or short identifier
} as const;

// ============================================================================
// CUSTOM VALIDATORS
// ============================================================================

export const regexPatternValidator = z
  .string()
  .min(STRING_LIMITS.FILTER_PATTERN.min)
  .max(STRING_LIMITS.FILTER_PATTERN.max, {
    message: `Pattern must not exceed ${STRING_LIMITS.FILTER_PATTERN.max} characters`,
  })
  .refine(
    (val) => {
      try {
        new RegExp(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid regular expression pattern" }
  );

export const slugValidator = z
  .string()
  .min(STRING_LIMITS.SLUG.min)
  .max(STRING_LIMITS.SLUG.max, {
    message: `Slug must not exceed ${STRING_LIMITS.SLUG.max} characters`,
  })
  .regex(
    /^[a-z0-9-]+$/,
    "Slug must contain only lowercase letters, numbers, and hyphens"
  );

export const hexColorValidator = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color code (e.g., #3B82F6)");

// ============================================================================
// REUSABLE INPUT VALIDATORS
// ============================================================================

/**
 * Username validator with length constraints
 */
export const usernameValidator = z
  .string()
  .min(STRING_LIMITS.USERNAME.min, {
    message: `Username must be at least ${STRING_LIMITS.USERNAME.min} characters`,
  })
  .max(STRING_LIMITS.USERNAME.max, {
    message: `Username must not exceed ${STRING_LIMITS.USERNAME.max} characters`,
  })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message:
      "Username can only contain letters, numbers, underscores, and hyphens",
  });

/**
 * Email validator with length constraints
 */
export const emailValidator = z
  .string()
  .email({ message: "Invalid email address" })
  .min(STRING_LIMITS.EMAIL.min)
  .max(STRING_LIMITS.EMAIL.max, {
    message: `Email must not exceed ${STRING_LIMITS.EMAIL.max} characters`,
  });

/**
 * URL validator with length constraints and protocol validation
 */
export const urlValidator = z
  .string()
  .url({ message: "Invalid URL format" })
  .max(STRING_LIMITS.URL.max, {
    message: `URL must not exceed ${STRING_LIMITS.URL.max} characters`,
  })
  .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
    message: "URL must use HTTP or HTTPS protocol",
  });

/**
 * Domain validator with wildcard pattern support
 * Supports formats like 'example.com' or '*.example.com' for wildcard blocking
 */
export const domainValidator = z
  .string()
  .min(1, { message: "Domain is required" })
  .max(253, { message: "Domain must not exceed 253 characters (RFC 1035)" })
  .refine(
    (val) => {
      const normalized = val.toLowerCase().trim();
      // Allow wildcard pattern: *.example.com
      if (normalized.startsWith("*.")) {
        const suffix = normalized.slice(2); // Remove '*.'
        // Validate suffix is a valid domain (must have at least one dot)
        return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
          suffix
        );
      }
      // Regular domain validation
      return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(
        normalized
      );
    },
    {
      message:
        "Invalid domain format. Use format like 'example.com' or '*.example.com' for wildcard",
    }
  )
  .transform((val) =>
    val
      .toLowerCase()
      .replace(/^www\./, "")
      .trim()
  );

/**
 * Title validator with length constraints
 */
export const titleValidator = z
  .string()
  .min(STRING_LIMITS.TITLE.min, { message: "Title is required" })
  .max(STRING_LIMITS.TITLE.max, {
    message: `Title must not exceed ${STRING_LIMITS.TITLE.max} characters`,
  })
  .trim();

/**
 * Custom title validator (optional, shorter)
 */
export const customTitleValidator = z
  .string()
  .max(STRING_LIMITS.CUSTOM_TITLE.max, {
    message: `Custom title must not exceed ${STRING_LIMITS.CUSTOM_TITLE.max} characters`,
  })
  .trim()
  .optional();

/**
 * Description validator with length constraints
 */
export const descriptionValidator = z
  .string()
  .max(STRING_LIMITS.DESCRIPTION.max, {
    message: `Description must not exceed ${STRING_LIMITS.DESCRIPTION.max} characters`,
  })
  .trim()
  .optional();

/**
 * Category name validator
 */
export const categoryNameValidator = z
  .string()
  .min(STRING_LIMITS.CATEGORY_NAME.min, {
    message: "Category name is required",
  })
  .max(STRING_LIMITS.CATEGORY_NAME.max, {
    message: `Category name must not exceed ${STRING_LIMITS.CATEGORY_NAME.max} characters`,
  })
  .trim();

/**
 * Array of IDs with maximum size to prevent DoS
 */
export const idArrayValidator = (maxSize: number = 500) =>
  z.array(z.number().int().positive()).max(maxSize, {
    message: `Cannot process more than ${maxSize} items at once`,
  });

/**
 * Category names array validator
 */
export const categoryNamesArrayValidator = z
  .array(categoryNameValidator)
  .max(50, {
    message: "Cannot create more than 50 categories at once",
  });

// ============================================================================
// CATEGORY SUGGESTIONS (from feed metadata discovery)
// ============================================================================

/**
 * Category suggestion extracted from feed metadata
 * Sources: RSS categories, Dublin Core subjects, iTunes keywords
 */
export const CategorySuggestionSchema = z.object({
  name: z.string(),
  count: z.number(), // How many articles have this category
  color: z.string(), // Deterministic color generated from name
});

export type CategorySuggestion = z.infer<typeof CategorySuggestionSchema>;

// ============================================================================
// IMPORT JOB SCHEMAS (not stored in database)
// ============================================================================

export const ImportedFeedDetailSchema = z.object({
  url: z.string(),
  title: z.string(),
  status: z.enum(["imported", "skipped", "error"]),
  errorReason: z.string().optional(),
  categories: z.array(z.string()),
});

export const ImportJobSchema = z.object({
  id: z.string(),
  userId: z.number(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number().min(0).max(100),
  totalFeeds: z.number(),
  processedFeeds: z.number(),
  importedCount: z.number(),
  skippedCount: z.number(),
  errorCount: z.number(),
  categoriesDiscovered: z.number(),
  importedFeeds: z.array(ImportedFeedDetailSchema),
  errors: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});

export type ImportedFeedDetail = z.infer<typeof ImportedFeedDetailSchema>;
export type ImportJob = z.infer<typeof ImportJobSchema>;
