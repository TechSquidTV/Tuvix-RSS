# Debugging Email Verification Issues

This guide helps debug email verification failures when they're not appearing in Sentry or logs.

## Sentry Configuration

Sentry is configured with the following features:

1. **Enabled Sentry Logs**: `enableLogs: true` in Sentry config
2. **Runtime-Agnostic Wrapper**: Sentry is automatically enabled in Cloudflare Workers, disabled in Node.js/Express
3. **Structured Logging**: Using `Sentry.logger` for better context

## Debugging Steps

### 1. Check Sentry Configuration

Verify that Sentry is properly configured:

```bash
# Check Cloudflare Workers logs for Sentry activity
# Sentry runs silently in the background in Cloudflare Workers
# Check the Sentry dashboard for captured events
```

### 2. Check Environment Variables

Ensure these are set in your Cloudflare Workers environment:

```bash
SENTRY_DSN=your_sentry_dsn
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com
```

### 3. Monitor Cloudflare Workers Logs

**Real-time Logs:**

```bash
# Using Wrangler CLI
wrangler tail

# Or view in Cloudflare Dashboard
# Workers & Pages > Your Worker > Logs
```

**What to look for:**

- `"Attempting to send verification email"` - Email attempt started
- `"Failed to send verification email"` - Email sending failed
- `"Verification email sent successfully"` - Email sent successfully
- `"Unexpected error in sendVerificationEmail callback"` - Unexpected error

### 4. Check Sentry Dashboard

**In Sentry, look for:**

1. **Logs Tab**:
   - Filter by `email.type:verification`
   - Look for log entries with `emailType: verification`

2. **Issues Tab**:
   - Filter by tag `email.type:verification`
   - Check for exceptions with tag `email.status:failed` or `email.status:error`

3. **Performance Tab**:
   - Look for spans with `op:email.send` and `name:Send verification Email`
   - Check duration and any errors

### 5. Test Email Configuration

Add a test endpoint to verify email configuration:

```typescript
// Add to your router for testing
testEmail: publicProcedure.mutation(async ({ ctx }) => {
  const { sendVerificationEmail } = await import("@/services/email");
  const result = await sendVerificationEmail(ctx.env, {
    to: "test@example.com",
    username: "Test User",
    verificationToken: "test-token",
    verificationUrl: "https://example.com/verify?token=test-token",
  });
  return result;
});
```

### 6. Check Better Auth Callback Execution

The email verification callback runs in Better Auth's context. To verify it's being called:

1. **Add explicit logging** at the start of the callback:

   ```typescript
   console.log("🔐 Better Auth sendVerificationEmail callback called", {
     userEmail: user.email,
     userId: user.id,
     hasToken: !!token,
     hasUrl: !!url,
   });
   ```

2. **Check if callback is skipped**:
   - If `requireEmailVerification` is false, callback returns early
   - Check global settings: `SELECT * FROM global_settings WHERE require_email_verification = 1`

### 7. Verify Email Service Configuration

Check if email service is properly configured:

```typescript
// The email service checks:
if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
  // Returns success: true in dev mode (doesn't actually send)
  // This might be why you're not seeing errors!
}
```

**Important**: In development, if email isn't configured, the service returns `success: true` without actually sending. This can mask configuration issues.

### 8. Check for Silent Failures

The callback is wrapped in try-catch to prevent breaking registration. Check:

1. **Are errors being caught silently?**
   - Look for `"Unexpected error in sendVerificationEmail callback"` in logs
   - Check Sentry for exceptions with tag `email.status:error`

2. **Is the error happening before Sentry is initialized?**
   - Better Auth callbacks might run before Sentry is fully initialized
   - Check if errors occur during the initial request

### 9. Add Temporary Debug Endpoint

Create a debug endpoint to test the full flow:

```typescript
// In your router
debugEmailVerification: publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ ctx, input }) => {
    const { sendVerificationEmail } = await import("@/services/email");
    const { getGlobalSettings } = await import("@/services/global-settings");

    const settings = await getGlobalSettings(ctx.db);
    console.log(
      "Email verification required:",
      settings.requireEmailVerification
    );
    console.log(
      "Email configured:",
      !!ctx.env.RESEND_API_KEY && !!ctx.env.EMAIL_FROM
    );

    const result = await sendVerificationEmail(ctx.env, {
      to: input.email,
      username: "Debug User",
      verificationToken: "debug-token",
      verificationUrl: "https://example.com/verify?token=debug-token",
    });

    return {
      success: result.success,
      error: result.error,
      emailConfigured: !!ctx.env.RESEND_API_KEY && !!ctx.env.EMAIL_FROM,
      requireVerification: settings.requireEmailVerification,
    };
  });
```

### 10. Check Cloudflare Workers Limits

Email sending might be failing due to:

- **CPU Time Limit**: Email sending might be timing out
- **Memory Limits**: Large email templates might exceed limits
- **Network Timeouts**: Resend API calls might be timing out

Check Workers metrics in Cloudflare Dashboard for:

- CPU time usage
- Memory usage
- Request duration
- Error rates

## Common Issues and Solutions

### Issue: No errors in Sentry or logs

**Possible causes:**

1. Sentry DSN not configured (check `SENTRY_DSN` environment variable)
2. Errors happening outside of Sentry's scope
3. Email service returning success in dev mode without sending
4. Errors being caught and swallowed

**Solution:**

- Check Cloudflare Workers logs (not just Sentry)
- Verify `SENTRY_DSN` is set in Cloudflare Workers secrets
- Check if `RESEND_API_KEY` and `EMAIL_FROM` are configured
- Add explicit console.log statements before try-catch blocks

### Issue: 503 errors during registration

**Possible causes:**

1. Email sending is blocking the request
2. Resend API is timing out
3. Email template rendering is failing

**Solution:**

- The callback is now wrapped in try-catch to prevent breaking registration
- Check if errors are being logged but registration still succeeds
- Verify Resend API is accessible from Cloudflare Workers

### Issue: Emails not sending but no errors

**Possible causes:**

1. Email service returning success without actually sending (dev mode)
2. Resend API silently failing
3. Email being sent but to wrong address

**Solution:**

- Verify `RESEND_API_KEY` and `EMAIL_FROM` are set in production
- Check Resend dashboard for sent emails
- Verify email address in database matches what's being sent

## Monitoring Checklist

After deploying the updated code, monitor:

- [ ] Sentry logs show email attempts
- [ ] Console logs appear in Cloudflare Workers logs
- [ ] Sentry exceptions are captured for failures
- [ ] Email spans appear in Sentry Performance
- [ ] Registration succeeds even if email fails
- [ ] Errors don't cause 503 responses

## Next Steps

1. Deploy the updated code with enhanced logging
2. Monitor Cloudflare Workers logs in real-time during registration
3. Check Sentry Logs tab for structured log entries
4. Check Sentry Issues tab for captured exceptions
5. Verify email configuration in production environment
6. Test registration flow and monitor all logs simultaneously
