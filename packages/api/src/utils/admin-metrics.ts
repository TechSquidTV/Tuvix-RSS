/**
 * Admin Metrics Utilities
 *
 * Shared functions for computing time-series growth metrics.
 */

/**
 * Time-series data point with date and count
 */
export interface TimeSeriesDataPoint {
  date: string;
  count: number;
}

/**
 * Aggregate records by date and fill in missing days
 *
 * Groups records by their date (from a date extractor) and returns
 * a complete time series with zero counts for days with no records.
 *
 * @param records - Array of records to aggregate
 * @param dateExtractor - Function to extract date from a record
 * @param days - Number of days in the time range
 * @param startDate - Start date of the time range
 * @returns Array of data points with date and count
 */
export function aggregateByDay<T>(
  records: T[],
  dateExtractor: (record: T) => Date,
  days: number,
  startDate: Date
): TimeSeriesDataPoint[] {
  // Group records by day
  const grouped = new Map<string, number>();
  records.forEach((record) => {
    const date = dateExtractor(record);
    const dateStr = date.toISOString().split("T")[0]!;
    grouped.set(dateStr, (grouped.get(dateStr) || 0) + 1);
  });

  // Fill in missing days
  const data: TimeSeriesDataPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0]!;
    data.push({
      date: dateStr,
      count: grouped.get(dateStr) || 0,
    });
  }

  return data;
}

/**
 * Calculate the start date for a time range
 *
 * @param days - Number of days to go back (must be a positive integer >= 1)
 * @returns Start date at midnight UTC
 * @throws Error if days is not a positive finite number
 */
export function calculateStartDate(days: number): Date {
  if (typeof days !== "number" || !Number.isFinite(days) || days < 1) {
    throw new Error(
      "calculateStartDate: 'days' must be a positive number (>= 1)"
    );
  }
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Set to start of day (midnight UTC) to ensure consistent date boundaries
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
