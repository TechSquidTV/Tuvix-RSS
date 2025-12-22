/**
 * Theme Selector Component
 *
 * Enhanced theme selector with preview cards showing theme colors, fonts, and border radius.
 * Uses Skeleton components to create visual previews of each theme.
 */

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllThemeMetadata, getTheme } from "@/lib/themes/themes";
import type { ThemeId } from "@/lib/themes/types";
import { Check } from "lucide-react";

interface ThemeSelectorProps {
  value: string;
  onChange: (themeId: ThemeId) => void;
  className?: string;
}

export function ThemeSelector({
  value,
  onChange,
  className,
}: ThemeSelectorProps) {
  const themes = getAllThemeMetadata();
  const currentTheme = value as ThemeId;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme) => {
          const themeConfig = getTheme(theme.id);
          const isSelected = currentTheme === theme.id;

          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              className={cn(
                "group relative flex flex-col gap-3 rounded-lg border-2 p-4 text-left transition-all",
                "hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                isSelected
                  ? "border-primary bg-accent/50"
                  : "border-border bg-card hover:bg-accent/30"
              )}
              aria-pressed={isSelected}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute right-3 top-3">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>
                </div>
              )}

              {/* Theme name and description */}
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground">{theme.name}</h3>
                {theme.description && (
                  <p className="text-sm text-muted-foreground">
                    {theme.description}
                  </p>
                )}
              </div>

              {/* Theme preview using Skeleton components */}
              <div className="space-y-2">
                {/* Color preview bars */}
                <div className="flex gap-1.5">
                  <Skeleton
                    className="h-8 flex-1"
                    style={{
                      backgroundColor: themeConfig.colors.background,
                      borderRadius: themeConfig.radius.value,
                    }}
                  />
                  <Skeleton
                    className="h-8 flex-1"
                    style={{
                      backgroundColor: themeConfig.colors.primary,
                      borderRadius: themeConfig.radius.value,
                    }}
                  />
                  <Skeleton
                    className="h-8 flex-1"
                    style={{
                      backgroundColor: themeConfig.colors.accent,
                      borderRadius: themeConfig.radius.value,
                    }}
                  />
                </div>

                {/* Card preview */}
                <div
                  className="rounded-md border p-2"
                  style={{
                    backgroundColor: themeConfig.colors.card,
                    borderColor: themeConfig.colors.border,
                    borderRadius: themeConfig.radius.value,
                  }}
                >
                  <div className="space-y-1.5">
                    <Skeleton
                      className="h-2 w-3/4"
                      style={{
                        backgroundColor: themeConfig.colors.muted,
                        borderRadius: themeConfig.radius.value,
                      }}
                    />
                    <Skeleton
                      className="h-2 w-full"
                      style={{
                        backgroundColor: themeConfig.colors.muted,
                        borderRadius: themeConfig.radius.value,
                      }}
                    />
                    <Skeleton
                      className="h-2 w-5/6"
                      style={{
                        backgroundColor: themeConfig.colors.muted,
                        borderRadius: themeConfig.radius.value,
                      }}
                    />
                  </div>
                </div>

                {/* Font preview */}
                <div className="text-xs text-muted-foreground">
                  <span style={{ fontFamily: themeConfig.fonts.sans }}>
                    Font: {themeConfig.fonts.sans.split(",")[0]}
                  </span>
                </div>

                {/* Border radius indicator */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Radius:</span>
                  <div
                    className="h-4 w-4 border-2"
                    style={{
                      borderRadius: themeConfig.radius.value,
                      borderColor: themeConfig.colors.border,
                    }}
                  />
                  <span>{themeConfig.radius.value}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
