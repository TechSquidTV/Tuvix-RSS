import { type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/animate-ui/components/radix/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

interface UsageQuotaItemProps {
  label: string;
  used: number;
  limit: number | null; // null = unlimited
  icon: ReactNode;
  helpText?: string;
  upgradeLink?: string;
}

export function UsageQuotaItem({
  label,
  used,
  limit,
  icon,
  helpText,
  upgradeLink = "/app/plans",
}: UsageQuotaItemProps) {
  const isUnlimited = limit === null;
  const percentUsed = isUnlimited ? 0 : (used / limit) * 100;
  const isNearLimit = percentUsed >= 80;
  const isAtLimit = percentUsed >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
          {helpText && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{helpText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums">
            {used.toLocaleString()}
            {!isUnlimited && ` / ${limit.toLocaleString()}`}
            {isUnlimited && (
              <span className="text-muted-foreground ml-1">(unlimited)</span>
            )}
          </span>
          {!isUnlimited && (
            <Badge
              variant={
                isAtLimit
                  ? "destructive"
                  : isNearLimit
                    ? "warning"
                    : "secondary"
              }
              className="text-xs"
            >
              {percentUsed.toFixed(0)}%
            </Badge>
          )}
        </div>
      </div>
      {!isUnlimited && (
        <>
          <Progress
            value={percentUsed}
            className={cn(
              "h-2",
              isAtLimit && "[&_[data-slot=progress-indicator]]:bg-red-500",
              isNearLimit &&
                !isAtLimit &&
                "[&_[data-slot=progress-indicator]]:bg-yellow-500"
            )}
          />
          {isAtLimit && (
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-red-600 dark:text-red-400 flex-1">
                Quota limit reached. Upgrade your plan to add more{" "}
                {label.toLowerCase()}.
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link to={upgradeLink}>Upgrade</Link>
              </Button>
            </div>
          )}
          {isNearLimit && !isAtLimit && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Approaching quota limit ({limit - used} remaining).
            </p>
          )}
        </>
      )}
    </div>
  );
}
