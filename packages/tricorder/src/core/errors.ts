/**
 * Feed Discovery Errors
 *
 * Custom error classes for feed discovery operations.
 */

/**
 * Base error class for feed discovery operations
 */
export class FeedDiscoveryError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "FeedDiscoveryError";
  }
}

/**
 * Error thrown when no feeds are found at the given URL
 */
export class NoFeedsFoundError extends FeedDiscoveryError {
  constructor(message = "No RSS or Atom feeds found on this website") {
    super(message, "NO_FEEDS_FOUND");
    this.name = "NoFeedsFoundError";
  }
}

/**
 * Error thrown when feed validation fails
 */
export class FeedValidationError extends FeedDiscoveryError {
  constructor(
    message = "Feed validation failed",
    public feedUrl?: string
  ) {
    super(message, "FEED_VALIDATION_FAILED");
    this.name = "FeedValidationError";
  }
}
