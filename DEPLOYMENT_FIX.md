# Email Verification Fix - Deployment Instructions

## Issues Fixed

1. **404 on email verification links** - Better Auth's verify-email endpoint was disabled
2. **Incorrect redirect after verification** - Users were redirected to API URL instead of frontend
3. **Sentry noise** - Email verification errors were being logged unnecessarily

## Changes Made

### 1. Enabled Better Auth Email Verification Endpoint

- **File**: `packages/api/src/auth/better-auth.ts:131`
- Changed `requireEmailVerification: false` to `true`
- This enables the `/api/auth/verify-email` endpoint

### 2. Fixed Redirect URLs

- **File**: `packages/api/src/auth/better-auth.ts:60-68`
- Split URL configuration into two variables:
  - `apiUrl` (BETTER_AUTH_URL): Where Better Auth API is hosted
  - `frontendUrl` (BASE_URL): Where users are redirected after verification

### 3. Reduced Sentry Noise

- **File**: `packages/api/src/trpc/init.ts:28-33`
- Filter out expected "Email verification required" FORBIDDEN errors
- **File**: `packages/app/src/routes/app/route.tsx:87-90`
- Don't log HTTP 3xx redirects as errors

## Production Deployment Steps

### Step 1: Update Cloudflare Secrets

You need to update two environment variables in production:

```bash
# Set BASE_URL to the FRONTEND URL (where users are redirected after verification)
npx wrangler secret put BASE_URL
# Enter: https://feed.tuvix.app

# Set BETTER_AUTH_URL to the API URL (where Better Auth endpoints are hosted)
npx wrangler secret put BETTER_AUTH_URL
# Enter: https://api.tuvix.app
```

### Step 2: Verify COOKIE_DOMAIN is Set

Since your frontend and API are on different subdomains, ensure COOKIE_DOMAIN is set:

```bash
npx wrangler secret list
```

Verify that `COOKIE_DOMAIN` is in the list. If not, set it:

```bash
npx wrangler secret put COOKIE_DOMAIN
# Enter: tuvix.app
```

### Step 3: Deploy

```bash
# Build and deploy
pnpm build
cd packages/api
npx wrangler deploy
```

### Step 4: Test the Flow

1. Sign up with a new email address
2. Check your email for the verification link
3. Click the link - you should be redirected to `https://api.tuvix.app/api/auth/verify-email?token=...`
4. After verification, you should be redirected to `https://feed.tuvix.app`
5. You should be able to access the app without seeing "Email verification required" errors

## Environment Variables Summary

| Variable          | Development             | Production               | Purpose                                        |
| ----------------- | ----------------------- | ------------------------ | ---------------------------------------------- |
| `BASE_URL`        | `http://localhost:5173` | `https://feed.tuvix.app` | Frontend URL for redirects after verification  |
| `BETTER_AUTH_URL` | `http://localhost:5173` | `https://api.tuvix.app`  | API URL where Better Auth endpoints are hosted |
| `COOKIE_DOMAIN`   | Not set                 | `tuvix.app`              | Root domain for cross-subdomain cookies        |

## What Was Broken Before

1. **Better Auth endpoint disabled**: `requireEmailVerification: false` prevented the `/api/auth/verify-email` endpoint from being created
2. **Wrong redirect URL**: After verification, users were redirected to `api.tuvix.app/` instead of `feed.tuvix.app`
3. **Sentry noise**: Expected verification errors were being logged to Sentry

## What Works Now

1. Email verification endpoint exists at `https://api.tuvix.app/api/auth/verify-email`
2. After clicking the verification link, users are redirected to the frontend
3. Sentry only logs actual errors, not expected verification flows
4. Console doesn't show false-positive "HTTP 307" errors
