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

export const Route = createFileRoute("/terms")({
  component: TermsOfService,
});

function TermsOfService() {
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
            <CardTitle className="text-3xl">Terms of Service</CardTitle>
            <CardDescription>
              Last updated: January 15, 2025
            </CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <h2>Introduction</h2>
            <p>
              TuvixRSS is an open-source RSS feed aggregator licensed under the
              GNU Affero General Public License v3 (AGPL-3.0). These terms
              govern your use of our hosted service. If you self-host TuvixRSS,
              you are responsible for establishing your own terms of service.
            </p>

            <h2>Acceptance of Terms</h2>
            <p>
              By creating an account or using TuvixRSS, you agree to these Terms
              of Service and our Privacy Policy. If you do not agree, please do
              not use the service.
            </p>

            <h2>Open Source License</h2>
            <p>
              TuvixRSS is free and open-source software licensed under the{" "}
              <strong>GNU Affero General Public License v3 (AGPL-3.0)</strong>.
              This license grants you the freedom to:
            </p>
            <ul>
              <li>Use the software for any purpose</li>
              <li>Study and modify the source code</li>
              <li>Distribute copies of the software</li>
              <li>Distribute modified versions</li>
            </ul>
            <p>
              <strong>Important AGPL-3.0 Requirement:</strong> If you run a
              modified version of TuvixRSS as a network service (accessible to
              others over a network), you must make the complete source code of
              your modified version available to users.
            </p>
            <p>
              For the complete license text, see{" "}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GNU AGPL-3.0
              </a>
              .
            </p>

            <h2>Account Registration</h2>
            <p>To use TuvixRSS, you must create an account by providing:</p>
            <ul>
              <li>A unique username (3-30 characters)</li>
              <li>A valid email address</li>
              <li>
                A secure password meeting our requirements (minimum 8
                characters, with uppercase, lowercase, numbers, and special
                characters)
              </li>
            </ul>
            <p>You are responsible for:</p>
            <ul>
              <li>
                Maintaining the confidentiality of your account credentials
              </li>
              <li>All activities that occur under your account</li>
              <li>Notifying us of any unauthorized access</li>
            </ul>
            <p>
              We use Better Auth for secure authentication with encrypted
              password storage.
            </p>

            <h2>Service Description</h2>
            <p>TuvixRSS provides:</p>
            <ul>
              <li>RSS feed aggregation and management</li>
              <li>Article reading and organization features</li>
              <li>Custom categories and filters</li>
              <li>Public feed creation and sharing</li>
              <li>OPML import/export functionality</li>
            </ul>

            <h2>Acceptable Use Policy</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the service for any illegal or unauthorized purpose</li>
              <li>
                Attempt to gain unauthorized access to the service or other user
                accounts
              </li>
              <li>
                Distribute malware, spam, or harmful content through public
                feeds
              </li>
              <li>
                Abuse the service through excessive automated requests or DDoS
                attacks
              </li>
              <li>Violate the intellectual property rights of others</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Circumvent rate limits or usage quotas</li>
            </ul>

            <h2>Usage Limits and Quotas</h2>
            <p>
              Our hosted service implements fair usage limits based on your
              subscription plan, including:
            </p>
            <ul>
              <li>Maximum number of RSS feed subscriptions</li>
              <li>Maximum number of public feeds</li>
              <li>Maximum number of categories</li>
              <li>API rate limits (requests per minute)</li>
            </ul>
            <p>
              These limits ensure fair resource allocation for all users. If you
              need higher limits, consider upgrading your plan or self-hosting
              TuvixRSS with custom configurations.
            </p>

            <h2>Subscription Plans and Billing</h2>
            <p>
              TuvixRSS may offer different subscription tiers with varying
              features and limits. Self-hosted installations are free and
              unlimited (subject to your own infrastructure constraints).
            </p>

            <h2>RSS Feed Fetching</h2>
            <p>
              When you subscribe to RSS feeds, TuvixRSS fetches content from
              those sources on your behalf. You acknowledge that:
            </p>
            <ul>
              <li>
                You are responsible for ensuring you have the right to access
                and aggregate those feeds
              </li>
              <li>
                Some feeds may have usage restrictions or require attribution
              </li>
              <li>
                TuvixRSS is not responsible for the content or availability of
                third-party RSS feeds
              </li>
            </ul>

            <h2>Public Feeds</h2>
            <p>
              You can create public feeds that combine multiple RSS sources.
              When creating public feeds:
            </p>
            <ul>
              <li>Anyone with the feed URL can access your public feed</li>
              <li>
                You are responsible for the content you include in public feeds
              </li>
              <li>
                Do not create public feeds from sources that prohibit
                redistribution
              </li>
              <li>
                We may remove public feeds that violate these terms or
                third-party rights
              </li>
            </ul>

            <h2>Telemetry and Error Reporting</h2>
            <p>
              Our hosted version uses <strong>Sentry</strong> for error tracking
              and performance monitoring to improve the application. This
              telemetry:
            </p>
            <ul>
              <li>
                Is <strong>optional</strong> and <strong>off by default</strong>{" "}
                in self-hosted installations
              </li>
              <li>
                Collects error logs, performance metrics, and usage patterns
              </li>
              <li>May include anonymous session data</li>
            </ul>
            <p>
              For details, see our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>

            <h2>Data Ownership and Export</h2>
            <p>You retain ownership of all data you add to TuvixRSS:</p>
            <ul>
              <li>Your RSS subscriptions</li>
              <li>Categories and organization</li>
              <li>Reading preferences and settings</li>
            </ul>
            <p>
              You can export your RSS subscriptions in OPML format at any time
              and migrate to another service or self-hosted instance.
            </p>

            <h2>Service Availability</h2>
            <p>
              While we strive for high availability, TuvixRSS is provided "as
              is" without guarantees of uptime. We may:
            </p>
            <ul>
              <li>Perform scheduled maintenance with advance notice</li>
              <li>Experience unplanned downtime</li>
              <li>
                Modify or discontinue features (with reasonable notice when
                possible)
              </li>
            </ul>
            <p>
              For guaranteed uptime, consider self-hosting TuvixRSS on your own
              infrastructure.
            </p>

            <h2>Account Termination</h2>
            <p>We may suspend or terminate your account if you:</p>
            <ul>
              <li>Violate these Terms of Service</li>
              <li>Engage in abusive or harmful behavior</li>
              <li>Use the service for illegal activities</li>
              <li>Fail to pay for premium services (if applicable)</li>
            </ul>
            <p>
              You may delete your account at any time from the settings page.
              Upon deletion, your data will be permanently removed in accordance
              with our Privacy Policy.
            </p>

            <h2>Intellectual Property</h2>
            <p>
              The TuvixRSS source code is licensed under AGPL-3.0. However, the
              TuvixRSS name, logo, and branding may be subject to separate
              trademark considerations.
            </p>
            <p>
              Content you access through RSS feeds remains the property of the
              original publishers.
            </p>

            <h2>Disclaimer of Warranties</h2>
            <p>
              TuvixRSS is provided "as is" and "as available" without warranties
              of any kind, either express or implied, including but not limited
              to:
            </p>
            <ul>
              <li>Warranties of merchantability</li>
              <li>Fitness for a particular purpose</li>
              <li>Non-infringement</li>
              <li>Uninterrupted or error-free operation</li>
            </ul>
            <p>
              As open-source software under AGPL-3.0, TuvixRSS comes with NO
              WARRANTY as explicitly stated in the license.
            </p>

            <h2>Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, we shall not be liable for
              any indirect, incidental, special, consequential, or punitive
              damages, including but not limited to:
            </p>
            <ul>
              <li>Loss of data</li>
              <li>Loss of profits or revenue</li>
              <li>Service interruptions</li>
              <li>Data breaches or security incidents</li>
            </ul>

            <h2>Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless TuvixRSS, its
              contributors, and operators from any claims, damages, or expenses
              arising from:
            </p>
            <ul>
              <li>Your use of the service</li>
              <li>Your violation of these terms</li>
              <li>Your violation of third-party rights</li>
              <li>Content you publish in public feeds</li>
            </ul>

            <h2>Modifications to Terms</h2>
            <p>
              We may update these Terms of Service from time to time.
              Significant changes will be communicated via:
            </p>
            <ul>
              <li>Email notification</li>
              <li>In-app announcements</li>
              <li>Updates to this page with revised "Last updated" date</li>
            </ul>
            <p>
              Continued use of the service after changes constitutes acceptance
              of the modified terms.
            </p>

            <h2>Self-Hosting</h2>
            <p>
              If you choose to self-host TuvixRSS (which we encourage!), you:
            </p>
            <ul>
              <li>Must comply with the AGPL-3.0 license terms</li>
              <li>
                Are responsible for your own infrastructure, security, and data
                protection
              </li>
              <li>
                Must establish your own terms of service if you provide the
                service to others
              </li>
              <li>
                Must make source code available if you run a modified version as
                a network service
              </li>
              <li>Can disable Sentry telemetry (it's off by default)</li>
            </ul>

            <h2>Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with
              applicable laws. For self-hosted installations, you are
              responsible for compliance with your local laws and regulations.
            </p>

            <h2>Contact and Support</h2>
            <p>
              For questions about these terms, technical support, or to report
              violations:
            </p>
            <ul>
              <li>Review our documentation and GitHub repository</li>
              <li>Open an issue on our GitHub page</li>
              <li>Contact us through the provided support channels</li>
            </ul>

            <h2>Source Code Availability</h2>
            <p>
              As required by the AGPL-3.0 license, the complete source code for
              TuvixRSS (including any modifications made to our hosted version)
              is available on our GitHub repository. You have the right to
              download, review, modify, and deploy your own instance at any
              time.
            </p>

            <p className="text-muted-foreground text-sm mt-8">
              These Terms of Service apply to the hosted version of TuvixRSS. If
              you self-host, you are responsible for establishing your own terms
              and ensuring compliance with the AGPL-3.0 license and applicable
              laws.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
