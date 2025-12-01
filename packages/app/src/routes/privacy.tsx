import { createFileRoute, Link } from "@tanstack/react-router";
import { TuvixLogo } from "@/components/app/tuvix-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary flex size-8 items-center justify-center rounded-md">
              <TuvixLogo className="size-5" />
            </div>
            <span className="text-xl font-semibold">TuvixRSS</span>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <CardDescription>
              Last updated: January 15, 2025
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <h2>Introduction</h2>
            <p>
              TuvixRSS is an open-source, self-hosted RSS feed aggregator
              licensed under the GNU Affero General Public License v3
              (AGPL-3.0). This privacy policy explains how information is
              collected and used, particularly for our hosted version of the
              application.
            </p>

            <h2>Open Source and Self-Hosting</h2>
            <p>TuvixRSS is free and open-source software. You can:</p>
            <ul>
              <li>Download and run TuvixRSS on your own infrastructure</li>
              <li>Review the complete source code</li>
              <li>Modify the software to suit your needs</li>
              <li>Host your own instance with full control over your data</li>
            </ul>
            <p>
              When you self-host TuvixRSS, you have complete control over your
              data. This privacy policy primarily applies to our hosted version
              of the service.
            </p>

            <h2>Information We Collect</h2>

            <h3>Account Information</h3>
            <p>When you create an account, we collect:</p>
            <ul>
              <li>Username</li>
              <li>Email address</li>
              <li>Password (encrypted using Better Auth)</li>
            </ul>

            <h3>Usage Data</h3>
            <p>To provide and improve our service, we collect:</p>
            <ul>
              <li>RSS feed subscriptions you add</li>
              <li>Articles you read, save, or mark as unread</li>
              <li>Categories and organization preferences</li>
              <li>Public feeds you create and share</li>
              <li>Application settings and preferences</li>
            </ul>

            <h3>Telemetry (Hosted Version Only)</h3>
            <p>
              Our hosted version uses <strong>Sentry</strong> to collect error
              reports and performance telemetry for the purpose of improving the
              application. This includes:
            </p>
            <ul>
              <li>Error logs and stack traces</li>
              <li>Performance metrics</li>
              <li>Anonymous usage patterns</li>
              <li>Device and browser information</li>
            </ul>
            <p className="font-semibold">
              Important: Sentry telemetry is <strong>optional</strong> and{" "}
              <strong>off by default</strong> in self-hosted installations. You
              have full control over whether to enable it in your own
              deployment.
            </p>

            <h2>How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul>
              <li>Provide and maintain the RSS aggregation service</li>
              <li>Authenticate your account using Better Auth</li>
              <li>Store and organize your RSS feed subscriptions</li>
              <li>Generate and serve your custom public feeds</li>
              <li>Improve application performance and fix bugs (via Sentry)</li>
              <li>Send important service notifications (if enabled)</li>
            </ul>

            <h2>Data Storage and Security</h2>
            <p>
              We implement industry-standard security measures to protect your
              data:
            </p>
            <ul>
              <li>
                Passwords are securely hashed using Better Auth's encryption
              </li>
              <li>HTTPS encryption for all data transmission</li>
              <li>Regular security updates and patches</li>
              <li>Limited access to production systems</li>
            </ul>

            <h2>Third-Party Services</h2>

            <h3>Better Auth</h3>
            <p>
              We use Better Auth for authentication. Better Auth provides secure
              username/email/password authentication with industry-standard
              security practices.
            </p>

            <h3>Sentry (Hosted Version)</h3>
            <p>
              Our hosted version uses Sentry for error tracking and performance
              monitoring. Sentry may collect:
            </p>
            <ul>
              <li>Error messages and stack traces</li>
              <li>Performance metrics</li>
              <li>Anonymous session data</li>
              <li>Browser and device information</li>
            </ul>
            <p>
              For more information, see{" "}
              <a
                href="https://sentry.io/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Sentry's Privacy Policy
              </a>
              .
            </p>

            <h2>RSS Feed Privacy</h2>
            <p>
              When you subscribe to RSS feeds, TuvixRSS fetches content from
              those sources on your behalf. The source websites may receive:
            </p>
            <ul>
              <li>Our server's IP address</li>
              <li>Standard HTTP headers</li>
            </ul>
            <p>
              Public feeds you create can be accessed by anyone with the feed
              URL. Consider this when sharing public feeds.
            </p>

            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access all data associated with your account</li>
              <li>Export your RSS subscriptions (OPML format)</li>
              <li>Delete your account and associated data</li>
              <li>Self-host TuvixRSS with complete control over your data</li>
            </ul>

            <h2>Data Retention</h2>
            <p>
              We retain your data as long as your account is active. When you
              delete your account:
            </p>
            <ul>
              <li>Your account information is permanently deleted</li>
              <li>Your RSS subscriptions and articles are removed</li>
              <li>Public feeds you created are deleted</li>
              <li>
                Some anonymized telemetry data may be retained in Sentry logs
                for debugging purposes
              </li>
            </ul>

            <h2>Children's Privacy</h2>
            <p>
              TuvixRSS is not intended for users under the age of 13. We do not
              knowingly collect information from children under 13.
            </p>

            <h2>Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will
              notify users of significant changes via email or in-app
              notification.
            </p>

            <h2>Open Source License</h2>
            <p>
              TuvixRSS is licensed under the GNU Affero General Public License
              v3 (AGPL-3.0). This means:
            </p>
            <ul>
              <li>The source code is freely available</li>
              <li>You can modify and distribute the software</li>
              <li>
                If you run a modified version as a network service, you must
                make your source code available
              </li>
            </ul>
            <p>
              For the full license text, see the{" "}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GNU AGPL-3.0 License
              </a>
              .
            </p>

            <h2>Contact</h2>
            <p>
              If you have questions about this privacy policy or your data,
              please contact us or review the source code on our GitHub
              repository.
            </p>

            <p className="text-muted-foreground text-sm mt-8">
              This privacy policy applies to the hosted version of TuvixRSS. If
              you are self-hosting, you are responsible for your own privacy
              practices and compliance with applicable laws.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
