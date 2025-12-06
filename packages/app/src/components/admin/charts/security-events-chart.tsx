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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type SecurityEventsChartProps = {
  data: { date: string; logins: number; failedLogins: number }[];
};

const chartConfig = {
  logins: {
    label: "Successful Logins",
    color: "var(--chart-4)",
  },
  failedLogins: {
    label: "Failed Logins",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function SecurityEventsChart({ data }: SecurityEventsChartProps) {
  const hasData = data.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Events</CardTitle>
        <CardDescription>Login activity over time</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig}>
            <BarChart
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
                tickMargin={10}
                tickFormatter={(value: string | number | Date) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="logins" fill="var(--color-logins)" radius={4} />
              <Bar
                dataKey="failedLogins"
                fill="var(--color-failedLogins)"
                radius={4}
              />
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
