import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser, useLogout } from "@/lib/hooks/useAuth";
import {
  useUserSettings,
  useUpdateUserSettings,
  useUserUsage,
} from "@/lib/hooks/useUserSettings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsField } from "@/components/settings/settings-field";
import { SettingsToggle } from "@/components/settings/settings-toggle";
import { SettingsPageLayout } from "@/components/settings/settings-page-layout";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { SubscriptionPlanCard } from "@/components/settings/subscription-plan-card";
import { AccountStatusCard } from "@/components/settings/account-status-card";
import { UsageQuotaItem } from "@/components/settings/usage-quota-item";
import { useAutoSaveSettings } from "@/hooks/use-auto-save-settings";
import { useState, useCallback } from "react";
import {
  LogOut,
  Rss,
  Globe,
  FolderOpen,
  FileText,
  Zap,
  Eye,
} from "lucide-react";
import { useTheme } from "@/components/provider/theme-provider";
import type { ThemeId } from "@/lib/themes/types";
import {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
} from "@/components/ui/responsive-alert-dialog";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

type UserSettings = {
  theme: string;
  autoAgeDays: number;
  defaultFilter: "all" | "unread" | "read" | "saved";
  shareEmail: boolean;
  shareHackernews: boolean;
  shareReddit: boolean;
  shareTwitter: boolean;
  shareBluesky: boolean;
  shareMastodon: boolean;
};

