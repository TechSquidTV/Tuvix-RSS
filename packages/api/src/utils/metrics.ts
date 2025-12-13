/**
 * Sentry Metrics Utility
 *
 * Provides wrapper functions for emitting Sentry Metrics (counters, gauges, distributions).
 * These metrics are always emitted (100% sampling) and are useful for dashboards,
 * alerts, and trend analysis.
 *
 * Works in both Node.js and Cloudflare Workers runtimes.
 */

import * as Sentry from "@/utils/sentry";

/**
 * Emit a counter metric
 *
 * Use for tracking occurrences: emails sent, errors occurred, API calls, user actions
 *
 * @example
 * emitCounter('email.sent', 1, {
 *   type: 'verification',
 *   status: 'success'
 * });
 */
export function emitCounter(
  name: string,
  value: number = 1,
  attributes?: Record<string, string | number | boolean>
): void {
  try {
    Sentry.metrics.count(name, value, { attributes });
  } catch (error) {
    // Gracefully handle if metrics aren't available
    console.warn(`Failed to emit counter metric ${name}:`, error);
  }
}

/**
 * Emit a gauge metric
 *
 * Use for tracking current state: queue depth, active users, resource usage
 *
 * @example
 * emitGauge('subscriptions.active', activeCount, {
 *   plan: 'free'
 * });
 */
export function emitGauge(
  name: string,
  value: number,
  attributes?: Record<string, string | number | boolean>
): void {
  try {
    Sentry.metrics.gauge(name, value, { attributes });
  } catch (error) {
    console.warn(`Failed to emit gauge metric ${name}:`, error);
  }
}

/**
 * Emit a distribution metric
 *
 * Use for analyzing value spread: response times, query durations, file sizes
 * Sentry will calculate percentiles (p50, p95, p99) automatically
 *
 * @example
 * emitDistribution('rss.fetch_time', 150, 'millisecond', {
 *   format: 'atom',
 *   domain: 'example.com'
 * });
 */
export function emitDistribution(
  name: string,
  value: number,
  unit?: "millisecond" | "second" | "byte" | "percent",
  attributes?: Record<string, string | number | boolean>
): void {
  try {
    Sentry.metrics.distribution(name, value, {
      unit,
      attributes,
    });
  } catch (error) {
    console.warn(`Failed to emit distribution metric ${name}:`, error);
  }
}

/**
 * Time a function and emit duration as distribution
 *
 * Automatically captures execution time and emits both success and failure metrics
 *
 * @example
 * const result = await withTiming(
 *   'email.send_time',
 *   async () => sendEmail(recipient, body),
 *   { type: 'verification' }
 * );
 */
export async function withTiming<T>(
  metricName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;

    emitDistribution(metricName, duration, "millisecond", {
      ...attributes,
      success: "true",
    });

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    emitDistribution(metricName, duration, "millisecond", {
      ...attributes,
      success: "false",
    });

    throw error;
  }
}

/**
 * Emit multiple related metrics at once
 *
 * Useful for emitting a set of metrics together (e.g., success + timing + count)
 *
 * @example
 * emitMetrics([
 *   { type: 'counter', name: 'rss.feed_fetched', value: 1, attributes: { status: 'success' } },
 *   { type: 'distribution', name: 'rss.fetch_time', value: 150, unit: 'millisecond' },
 *   { type: 'counter', name: 'rss.articles_discovered', value: newArticles.length }
 * ]);
 */
export function emitMetrics(
  metrics: Array<
    | {
        type: "counter";
        name: string;
        value: number;
        attributes?: Record<string, string | number | boolean>;
      }
    | {
        type: "gauge";
        name: string;
        value: number;
        attributes?: Record<string, string | number | boolean>;
      }
    | {
        type: "distribution";
        name: string;
        value: number;
        unit?: "millisecond" | "second" | "byte" | "percent";
        attributes?: Record<string, string | number | boolean>;
      }
  >
): void {
  for (const metric of metrics) {
    switch (metric.type) {
      case "counter":
        emitCounter(metric.name, metric.value, metric.attributes);
        break;
      case "gauge":
        emitGauge(metric.name, metric.value, metric.attributes);
        break;
      case "distribution":
        emitDistribution(
          metric.name,
          metric.value,
          metric.unit,
          metric.attributes
        );
        break;
    }
  }
}
