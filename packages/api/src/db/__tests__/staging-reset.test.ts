import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createTestDb, seedTestUser } from "@api/test/setup";
import { authRateLimits } from "@api/db/schema";

describe("staging database reset", () => {
  it("can recreate a populated database from all migrations after a wipe", async () => {
    const db = createTestDb();
    try {
      await seedTestUser(db);
      await db.insert(authRateLimits).values({
        key: "test-client",
        attempts: 3,
        windowStartedAt: 1,
      });

      const tables = () =>
        db.$client
          .prepare<[], { name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name"
          )
          .all()
          .map(({ name }) => name);
      const originalTables = tables();

      db.$client.exec(
        readFileSync(
          new URL("../../../scripts/wipe-staging.sql", import.meta.url),
          "utf8"
        )
      );
      expect(tables()).toEqual([]);

      migrate(db, {
        migrationsFolder: fileURLToPath(
          new URL("../../../drizzle/", import.meta.url)
        ),
      });
      expect(tables()).toEqual(originalTables);
      expect(await db.select().from(authRateLimits)).toEqual([]);
    } finally {
      db.$client.close();
    }
  });
});
