# Staging Environment Setup Guide

This guide walks through setting up the staging environment for TuvixRSS.

## Overview

The staging environment provides a production-like environment for testing PRs before they're merged to main. Key features:

- **Clean slate**: Database is wiped and recreated on every deployment
- **Manual deployments**: Triggered via GitHub Actions workflow dispatch
- **Separate infrastructure**: Dedicated D1 database, Worker, and Pages project
- **No conflicts**: Last deployment wins (concurrent deployments are cancelled)

## Infrastructure Setup

### 1. Create Staging D1 Database

```bash
# Create a new D1 database for staging
wrangler d1 create tuvix-staging

# Note the database_id from the output
# Example output:
# ✅ Successfully created DB 'tuvix-staging' in region WEUR
# Created your database using D1's new storage backend.
#
# [[d1_databases]]
# binding = "DB"
# database_name = "tuvix-staging"
# database_id = "abc123-def456-ghi789"
```

### 2. Create Staging Pages Project

```bash
# Create a new Pages project for staging
wrangler pages project create tuvix-app-staging

# Or create it via the Cloudflare dashboard:
# 1. Go to Workers & Pages → Pages
# 2. Click "Create application"
# 3. Name it "tuvix-app-staging"
# 4. Choose "Direct Upload" (not Git integration)
```

### 3. Configure GitHub Secrets

Add the following secrets to your GitHub repository under **Settings → Secrets and variables → Actions → Environments**:

Create a **new environment** called `staging`, then add these secrets:

#### Staging Environment Secrets

| Secret Name                             | Value                                   | Description                    |
| --------------------------------------- | --------------------------------------- | ------------------------------ |
| `STAGING_D1_DATABASE_ID`                | `abc123-def456-ghi789`                  | Database ID from step 1        |
| `STAGING_CLOUDFLARE_PAGES_PROJECT_NAME` | `tuvix-app-staging`                     | Pages project name from step 2 |
| `STAGING_VITE_API_URL`                  | `https://tuvix-api-staging.workers.dev` | Staging API URL                |

#### Shared Secrets (if not already set)

These should already exist in your repository secrets (not environment-specific):

| Secret Name             | Value           | Description                             |
| ----------------------- | --------------- | --------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Your API token  | Token with Workers/Pages/D1 permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID | Found in Cloudflare dashboard           |
| `VITE_SENTRY_DSN`       | Your Sentry DSN | Frontend error tracking (optional)      |
| `SENTRY_DSN`            | Your Sentry DSN | Backend error tracking (optional)       |

### 4. Set Staging Worker Secrets

Set the required secrets for the staging Worker:

```bash
# Better Auth secret (generate a random 32-character string)
# When prompted, paste your randomly generated staging secret key
wrangler secret put BETTER_AUTH_SECRET --name tuvix-api-staging --env staging

# Email service (optional, for testing email flows)
# When prompted, enter your Resend API key
wrangler secret put RESEND_API_KEY --name tuvix-api-staging --env staging
# When prompted, enter the "from" email address to use for staging
wrangler secret put EMAIL_FROM --name tuvix-api-staging --env staging
# When prompted, enter the full base URL of your staging app (e.g. https://staging.yourdomain.com)
wrangler secret put BASE_URL --name tuvix-api-staging --env staging

# Sentry release (will be set automatically by deployment workflow)
# When prompted, enter the staging release identifier (if you choose to set this manually)
# wrangler secret put SENTRY_RELEASE --name tuvix-api-staging --env staging
```

## Deployment

### Manual Deployment via GitHub Actions

1. Go to **Actions** → **Deploy to Staging** → **Run workflow**
2. Select the branch/PR to deploy (e.g., `main`, `feature/new-feature`)
3. Choose whether to seed test data (default: false)
4. Click **Run workflow**

### What Happens During Deployment

1. **Build & Test**: Runs linting, type checking, and tests
2. **Deploy API**: Deploys Worker to `tuvix-api-staging`
3. **Deploy App**: Deploys Pages to `tuvix-app-staging`
4. **Wipe Database**: Drops all tables from staging database
5. **Apply Migrations**: Runs all migrations from scratch
6. **Seed Data** (optional): Loads test data if selected

