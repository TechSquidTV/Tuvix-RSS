import { z } from "zod";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";
import { eq, asc } from "drizzle-orm";

/**
 * Get list of all available plan IDs from the database
 */
export async function getAvailablePlanIds(db: Database): Promise<string[]> {
  const plans = await db.query.plans.findMany({
    columns: { id: true },
  });

  return plans.map((p: { id: string }) => p.id);
}

/**
 * Create a dynamic Zod enum schema based on available plans in the database
 * Falls back to allowing any string if database query fails
 * Note: This is not currently used but kept for potential future use
 */
export async function createPlanSchema(db: Database): Promise<z.ZodString> {
  try {
    const planIds = await getAvailablePlanIds(db);

    if (planIds.length === 0) {
      // No plans in database yet (shouldn't happen after migrations)
      return z.string();
    }

    // Return string schema - runtime validation happens in the router
    return z.string();
  } catch (error) {
    console.error("Failed to fetch plans for schema validation:", error);
    // Fallback to string validation
    return z.string();
  }
}

/**
 * Validate that a plan ID exists in the database
 */
export async function validatePlanExists(
  db: Database,
  planId: string
): Promise<boolean> {
  const plan = await db.query.plans.findFirst({
    where: eq(schema.plans.id, planId),
  });

  return !!plan;
}

/**
 * Get all plans with their details
 */
export async function getAllPlans(db: Database) {
  return await db.query.plans.findMany({
    orderBy: [asc(schema.plans.priceCents)],
  });
}

/**
 * Get plan by ID
 */
export async function getPlanById(db: Database, planId: string) {
  const plan = await db.query.plans.findFirst({
    where: eq(schema.plans.id, planId),
  });
  return plan ?? null;
}
