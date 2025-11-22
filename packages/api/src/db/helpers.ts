/**
 * Database Helper Functions
 *
 * Common database operations like ownership verification,
 * slug checking, and many-to-many relationship updates.
 */

import { TRPCError } from "@trpc/server";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { SQLiteTable, SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Verify user owns a resource, throw NOT_FOUND if not
 *
 * @param db Database instance
 * @param table Drizzle table definition
 * @param resourceId Resource ID to check
 * @param userId User ID who should own the resource
 * @param resourceName Human-readable resource name for error message
 * @returns The resource row
 * @throws TRPCError with NOT_FOUND code if resource not found or not owned by user
 *
 * @example
 * const category = await requireOwnership<typeof schema.categories.$inferSelect>(
 *   ctx.db,
 *   schema.categories,
 *   input.id,
 *   ctx.user.userId,
 *   "Category"
 * );
 */
// Type for tables with id and userId columns
type TableWithOwnership = SQLiteTable & {
  id: SQLiteColumn;
  userId: SQLiteColumn;
};

export async function requireOwnership<T>(
  db: Database,
  table: TableWithOwnership,
  resourceId: number,
  userId: number,
  resourceName: string
): Promise<T> {
  const result = await db
    .select()
    .from(table)
    .where(and(eq(table.id, resourceId), eq(table.userId, userId)))
    .limit(1);

  if (!result.length) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${resourceName} not found or not accessible`,
    });
  }

  return result[0] as T;
}

/**
 * Check if a slug already exists for a user
 *
 * @param db Database instance
 * @param table Drizzle table definition
 * @param userId User ID
 * @param slug Slug to check
 * @param excludeId Optional ID to exclude from check (for updates)
 * @returns true if slug exists, false otherwise
 *
 * @example
 * const exists = await slugExists(ctx.db, schema.feeds, userId, "my-feed");
 * if (exists) {
 *   throw new TRPCError({ code: "CONFLICT", message: "Slug already exists" });
 * }
 */
// Type for tables with userId and slug columns
type TableWithSlug = SQLiteTable & {
  userId: SQLiteColumn;
  slug: SQLiteColumn;
  id: SQLiteColumn;
};

export async function slugExists(
  db: Database,
  table: TableWithSlug,
  userId: number,
  slug: string,
  excludeId?: number
): Promise<boolean> {
  const conditions: SQL[] = [eq(table.userId, userId), eq(table.slug, slug)];

  if (excludeId !== undefined) {
    conditions.push(sql`${table.id} != ${excludeId}`);
  }

  const result = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .limit(1);

  return result.length > 0;
}

/**
 * Check if a category name already exists for a user (case-insensitive)
 *
 * @param db Database instance
 * @param table Drizzle table definition (must have name and userId columns)
 * @param userId User ID
 * @param name Category name to check
 * @param excludeId Optional ID to exclude from check (for updates)
 * @returns true if name exists, false otherwise
 */
// Type for tables with userId and name columns
type TableWithName = SQLiteTable & {
  userId: SQLiteColumn;
  name: SQLiteColumn;
  id: SQLiteColumn;
};

export async function categoryNameExists(
  db: Database,
  table: TableWithName,
  userId: number,
  name: string,
  excludeId?: number
): Promise<boolean> {
  const conditions: SQL[] = [
    eq(table.userId, userId),
    sql`LOWER(${table.name}) = LOWER(${name})`,
  ];

  if (excludeId !== undefined) {
    conditions.push(sql`${table.id} != ${excludeId}`);
  }

  const result = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .limit(1);

  return result.length > 0;
}

/**
 * Find or create a category by name (case-insensitive normalization)
 *
 * This function ensures category names are normalized - if "Tech" exists,
 * creating "tech" will return the existing "Tech" category instead of creating a duplicate.
 *
 * @param db Database instance
 * @param categoriesTable Categories table from schema
 * @param userId User ID
 * @param name Category name (will be normalized)
 * @param generateColor Function to generate color for new categories
 * @returns The category ID (existing or newly created)
 */
// Type for category tables
type CategoryTable = SQLiteTable & {
  userId: SQLiteColumn;
  name: SQLiteColumn;
  color: SQLiteColumn;
  id: SQLiteColumn;
};

export async function findOrCreateCategory(
  db: Database,
  categoriesTable: CategoryTable,
  userId: number,
  name: string,
  generateColor: (name: string) => string
): Promise<number> {
  // Normalize name (trim whitespace)
  const normalizedName = name.trim();

  // Check if category with this normalized name already exists
  const existing = await db
    .select()
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.userId, userId),
        sql`LOWER(${categoriesTable.name}) = LOWER(${normalizedName})`
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Return existing category ID
    const firstResult = existing[0];
    if (!firstResult || typeof firstResult.id !== "number") {
      throw new Error("Invalid category ID");
    }
    return firstResult.id as number;
  }

  // Create new category
  const result = await db
    .insert(categoriesTable)
    .values({
      userId,
      name: normalizedName,
      color: generateColor(normalizedName),
    })
    .returning();

  if (!Array.isArray(result) || result.length === 0) {
    throw new Error("Failed to create category");
  }

  const firstResult = result[0];
  if (!firstResult || typeof firstResult.id !== "number") {
    throw new Error("Invalid category ID");
  }
  return firstResult.id;
}

/**
 * Update many-to-many relationship using delete + insert pattern
 *
 * This is a common pattern for updating many-to-many relationships:
 * 1. Delete all existing links
 * 2. Insert new links
 *
 * @param db Database instance
 * @param linkTable Join table (e.g., subscription_categories)
 * @param parentIdColumn Column for parent ID (e.g., subscriptionId)
 * @param parentId Parent resource ID
 * @param childIdColumn Column for child ID (e.g., categoryId)
 * @param newChildIds Array of new child IDs to link
 *
 * @example
 * // Update subscription categories
 * await updateManyToMany(
 *   ctx.db,
 *   schema.subscriptionCategories,
 *   schema.subscriptionCategories.subscriptionId,
 *   subscriptionId,
 *   schema.subscriptionCategories.categoryId,
 *   [1, 2, 3]
 * );
 */
// Type for link tables in many-to-many relationships
type LinkTable = SQLiteTable;
type ColumnReference = SQLiteColumn;

export async function updateManyToMany(
  db: Database,
  linkTable: LinkTable,
  parentIdColumn: ColumnReference,
  parentId: number,
  childIdColumn: ColumnReference,
  newChildIds: number[]
): Promise<void> {
  // Delete all existing links
  await db.delete(linkTable).where(eq(parentIdColumn, parentId));

  // Insert new links if any
  if (newChildIds.length > 0) {
    // Find the property names by searching the table object
    // In Drizzle, the table object has properties (camelCase) that reference columns
    let parentFieldName: string | undefined;
    let childFieldName: string | undefined;

    for (const [key, value] of Object.entries(linkTable)) {
      if (value === parentIdColumn) parentFieldName = key;
      if (value === childIdColumn) childFieldName = key;
    }

    if (!parentFieldName || !childFieldName) {
      throw new Error("Could not find column names in link table");
    }

    const links = newChildIds.map((childId) => ({
      [parentFieldName!]: parentId,
      [childFieldName!]: childId,
    }));

    await db.insert(linkTable).values(links);
  }
}
