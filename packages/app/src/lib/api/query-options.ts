// Exported for testing
export type TRPCError = { data?: { httpStatus?: number } };

/**
 * Retry logic for tRPC queries
 * - Don't retry on 4xx errors (client errors like validation, auth failures)
 * - Retry up to 3 times for network/server errors (5xx, timeouts)
 */
export function shouldRetryQuery(
  failureCount: number,
  error: TRPCError | Error
): boolean {
  // Don't retry on 4xx errors (client errors)
  if (
    "data" in error &&
    error.data?.httpStatus &&
    error.data.httpStatus >= 400 &&
    error.data.httpStatus < 500
  ) {
    return false;
  }
  // Retry up to 3 times for network/server errors
  return failureCount < 3;
}

/**
 * Exponential backoff delay for retries
 * 1s -> 2s -> 4s -> ... capped at 30s
 */
export function calculateRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}

/**
 * Custom fetch wrapper that includes credentials for session cookies
 * and preserves any existing headers (like Sentry trace headers)
 */
export function createFetchWithCredentials(
  url: URL | RequestInfo,
  options?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: "include", // Required for HTTP-only session cookies
    headers: options?.headers ?? {},
  });
}
