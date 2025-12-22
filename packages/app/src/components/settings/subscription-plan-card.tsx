import { Check, Info, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PlanInfo {
  id: string;
  name: string;
  priceCents: number;
  features: string[] | null;
}

interface CustomLimits {
  maxSources?: number | null;
  maxPublicFeeds?: number | null;
  maxCategories?: number | null;
  apiRateLimitPerMinute?: number | null;
  publicFeedRateLimitPerMinute?: number | null;
  notes?: string | null;
}

interface SubscriptionPlanCardProps {
  plan: PlanInfo;
  customLimits: CustomLimits | null;
}

function getPlanBadgeVariant(
  planId: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (planId) {
    case "free":
      return "secondary";
    case "pro":
      return "default";
    case "enterprise":
      return "default";
    default:
      return "secondary";
  }
}

export function SubscriptionPlanCard({
  plan,
  customLimits,
}: SubscriptionPlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription &amp; Plan</CardTitle>
        <CardDescription>Your current plan and features</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan Badge */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="text-sm text-muted-foreground">
              {plan.priceCents > 0
                ? `$${(plan.priceCents / 100).toFixed(2)}/month`
                : "Free forever"}
            </p>
          </div>
          <Badge variant={getPlanBadgeVariant(plan.id)}>{plan.name}</Badge>
        </div>

        {/* Custom Limits Alert (if applicable) */}
        {customLimits && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Custom Limits Applied</AlertTitle>
            <AlertDescription>
              An administrator has set custom limits for your account.
              {customLimits.notes && ` Note: ${customLimits.notes}`}
            </AlertDescription>
          </Alert>
        )}

        {/* Plan Features */}
        {plan.features && plan.features.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Plan Features</h4>
            <ul className="space-y-1 text-sm">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upgrade CTA (if on free plan) */}
        {plan.id === "free" && (
          <Button className="w-full" asChild>
            <Link to="/app/plans">
              <Zap className="mr-2 h-4 w-4" />
              Upgrade Plan
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
