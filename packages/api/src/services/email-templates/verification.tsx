import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface VerificationEmailProps {
  username: string;
  verificationUrl: string;
}

export const VerificationEmail: React.FC<Readonly<VerificationEmailProps>> = ({
  username,
  verificationUrl,
}) => {
  // Extract base URL from verification URL for logo
  let appUrl = "http://localhost:5173";
  try {
    const url = new URL(verificationUrl);
    appUrl = `${url.protocol}//${url.host}`;
  } catch {
    // Fallback to default if URL parsing fails
  }

  return (
    <EmailLayout preview="Verify your TuvixRSS email address" appUrl={appUrl}>
      <Section className="mt-4">
        <Heading className="mx-0 mb-8 mt-2 p-0 text-lg font-normal">
          Verify Your Email Address
        </Heading>
        <Text className="text-[14px] leading-6 text-muted">
          Hello {username},
        </Text>
        <Text className="text-[14px] leading-6 text-muted">
          Thank you for signing up for TuvixRSS! Please verify your email
          address by clicking the button below:
        </Text>
      </Section>

      <Section className="mt-8">
        <Button
          className="bg-brand rounded-[8px] px-[24px] py-[12px] text-center text-[14px] font-medium text-white no-underline"
          href={verificationUrl}
        >
          Verify Email Address
        </Button>
      </Section>

      <Section className="mt-4">
        <Text className="text-[14px] leading-6 text-muted">
          This link will expire in 1 hour. If you didn&apos;t create an account,
          you can safely ignore this email.
        </Text>
        <Text className="text-[14px] leading-6 text-muted">
          If the button doesn&apos;t work, copy and paste this link into your
          browser:
        </Text>
        <Text className="text-[14px] leading-6 text-[#0066cc] break-all">
          {verificationUrl}
        </Text>
      </Section>
    </EmailLayout>
  );
};

export default VerificationEmail;
