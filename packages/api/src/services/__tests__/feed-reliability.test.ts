import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, cleanupTestDb } from "@api/test/setup";
import * as schema from "@api/db/schema";
import * as Sentry from "@api/utils/sentry";
import { fetchSingleFeed } from "../rss-fetcher";
import { recordFeedBatchHealth } from "../feed-health";

const feed = (count = 2) =>
  `<rss version="2.0"><channel><title>News</title><link>https://example.com</link><description>News</description>${Array.from({ length: count }, (_, i) => `<item><guid>item-${i}</guid><title>Story ${i}</title></item>`).join("")}</channel></rss>`;
const response = (count = 2) =>
  new Response(feed(count), {
    headers: { "content-type": "application/rss+xml" },
  });

describe("feed reliability", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });
  afterEach(() => {
    cleanupTestDb(db);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function source() {
    const [row] = await db
      .insert(schema.sources)
      .values({ url: "https://example.com/rss", title: "News" })
      .returning();
    if (!row) throw new Error("Missing fixture");
    return row;
  }

  it("allows only one owner when manual refreshes overlap", async () => {
    const row = await source();
    let release: (value: Response) => void = () => {
      throw new Error("Not started");
    };
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetch);
    const first = fetchSingleFeed(row.id, row.url, db);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = await fetchSingleFeed(row.id, row.url, db);
    expect(second.outcome).toBe("leased");
    release(response());
    expect((await first).articlesAdded).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.select().from(schema.articles)).toHaveLength(2);
    const [finished] = await db.select().from(schema.sources);
    expect(finished?.fetchLeaseToken).toBeNull();
  });

  it("does not store data or clear the new owner's lease after losing ownership", async () => {
    const row = await source();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await db
          .update(schema.sources)
          .set({
            fetchLeaseToken: "new-owner",
            fetchLeaseUntil: new Date(Date.now() + 60_000),
          })
          .where(eq(schema.sources.id, row.id));
        return response();
      })
    );
    await expect(fetchSingleFeed(row.id, row.url, db)).rejects.toThrow(
      "ownership changed"
    );
    expect(await db.select().from(schema.articles)).toHaveLength(0);
    const [current] = await db.select().from(schema.sources);
    expect(current?.fetchLeaseToken).toBe("new-owner");
    expect(current?.lastFetched).toBeNull();
    expect(current?.lastFetchError).toBeNull();
  });

  it("recovers an abandoned lease and inserts duplicates harmlessly", async () => {
    const row = await source();
    await db
      .update(schema.sources)
      .set({ fetchLeaseToken: "abandoned", fetchLeaseUntil: new Date(0) })
      .where(eq(schema.sources.id, row.id));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response())
    );
    expect((await fetchSingleFeed(row.id, row.url, db)).articlesAdded).toBe(2);
    expect((await fetchSingleFeed(row.id, row.url, db)).articlesAdded).toBe(0);
    expect(await db.select().from(schema.articles)).toHaveLength(2);
  });

  it("records partial storage failures and safely retries completed chunks", async () => {
    const row = await source();
    db.$client.exec(
      "CREATE TRIGGER reject_article BEFORE INSERT ON articles WHEN NEW.guid = 'item-7' BEGIN SELECT RAISE(ABORT, 'storage failure'); END"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(9))
    );
    await expect(fetchSingleFeed(row.id, row.url, db)).rejects.toThrow();
    const [failed] = await db.select().from(schema.sources);
    expect(failed?.lastFetched).toBeNull();
    expect(failed?.consecutiveFetchFailures).toBe(1);
    expect(failed?.lastFetchError).toContain("could not all be stored");
    expect(failed?.lastFetchError).not.toContain("INSERT");
    expect(failed?.nextFetchAt).toBeInstanceOf(Date);
    expect(failed?.fetchLeaseToken).toBeNull();
    expect(await db.select().from(schema.articles)).toHaveLength(7);
    db.$client.exec("DROP TRIGGER reject_article");
    expect((await fetchSingleFeed(row.id, row.url, db)).articlesAdded).toBe(2);
    const [recovered] = await db.select().from(schema.sources);
    expect(recovered?.lastFetched).toBeInstanceOf(Date);
    expect(recovered?.lastFetchError).toBeNull();
    expect(recovered?.consecutiveFetchFailures).toBe(0);
  });

  it("alerts on sustained failures, throttles repeats, and resets on recovery", async () => {
    const alert = vi.spyOn(Sentry, "captureMessage");
    const failed = { backlog: 50, errors: 20, added: 0, processed: 20 };
    await recordFeedBatchHealth(db, failed);
    await recordFeedBatchHealth(db, failed);
    expect(alert).not.toHaveBeenCalled();
    await recordFeedBatchHealth(db, failed);
    await recordFeedBatchHealth(db, failed);
    expect(alert).toHaveBeenCalledTimes(1);
    await recordFeedBatchHealth(db, { ...failed, errors: 0, added: 2 });
    const [health] = await db.select().from(schema.feedFetchHealth);
    expect(health?.failingBatches).toBe(0);
  });

  it("alerts when backlog grows across successive productive batches", async () => {
    const alert = vi.spyOn(Sentry, "captureMessage");
    for (const backlog of [10, 20, 30, 40]) {
      await recordFeedBatchHealth(db, {
        backlog,
        errors: 0,
        added: 1,
        processed: 20,
      });
    }
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
