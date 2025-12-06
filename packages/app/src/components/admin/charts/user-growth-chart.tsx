"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
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

type UserGrowthChartProps = {
  data: { date: string; count: number }[];
};

const chartConfig = {
  count: {
    label: "New Users",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function UserGrowthChart({ data }: UserGrowthChartProps) {
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Growth</CardTitle>
        <CardDescription>New user registrations over time</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig}>
            <LineChart
              accessibilityLayer
              data={data}
              margin={{
                left: 12,
                right: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: string | number | Date) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Line
                dataKey="count"
                type="natural"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
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
