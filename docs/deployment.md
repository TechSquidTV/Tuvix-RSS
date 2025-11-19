# TuvixRSS Deployment Guide

This guide covers development and release processes for both Docker Compose and Cloudflare (Workers + Pages) deployments.

## Table of Contents

- [Overview](#overview)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Cloudflare Deployment (Workers + Pages)](#cloudflare-deployment-workers--pages)
  - [API Setup (Cloudflare Workers)](#api-setup-cloudflare-workers)
  - [Frontend Setup (Cloudflare Pages)](#frontend-setup-cloudflare-pages)
  - [Cross-Subdomain Configuration](#cross-subdomain-configuration)
  - [Development Workflow](#development-workflow)
  - [Production Deployment Workflow](#production-deployment-workflow)
  - [Cloudflare Configuration](#cloudflare-configuration)
  - [Monitoring & Troubleshooting](#monitoring--troubleshooting)
- [Environment Configuration](#environment-configuration)
- [Scheduled Tasks (Cron)](#scheduled-tasks-cron)
- [Database Migrations](#database-migrations)
- [Monitoring & Health Checks](#monitoring--health-checks)

---

## Overview

TuvixRSS supports two deployment targets:

1. **Docker Compose** - Traditional container-based deployment with Node.js runtime
2. **Cloudflare** - Serverless edge deployment:
   - **API**: Cloudflare Workers (serverless edge runtime)
   - **Frontend**: Cloudflare Pages (static site hosting)

Both deployments share the same codebase with runtime-specific adapters.

### Architecture Differences

| Feature | Docker Compose | Cloudflare Workers |
|---------|---------------|-------------------|
| Runtime | Node.js 20+ | Cloudflare Workers |
| Database | SQLite (better-sqlite3) | D1 (Cloudflare's SQLite) |
| Cron | node-cron | Workers Scheduled Events |
| Rate Limiting | Disabled | Cloudflare Workers rate limit bindings |

---

## Docker Compose Deployment

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Git

### Development Process

#### 1. Initial Setup

```bash
# Clone repository
git clone https://github.com/yourusername/TuvixRSS.git
cd TuvixRSS

# Copy environment file
cp .env.example .env

# Generate secure Better Auth secret
openssl rand -base64 32

# Edit .env file with your values
vim .env
```

**Required Environment Variables:**

```env
BETTER_AUTH_SECRET=your-generated-secret-here  # Min 32 chars, for Better Auth session management
CORS_ORIGIN=http://localhost:5173
DATABASE_PATH=/app/data/tuvix.db
PORT=3001
NODE_ENV=production
```

**Note**: Better Auth uses HTTP-only cookies for session management (more secure than JWT tokens). The `BETTER_AUTH_SECRET` is used to sign and verify session cookies.

**Local Development**: Better Auth works perfectly with Docker Compose localhost setup:
- Frontend on `http://localhost:5173` (from host)
- API on `http://localhost:3001` (from host)
- Cookies are automatically handled (localhost domain works for both ports)
- CORS is configured with `credentials: true` to allow cookies
- Frontend client points to API URL (`VITE_API_URL=http://localhost:3001/trpc`)

#### 2. Build and Run

```bash
# Build Docker images
pnpm run docker:build

# Start containers
pnpm run docker:up

# View logs
pnpm run docker:logs

# Stop containers
pnpm run docker:down
```

**Services:**

- `api` - tRPC API server (port 3001)
  - Health check: http://localhost:3001/health
  - tRPC endpoint: http://localhost:3001/trpc
- `app` - React frontend (port 5173)
  - Health check: http://localhost:5173/health

#### 3. Local Development

For active development without Docker:

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm run db:migrate

# Start both API and frontend
pnpm run dev

# Or start separately:
pnpm run dev:api    # API on :3001
pnpm run dev:app    # Frontend on :5173
```

#### 4. Testing

```bash
# Run all tests
pnpm run test

# Run tests with coverage
pnpm run test:coverage

# Type checking
pnpm run type-check

# Linting
pnpm run lint
```

#### 5. Pre-Release Checklist

Before deploying to production:

```bash
# Run full pre-check
pnpm run pre-check

# This runs:
# - Linting (API + App)
# - Formatting checks
# - Type checking
# - Production build
```

### Production Deployment

#### 1. Server Setup

```bash
# On your production server
git clone https://github.com/yourusername/TuvixRSS.git
cd TuvixRSS

# Create production environment file
cp .env.example .env
vim .env
```

**Production Environment Variables:**

```env
# SECURITY: Use strong secrets in production
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>  # Min 32 chars for Better Auth
CORS_ORIGIN=https://yourdomain.com
DATABASE_PATH=/app/data/tuvix.db
PORT=3001
NODE_ENV=production

# Optional: Customize fetch behavior
FETCH_INTERVAL_MINUTES=60  # How often to fetch RSS feeds
```

**Better Auth Sessions**: Better Auth manages user sessions via HTTP-only cookies. No JWT tokens are used. The `BETTER_AUTH_SECRET` is used to sign session cookies securely.

#### 2. Deploy

```bash
# Build and start
docker compose build
docker compose up -d

# Verify health
curl http://localhost:3001/health
curl http://localhost:5173/health

# Monitor logs
docker compose logs -f
```

#### 3. Database Backups

```bash
# Backup database
docker compose exec api cp /app/data/tuvix.db /app/data/backup-$(date +%Y%m%d).db

# Or from host (if volume is mounted)
cp ./data/tuvix.db ./data/backup-$(date +%Y%m%d).db
```

#### 4. Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose down
docker compose build
docker compose up -d

# Database migrations run automatically on startup
```

### Docker Configuration

#### Dockerfile Structure

**API Dockerfile** (`packages/api/Dockerfile`):
- Multi-stage build (builder + production)
- Installs pnpm 10.19.0
- Runs migrations on startup
- Exposes port 3001
- Health check on /health endpoint

**App Dockerfile** (`packages/app/Dockerfile`):
- Multi-stage build with nginx
- Accepts VITE_API_URL build arg
- SPA routing support
- Static asset caching
- Health check on /health endpoint

#### docker-compose.yml

```yaml
services:
  api:
    build: ./packages/api
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_PATH=/app/data/tuvix.db
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - CORS_ORIGIN=${CORS_ORIGIN}
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  app:
    build:
      context: ./packages/app
      args:
        - VITE_API_URL=${VITE_API_URL:-http://localhost:3001/trpc}
    ports:
      - "5173:80"
    depends_on:
      api:
        condition: service_healthy
```

---

## Cloudflare Deployment (Workers + Pages)

TuvixRSS deploys to Cloudflare with:
- **API**: Cloudflare Workers (serverless edge runtime)
- **Frontend**: Cloudflare Pages (static site hosting)

### Prerequisites

- Node.js 20+
- pnpm
- Cloudflare account ([Sign up](https://dash.cloudflare.com/sign-up))
- Wrangler CLI (`npm install -g wrangler` or use `npx wrangler`)

### Quick Start

```bash
# 1. Authenticate
npx wrangler login

# 2. Setup API (Workers)
cd packages/api
# Follow "API Setup" section below

# 3. Setup Frontend (Pages)
cd packages/app
# Follow "Frontend Setup" section below
```

---

## API Setup (Cloudflare Workers)

### Step 1: Create Cloudflare Resources

#### 1.1. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens your browser to authenticate with Cloudflare.

#### 1.2. Create D1 Database

```bash
cd packages/api

# Create database
npx wrangler d1 create tuvix

# Output will show:
# ✅ Successfully created DB 'tuvix'!
# Created your database using D1's new storage backend. The storage backend
# migrates automatically based on your usage.
# [[d1_databases]]
# binding = "DB"
# database_name = "tuvix"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Copy this ID
#
# For local development: Set D1_DATABASE_ID environment variable with this ID
# For CI/CD: Add this ID as D1_DATABASE_ID GitHub secret
```

### Step 2: Configure wrangler.toml

**Note**: 
- Rate limit `namespace_id` values are user-defined positive integers that you choose yourself (e.g., `"1001"`, `"1002"`). They don't need to be created via CLI or dashboard.
- The `database_id` uses `${D1_DATABASE_ID}` placeholder syntax. For local dev, use `wrangler.toml.local`. For CI/CD, envsubst automatically substitutes it from GitHub secrets.

The `wrangler.toml` file is already configured with environment variable placeholders:

```toml
# ============================================================================
# Cloudflare Workers Configuration
# ============================================================================
# IMPORTANT: This file is safe to commit with empty IDs.
# DO NOT commit filled-in database_id or namespace IDs - they are account-specific.
# Use wrangler.toml.local for local overrides if needed.
# ============================================================================

name = "tuvix-api"
main = "src/adapters/cloudflare.ts"
compatibility_date = "2024-11-10"

# Sentry requires AsyncLocalStorage
compatibility_flags = ["nodejs_als"]

# D1 Database binding
# For local dev: Create wrangler.toml.local with your actual database_id
# For CI/CD: envsubst substitutes ${D1_DATABASE_ID} before deployment
[[d1_databases]]
binding = "DB"
database_name = "tuvix"
database_id = "${D1_DATABASE_ID}"  # Substituted by envsubst in CI/CD, or override in wrangler.toml.local

# Rate Limit Bindings
# namespace_id: A positive integer you define, unique to your Cloudflare account
# You choose these IDs yourself - they don't need to be created elsewhere
[[ratelimits]]
name = "API_RATE_LIMIT"
namespace_id = "1001"  # User-defined identifier - choose any unique positive integer
simple = { limit = 10000, period = 60 }  # High limit - actual limits enforced per user

[[ratelimits]]
name = "FEED_RATE_LIMIT"
namespace_id = "1002"  # User-defined identifier - choose any unique positive integer
simple = { limit = 10000, period = 60 }  # High limit - actual limits enforced per user

# Environment variables
[vars]
RUNTIME = "cloudflare"

# Cron trigger - every 5 minutes
[triggers]
crons = ["*/5 * * * *"]
```

**Security Notes**:
- ✅ **Safe to commit**: Environment variable placeholders (e.g., `${D1_DATABASE_ID}`), structure, names, bindings
- ❌ **Never commit**: Filled-in `database_id` values (account-specific)
- 🔒 **Use GitHub Secrets** (not Variables) for sensitive data:
  - For CI/CD: Set `D1_DATABASE_ID` as a GitHub **Secret** (encrypted, masked in logs)
  - For local dev: Create `wrangler.toml.local` with your actual database_id
  - Other secrets: Use `wrangler secret put` for Cloudflare Worker secrets

**Local Development Setup:**

Wrangler doesn't support environment variable substitution in `wrangler.toml`. For local development, create `wrangler.toml.local`:

```bash
cd packages/api

# Copy the example file
cp wrangler.toml.local.example wrangler.toml.local

# Edit wrangler.toml.local and replace "your-database-id-here" with your actual D1 database ID
# Example: database_id = "7078240d-69e3-46fb-bb21-aa8e5208de9b"
```

**Note:** `wrangler.toml.local` is gitignored and will override values in `wrangler.toml`. This is the recommended approach for local development.

**CI/CD Setup:**

The GitHub Actions workflow automatically substitutes `${D1_DATABASE_ID}` in `wrangler.toml` before deployment using `envsubst` (available on Ubuntu runners). 

**To configure:**

1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Click the **"Secrets"** tab (not "Variables" - we use Secrets for sensitive data)
3. Click "New repository secret"
4. Name: `D1_DATABASE_ID` (must match exactly)
5. Value: Your D1 database ID (from `wrangler d1 create tuvix`)
6. Click "Add secret"

**Why Secrets instead of Variables?**
- **Secrets** are encrypted and masked in logs (use for sensitive data like database IDs, API keys)
- **Variables** are plain text and visible in logs (use for non-sensitive configuration)

The workflow automatically:
- Reads the `D1_DATABASE_ID` **secret** from GitHub (via `${{ secrets.D1_DATABASE_ID }}`)
- Sets it as an environment variable in the step's `env` block for use by `envsubst`
- Substitutes `${D1_DATABASE_ID}` in `wrangler.toml` before deployment
- Verifies the secret is set and substitution succeeded
- Never logs or leaks the secret value (secrets are automatically masked)

No additional configuration needed once the secret is set.

### Step 3: Set Secrets

Set required secrets:

```bash
# Make sure you're in the packages/api directory
cd packages/api

# Required: Better Auth secret (min 32 chars)
npx wrangler secret put BETTER_AUTH_SECRET
# Generate with: openssl rand -base64 32
# This will prompt you to enter the secret value

# Required: CORS origin (frontend URL)
npx wrangler secret put CORS_ORIGIN
# Enter: https://your-pages-project.pages.dev
# Or: https://yourdomain.com,https://www.yourdomain.com
```

**Optional Secrets**:

```bash
# Email service (Resend)
# See docs/developer/email-system.md for complete email setup guide
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put BASE_URL

# Cross-subdomain cookies (if frontend/API on different subdomains)
npx wrangler secret put COOKIE_DOMAIN
# Enter: example.com  (root domain, not subdomain)

# Admin initialization (first deployment only)
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_EMAIL
```

### Step 4: Database Migrations

```bash
cd packages/api

# Generate migrations from schema changes
pnpm run db:generate

# Apply migrations to production D1
pnpm run db:migrate:d1

# Verify migrations
npx wrangler d1 execute tuvix --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

### Step 5: Deploy API

```bash
cd packages/api

# Pre-deployment checks
pnpm run type-check
pnpm run test
pnpm run build

# Deploy to Workers
pnpm run deploy
# Or: npx wrangler deploy

# Monitor deployment
npx wrangler tail
```

### Step 6: Initialize Admin User (First Deployment)

After first deployment:

```bash
# Trigger admin initialization
curl -X POST https://your-worker.workers.dev/_admin/init

# Or if using custom domain:
curl -X POST https://api.yourdomain.com/_admin/init
```

**Note**: Admin initialization creates a user in Better Auth's `user` table. You can then log in using Better Auth's `/api/auth/sign-in/username` endpoint.

---

## Frontend Setup (Cloudflare Pages)

### Step 1: Create Pages Project

#### Option A: Via Wrangler CLI (Recommended)

```bash
cd packages/app

# Build the app
export VITE_API_URL=https://your-worker.workers.dev/trpc
# Or: export VITE_API_URL=https://api.yourdomain.com/trpc
pnpm run build

# Deploy to Pages
npx wrangler pages deploy dist --project-name=tuvix-app
```

#### Option B: Via Cloudflare Dashboard

1. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/pages)
2. Click **"Create a project"**
3. Connect your Git repository (GitHub/GitLab)
4. Configure build settings:
   - **Build command**: `cd packages/app && pnpm install && pnpm build`
   - **Build output directory**: `packages/app/dist`
   - **Root directory**: `/` (project root)
5. Add environment variable:
   - **Variable**: `VITE_API_URL`
   - **Value**: `https://your-worker.workers.dev/trpc` (or your custom domain)

### Step 2: Configure CORS

Ensure your Worker's `CORS_ORIGIN` secret includes your Pages URL:

```bash
# If Pages is at https://tuvix-app.pages.dev
npx wrangler secret put CORS_ORIGIN
# Enter: https://tuvix-app.pages.dev

# If using custom domain
npx wrangler secret put CORS_ORIGIN
# Enter: https://yourdomain.com,https://tuvix-app.pages.dev
```

### Step 3: Configure Custom Domain (Optional)

1. In Cloudflare Dashboard → Pages → Your Project → **Custom domains**
2. Click **"Set up a custom domain"**
3. Enter your domain (e.g., `app.yourdomain.com`)
4. Cloudflare will automatically configure DNS

**Update CORS**:
```bash
npx wrangler secret put CORS_ORIGIN
# Enter: https://app.yourdomain.com,https://yourdomain.com
```

---

## Cross-Subdomain Configuration

If your frontend and API are on different subdomains (e.g., `app.example.com` and `api.example.com`), configure cross-subdomain cookies:

### When You Need This

- ✅ Frontend on `app.example.com`, API on `api.example.com`
- ✅ Frontend on `www.example.com`, API on `api.example.com`
- ❌ Both on same domain (e.g., `example.com/app` and `example.com/api`)
- ❌ Both on same subdomain (e.g., `app.example.com` and `app.example.com/api`)

### Configuration

```bash
# Set cookie domain to root domain (not subdomain)
npx wrangler secret put COOKIE_DOMAIN
# Enter: example.com  (NOT api.example.com or app.example.com)
```

**Security Note**: Setting `COOKIE_DOMAIN` makes cookies accessible across all subdomains. Only enable if necessary and ensure all subdomains are trusted.

---

## Development Workflow

### Local Development

#### API (Workers)

```bash
cd packages/api

# Start local Workers development server
pnpm run dev:workers

# This starts:
# - Local Workers runtime (Miniflare)
# - Local D1 database
# - Auto-reload on file changes
```

#### Frontend

```bash
cd packages/app

# Start Vite dev server
pnpm run dev

# Frontend runs on http://localhost:5173
# Points to API at VITE_API_URL (default: http://localhost:3001/trpc)
```

### Testing

```bash
# Run tests (uses Node.js runtime)
pnpm run test

# Test Workers locally
cd packages/api
npx wrangler dev

# Test cron trigger locally
npx wrangler dev --test-scheduled
```

---

## Production Deployment Workflow

### Complete Deployment Checklist

1. **Pre-Deployment**:
   ```bash
   # From project root
   pnpm run type-check
   pnpm run test
   ```

2. **Deploy API**:
   ```bash
   cd packages/api
   pnpm run db:migrate:d1  # Run migrations
   pnpm run build
   pnpm run deploy
   ```

3. **Deploy Frontend**:
   ```bash
   cd packages/app
   export VITE_API_URL=https://your-worker.workers.dev/trpc
   pnpm run build
   npx wrangler pages deploy dist --project-name=tuvix-app
   ```

4. **Verify**:
   ```bash
   # Check API health
   curl https://your-worker.workers.dev/health

   # Check frontend
   curl https://tuvix-app.pages.dev/health
   ```

---

## Cloudflare Configuration

### Worker Settings

Recommended settings in Cloudflare Dashboard → Workers → Your Worker → Settings:

- **CPU Limit**: 50ms (sufficient for most operations)
- **Memory**: 128MB
- **Cron Triggers**: Configured via `wrangler.toml` (`*/5 * * * *`)

### Pages Settings

Recommended settings in Cloudflare Dashboard → Pages → Your Project → Settings:

- **Build command**: `cd packages/app && pnpm install && pnpm build`
- **Build output directory**: `packages/app/dist`
- **Environment variables**: `VITE_API_URL` (set to your Worker URL)

### Custom Domains

#### Worker Custom Domain

```bash
# Add custom domain to Worker
npx wrangler domains add api.yourdomain.com

# Update CORS_ORIGIN secret
npx wrangler secret put CORS_ORIGIN
# Enter: https://yourdomain.com,https://www.yourdomain.com
```

#### Pages Custom Domain

1. Cloudflare Dashboard → Pages → Your Project → **Custom domains**
2. Click **"Set up a custom domain"**
3. Enter domain (e.g., `app.yourdomain.com`)
4. DNS is configured automatically

**Important**: After adding custom domains, update the `CORS_ORIGIN` secret in your Worker to include all frontend URLs.

---

## Monitoring & Troubleshooting

### View Logs

```bash
# API (Workers) logs
npx wrangler tail

# Filter by status
npx wrangler tail --status error
npx wrangler tail --status ok

# Search logs
npx wrangler tail --search "RSS fetch"

# Frontend (Pages) logs
# View in Cloudflare Dashboard → Pages → Your Project → Deployments → View logs
```

### View Metrics

- **Workers**: Cloudflare Dashboard → Workers → Your Worker → **Metrics**
- **Pages**: Cloudflare Dashboard → Pages → Your Project → **Analytics**

### Common Issues

#### CORS Errors

**Symptom**: Frontend requests blocked by CORS policy

**Solution**:
```bash
# Ensure CORS_ORIGIN includes your frontend URL
npx wrangler secret put CORS_ORIGIN
# Enter: https://your-pages-project.pages.dev
```

#### Authentication Cookies Not Working

**Symptom**: Users can't stay logged in

**Solution**:
- If frontend/API on different subdomains: Set `COOKIE_DOMAIN` secret
- Verify `CORS_ORIGIN` includes frontend URL
- Ensure frontend uses `credentials: "include"` in fetch requests

#### Database Migration Failed

**Symptom**: Worker errors about missing tables

**Solution**:
```bash
# Check migration status
npx wrangler d1 migrations list tuvix

# Re-run migrations
pnpm run db:migrate:d1
```

#### Rate Limit Namespaces Not Found

**Symptom**: Worker errors about rate limit bindings

**Solution**:
- Verify `wrangler.toml` has correct format:
  - Uses `name` (not `binding`)
  - Uses `namespace_id` as a string integer (e.g., `"1001"`)
  - Uses `simple` object with `limit` and `period`
- Ensure `namespace_id` values are unique positive integers
- Check that bindings match the names used in code (`API_RATE_LIMIT`, `FEED_RATE_LIMIT`)

---

## Environment Configuration

### Shared Variables

These apply to both deployments:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | - | Secret for Better Auth session management (min 32 chars) |
| `CORS_ORIGIN` | Yes | - | Allowed CORS origins (comma-separated) |
| `NODE_ENV` | No | development | Environment mode |

**Note**: Better Auth uses HTTP-only cookies for session management. The `BETTER_AUTH_SECRET` is used to sign and verify session cookies, not JWT tokens.

### Docker-Only Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_PATH` | No | ./data/tuvix.db | Path to SQLite database |
| `PORT` | No | 3001 | API server port |

### Cloudflare-Only Variables

**Bindings** (configured in `wrangler.toml`):

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 | Database binding |
| `API_RATE_LIMIT` | RateLimit | API rate limiting binding |
| `FEED_RATE_LIMIT` | RateLimit | Public feed rate limiting binding |

**Secrets** (set via `wrangler secret put` - **not in wrangler.toml**):

| Secret | Required | Description |
|--------|----------|-------------|
| `BETTER_AUTH_SECRET` | Yes | Secret for Better Auth session management (min 32 chars) |
| `CORS_ORIGIN` | Yes | Allowed CORS origins (comma-separated) |
| `RESEND_API_KEY` | No | Resend API key for email service (see [Email System Guide](../developer/email-system.md)) |
| `EMAIL_FROM` | No | Email sender address (must match verified domain in Resend) |
| `BASE_URL` | No | Base URL for generating email links |
| `COOKIE_DOMAIN` | No | Root domain for cross-subdomain cookies (e.g., "example.com") |
| `ADMIN_USERNAME` | No | Admin username for initialization |
| `ADMIN_PASSWORD` | No | Admin password for initialization |
| `ADMIN_EMAIL` | No | Admin email for initialization |

**Better Auth**: Better Auth handles authentication via HTTP-only cookies. Users authenticate through Better Auth endpoints (`/api/auth/sign-in/*`, `/api/auth/sign-up/*`), and sessions are managed automatically.

**⚠️ Security Note**: Never commit secrets to `wrangler.toml`. Use `wrangler secret put` for all sensitive values. The `wrangler.toml` file with empty IDs is safe to commit as a template.

---

## Scheduled Tasks (Cron)

TuvixRSS runs two scheduled tasks:

1. **RSS Feed Fetching** - Fetches new articles from subscribed feeds
2. **Article Pruning** - Removes old articles based on retention policy

### Docker Compose Cron

Uses `node-cron` (scheduler.ts:44):

```typescript
// RSS fetch - dynamic interval from global_settings
cron.schedule(fetchCronExpression, async () => {
  await handleRSSFetch(env);
});

// Article prune - daily at 2 AM
cron.schedule("0 2 * * *", async () => {
  await handleArticlePrune(env);
});
```

**Configuration:**

- Fetch interval: Configurable via `global_settings.fetchIntervalMinutes`
- Default: 60 minutes
- Minimum: 5 minutes

**Logs:**

```bash
docker compose logs -f api | grep "RSS fetch\|Prune"
```

### Cloudflare Workers Cron

Uses Workers Scheduled Events (cloudflare.ts:284):

```toml
# wrangler.toml
[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes
```

**How it works:**

1. Cron triggers every 5 minutes
2. Checks `global_settings.lastRssFetchAt` and `fetchIntervalMinutes`
3. Runs RSS fetch if interval has elapsed
4. Checks `global_settings.lastPruneAt`
5. Runs prune if 24 hours have elapsed

**Configuration:**

```bash
# View cron triggers
npx wrangler deployments list

# Test cron locally
npx wrangler dev --test-scheduled

# Monitor cron execution
npx wrangler tail --search "Cron triggered"
```

**Cron Interval Limits:**

- Cloudflare: Minimum 1 minute intervals
- Recommended: 5-15 minutes (balance between freshness and costs)

### Customizing Fetch Interval

Both deployments read from `global_settings` table:

```sql
-- Update via SQL
UPDATE global_settings SET fetchIntervalMinutes = 30 WHERE id = 1;
```

Or via admin UI:
1. Navigate to Settings
2. Update "Fetch Interval (minutes)"
3. Save

---

## Database Migrations

### Docker Compose Migrations

Migrations run automatically on container startup (packages/api/Dockerfile:45):

```bash
CMD ["sh", "-c", "node dist/db/migrate-local.js && node dist/adapters/express.js"]
```

**Manual migrations:**

```bash
# From host
pnpm run db:migrate

# From container
docker compose exec api node dist/db/migrate-local.js
```

### Cloudflare D1 Migrations

Must be run manually before deployment:

```bash
cd packages/api

# Generate migration from schema changes
pnpm run db:generate

# Apply to local D1
pnpm run db:migrate:d1:local

# Apply to remote D1
pnpm run db:migrate:d1
```

**Verify migrations:**

```bash
# List tables
npx wrangler d1 execute tuvix --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"

# Check migration status
npx wrangler d1 migrations list tuvix
```

### Migration Workflow

1. **Modify Schema** - Edit `packages/api/src/db/schema.ts`
2. **Generate Migration** - `pnpm run db:generate`
3. **Test Locally** - Run on local database
4. **Deploy**:
   - Docker: Restart containers (auto-migrates)
   - Workers: Run `pnpm run db:migrate:d1` then deploy

---

## Monitoring & Health Checks

### Health Check Endpoints

Both deployments expose health check endpoints:

```bash
# Docker Compose
curl http://localhost:3001/health
# Response: {"status":"ok","runtime":"nodejs"}

curl http://localhost:5173/health
# Response: ok

# Cloudflare Workers
curl https://your-worker.workers.dev/health
# Response: {"status":"ok","runtime":"cloudflare"}
```

### Docker Health Checks

Configured in docker-compose.yml:

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:3001/health"]
  interval: 30s
  timeout: 3s
  start_period: 5s
  retries: 3
```

**Check health:**

```bash
docker compose ps
docker inspect tuvix-api | grep -A 5 Health
```

### Cloudflare Monitoring

```bash
# Live request logs
npx wrangler tail

# Cron job logs
npx wrangler tail --search "Cron triggered"

# Error logs
npx wrangler tail --status error

# Metrics in dashboard
# Visit: https://dash.cloudflare.com > Workers > Your Worker > Metrics
```

### Rate Limiting

Rate limiting uses Cloudflare Workers rate limit bindings:

- **API Rate Limiting**: Per-user, per-minute limits based on subscription plan
- **Public Feed Rate Limiting**: Per-feed owner, per-minute limits

Rate limiting is **disabled** for Docker Compose deployments.

Monitor rate limiting:

```bash
# Docker
docker compose logs api | grep "Rate limit"

# Workers
npx wrangler tail --search "Rate limit"
```

### Alerting

**Docker:**
- Use monitoring tools like Prometheus + Grafana
- Monitor health check endpoint
- Set up log aggregation (ELK, Loki)

**Cloudflare:**
- Configure Workers Analytics in dashboard
- Set up Logpush to external service
- Use Cloudflare's built-in email alerts

---

## Troubleshooting

### Common Issues

#### Docker: Port Already in Use

```bash
# Check what's using the port
lsof -i :3001

# Change port in .env
PORT=3002
```

#### Docker: Database Locked

```bash
# Stop all containers
docker compose down

# Remove stale lock
rm -f ./data/tuvix.db-shm ./data/tuvix.db-wal

# Restart
docker compose up -d
```

#### Workers: Migration Failed

```bash
# Check D1 status
npx wrangler d1 execute tuvix --remote \
  --command "SELECT * FROM __drizzle_migrations;"

# Force migration
npx wrangler d1 migrations apply tuvix --remote
```

#### Workers: Rate Limit Namespaces Not Found

**Solution**:
- Verify `wrangler.toml` configuration format:
  ```toml
  [[ratelimits]]
  name = "API_RATE_LIMIT"
  namespace_id = "1001"  # User-defined positive integer
  simple = { limit = 10000, period = 60 }
  ```
- Ensure `namespace_id` values are unique positive integers (you choose these yourself)
- Check that binding names match code (`API_RATE_LIMIT`, `FEED_RATE_LIMIT`)

### Logs

#### Docker

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail=100 api
```

#### Workers

```bash
# Live logs
npx wrangler tail

# Filter by status
npx wrangler tail --status error
npx wrangler tail --status ok

# Search logs
npx wrangler tail --search "RSS fetch"
```

---

## CI/CD Integration

TuvixRSS uses GitHub Actions for automated CI/CD with a three-branch workflow: `feature` → `development` → `main`.

### Branch Flow

```
feature branch → PR → development → PR → main → Release → Deploy
```

### Workflows

#### 1. CI - Feature Branch (`ci-feature.yml`)
**Triggers:** Pull requests targeting `development`

**Validates:**
- Lint & format checks
- TypeScript type checking
- API and App tests (with coverage)
- Build verification

**Purpose:** Ensure code quality before merging to development branch.

#### 2. CI - Development Branch (`ci-development.yml`)
**Triggers:** Pull requests targeting `main`

**Validates:**
- All checks from feature branch workflow
- Coverage tracking and reporting
- Build artifact uploads

**Purpose:** Comprehensive validation before merging to main, including coverage tracking.

#### 3. Deploy to Cloudflare Workers (`deploy-cloudflare.yml`)
**Triggers:**
- Published GitHub releases (automatic)
- Manual workflow dispatch

**Process:**
1. Checks out release tag
2. Runs type checks and tests
3. Builds API and App
4. Deploys API to Cloudflare Workers
5. Deploys App to Cloudflare Pages
6. Runs database migrations (after successful API deployment)
7. Outputs deployment summary with URLs

**Purpose:** Automated production deployment on releases.

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers and Pages permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_WORKER_NAME` | Worker name (from `wrangler.toml`, e.g., `tuvix-api`) |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Cloudflare Pages project name |
| `VITE_API_URL` | API URL for frontend builds (e.g., `https://api.yourdomain.com/trpc`) |

**Getting Cloudflare Credentials:**

1. **API Token:**
   ```bash
   # Go to Cloudflare Dashboard → My Profile → API Tokens
   # Create token with: Account.Cloudflare Workers:Edit, Account.Cloudflare Pages:Edit
   ```

2. **Account ID:**
   - Found in Cloudflare Dashboard → Right sidebar

3. **Worker/Pages Names:**
   - Worker: Check `packages/api/wrangler.toml` → `name` field
   - Pages: Create in Cloudflare Dashboard or use existing name

### Deployment Process

#### Automatic Deployment (Recommended)

1. **Create a Release:**
   ```bash
   # Tag and push
   git tag v1.0.0
   git push origin v1.0.0
   
   # Or create release in GitHub UI
   # GitHub → Releases → Draft a new release
   ```

2. **Workflow Automatically:**
   - Checks out the release tag
   - Runs all validation checks
   - Deploys to Cloudflare Workers and Pages
   - Runs database migrations
   - Outputs deployment summary with URLs

#### Manual Deployment

1. Go to **Actions → Deploy to Cloudflare Workers**
2. Click **"Run workflow"**
3. Select branch and enter version tag (e.g., `v1.0.0`)
4. Click **"Run workflow"**

### Coverage Reporting

Coverage is automatically generated and reported:

- **PR Comments:** Coverage changes appear in pull request comments
- **Artifacts:** Full HTML coverage reports available for download
- **GitHub Integration:** Uses Codecov Action for coverage visualization

**View Coverage Locally:**
```bash
pnpm run test:coverage
open coverage/index.html
```

### Dependabot

Automated dependency updates configured:
- **Schedule:** Monthly checks
- **Grouping:** Production and development dependencies grouped separately
- **Labels:** Automatic labeling for easy filtering
- **CI:** Dependabot PRs automatically trigger CI workflows

### Branch Protection

Configure branch protection rules to enforce CI checks:

**For `development` branch:**
- Require pull request before merging
- Require status checks: `lint-and-format`, `type-check`, `test-api`, `test-app`, `build`
- Require branches to be up to date

**For `main` branch:**
- Same as development
- Optional: Require code owner review

See [`.github/workflows/README.md`](../.github/workflows/README.md) for detailed setup instructions.

### Workflow Features

- ✅ **Parallel Jobs:** Faster CI feedback
- ✅ **Concurrency Control:** Prevents duplicate runs
- ✅ **Caching:** Optimized dependency caching
- ✅ **Coverage Reporting:** Automatic PR coverage comments
- ✅ **Environment Protection:** Production deployments use GitHub environments
- ✅ **Release Tag Checkout:** Ensures correct code version is deployed
- ✅ **Deployment URLs:** Displayed in workflow summary

### Troubleshooting CI/CD

**Workflow Fails:**
- Check Actions tab for specific error messages
- Verify all required secrets are configured
- Run checks locally: `pnpm run pre-check`

**Deployment Fails:**
- Verify Cloudflare API token permissions
- Check that Worker and Pages projects exist
- Review Cloudflare dashboard for errors
- Ensure database migrations completed successfully

**Coverage Not Showing:**
- Coverage generates automatically during test runs
- Check that `coverage/lcov.info` files exist
- For private repos, may need `CODECOV_TOKEN` secret

---

## Security Checklist

### Both Deployments

- [ ] Generate strong BETTER_AUTH_SECRET (min 32 chars) for Better Auth session management
- [ ] Set restrictive CORS_ORIGIN
- [ ] Use HTTPS in production (required for secure cookies)
- [ ] Regular dependency updates (`pnpm update`)
- [ ] Monitor security advisories
- [ ] Regular database backups
- [ ] Verify Better Auth endpoints are accessible (`/api/auth/*`)

### Docker-Specific

- [ ] Don't commit `.env` to git
- [ ] Use Docker secrets for sensitive data
- [ ] Limit container resource usage
- [ ] Run containers as non-root user
- [ ] Regular security scans (`docker scan`)

### Workers-Specific

- [ ] Use Wrangler secrets (not vars) for sensitive data
- [ ] Enable Cloudflare security features (WAF, DDoS)
- [ ] Restrict Worker routes
- [ ] Monitor usage for cost control
- [ ] Review KV/D1 access logs

---

## Performance Optimization

### Docker

- Use multi-stage builds (already implemented)
- Mount volumes for data persistence
- Adjust health check intervals
- Use Docker build cache
- Consider using Alpine base images

### Workers

- Minimize Worker script size
- Use Smart Placement for reduced latency
- Configure appropriate CPU limits
- Use caching for static responses
- Monitor edge location performance

---

## Next Steps

After deployment:

1. Create admin user (see above)
2. Configure global settings via admin UI
3. Set up monitoring and alerting
4. Configure backups
5. Test public RSS feeds
6. Add custom domain (optional)
7. Configure reverse proxy (Docker) or custom domain (Workers)

For more information, see:
- [README.md](../README.md) - Project overview
- [API README](../packages/api/README.md) - API documentation
- [App README](../packages/app/README.md) - Frontend documentation

---

**Last Updated:** 2025-01-15
