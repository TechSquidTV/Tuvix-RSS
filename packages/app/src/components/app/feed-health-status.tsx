import type { RouterOutputs } from "@/lib/api/trpc";
import { getRelativeTime } from "@/lib/utils/date";

type Source = RouterOutputs["subscriptions"]["list"]["items"][number]["source"];

export function FeedHealthStatus({
  source,
}: {
  source: Pick<Source, "lastFetched" | "fetchHealth">;
}) {
  const health = source.fetchHealth;
  return (
    <div className="space-y-1 text-xs" role="status">
      <p className="text-muted-foreground">
        Last successful update:{" "}
        {source.lastFetched ? getRelativeTime(source.lastFetched) : "Never"}
      </p>
      {health.lastFetchError ? (
        <div className="space-y-1 text-destructive">
          <p>
            <span className="font-medium">Feed needs attention: </span>
            {health.lastFetchError}
          </p>
          <p>
            Failed attempts: {health.consecutiveFetchFailures}. Next retry:{" "}
            {health.nextFetchAt
              ? getRelativeTime(health.nextFetchAt)
              : "Not scheduled"}
          </p>
        </div>
      ) : !source.lastFetched ? (
        <p className="text-muted-foreground">
          Waiting for the first successful update.
        </p>
      ) : null}
    </div>
  );
}
