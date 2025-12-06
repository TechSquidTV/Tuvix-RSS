import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/lib/api/trpc";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserCheck, UserX, Package, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserGrowthChart,
  ArticleActivityChart,
  PublicFeedAccessChart,
  ApiUsageChart,
  UsersByPlanChart,
  SecurityEventsChart,
  ArticlesReadChart,
} from "@/components/admin/charts";

export const Route = createFileRoute("/app/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const [timeRange, setTimeRange] = useState<number>(30);
  const { data: stats, isLoading } = trpc.admin.getStats.useQuery();
  const { data: rateLimitStats } = trpc.admin.getRateLimitStats.useQuery();

  // Analytics queries
  const { data: userGrowth, isLoading: isLoadingUserGrowth } =
    trpc.admin.getUserGrowth.useQuery({
      days: timeRange,
    });
  const { data: articleActivity, isLoading: isLoadingArticleActivity } =
    trpc.admin.getArticleActivity.useQuery({
      days: timeRange,
    });
  const { data: publicFeedAccess, isLoading: isLoadingPublicFeedAccess } =
    trpc.admin.getPublicFeedAccess.useQuery({
      days: timeRange,
    });
  const { data: apiUsage, isLoading: isLoadingApiUsage } =
    trpc.admin.getApiUsage.useQuery({
      days: timeRange,
    });
  const { data: securityEvents, isLoading: isLoadingSecurityEvents } =
    trpc.admin.getSecurityEvents.useQuery({
      days: timeRange,
    });
  const { data: articlesRead, isLoading: isLoadingArticlesRead } =
    trpc.admin.getArticlesRead.useQuery({
      days: timeRange,
    });

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">
              Platform overview and statistics
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load statistics</p>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      description: `${stats.activeUsers} active users`,
      icon: Users,
    },
    {
      title: "Active Users",
      value: stats.activeUsers,
      description: `${stats.adminUsers} admins`,
      icon: UserCheck,
    },
    {
      title: "Banned",
      value: stats.bannedUsers,
      description: "Banned accounts",
      icon: UserX,
    },
    {
      title: "Total Sources",
      value: stats.totalSources,
      description: "RSS sources tracked",
      icon: Package,
    },
  ];

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Platform overview and statistics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Time Range:</span>
          <Select
            value={timeRange.toString()}
            onValueChange={(value) => setTimeRange(Number(value))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UsersByPlanChart data={stats.usersByPlan} />

        <Card>
          <CardHeader>
            <CardTitle>Platform Stats</CardTitle>
            <CardDescription>Content and engagement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Total Sources</span>
              <span className="text-sm font-medium">{stats.totalSources}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Public Feeds</span>
              <span className="text-sm font-medium">
                {stats.totalPublicFeeds}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Categories</span>
              <span className="text-sm font-medium">
                {stats.totalCategories}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Total Articles</span>
              <span className="text-sm font-medium">{stats.totalArticles}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rate Limit Activity</CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Public Feed Access
              </span>
              <span className="text-sm font-medium">
                {rateLimitStats?.totalPublicFeedAccessLast24h.toLocaleString() ??
                  0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-2">
                Rate Limiting
              </span>
              <span className="text-sm font-medium">
                {rateLimitStats?.rateLimitEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {!isLoadingUserGrowth && userGrowth?.data && (
          <UserGrowthChart data={userGrowth.data} />
        )}
        {!isLoadingArticleActivity && articleActivity?.data && (
          <ArticleActivityChart data={articleActivity.data} />
        )}
        {!isLoadingPublicFeedAccess && publicFeedAccess?.data && (
          <PublicFeedAccessChart data={publicFeedAccess.data} />
        )}
        {!isLoadingApiUsage && apiUsage?.byEndpoint && (
          <ApiUsageChart data={apiUsage.byEndpoint} />
        )}
        {!isLoadingSecurityEvents && securityEvents?.data && (
          <SecurityEventsChart data={securityEvents.data} />
        )}
        {!isLoadingArticlesRead && articlesRead?.data && (
          <ArticlesReadChart data={articlesRead.data} />
        )}
      </div>
    </div>
  );
}