### Accessing Staging

- **API**: `https://tuvix-api-staging.workers.dev`
- **App**: `https://tuvix-app-staging.pages.dev`

## Usage Tips

### When to Use Staging

- Testing PRs before merging to main
- Verifying database migrations work correctly
- Integration testing with production-like infrastructure
- Demoing features to stakeholders

### When NOT to Use Staging

- Local development (use `pnpm dev` instead - much faster)
- Quick iteration (staging deployments take 3-5 minutes)
- Testing that requires preserving data (staging wipes on each deploy)

### Communication

Since staging is shared and wiped on each deployment:

- **Post in team chat** before deploying to staging
- **Don't rely on staging data** - it will be deleted on next deployment
- **Use branch name in commit messages** so team knows what's deployed

## Troubleshooting

### Deployment fails with "Database not found"

Check that `STAGING_D1_DATABASE_ID` secret matches the actual database ID:

```bash
wrangler d1 list
# Find tuvix-staging in the list and verify the ID matches
```

### Deployment fails with "Insufficient permissions"

Ensure `CLOUDFLARE_API_TOKEN` has these permissions:

- Account: Cloudflare D1 - Edit
- Account: Workers Scripts - Edit
- Account: Cloudflare Pages - Edit

### Database wipe fails

If the wipe script fails during automated deployment, check the GitHub Actions logs.

For manual troubleshooting, you have two options:

**Option 1: Safe wrapper script (recommended for manual use)**

```bash
# Interactive script with validation and confirmation prompts
# Use this for manual/local database resets
cd packages/api
./scripts/wipe-staging-safe.sh
```

**Option 2: Direct wrangler command (used by CI, safe for manual use)**

```bash
# CRITICAL: Always include --env staging flag!
# This is what GitHub Actions uses - it's non-interactive and safe

# List tables in staging database
wrangler d1 execute tuvix-staging --remote --env staging --command "SELECT name FROM sqlite_master WHERE type='table'"

# Wipe staging database
wrangler d1 execute tuvix-staging --remote --env staging --file=packages/api/scripts/wipe-staging.sql
```

> [!CAUTION]
> **Never run wipe scripts without the `--env staging` flag!**
>
> The `--env staging` flag is critical for safety:
>
> - Targets the `tuvix-staging` database (not production)
> - Sets `ENVIRONMENT='staging'` variable
> - Uses staging-specific configuration
>
> The wipe script includes SQL-level safety checks, but the primary protection
> is the database name and environment flag. Always double-check before executing.

### App shows "Cannot connect to API"

Verify `STAGING_VITE_API_URL` matches the staging Worker URL:

```bash
# Get the Worker URL
wrangler whoami
# Then construct: https://tuvix-api-staging.<account-subdomain>.workers.dev
# For this project the staging Worker URL is:
# https://tuvix-api-staging.workers.dev
#
# You can confirm this in the Cloudflare dashboard:
# - Go to "Workers & Queues" → select the `tuvix-api-staging` Worker
# - Copy the "Default public URL" shown there

```

## Cost Considerations

Staging environment costs (assuming low-moderate usage):

- **D1 Database**: Free tier (5 GB storage, 50M reads/day)
- **Worker**: Free tier (100k requests/day) or $5/month (Paid plan required for CPU-intensive operations)
- **Pages**: Free tier (500 builds/month, unlimited requests)

**Estimated monthly cost**: $0-$5 depending on plan requirements

## Security

- Staging uses **separate secrets** from production
- Staging database is **wiped on every deployment** (no production data)
- **Never deploy production data** to staging
- Staging is **not intended for sensitive data** testing

## Next Steps

After setup:

1. Test a deployment to verify everything works
2. Document your staging URLs in team wiki/docs
3. Set up Slack/Discord notifications for staging deployments (optional)
4. Create test user accounts for staging (they'll persist until next deployment)
