import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("backfills scheduling attempts without changing successful fetch times", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`
      CREATE TABLE sources (id INTEGER PRIMARY KEY, last_fetched INTEGER);
      INSERT INTO sources VALUES (1, 1700000000), (2, NULL);
    `);
    db.exec(
      readFileSync(
        new URL(
          "../../../drizzle/0013_feed_fetch_attempts.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    expect(db.prepare("SELECT * FROM sources ORDER BY id").all()).toEqual([
      { id: 1, last_fetched: 1700000000, last_fetch_attempt_at: 1700000000 },
      { id: 2, last_fetched: null, last_fetch_attempt_at: null },
    ]);
  } finally {
    db.close();
  }
});
