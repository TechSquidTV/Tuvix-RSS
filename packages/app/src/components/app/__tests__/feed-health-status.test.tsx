import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FeedHealthStatus } from "../feed-health-status";

it("distinguishes first fetch, failure, and recovery", () => {
  const health = {
    lastFetchAttemptAt: null,
    nextFetchAt: null,
    lastFetchError: null,
    consecutiveFetchFailures: 0,
  };
  const { rerender } = render(
    <FeedHealthStatus source={{ lastFetched: null, fetchHealth: health }} />
  );
  expect(
    screen.getByText("Waiting for the first successful update.")
  ).toBeInTheDocument();
  rerender(
    <FeedHealthStatus
      source={{
        lastFetched: new Date(),
        fetchHealth: {
          ...health,
          lastFetchError: "Publisher returned HTTP 403.",
          consecutiveFetchFailures: 3,
          nextFetchAt: new Date(Date.now() + 60_000),
        },
      }}
    />
  );
  expect(screen.getByText(/Feed needs attention/)).toBeInTheDocument();
  expect(screen.getByText(/Publisher returned HTTP 403/)).toBeInTheDocument();
  expect(
    screen.getByText(/Failed attempts: 3. Next retry: in/)
  ).toBeInTheDocument();
  expect(screen.getByText(/Last successful update/)).toBeInTheDocument();
  rerender(
    <FeedHealthStatus
      source={{ lastFetched: new Date(), fetchHealth: health }}
    />
  );
  expect(screen.queryByText(/Feed needs attention/)).not.toBeInTheDocument();
});
