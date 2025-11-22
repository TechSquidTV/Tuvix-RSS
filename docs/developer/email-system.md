# Email System Documentation

Complete guide to TuvixRSS's transactional email system, powered by Resend and React Email.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Setup and Configuration](#setup-and-configuration)
- [Email Types](#email-types)
- [Email Flows](#email-flows)
- [Template Development](#template-development)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Code References](#code-references)

## Overview

TuvixRSS uses [Resend](https://resend.com) for transactional email delivery, supporting email verification, password reset, and welcome emails. All email templates are built using [React Email](https://react.email) components, providing a modern, type-safe approach to email development.

### Key Features

- **Email Verification**: Verify user email addresses during registration
- **Password Reset**: Secure password reset via email tokens
- **Welcome Emails**: Greet new users after successful registration
- **Graceful Fallback**: Development mode logging when API key is missing
- **Type-Safe Templates**: React Email components with TypeScript
- **Unified Sending Logic**: Shared email sending infrastructure

### Email Service Location

**Core Service**: `packages/api/src/services/email.ts`

All email sending logic is centralized in this file, with templates in `packages/api/src/services/email-templates/`.

## Architecture

### Email Service Structure

```
packages/api/src/services/
├── email.ts                    # Core email service (sending logic)
└── email-templates/
    ├── index.ts               # Template exports
    ├── verification.tsx        # Email verification template
    ├── password-reset.tsx      # Password reset template
    └── welcome.tsx             # Welcome email template
```

### Sending Flow

1. **Email Function Called** (e.g., `sendVerificationEmail`)
2. **Configuration Check** - Verifies `RESEND_API_KEY` and `EMAIL_FROM` are set
3. **Dev Mode Fallback** - If not configured, logs to console (dev mode only)
4. **Resend Client** - Initializes Resend client with API key
5. **Template Rendering** - React Email component rendered to HTML
6. **Email Sent** - Resend API sends email
7. **Result Logging** - Success/failure logged (dev mode)

### Shared Sending Logic

All email types use a shared `sendEmail()` helper function that handles:
- Configuration checking
- Resend client initialization
- Error handling
- Success/failure logging
- Development mode fallback

**Non-Blocking Behavior**:
- Email sending failures do **not** block user registration or other operations
- Failures are logged to console but don't throw errors
- User registration completes successfully even if email sending fails
- This ensures availability - users can always register, even if email service is down

**Implementation**: `packages/api/src/services/email.ts:96`

```typescript
async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  // Common logic for all email types
}
```

## Setup and Configuration

### Prerequisites

1. **Resend Account** - Sign up at [resend.com](https://resend.com/signup)
2. **Domain Verification** - Verify your sending domain in Resend dashboard
3. **API Key** - Create an API key in Resend dashboard

### Step 1: Create Resend Account

1. Sign up at [resend.com](https://resend.com/signup)
2. Verify your email address
3. Complete account setup

### Step 2: Verify Domain

1. Navigate to **"Domains"** in Resend dashboard
2. Click **"Add Domain"**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add DNS records provided by Resend:
   - **DKIM** - DomainKeys Identified Mail
   - **SPF** - Sender Policy Framework
   - **DMARC** - Domain-based Message Authentication
5. Click **"Verify DNS Records"** in Resend dashboard
6. Wait for verification (usually a few minutes, up to 24-48 hours)

**Important**: The `EMAIL_FROM` address must match a verified domain in Resend.

### Step 3: Create API Key

1. Navigate to **"API Keys"** in Resend dashboard
2. Click **"Create API Key"**
3. Give it a descriptive name (e.g., "TuvixRSS Production")
4. Copy the API key (starts with `re_`)
5. Store securely (you won't be able to see it again)

### Step 4: Configure Environment Variables

#### Docker Compose / Local Development

Add to your `.env` file:

```bash
# Required for email functionality
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com  # Must match verified domain
BASE_URL=http://localhost:5173     # Frontend URL for email links
```

#### Cloudflare Workers

Set secrets via Wrangler CLI:

```bash
cd packages/api

# Required secrets
npx wrangler secret put RESEND_API_KEY
# Enter: re_xxxxxxxxx

npx wrangler secret put EMAIL_FROM
# Enter: noreply@yourdomain.com

npx wrangler secret put BASE_URL
# Enter: https://yourdomain.com
```

### Step 5: Test Email Delivery

1. **Register a new user** - Should receive verification email (if enabled) and welcome email
2. **Request password reset** - Should receive password reset email
3. **Check Resend dashboard** - View delivery status and logs

## Email Types

### Email Verification

**Purpose**: Verify user email addresses during registration

**Template**: `packages/api/src/services/email-templates/verification.tsx`

**Subject**: "Verify Your TuvixRSS Email Address"

**When Sent**:
- Automatically on registration (if `requireEmailVerification` is enabled)
- Manually via `auth.resendVerificationEmail` endpoint

**Parameters**:
- `to`: Recipient email address
- `username`: User's display name
- `verificationToken`: Verification token
- `verificationUrl`: Full verification URL

**Function**: `sendVerificationEmail(env, params)`

**Example**:
```typescript
import { sendVerificationEmail } from '@/services/email';

await sendVerificationEmail(env, {
  to: user.email,
  username: user.name || "User",
  verificationToken: token,
  verificationUrl: `${baseUrl}/api/auth/verify-email?token=${token}`,
});
```

### Password Reset

**Purpose**: Allow users to reset forgotten passwords

**Template**: `packages/api/src/services/email-templates/password-reset.tsx`

**Subject**: "Reset Your TuvixRSS Password"

**When Sent**:
- When user requests password reset via `auth.requestPasswordReset`
- Triggered by Better Auth's `requestPasswordReset` endpoint

**Parameters**:
- `to`: Recipient email address
- `username`: User's display name
- `resetToken`: Password reset token
- `resetUrl`: Full password reset URL

**Function**: `sendPasswordResetEmail(env, params)`

**Example**:
```typescript
import { sendPasswordResetEmail } from '@/services/email';

await sendPasswordResetEmail(env, {
  to: user.email,
  username: user.name || "User",
  resetToken: token,
  resetUrl: `${baseUrl}/reset-password?token=${token}`,
});
```

### Welcome Email

**Purpose**: Greet new users after successful registration

**Template**: `packages/api/src/services/email-templates/welcome.tsx`

**Subject**: "Welcome to Tuvix!"

**When Sent**:
- Automatically after successful registration
- Only if email verification is not required OR user is already verified

**Parameters**:
- `to`: Recipient email address
- `username`: User's display name
- `appUrl`: Frontend application URL

**Function**: `sendWelcomeEmail(env, params)`

**Example**:
```typescript
import { sendWelcomeEmail } from '@/services/email';

await sendWelcomeEmail(env, {
  to: user.email,
  username: user.name || "User",
  appUrl: baseUrl,
});
```

## Email Flows

### Admin User Considerations

**Email Verification Bypass**:
- Admin users bypass email verification checks in tRPC middleware
- Admins can access protected endpoints even if `emailVerified` is `false`
- This allows first admin user (created via `ALLOW_FIRST_USER_ADMIN`) immediate access

**Email Sending Behavior**:
- Verification emails are still sent to admins if `requireEmailVerification` is enabled
- Welcome emails follow normal logic: sent if verification not required OR user is verified
- **Note**: If `requireEmailVerification` is enabled and admin hasn't verified email, welcome email is delayed until verification (even though admin can access app)
- Admin status doesn't prevent email sending, only bypasses access restrictions

**Implementation**: `packages/api/src/trpc/init.ts:68-78`

### Registration Flow

1. **User Registers** → Better Auth creates account
2. **Role Assignment**:
   - First user may be promoted to admin (if `ALLOW_FIRST_USER_ADMIN` is enabled)
   - Admin users bypass email verification requirement (can access app immediately)
3. **Email Verification Check**:
   - If `requireEmailVerification` is enabled:
     - Verification email sent automatically (even for admins)
     - Welcome email **not** sent (waiting for verification)
     - **Exception**: Admin users can access app without verification
   - If `requireEmailVerification` is disabled:
     - Welcome email sent immediately
4. **User Verifies Email** (if required):
   - Clicks verification link
   - Email verified via Better Auth
   - Welcome email sent (if not already sent)

**Admin Bypass**: Admin users bypass email verification checks in middleware (`packages/api/src/trpc/init.ts:68`), allowing immediate access even if `emailVerified` is `false`. However, verification emails are still sent if `requireEmailVerification` is enabled.

**Implementation**: `packages/api/src/auth/better-auth.ts:320`

### Password Reset Flow

1. **User Requests Reset** → `auth.requestPasswordReset` endpoint
2. **Better Auth Generates Token** → Secure 32-byte token
3. **Email Sent** → `sendPasswordResetEmail` called
4. **User Clicks Link** → Redirected to reset password page
5. **User Submits New Password** → `auth.resetPassword` endpoint
6. **Token Validated** → Better Auth verifies token
7. **Password Updated** → User can log in with new password

**Implementation**: `packages/api/src/routers/auth.ts:552`

### Email Verification Flow

1. **User Registers** → Account created, email not verified
2. **Verification Email Sent** → `sendVerificationEmail` called (if `requireEmailVerification` is enabled)
3. **User Clicks Link** → Better Auth `/api/auth/verify-email` endpoint
4. **Token Validated** → Better Auth verifies token
5. **Email Verified** → `emailVerified` flag set to `true`
6. **Welcome Email Sent** → If not already sent

**Resend Verification Email**:
- User can request new verification email via `auth.resendVerificationEmail`
- Rate limited: 1 request per 5 minutes per user
- Only available if `requireEmailVerification` is enabled and user is not already verified

**Admin Users**:
- Admin users bypass email verification requirement in middleware
- Can access all protected endpoints without verifying email
- Verification emails are still sent if `requireEmailVerification` is enabled
- Welcome emails are sent immediately if `requireEmailVerification` is disabled OR if admin is already verified

**Implementation**: 
- Email sending: `packages/api/src/routers/auth.ts:355`
- Admin bypass: `packages/api/src/trpc/init.ts:68`

## Template Development

### Previewing Email Templates

React Email provides a development server for previewing email templates in the browser.

**Start Preview Server**:
```bash
# From project root
pnpm run email:preview

# Or from packages/api directory
cd packages/api
pnpm run email:preview
```

This starts a local preview server (typically at `http://localhost:3000`) where you can:
- View all email templates in a browser
- See how templates render with different props
- Test responsive design
- Preview in different email clients (via React Email's built-in previews)

**Preview Server Features**:
- Hot reload - changes to templates update automatically
- Multiple template preview - see all templates side-by-side
- Props editor - modify template props in real-time
- Email client previews - see how emails look in Gmail, Outlook, etc.

**Note**: The preview server looks for templates in `packages/api/src/services/email-templates/` directory.

**Testing with Sample Data**:
When previewing templates, you can test with different prop values:
- **Verification Email**: Test with various usernames and verification URLs
- **Password Reset**: Test with different reset URLs and usernames
- **Welcome Email**: Test with different app URLs and usernames

The preview server allows you to modify props in real-time to see how templates render with different data.

### Template Structure

All email templates follow this structure:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface MyEmailProps {
  username: string;
  actionUrl: string;
}

export const MyEmail: React.FC<Readonly<MyEmailProps>> = ({
  username,
  actionUrl,
}) => (
  <Html>
    <Head />
    <Preview>Email preview text</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Email Title</Heading>
        <Text style={text}>Hello {username},</Text>
        {/* Email content */}
        <Section style={buttonContainer}>
          <Button style={button} href={actionUrl}>
            Action Button
          </Button>
        </Section>
        {/* Additional content */}
      </Container>
    </Body>
  </Html>
);

export default MyEmail;

// Styles
const main = { /* ... */ };
const container = { /* ... */ };
const h1 = { /* ... */ };
const text = { /* ... */ };
const buttonContainer = { /* ... */ };
const button = { /* ... */ };
```

### Adding a New Email Type

1. **Create Template** (`packages/api/src/services/email-templates/my-email.tsx`):
   ```tsx
   export const MyEmail: React.FC<MyEmailProps> = ({ ... }) => (
     // Template JSX
   );
   ```

2. **Export Template** (`packages/api/src/services/email-templates/index.ts`):
   ```typescript
   export { MyEmail } from "./my-email";
   ```

3. **Add Type Definition** (`packages/api/src/services/email.ts`):
   ```typescript
   export interface MyEmailParams {
     to: string;
     username: string;
     // ... other params
   }
   ```

4. **Add Sending Function** (`packages/api/src/services/email.ts`):
   ```typescript
   export async function sendMyEmail(
     env: Env,
     params: MyEmailParams,
   ): Promise<SendEmailResult> {
     return sendEmail({
       env,
       to: params.to,
       subject: "My Email Subject",
       template: MyEmail({ ...params }) as React.ReactElement,
       type: "my-email",
       details: { ...params },
     });
   }
   ```

5. **Use Function**:
   ```typescript
   import { sendMyEmail } from '@/services/email';
   
   await sendMyEmail(env, {
     to: user.email,
     username: user.name,
     // ... other params
   });
   ```

### Template Best Practices

1. **Preview Text**: Always include a `<Preview>` component
2. **Responsive Design**: Use inline styles (email clients don't support CSS)
3. **Accessibility**: Use semantic HTML and alt text for images
4. **Fallback Links**: Include plain text links if buttons don't work
5. **Expiration Notice**: Mention token/link expiration times
6. **Brand Consistency**: Match your application's design system

### Styling Guidelines

- **Inline Styles Only**: Email clients don't support `<style>` tags
- **Table-Based Layouts**: Use tables for complex layouts (better email client support)
- **Web-Safe Fonts**: Use system font stacks
- **Color Contrast**: Ensure sufficient contrast for accessibility
- **Button Styling**: Use background colors, not borders (better support)

## API Reference

### Email Service Functions

#### `sendVerificationEmail`

Send email verification email.

```typescript
function sendVerificationEmail(
  env: Env,
  params: VerificationEmailParams,
): Promise<SendEmailResult>
```

**Parameters**:
- `env`: Environment configuration
- `params.to`: Recipient email address
- `params.username`: User's display name
- `params.verificationToken`: Verification token
- `params.verificationUrl`: Full verification URL

**Returns**: `Promise<SendEmailResult>`

#### `sendPasswordResetEmail`

Send password reset email.

```typescript
function sendPasswordResetEmail(
  env: Env,
  params: PasswordResetEmailParams,
): Promise<SendEmailResult>
```

**Parameters**:
- `env`: Environment configuration
- `params.to`: Recipient email address
- `params.username`: User's display name
- `params.resetToken`: Password reset token
- `params.resetUrl`: Full password reset URL

**Returns**: `Promise<SendEmailResult>`

#### `sendWelcomeEmail`

Send welcome email to new user.

```typescript
function sendWelcomeEmail(
  env: Env,
  params: WelcomeEmailParams,
): Promise<SendEmailResult>
```

**Parameters**:
- `env`: Environment configuration
- `params.to`: Recipient email address
- `params.username`: User's display name
- `params.appUrl`: Frontend application URL

**Returns**: `Promise<SendEmailResult>`

### Type Definitions

#### `SendEmailResult`

```typescript
interface SendEmailResult {
  success: boolean;
  error?: string;
}
```

#### `VerificationEmailParams`

```typescript
interface VerificationEmailParams {
  to: string;
  username: string;
  verificationToken: string;
  verificationUrl: string;
}
```

#### `PasswordResetEmailParams`

```typescript
interface PasswordResetEmailParams {
  to: string;
  username: string;
  resetToken: string;
  resetUrl: string;
}
```

#### `WelcomeEmailParams`

```typescript
interface WelcomeEmailParams {
  to: string;
  username: string;
  appUrl: string;
}
```

## Troubleshooting

### Emails Not Sending

**Symptoms**: No emails received, no errors in logs

**Solutions**:
1. **Verify API Key**: Check `RESEND_API_KEY` is set correctly
2. **Verify Domain**: Ensure `EMAIL_FROM` matches verified domain in Resend
3. **Check Resend Dashboard**: View API errors and delivery status
4. **Development Mode**: Check console logs (emails log to console if API key missing)
5. **Check Spam Folder**: Emails may be filtered as spam

### Domain Verification Issues

**Symptoms**: Emails fail with domain verification errors

**Solutions**:
1. **Verify DNS Records**: Ensure all DNS records (DKIM, SPF, DMARC) are added correctly
2. **Wait for Propagation**: DNS changes can take 24-48 hours
3. **Use Resend Tool**: Use Resend's DNS verification tool to check record status
4. **Check Record Format**: Ensure records match exactly what Resend provides

### Email Delivery Delays

**Symptoms**: Emails arrive but with significant delay

**Solutions**:
1. **Check Resend Dashboard**: View delivery status and logs
2. **Verify Recipient Email**: Ensure email address is valid
3. **Check Spam Filters**: Review spam/junk folders
4. **Review Resend Logs**: Check for bounce/spam reports

### Development Mode Logging

When `RESEND_API_KEY` is not configured, emails are logged to console instead of being sent:

```
📧 Email (verification) would be sent to: user@example.com
   Details: {
     "username": "John",
     "verificationUrl": "http://localhost:5173/api/auth/verify-email?token=..."
   }
   ⚠️  Configure RESEND_API_KEY and EMAIL_FROM to send emails
```

This allows development without a Resend account, but emails won't actually be sent.

### Template Rendering Issues

**Symptoms**: Emails render incorrectly or buttons don't work

**Solutions**:
1. **Test in Email Clients**: Use tools like Litmus or Email on Acid
2. **Check Inline Styles**: Ensure all styles are inline (not in `<style>` tags)
3. **Verify Button Links**: Test that `href` attributes are correct
4. **Check HTML Structure**: Ensure proper nesting and closing tags

## Code References

### Key Files

| File | Description |
|------|-------------|
| `packages/api/src/services/email.ts` | Core email service and sending functions |
| `packages/api/src/services/email-templates/verification.tsx` | Email verification template |
| `packages/api/src/services/email-templates/password-reset.tsx` | Password reset template |
| `packages/api/src/services/email-templates/welcome.tsx` | Welcome email template |
| `packages/api/src/services/email-templates/index.ts` | Template exports |
| `packages/api/src/auth/better-auth.ts` | Better Auth email verification integration |
| `packages/api/src/routers/auth.ts` | Auth router with email endpoints |

### Integration Points

**Better Auth Email Verification**:
- `packages/api/src/auth/better-auth.ts:178` - `emailVerification.sendVerificationEmail` callback
- `packages/api/src/auth/better-auth.ts:345` - Manual verification email on sign-up

**Password Reset**:
- `packages/api/src/auth/better-auth.ts:92` - `sendResetPassword` callback
- `packages/api/src/routers/auth.ts:552` - `requestPasswordReset` endpoint

**Welcome Email**:
- `packages/api/src/auth/better-auth.ts:358` - Welcome email after sign-up

**Resend Verification Email**:
- `packages/api/src/routers/auth.ts:355` - `resendVerificationEmail` endpoint

### Related Documentation

- [Authentication Guide](./authentication.md) - Email verification integration
- [Security Guide](./security.md) - Email service security considerations
- [Admin Guide](../guides/admin/admin-guide.md) - Email configuration for admins
- [Deployment Guide](../deployment.md) - Environment variable configuration

---

**Last Updated:** 2025-01-15

