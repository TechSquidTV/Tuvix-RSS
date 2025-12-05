import { Button, Heading, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface WelcomeEmailProps {
  username: string;
  appUrl?: string;
}

export const WelcomeEmail: React.FC<Readonly<WelcomeEmailProps>> = ({
  username,
  appUrl = "http://localhost:5173",
}) => {
  const defaultAppUrl = appUrl || "http://localhost:5173";

  return (
    <EmailLayout
      preview="Welcome to Tuvix! Get started by adding your first RSS feed and organizing your reading."
      appUrl={appUrl}
    >
      <Section className="mt-4">
        <Heading className="mx-0 mb-8 mt-2 p-0 text-lg font-normal">
          Hey {username}, welcome to Tuvix!
        </Heading>
        <Text className="text-[14px] leading-6 text-muted">
          We&apos;re thrilled you chose us to manage your RSS feeds. To get
          started, we recommend adding your first RSS feed from the{" "}
          <Link
            href={`${defaultAppUrl}/sources`}
            className="text-muted underline"
          >
            Sources page
          </Link>
          . This will help you organize your reading and stay up to date with
          your favorite websites.
        </Text>
      </Section>

      <Section className="mt-8">
        <Heading className="mx-0 mb-2 p-0 text-[16px] font-normal">
          Why use TuvixRSS?
        </Heading>
        <ul className="list-disc pl-6">
          <li className="text-[14px] leading-6 text-muted">
            <strong>Organize everything:</strong> Group feeds into categories
            and keep your reading organized.
          </li>
          <li className="text-[14px] leading-6 text-muted">
            <strong>Create public feeds:</strong> Share curated collections of
            articles with others, or ingest in other RSS readers.
          </li>
          <li className="text-[14px] leading-6 text-muted">
            <strong>Stay updated:</strong> Automatic fetching keeps your
            articles fresh and ready to read.
          </li>
        </ul>
      </Section>

      <Section className="mt-8">
        <Button
          className="bg-brand rounded-[8px] px-[24px] py-[12px] text-center text-[14px] font-medium text-white no-underline"
          href={defaultAppUrl}
        >
          Go to Dashboard
        </Button>
      </Section>

      <Section className="mt-4">
        <Text className="text-[14px] leading-6 text-muted">
          We hope TuvixRSS helps you stay organized and informed. If you have
          any questions or need help getting started, don&apos;t hesitate to
          reach out.
        </Text>
        <Text className="text-[14px] leading-6 mt-4">Happy reading! 📰</Text>
        <Text className="text-[14px] leading-6">The Tuvix Team</Text>
      </Section>
    </EmailLayout>
  );
};

export default WelcomeEmail;
