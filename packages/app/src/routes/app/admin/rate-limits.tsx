import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/lib/api/trpc";
import { formatDistanceToNow } from "@/lib/utils/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/app/admin/rate-limits")({
  component: RateLimitsMonitor,
});

function RateLimitsMonitor() {
  // Queries
  const { data: rateLimitStats, refetch: refetchStats } =
    trpc.admin.getRateLimitStats.useQuery();

  const { data: accessLog, isLoading: isLoadingLog } =
    trpc.admin.getPublicFeedAccessLog.useQuery({
      limit: 50,
      offset: 0,
    });

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Rate Limit Monitor
          </h1>
          <p className="text-muted-foreground">
            Track and manage API and public feed rate limits
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchStats()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Public Feed Access (24h)
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rateLimitStats?.totalPublicFeedAccessLast24h.toLocaleString() ??
                0}
            </div>
            <p className="text-xs text-muted-foreground">
              Total RSS feed requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Rate Limiting Status
            </CardTitle>
            {rateLimitStats?.rateLimitEnabled ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {rateLimitStats?.rateLimitEnabled ? "Enabled" : "Disabled"}
            </div>
            <p className="text-xs text-muted-foreground">
              {rateLimitStats?.rateLimitEnabled
                ? "Cloudflare Workers bindings active"
                : "Rate limiting not available for this deployment"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Public Feed Access Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Public Feed Access</CardTitle>
          <CardDescription>
            Last 50 RSS feed requests from external clients
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLog ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : accessLog && accessLog.items.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Feed</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>User Agent</TableHead>
                    <TableHead className="text-right">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessLog.items.map(
                    (log: {
                      id: number;
                      feedSlug: string;
                      ownerUsername: string;
                      ipAddress: string;
                      userAgent: string | null;
                      accessedAt: Date;
                    }) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(log.accessedAt, {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell>
                          <code className="px-2 py-1 bg-muted rounded text-xs font-mono">
                            {log.feedSlug}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.ownerUsername}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {log.ipAddress}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {log.userAgent || (
                            <span className="italic">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              const url = `/public/${log.ownerUsername}/${log.feedSlug}`;
                              window.open(url, "_blank");
                            }}
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="sr-only">Open feed</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No public feed access logged yet</p>
              <p className="text-sm mt-1">
                Feed access will appear here once users start sharing feeds
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
