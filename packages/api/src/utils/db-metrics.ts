/**
 * Database Query Metrics Wrapper
 *
 * Provides instrumentation for Drizzle ORM queries that works for both:
 * - SQLite (Node.js via better-sqlite3)
 * - D1 (Cloudflare Workers)
 *
 * Emits both Span Metrics (for detailed tracing) and Sentry Metrics (for dashboards).
 */

import * as Sentry from "@/utils/sentry";
import { emitCounter, emitDistribution } from "./metrics.js";

/**
 * Wraps a Drizzle query with Sentry span and metrics
 *
 * Automatically tracks:
 * - Query duration
 * - Success/failure status
 * - Slow queries (> 1s)
 * - Runtime (nodejs vs cloudflare)
 *
 * Works for both SQLite (Node.js) and D1 (Cloudflare) thanks to Drizzle ORM abstraction
 *
 * @param queryName - Descriptive name for the query (e.g., 'articles.getArticles')
 * @param queryFn - Async function that executes the query
 * @param additionalAttrs - Additional span attributes for context
 *
 * @example
 * const articles = await withQueryMetrics(
 *   'articles.getArticles',
 *   async () => {
 *     return db.select()
 *       .from(schema.articles)
 *       .where(eq(schema.articles.userId, userId))
 *       .limit(10);
 *   },
 *   {
 *     'db.table': 'articles',
 *     'db.operation': 'select',
 *     'db.user_id': userId,
 *   }
 * );
 */
export async function withQueryMetrics<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  additionalAttrs?: Record<string, unknown>
): Promise<T> {
  return Sentry.startSpan(
    {
      name: `db.query.${queryName}`,
      op: "db.query",
    },
    async (span) => {
      const startTime = Date.now();
      let runtime: string | undefined;

      try {
        // Detect runtime from process.env or lack thereof
        runtime =
          typeof process !== "undefined" && process.env
            ? "nodejs"
            : "cloudflare";

        const result = await queryFn();
        const duration = Date.now() - startTime;

        // SPAN METRICS (10% sampled, rich context)
        span?.setAttributes({
          "db.query_name": queryName,
          "db.duration_ms": duration,
          "db.success": true,
          "db.slow_query": duration > 1000, // Flag queries over 1s
          "db.runtime": runtime,
          ...additionalAttrs,
        });

        // SENTRY METRICS (100% emitted, lightweight)
        emitDistribution("db.query_time", duration, "millisecond", {
          query_name: queryName,
          slow: duration > 1000 ? "true" : "false",
          runtime,
        });

        // Count slow queries
        if (duration > 1000) {
          emitCounter("db.query_slow", 1, {
            query_name: queryName,
            runtime,
          });
        }

        // Count all queries
        emitCounter("db.query_executed", 1, {
          query_name: queryName,
          runtime,
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // SPAN METRICS (error case)
        span?.setAttributes({
          "db.query_name": queryName,
          "db.duration_ms": duration,
          "db.success": false,
          "db.error": (error as Error).message,
          "db.runtime": runtime || "unknown",
        });

        // SENTRY METRICS (error counting)
        emitCounter("db.query_error", 1, {
          query_name: queryName,
          runtime: runtime || "unknown",
        });

        // Capture error with context
        Sentry.captureException(error, {
          tags: {
            query_name: queryName,
            runtime: runtime || "unknown",
          },
          contexts: {
            database: {
              query_name: queryName,
              duration_ms: duration,
              ...additionalAttrs,
            },
          },
        });

        throw error;
      }
    }
  );
}

/**
 * Helper to extract row count from Drizzle results
 *
 * Drizzle returns different shapes depending on the operation:
 * - SELECT: array of rows
 * - INSERT/UPDATE/DELETE with .returning(): array of returned rows
 * - Some operations: { rows: [...], rowsAffected: number }
 *
 * @param result - The result from a Drizzle query
 * @returns The number of rows, or undefined if can't be determined
 */
export function getRowCount(result: unknown): number | undefined {
  if (Array.isArray(result)) {
    return result.length;
  }

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;

    // Drizzle returns { rows: [...] } for some operations
    if ("rows" in obj && Array.isArray(obj.rows)) {
      return obj.rows.length;
    }

    // Check for affected rows in mutation results
    if ("rowsAffected" in obj && typeof obj.rowsAffected === "number") {
      return obj.rowsAffected;
    }
  }

  return undefined;
}

/**
 * Emit row count as a distribution metric
 *
 * Call this after executing a query to track how many rows were returned/affected
 *
 * @example
 * const articles = await withQueryMetrics('articles.getArticles', async () => {...});
 * emitRowCountMetric('articles.getArticles', articles, 'articles');
 */
export function emitRowCountMetric(
  queryName: string,
  result: unknown,
  table?: string
): void {
  const rowCount = getRowCount(result);
  if (rowCount !== undefined) {
    emitDistribution(
      "db.rows_returned",
      rowCount,
      undefined,
      table ? { query_name: queryName, table } : { query_name: queryName }
    );
  }
}
