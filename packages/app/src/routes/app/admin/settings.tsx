import { createFileRoute } from "@tanstack/react-router";
import { trpc, type RouterOutputs } from "@/lib/api/trpc";
import { toast } from "sonner";
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
import { useAutoSaveSettings } from "@/hooks/use-auto-save-settings";

export const Route = createFileRoute("/app/admin/settings")({
  component: AdminSettings,
});

type GlobalSettings = RouterOutputs["admin"]["getGlobalSettings"];

function AdminSettings() {
  const {
    data: settings,
    isLoading,
    refetch,
  } = trpc.admin.getGlobalSettings.useQuery();

  const updateMutation = trpc.admin.updateGlobalSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to save settings");
    },
  });

  const { formData, setFormData } = useAutoSaveSettings<GlobalSettings>({
    settings: settings,
    onSave: (updates) => {
      updateMutation.mutate(updates);
    },
  });

  if (isLoading || !formData) {
    return (
      <SettingsPageLayout
        title="Admin Settings"
        description="Configure global system settings"
        isLoading={true}
      >
        {null}
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      title="Admin Settings"
      description="Configure global system settings"
      lastUpdated={settings?.updatedAt}
    >
      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>
            Configure RSS fetching and article retention
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsField
            id="fetchIntervalMinutes"
            label="Fetch Interval (minutes)"
            description="How often to check for new articles (5-1440 minutes)"
            type="number"
            value={formData.fetchIntervalMinutes}
            onChange={(value) =>
              setFormData({
                ...formData,
                fetchIntervalMinutes: parseInt(value) || 60,
              })
            }
            min="5"
            max="1440"
          />

          <SettingsField
            id="pruneDays"
            label="Prune Articles After (days)"
            description="Automatically delete articles older than this many days. Saved articles are never deleted. (0-365, 0 = never delete)"
            type="number"
            value={formData.pruneDays}
            onChange={(value) =>
              setFormData({ ...formData, pruneDays: parseInt(value) || 90 })
            }
            min="0"
            max="365"
          />
        </CardContent>
      </Card>

      {/* Authentication Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Configure login attempt limits and lockout behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsField
            id="maxLoginAttempts"
            label="Max Login Attempts"
            description="Maximum failed login attempts before lockout (1-100)"
            type="number"
            value={formData.maxLoginAttempts}
            onChange={(value) =>
              setFormData({
                ...formData,
                maxLoginAttempts: parseInt(value) || 5,
              })
            }
            min="1"
            max="100"
          />

          <SettingsField
            id="loginAttemptWindowMinutes"
            label="Login Attempt Window (minutes)"
            description="Time window for counting login attempts (1-1440 minutes)"
            type="number"
            value={formData.loginAttemptWindowMinutes}
            onChange={(value) =>
              setFormData({
                ...formData,
                loginAttemptWindowMinutes: parseInt(value) || 15,
              })
            }
            min="1"
            max="1440"
          />

          <SettingsField
            id="lockoutDurationMinutes"
            label="Lockout Duration (minutes)"
            description="How long to lock out accounts after max attempts (1-10080 minutes)"
            type="number"
            value={formData.lockoutDurationMinutes}
            onChange={(value) =>
              setFormData({
                ...formData,
                lockoutDurationMinutes: parseInt(value) || 30,
              })
            }
            min="1"
            max="10080"
          />
        </CardContent>
      </Card>

      {/* Registration Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>
            Control user registration and email verification
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsToggle
            id="allowRegistration"
            label="Allow Registration"
            description="Enable or disable new user registration"
            checked={formData.allowRegistration}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, allowRegistration: checked })
            }
          />

          <SettingsToggle
            id="requireEmailVerification"
            label="Require Email Verification"
            description="Require users to verify their email before accessing the app"
            checked={formData.requireEmailVerification}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, requireEmailVerification: checked })
            }
          />

          <SettingsToggle
            id="adminBypassEmailVerification"
            label="Admin Bypass Email Verification"
            description="Allow admin users to access the app without verifying their email address"
            checked={formData.adminBypassEmailVerification}
            onCheckedChange={(checked) =>
              setFormData({
                ...formData,
                adminBypassEmailVerification: checked,
              })
            }
          />
        </CardContent>
      </Card>

      {/* Password Reset Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Password Reset</CardTitle>
          <CardDescription>
            Configure password reset token expiration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsField
            id="passwordResetTokenExpiryHours"
            label="Token Expiry (hours)"
            description="How long password reset tokens remain valid (1-72 hours)"
            type="number"
            value={formData.passwordResetTokenExpiryHours}
            onChange={(value) =>
              setFormData({
                ...formData,
                passwordResetTokenExpiryHours: parseInt(value) || 1,
              })
            }
            min="1"
            max="72"
          />
        </CardContent>
      </Card>

      {/* AI Features */}
      <Card>
        <CardHeader>
          <CardTitle>AI Features</CardTitle>
          <CardDescription>
            Enable AI-powered features (requires GOOGLE_GENERATIVE_AI_API_KEY)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingsToggle
            id="aiEnabled"
            label="Enable AI Features"
            description="Smart category suggestions and other AI-powered tools"
            checked={formData.aiEnabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, aiEnabled: checked })
            }
          />
        </CardContent>
      </Card>
    </SettingsPageLayout>
  );
}