function SettingsPage() {
  const { data: userSettings, isLoading: userSettingsLoading } =
    useUserSettings();
  const { isPending: userLoading } = useCurrentUser();
  const { data: usageData, isLoading: usageLoading } = useUserUsage();
  const updateUserSettings = useUpdateUserSettings();
  const logout = useLogout();
  const { setTheme } = useTheme();

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  // Memoize onSave to prevent unnecessary re-renders and multiple saves
  const handleSave = useCallback(
    (updates: Partial<UserSettings>) => {
      updateUserSettings.mutate(updates);

      // Update theme in theme provider if it changed
      if (updates.theme) {
        setTheme(updates.theme as ThemeId);
      }
    },
    [updateUserSettings, setTheme],
  );

  const { formData, setFormData } = useAutoSaveSettings<UserSettings>({
    settings: userSettings as UserSettings | undefined,
    onSave: handleSave,
  });

  const handleLogout = () => {
    setLogoutDialogOpen(true);
  };

  const confirmLogout = () => {
    logout.mutate();
    setLogoutDialogOpen(false);
  };

  if (userLoading || userSettingsLoading || !formData) {
    return (
      <SettingsPageLayout
        title="Settings"
        description="Manage your account settings and preferences"
        isLoading={true}
      >
        {null}
      </SettingsPageLayout>
    );
  }

  return (
    <>
      <SettingsPageLayout
        title="Settings"
        description="Manage your account settings and preferences"
      >
        {/* Subscription & Plan Section */}
        {!usageLoading && usageData && (
          <SubscriptionPlanCard
            plan={usageData.plan}
            customLimits={usageData.customLimits}
          />
        )}

        {/* Account Status Section */}
        {!usageLoading && usageData && (
          <AccountStatusCard
            user={{
              banned: usageData.user.banned,
              createdAt: new Date(usageData.user.createdAt),
              role: usageData.user.role,
            }}
          />
        )}

        {/* Enhanced Usage Statistics */}
        {!usageLoading && usageData && (
          <Card>
            <CardHeader>
              <CardTitle>Usage &amp; Limits</CardTitle>
              <CardDescription>
                Your resource usage and plan limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Resource Quotas */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Resource Quotas</h4>

                {/* Sources */}
                <UsageQuotaItem
                  label="RSS Feed Sources"
                  used={usageData.usage.sourceCount}
                  limit={usageData.limits.maxSources}
                  icon={<Rss className="h-4 w-4" />}
                  helpText="Number of RSS feeds you're subscribed to"
                />

                {/* Public Feeds */}
                <UsageQuotaItem
                  label="Public Feeds"
                  used={usageData.usage.publicFeedCount}
                  limit={usageData.limits.maxPublicFeeds}
                  icon={<Globe className="h-4 w-4" />}
                  helpText="Number of public feed collections you've created"
                />

                {/* Categories */}
                <UsageQuotaItem
                  label="Categories"
                  used={usageData.usage.categoryCount}
                  limit={usageData.limits.maxCategories}
                  icon={<FolderOpen className="h-4 w-4" />}
                  helpText="Number of custom categories you've organized"
                />

                {/* Article Count (Informational) */}
                <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Total Articles</span>
                  </div>
                  <span className="font-medium">
                    {usageData.usage.articleCount.toLocaleString()}
                  </span>
                </div>
              </div>

              <Separator />

              {/* Rate Limits */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold">Rate Limits</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {usageData.rateLimitEnabled
                      ? "Rate limiting is enabled. Limits are enforced per-minute and reset automatically."
                      : "Rate limiting is not available for this deployment."}
                  </p>
                </div>

                {usageData.rateLimitEnabled && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">API Requests</span>
                        <span className="text-xs text-muted-foreground">
                          (per minute)
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {usageData.plan.apiRateLimitPerMinute.toLocaleString()}{" "}
                        requests/min
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Public Feed Access</span>
                        <span className="text-xs text-muted-foreground">
                          (per minute)
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {usageData.plan.publicFeedRateLimitPerMinute?.toLocaleString() ||
                          "N/A"}{" "}
                        requests/min
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground pt-2">
                Last updated:{" "}
                {new Date(usageData.usage.lastUpdated).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        )}

        {/* User Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Your account information and details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageData && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Username
                  </Label>
                  <div className="px-3 py-2 bg-muted rounded-md">
                    {usageData.user.username}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Email
                  </Label>
                  <div className="px-3 py-2 bg-muted rounded-md">
                    {usageData.user.email}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Appearance Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Customize how the application looks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Theme
              </label>
              <p className="text-xs text-muted-foreground">
                Choose your preferred color theme, fonts, and border radius
              </p>
              <ThemeSelector
                value={formData.theme}
                onChange={(themeId) =>
                  setFormData({ ...formData, theme: themeId })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Reading Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Reading Preferences</CardTitle>
            <CardDescription>
              Configure how articles are displayed and managed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <SettingsField
                id="auto-age"
                label="Auto-age threshold (days)"
                description="Articles older than this are automatically marked as read (0 = disabled)"
                type="number"
                value={formData.autoAgeDays}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    autoAgeDays: Math.max(
                      0,
                      Math.min(90, parseInt(value) || 0),
                    ),
                  })
                }
                min="0"
                max="90"
              />
              <p className="text-xs text-muted-foreground font-medium">
                Saved articles are never auto-aged
              </p>
            </div>

            <SettingsField
              id="default-filter"
              label="Default view"
              description="Default filter when opening articles page"
              type="select"
              value={formData.defaultFilter}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  defaultFilter: value as "all" | "unread" | "read" | "saved",
                })
              }
              options={[
                { value: "all", label: "All articles" },
                { value: "unread", label: "Unread only" },
                { value: "read", label: "Read only" },
                { value: "saved", label: "Saved only" },
              ]}
            />
          </CardContent>
        </Card>

        {/* Share Options */}
        <Card>
          <CardHeader>
            <CardTitle>Share Options</CardTitle>
            <CardDescription>
              Choose which share options appear in article share menus. "Copy
              Link" is always available.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingsToggle
              id="share-email"
              label="Email"
              description="Share article via email"
              checked={formData.shareEmail}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, shareEmail: checked })
              }
            />

            <SettingsToggle
              id="share-hackernews"
              label="Hacker News"
              description="Submit article to Hacker News"
              checked={formData.shareHackernews}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, shareHackernews: checked })
              }
            />

            <SettingsToggle
              id="share-reddit"
              label="Reddit"
              description="Submit article to Reddit"
              checked={formData.shareReddit}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, shareReddit: checked })
              }
            />

            <SettingsToggle
              id="share-twitter"
              label="Twitter (X)"
              description="Share article on Twitter"
              checked={formData.shareTwitter}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, shareTwitter: checked })
              }
            />

            <SettingsToggle
              id="share-bluesky"
              label="Bluesky"
              description="Share article on Bluesky"
              checked={formData.shareBluesky}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, shareBluesky: checked })
              }
            />

            <SettingsToggle
              id="share-mastodon"
              label="Mastodon"
              description="Share article on Mastodon"
              checked={formData.shareMastodon}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, shareMastodon: checked })
              }
            />
          </CardContent>
        </Card>

        {/* Legal & Information */}
        <Card>
          <CardHeader>
            <CardTitle>Legal & Information</CardTitle>
            <CardDescription>
              Privacy policy and terms of service
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Privacy Policy</p>
                <p className="text-sm text-muted-foreground">
                  Learn how we handle your data
                </p>
              </div>
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  View Policy
                </Button>
              </a>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Terms of Service</p>
                <p className="text-sm text-muted-foreground">
                  Read our terms and conditions
                </p>
              </div>
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  View Terms
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Actions that affect your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Log Out</p>
                <p className="text-sm text-muted-foreground">
                  Sign out of your account
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={logout.isPending}
              >
                <LogOut className="mr-2 size-4" />
                {logout.isPending ? "Logging out..." : "Log Out"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </SettingsPageLayout>

      {/* Logout Confirmation Dialog */}
      <ResponsiveAlertDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
      >
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>Log out</ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              Are you sure you want to log out?
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>Cancel</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction onClick={confirmLogout}>
              Log out
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>
    </>
  );
}
