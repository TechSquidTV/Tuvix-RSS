import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

interface PasswordResetEmailProps {
  username: string;
  resetUrl: string;
}

export const PasswordResetEmail: React.FC<
  Readonly<PasswordResetEmailProps>
> = ({ username, resetUrl }) => {
  // Extract base URL from reset URL for logo
  let appUrl = "http://localhost:5173";
  try {
    const url = new URL(resetUrl);
    appUrl = `${url.protocol}//${url.host}`;
  } catch {
    // Fallback to default if URL parsing fails
  }

  return (
    <EmailLayout preview="Reset your TuvixRSS password" appUrl={appUrl}>
      <Section className="mt-4">
        <Heading className="mx-0 mb-8 mt-2 p-0 text-lg font-normal">
          Reset Your Password
        </Heading>
        <Text className="text-[14px] leading-6 text-muted">
          Hello {username},
        </Text>
        <Text className="text-[14px] leading-6 text-muted">
          We received a request to reset your password. Click the button below
          to create a new password:
        </Text>
      </Section>

      <Section className="mt-8">
        <Button
          className="bg-brand rounded-[8px] px-[24px] py-[12px] text-center text-[14px] font-medium text-white no-underline"
          href={resetUrl}
        >
          Reset Password
        </Button>
      </Section>

      <Section className="mt-4">
        <Text className="text-[14px] leading-6 text-muted">
          This link will expire in 1 hour. If you didn&apos;t request a password
          reset, you can safely ignore this email.
        </Text>
        <Text className="text-[14px] leading-6 text-muted">
          If the button doesn&apos;t work, copy and paste this link into your
          browser:
        </Text>
        <Text className="text-[14px] leading-6 text-[#0066cc] break-all">
          {resetUrl}
        </Text>
      </Section>
    </EmailLayout>
  );
};

export default PasswordResetEmail;
