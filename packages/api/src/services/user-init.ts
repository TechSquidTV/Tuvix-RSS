/** Shared initialization for every Better Auth user creation path. */
import { eq, sql } from "drizzle-orm";
import * as schema from "@api/db/schema";
import { executeBatch } from "@api/db/utils";
import { ADMIN_PLAN, DEFAULT_USER_PLAN } from "@api/config/plans";
import type { Database } from "@api/db/client";

export async function initializeNewUser(
  db: Database,
  userId: number,
  allowFirstUserAdmin: boolean
): Promise<void> {
  // The lowest database ID wins even when signups run concurrently. Existing
  // accounts prevent a later signup from claiming a missing administrator role.
  const isAdmin = sql`(${schema.user.role} = 'admin' OR (${Number(allowFirstUserAdmin)} AND ${schema.user.id} = (SELECT min(id) FROM user)))`;
  try {
    await executeBatch(db, [
      db
        .update(schema.user)
        .set({
          role: sql`CASE WHEN ${isAdmin} THEN 'admin' ELSE 'user' END`,
          plan: sql`CASE WHEN ${isAdmin} THEN ${ADMIN_PLAN} ELSE ${DEFAULT_USER_PLAN} END`,
        })
        .where(eq(schema.user.id, userId)),
      db.insert(schema.userSettings).values({ userId }),
      db.insert(schema.usageStats).values({
        userId,
        sourceCount: 0,
        publicFeedCount: 0,
        categoryCount: 0,
        articleCount: 0,
        lastUpdated: new Date(),
      }),
    ]);
  } catch (error) {
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    throw error;
  }
}
