import { createFileRoute } from "@tanstack/react-router";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Info, Check, Rocket } from "lucide-react";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { trpc } from "@/lib/api/trpc";

export const Route = createFileRoute("/app/plans")({
  component: PlansPage,
});

function PlansPage() {
  // Fetch plans dynamically from API
  const { data: plans, isLoading } = trpc.plans.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Track that a user accessed the plans/upgrade page
  useEffect(() => {
    try {
      Sentry.captureMessage("User accessed upgrade plans page", {
        level: "info",
        tags: {
          feature: "plans",
          action: "upgrade_interest",
        },
        contexts: {
          page: {
            name: "Plans",
            path: "/app/plans",
          },
        },
      });
    } catch {
      // Sentry not available - silently ignore
    }
  }, []);

  // Find specific plans
  const freePlan = plans?.find((p) => p.id === "free");
  const proPlan = plans?.find((p) => p.id === "pro");
  const enterprisePlan = plans?.find((p) => p.id === "enterprise");

  return (
    <SettingsPageLayout
      title="Plans &amp; Pricing"
      description="Learn about TuvixRSS plans"
      isLoading={isLoading}
    >
      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Paid Plans Coming Soon</AlertTitle>
        <AlertDescription>
          We're currently working on paid plan options. Your interest has been
          noted and we'll notify you when paid plans become available.
        </AlertDescription>
      </Alert>

      {/* Current Free Plan */}
      {freePlan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {freePlan.name}
                  <Badge variant="secondary">Current</Badge>
                </CardTitle>
                <CardDescription>Perfect for personal use</CardDescription>
              </div>
              <div className="text-3xl font-bold">
                ${(freePlan.priceCents / 100).toFixed(2)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {freePlan.maxSources.toLocaleString()} RSS feed sources
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{freePlan.maxPublicFeeds} public feeds</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {freePlan.maxCategories === null
                    ? "Unlimited"
                    : freePlan.maxCategories}{" "}
                  categories
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {freePlan.apiRateLimitPerMinute} API requests per minute
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Future Pro Plan */}
      {proPlan && (
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {proPlan.name}
                  <Badge variant="outline">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  For power users and professionals
                </CardDescription>
              </div>
              <div className="text-3xl font-bold">TBD</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {proPlan.maxSources.toLocaleString()} RSS feed sources
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{proPlan.maxPublicFeeds} public feeds</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {proPlan.maxCategories === null
                    ? "Unlimited"
                    : proPlan.maxCategories}{" "}
                  categories
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {proPlan.apiRateLimitPerMinute} API requests per minute
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Priority support</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Future Enterprise Plan */}
      {enterprisePlan && (
        <Card className="opacity-60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {enterprisePlan.name}
                  <Badge variant="outline">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>For teams and organizations</CardDescription>
              </div>
              <div className="text-3xl font-bold">TBD</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {enterprisePlan.maxSources.toLocaleString()} RSS feed sources
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>{enterprisePlan.maxPublicFeeds} public feeds</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {enterprisePlan.maxCategories === null
                    ? "Unlimited"
                    : enterprisePlan.maxCategories}{" "}
                  categories
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>
                  {enterprisePlan.apiRateLimitPerMinute} API requests per minute
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Dedicated support</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>SLA guarantee</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Need More? Card */}
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Need Higher Limits?
          </CardTitle>
          <CardDescription>
            If you need higher limits on the free plan before paid plans are
            available, please reach out to us. We're happy to discuss custom
            limits for active users.
          </CardDescription>
        </CardHeader>
      </Card>
    </SettingsPageLayout>
  );
}
