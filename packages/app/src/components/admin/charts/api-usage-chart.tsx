"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type ApiUsageChartProps = {
  data: { endpoint: string; count: number }[];
};

const chartConfig = {
  count: {
    label: "Requests",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

export function ApiUsageChart({ data }: ApiUsageChartProps) {
  // Limit to top 10 and format endpoint names
  const displayData = data.slice(0, 10).map((item) => ({
    ...item,
    endpoint:
      item.endpoint.length > 20
        ? item.endpoint.substring(0, 20) + "..."
        : item.endpoint,
  }));

  const hasData = displayData.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Usage by Endpoint</CardTitle>
        <CardDescription>Top endpoints by request count</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig}>
            <BarChart
              accessibilityLayer
              data={displayData}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="endpoint"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
            No data available for this time period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
