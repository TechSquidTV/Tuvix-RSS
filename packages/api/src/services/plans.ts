import type { Database } from "@api/db/client";
import * as schema from "@api/db/schema";
import { eq, asc } from "drizzle-orm";

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
