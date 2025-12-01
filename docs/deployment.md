# TuvixRSS Deployment Guide

This guide covers development and release processes for both Docker Compose and Cloudflare (Workers + Pages) deployments.

## Table of Contents

- [TuvixRSS Deployment Guide](#tuvixrss-deployment-guide)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
    - [Architecture Differences](#architecture-differences)
    - [Authentication](#authentication)
  - [Docker Compose Deployment](#docker-compose-deployment)
    - [Prerequisites](#prerequisites)
    - [Development Setup](#development-setup)
      - [1. Initial Setup](#1-initial-setup)
      - [2. Build and Run](#2-build-and-run)
      - [3. Local Development (Without Docker)](#3-local-development-without-docker)
      - [4. Testing](#4-testing)
    - [Production Deployment](#production-deployment)
      - [1. Server Setup](#1-server-setup)
      - [2. Deploy](#2-deploy)
      - [3. Database Backups](#3-database-backups)
      - [4. Updates](#4-updates)
    - [Configuration](#configuration)
      - [Dockerfile Structure](#dockerfile-structure)
      - [docker-compose.yml](#docker-composeyml)
    - [Monitoring \& Troubleshooting](#monitoring--troubleshooting)
      - [Health Checks](#health-checks)
      - [View Logs](#view-logs)
      - [Common Issues](#common-issues)
  - [Cloudflare Deployment](#cloudflare-deployment)
    - [Prerequisites](#prerequisites-1)
    - [Quick Start](#quick-start)
    - [API Setup (Cloudflare Workers)](#api-setup-cloudflare-workers)
      - [Step 1: Create Cloudflare Resources](#step-1-create-cloudflare-resources)
      - [Step 2: Configure wrangler.toml](#step-2-configure-wranglertoml)
      - [Step 3: Set Secrets](#step-3-set-secrets)
      - [Step 4: Database Migrations](#step-4-database-migrations)
      - [Step 5: Deploy API](#step-5-deploy-api)
      - [Step 6: Initialize Admin User (First Deployment)](#step-6-initialize-admin-user-first-deployment)
    - [Frontend Setup (Cloudflare Pages)](#frontend-setup-cloudflare-pages)
      - [Step 1: Create Pages Project](#step-1-create-pages-project)
      - [Step 2: Configure Custom Domain (Optional)](#step-2-configure-custom-domain-optional)
    - [Cross-Subdomain Configuration](#cross-subdomain-configuration)
    - [Development Workflow](#development-workflow)
    - [Configuration](#configuration-1)
    - [Monitoring \& Troubleshooting](#monitoring--troubleshooting-1)
      - [View Logs](#view-logs-1)
      - [View Metrics](#view-metrics)
      - [Health Checks](#health-checks-1)
      - [Common Issues](#common-issues-1)
  - [Shared Topics](#shared-topics)
    - [Environment Variables](#environment-variables)
      - [Shared Variables (Both Deployments)](#shared-variables-both-deployments)
      - [Docker-Only Variables](#docker-only-variables)
      - [Cloudflare-Only Variables](#cloudflare-only-variables)
    - [Database Migrations](#database-migrations)
      - [Docker Compose Migrations](#docker-compose-migrations)
      - [Cloudflare D1 Migrations](#cloudflare-d1-migrations)
      - [Migration Workflow](#migration-workflow)
    - [Scheduled Tasks (Cron)](#scheduled-tasks-cron)
      - [Docker Compose Cron](#docker-compose-cron)
      - [Cloudflare Workers Cron](#cloudflare-workers-cron)
      - [Customizing Fetch Interval](#customizing-fetch-interval)
  - [CI/CD Integration](#cicd-integration)
    - [Branch Flow](#branch-flow)
    - [Workflows](#workflows)
      - [1. CI - Feature Branch (`ci-feature.yml`)](#1-ci---feature-branch-ci-featureyml)
      - [2. CI - Development Branch (`ci-development.yml`)](#2-ci---development-branch-ci-developmentyml)
      - [3. Deploy to Cloudflare Workers (`deploy-cloudflare.yml`)](#3-deploy-to-cloudflare-workers-deploy-cloudflareyml)
    - [Required GitHub Secrets](#required-github-secrets)
    - [Deployment Process](#deployment-process)
      - [Automatic Deployment (Recommended)](#automatic-deployment-recommended)
      - [Manual Deployment](#manual-deployment)
    - [Workflow Features](#workflow-features)
    - [Sentry Error Tracking Setup](#sentry-error-tracking-setup)
    - [Troubleshooting CI/CD](#troubleshooting-cicd)
  - [Security Checklist](#security-checklist)
    - [Both Deployments](#both-deployments)
    - [Docker-Specific](#docker-specific)
    - [Workers-Specific](#workers-specific)
  - [Performance Optimization](#performance-optimization)
    - [Docker](#docker)
    - [Workers](#workers)
  - [Next Steps](#next-steps)

---

## Overview

TuvixRSS supports two deployment targets:

1. **Docker Compose** - Traditional container-based deployment with Node.js runtime
2. **Cloudflare** - Serverless edge deployment:
   - **API**: Cloudflare Workers (serverless edge runtime) - typically deployed to `api.example.com`
   - **Frontend**: Cloudflare Pages (static site hosting) - typically deployed to `feed.example.com`

Both deployments share the same codebase with runtime-specific adapters.

**Example Domain Structure:**
- `example.com` - Static blog (optional, separate from TuvixRSS)
- `feed.example.com` - Frontend Pages app (TuvixRSS UI)
- `api.example.com` - Worker API (TuvixRSS backend)

### Architecture Differences

| Feature | Docker Compose | Cloudflare Workers |
|---------|---------------|-------------------|
| Runtime | Node.js 20+ | Cloudflare Workers |
| Database | SQLite (better-sqlite3) | D1 (Cloudflare's SQLite) |
| Cron | node-cron | Workers Scheduled Events |
| Rate Limiting | Disabled | Cloudflare Workers rate limit bindings |

### Authentication

TuvixRSS uses **Better Auth** for authentication, which manages user sessions via HTTP-only cookies. The `BETTER_AUTH_SECRET` environment variable (minimum 32 characters) is used to sign and verify session cookies securely. No JWT tokens are used.

**Local Development**: Better Auth works perfectly with localhost setups:
- Frontend and API can run on different ports (e.g., `localhost:5173` and `localhost:3001`)
- Cookies are automatically handled (localhost domain works for both ports)
- CORS is configured with `credentials: true` to allow cookies

**Cross-Subdomain**: If your frontend and API are on different subdomains (e.g., `feed.example.com` and `api.example.com`), configure the `COOKIE_DOMAIN` secret to the root domain (e.g., `example.com`) to enable cross-subdomain cookies.

---

## Docker Compose Deployment

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Git

### Development Setup

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
BETTER_AUTH_SECRET=your-generated-secret-here  # Min 32 chars
CORS_ORIGIN=http://localhost:5173
DATABASE_PATH=/app/data/tuvix.db
PORT=3001
NODE_ENV=production
```

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

#### 3. Local Development (Without Docker)

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

# Pre-release checks
pnpm run pre-check
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
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>  # Min 32 chars
CORS_ORIGIN=https://feed.example.com  # Frontend URL (or multiple origins comma-separated)
DATABASE_PATH=/app/data/tuvix.db
PORT=3001
NODE_ENV=production

# Optional: Customize fetch behavior
FETCH_INTERVAL_MINUTES=60  # How often to fetch RSS feeds
```

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

### Configuration

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

### Monitoring & Troubleshooting

#### Health Checks

```bash
# Check container health
docker compose ps
docker inspect tuvix-api | grep -A 5 Health

# Health check endpoints
curl http://localhost:3001/health
# Response: {"status":"ok","runtime":"nodejs"}

curl http://localhost:5173/health
# Response: ok
```

#### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail=100 api

# Filter cron logs
docker compose logs -f api | grep "RSS fetch\|Prune"
```

#### Common Issues

**Port Already in Use:**
```bash
# Check what's using the port
lsof -i :3001

# Change port in .env
PORT=3002
```

**Database Locked:**
```bash
# Stop all containers
docker compose down

# Remove stale lock
rm -f ./data/tuvix.db-shm ./data/tuvix.db-wal

# Restart
docker compose up -d
```

---

## Cloudflare Deployment

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

### API Setup (Cloudflare Workers)

#### Step 1: Create Cloudflare Resources

**Authenticate:**
```bash
npx wrangler login
```

**Create D1 Database:**
```bash
cd packages/api

# Create database
npx wrangler d1 create tuvix

# Output will show:
# ✅ Successfully created DB 'tuvix'!
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Copy this ID
#
# For local development: Create wrangler.toml.local with this ID
# For CI/CD: Add this ID as D1_DATABASE_ID GitHub secret
```

#### Step 2: Configure wrangler.toml

The `wrangler.example.toml` file serves as a template with environment variable placeholders. You'll create your own `wrangler.toml` from this template:

```toml
name = "tuvix-api"
main = "src/adapters/cloudflare.ts"
compatibility_date = "2024-11-10"
compatibility_flags = ["nodejs_als"]

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "tuvix"
database_id = "${D1_DATABASE_ID}"  # Substituted by envsubst in CI/CD

# Plan-specific API Rate Limit Bindings
# Each plan has its own binding with the plan's rate limit
[[ratelimits]]
name = "FREE_API_RATE_LIMIT"
namespace_id = "1003"
simple = { limit = 60, period = 60 }  # Free plan: 60 requests per minute

[[ratelimits]]
name = "PRO_API_RATE_LIMIT"
namespace_id = "1004"
simple = { limit = 180, period = 60 }  # Pro plan: 180 requests per minute

[[ratelimits]]
name = "ENTERPRISE_API_RATE_LIMIT"
namespace_id = "1005"
simple = { limit = 600, period = 60 }  # Enterprise/admin plan: 600 requests per minute

# Public Feed Rate Limiting (unchanged)
[[ratelimits]]
name = "FEED_RATE_LIMIT"
namespace_id = "1001"  # User-defined positive integer
simple = { limit = 10000, period = 60 }

[[ratelimits]]
name = "FEED_RATE_LIMIT"
namespace_id = "1002"  # User-defined positive integer
simple = { limit = 10000, period = 60 }

[vars]
RUNTIME = "cloudflare"

[triggers]
crons = ["*/5 * * * *"]  # Every 5 minutes
```

**Security Notes:**
- ✅ **Safe to commit**: `wrangler.example.toml` with environment variable placeholders
- ❌ **Never commit**: `wrangler.toml` with filled-in values (now gitignored)
- 🔒 **Use GitHub Secrets** (not Variables) for sensitive data

**Local Development Setup:**

For local development, you have two options:

**Option 1: Create wrangler.toml.local** (Recommended for quick setup):

```bash
cd packages/api

# Copy the example file
cp wrangler.toml.local.example wrangler.toml.local

# Edit wrangler.toml.local and replace "your-database-id-here" with your actual D1 database ID
# Example: database_id = "7078240d-69e3-46fb-bb21-aa8e5208de9b"
```

**Note:** `wrangler.toml.local` is gitignored and will override values when scripts read configuration.

**Option 2: Create wrangler.toml directly** (Alternative):

```bash
cd packages/api

# Copy the example to wrangler.toml
cp wrangler.example.toml wrangler.toml

# Edit wrangler.toml and replace ${D1_DATABASE_ID} with your actual database ID
# Note: wrangler.toml is gitignored, so your values won't be committed
```

**Deployment Scripts:**

The deployment scripts (`deploy.sh`, `migrate-d1.sh`) automatically create `wrangler.toml` from `wrangler.example.toml` and substitute the database ID from either:
- `D1_DATABASE_ID` environment variable, OR
- `wrangler.toml.local` file

**CI/CD Setup:**

The GitHub Actions workflow automatically creates `wrangler.toml` from `wrangler.example.toml` and substitutes `${D1_DATABASE_ID}` before deployment.

**To configure:**
1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Click the **"Secrets"** tab (not "Variables")
3. Click "New repository secret"
4. Name: `D1_DATABASE_ID` (must match exactly)
5. Value: Your D1 database ID (from `wrangler d1 create tuvix`)
6. Click "Add secret"

**Why Secrets instead of Variables?**
- **Secrets** are encrypted and masked in logs (use for sensitive data)
- **Variables** are plain text and visible in logs (use for non-sensitive configuration)

#### Step 3: Set Secrets

**Required Secrets:**

```bash
cd packages/api

# Better Auth secret (min 32 chars)
npx wrangler secret put BETTER_AUTH_SECRET
# Generate with: openssl rand -base64 32

# First user auto-promotion to admin (REQUIRED for first deployment)
npx wrangler secret put ALLOW_FIRST_USER_ADMIN
# Enter: true

# CORS origin (frontend URL) - Set BEFORE deploying API
npx wrangler secret put CORS_ORIGIN
# Enter: https://feed.example.com (if using custom domain)
# Or: https://your-pages-project.pages.dev (if using Pages default)
# Multiple origins: https://feed.example.com,https://your-pages-project.pages.dev

# Base URL for Better Auth (REQUIRED for production)
# Better Auth uses this for generating callback URLs and session management
# Must be your production API URL, NOT localhost
npx wrangler secret put BASE_URL
# Enter: https://api.example.com (if using custom domain)
# Or: https://your-worker.workers.dev (if using Workers default domain)
# Example: https://api.tuvix.app
```

**Optional Secrets:**

```bash
# Email service (Resend)
# See docs/developer/email-system.md for complete email setup guide
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put BASE_URL

# Cross-subdomain cookies (if frontend/API on different subdomains)
npx wrangler secret put COOKIE_DOMAIN
# Enter: example.com  (root domain, not subdomain like api.example.com)

# Sentry Error Tracking (Optional but recommended)
# Get DSN from: https://techsquidtv.sentry.io/settings/projects/tuvix-api/keys/
npx wrangler secret put SENTRY_DSN
# Enter: https://xxx@xxx.ingest.sentry.io/xxx

npx wrangler secret put SENTRY_ENVIRONMENT
# Enter: production (or staging, development, etc.)

# Optional: Release tracking (git commit SHA or version)
npx wrangler secret put SENTRY_RELEASE
# Enter: v1.0.0 or git commit SHA
```

#### Step 4: Database Migrations

**Note:** For first deployment, run migrations BEFORE deploying. For subsequent deployments, migrations can run before or after deployment (CI/CD runs them after deployment).

```bash
cd packages/api

# Generate migrations from schema changes (if schema was modified)
pnpm run db:generate

# Apply migrations to production D1
pnpm run db:migrate:d1

# Verify migrations
npx wrangler d1 execute tuvix --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

#### Step 5: Deploy API

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

#### Step 6: Initialize Admin User (First Deployment)

**⚠️ IMPORTANT: Cloudflare Workers Paid Plan Required**

Cloudflare Workers **free tier does not support password authentication** due to CPU time limits:
- **Free tier**: 10ms CPU limit
- **Password hashing (scrypt)**: Requires 3-4 seconds of CPU time
- **Paid tier** ($5/month): 30 seconds CPU limit (required)

See [GitHub Issue #969](https://github.com/better-auth/better-auth/issues/969) for details.

**Prerequisites:**
1. ✅ Cloudflare Workers Paid plan active ($5/month)
2. ✅ `ALLOW_FIRST_USER_ADMIN` secret set to `"true"` (Step 3)
3. ✅ Email service configured (optional but recommended)
4. ✅ CPU limits configured in `wrangler.toml` (already set to 30 seconds)

**Admin User Creation:**

The **first user to sign up** automatically becomes admin:

1. Navigate to your frontend URL (e.g., `https://feed.example.com/sign-up`)
2. Sign up with your email and password
3. You'll be assigned user ID 1 and admin role automatically
4. **Email verification is disabled by default** - you can log in immediately

**Why this approach:**
- ✅ No manual database manipulation needed
- ✅ Uses Better Auth's standard signup flow
- ✅ Automatic role assignment via `ALLOW_FIRST_USER_ADMIN` logic
- ✅ Works with all authentication methods (email, username)

**Verify Admin User Created:**

```bash
# Check if admin user exists
npx wrangler d1 execute tuvix --remote \
  --command "SELECT id, email, email_verified, role FROM user WHERE id = 1;"

# Expected output:
# id: 1
# email: your@email.com
# email_verified: 1
# role: admin
```

**Configuration Notes:**
- Email verification is **disabled by default** (can be enabled in admin settings)
- First user automatically gets admin role and free plan
- Subsequent users get user role and must be promoted by admin
- Admin can enable email verification requirement in settings after initial setup

### Frontend Setup (Cloudflare Pages)

#### Step 1: Create Pages Project

**Option A: Via Wrangler CLI (Recommended)**

```bash
# Create the Pages project (first time only)
npx wrangler pages project create tuvix-app

# Build and deploy
cd packages/app
export VITE_API_URL=https://api.example.com/trpc
# Or if not using custom domain: https://your-worker.workers.dev/trpc
pnpm run build
npx wrangler pages deploy dist --project-name=tuvix-app
```

**Note:** The project name (`tuvix-app` in this example) must match the `CLOUDFLARE_PAGES_PROJECT_NAME` GitHub secret used in CI/CD. This is the internal Cloudflare project name, not your custom domain.

**Option B: Via Cloudflare Dashboard**

1. Go to [Cloudflare Dashboard → Pages](https://dash.cloudflare.com/pages)
2. Click **"Create a project"**
3. Connect your Git repository (GitHub/GitLab)
4. Configure build settings:
   - **Build command**: `cd packages/app && pnpm install && pnpm build`
   - **Build output directory**: `packages/app/dist`
   - **Root directory**: `/` (project root)
5. Add environment variable:
   - **Variable**: `VITE_API_URL`
   - **Value**: `https://api.example.com/trpc` (or `https://your-worker.workers.dev/trpc` if not using custom domain)

#### Step 2: Configure Custom Domain (Optional)

1. In Cloudflare Dashboard → Pages → Your Project → **Custom domains**
2. Click **"Set up a custom domain"**
3. Enter your domain (e.g., `feed.example.com`)
4. Cloudflare will automatically configure DNS

**Update CORS:** After adding a custom domain, update the `CORS_ORIGIN` secret in your Worker to include the frontend URL:

```bash
npx wrangler secret put CORS_ORIGIN
# Enter: https://feed.example.com
```

**Example:** For `feed.tuvix.app`, set CORS_ORIGIN to `https://feed.tuvix.app`

### Cross-Subdomain Configuration

**When to configure:** After both API and Frontend are deployed and working.

If your frontend and API are on different subdomains (e.g., `feed.example.com` and `api.example.com`), configure cross-subdomain cookies:

**When You Need This:**
- ✅ Frontend on `feed.example.com`, API on `api.example.com`
- ✅ Frontend on `www.example.com`, API on `api.example.com`
- ❌ Both on same domain (e.g., `example.com/feed` and `example.com/api`)
- ❌ Both on same subdomain (e.g., `feed.example.com/feed` and `feed.example.com/api`)

**Configuration:**

```bash
# Set cookie domain to root domain (not subdomain)
npx wrangler secret put COOKIE_DOMAIN
# Enter: example.com  (NOT api.example.com or feed.example.com)
```

**Example:** For `feed.tuvix.app` and `api.tuvix.app`, set COOKIE_DOMAIN to `tuvix.app`

**Security Note**: Setting `COOKIE_DOMAIN` makes cookies accessible across all subdomains. Only enable if necessary and ensure all subdomains are trusted.

### Development Workflow

**Local Development:**

```bash
# API (Workers)
cd packages/api
pnpm run dev:workers
# Starts: Local Workers runtime (Miniflare), Local D1 database, Auto-reload

# Frontend
cd packages/app
pnpm run dev
# Frontend runs on http://localhost:5173
# Points to API at VITE_API_URL (default: http://localhost:3001/trpc)

# Testing
pnpm run test
npx wrangler dev  # Test Workers locally
npx wrangler dev --test-scheduled  # Test cron trigger locally
```

**Production Deployment:**

```bash
# Pre-Deployment
pnpm run type-check
pnpm run test

# Deploy API
cd packages/api
pnpm run db:migrate:d1  # Run migrations
pnpm run build
pnpm run deploy

# Deploy Frontend
cd packages/app
export VITE_API_URL=https://api.example.com/trpc
pnpm run build
npx wrangler pages deploy dist --project-name=tuvix-app

# Verify
curl https://api.example.com/health
curl https://feed.example.com/health
```

### Configuration

**Worker Settings** (Cloudflare Dashboard → Workers → Your Worker → Settings):
- **CPU Limit**: 50ms (sufficient for most operations)
- **Memory**: 128MB
- **Cron Triggers**: Configured via `wrangler.toml` (`*/5 * * * *`)

**Pages Settings** (Cloudflare Dashboard → Pages → Your Project → Settings):
- **Build command**: `cd packages/app && pnpm install && pnpm build`
- **Build output directory**: `packages/app/dist`
- **Environment variables**: `VITE_API_URL` (set to your Worker URL)

**Custom Domains:**

```bash
# Add custom domain to Worker
npx wrangler domains add api.example.com

# Update CORS_ORIGIN secret to include frontend domain
npx wrangler secret put CORS_ORIGIN
# Enter: https://feed.example.com
```

**Example:** `npx wrangler domains add api.tuvix.app`

### Monitoring & Troubleshooting

#### View Logs

```bash
# API (Workers) logs
npx wrangler tail

# Filter by status
npx wrangler tail --status error
npx wrangler tail --status ok

# Search logs
npx wrangler tail --search "RSS fetch"
npx wrangler tail --search "Cron triggered"

# Frontend (Pages) logs
# View in Cloudflare Dashboard → Pages → Your Project → Deployments → View logs
```

#### View Metrics

- **Workers**: Cloudflare Dashboard → Workers → Your Worker → **Metrics**
- **Pages**: Cloudflare Dashboard → Pages → Your Project → **Analytics**

#### Health Checks

```bash
# Check API health
curl https://api.example.com/health
# Or: curl https://your-worker.workers.dev/health
# Response: {"status":"ok","runtime":"cloudflare"}

# Check frontend
curl https://feed.example.com/health
# Or: curl https://your-pages-project.pages.dev/health
```

#### Common Issues

**CORS Errors:**
```bash
# Ensure CORS_ORIGIN includes your frontend URL
npx wrangler secret put CORS_ORIGIN
# Enter: https://feed.example.com
# Or if using Pages default: https://your-pages-project.pages.dev
```

**Authentication Cookies Not Working:**
- If frontend/API on different subdomains: Set `COOKIE_DOMAIN` secret
- Verify `CORS_ORIGIN` includes frontend URL
- Ensure frontend uses `credentials: "include"` in fetch requests

**Database Migration Failed:**
```bash
# Check migration status
npx wrangler d1 migrations list tuvix

# Re-run migrations
pnpm run db:migrate:d1

# Check D1 status
npx wrangler d1 execute tuvix --remote \
  --command "SELECT * FROM __drizzle_migrations;"
```

**Rate Limit Namespaces Not Found:**
- Verify `wrangler.toml` has correct format:
  - Uses `name` (not `binding`)
  - Uses `namespace_id` as a string integer (e.g., `"1001"`)
  - Uses `simple` object with `limit` and `period`
- Ensure `namespace_id` values are unique positive integers
- Check that bindings match the names used in code (`FREE_API_RATE_LIMIT`, `PRO_API_RATE_LIMIT`, `ENTERPRISE_API_RATE_LIMIT`, `FEED_RATE_LIMIT`)

**Rate Limiting:**
- **API Rate Limiting**: Per-user, per-minute limits based on subscription plan
- **Public Feed Rate Limiting**: Per-feed owner, per-minute limits
- Monitor: `npx wrangler tail --search "Rate limit"`

**Admin Initialization Failed:**

**Error: "Admin credentials not provided in environment variables"**
```bash
# Ensure all three admin secrets are set
npx wrangler secret list
# Should show: ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD

# If missing, set them:
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD

# Then retry initialization
curl -X POST https://api.example.com/_admin/init
```

**Error: "Admin user already exists"**
- This is normal if admin was already created
- You can skip initialization and proceed to login
- To verify admin exists: `npx wrangler d1 execute tuvix --remote --command "SELECT id, email, username, role FROM user WHERE role = 'admin';"`

**Error: "Failed to create admin user via Better Auth"**
- Check Worker logs: `npx wrangler tail --status error`
- Verify database migrations completed successfully
- Ensure `BETTER_AUTH_SECRET` is set correctly
- Check that email/username don't already exist: `npx wrangler d1 execute tuvix --remote --command "SELECT email, username FROM user;"`

**Cannot Login After Initialization:**
- Verify admin was created: Check database (see above)
- Ensure you're using the correct credentials (from secrets you set)
- Try both email and username login endpoints:
  - `/api/auth/sign-in/email` (with email)
  - `/api/auth/sign-in/username` (with username)
- Check CORS_ORIGIN includes your frontend URL
- Verify cookies are being set (check browser DevTools → Application → Cookies)

**"CPU Time Limit Exceeded" Error During Login:**

⚠️ **Important**: Cloudflare Workers does NOT differentiate between Better Auth configuration errors and actual CPU time limit exceeded errors. Both will show as "CPU Time Limit Exceeded", making debugging difficult.

**Common causes that manifest as CPU exceeded errors:**

1. **Missing BASE_URL Secret:**
   ```bash
   # Better Auth needs production BASE_URL, not localhost
   npx wrangler secret put BASE_URL
   # Enter: https://api.example.com (your API domain)
   # Or: https://your-worker.workers.dev (if using Workers default domain)
   ```

2. **CORS Configuration Issues:**
   - Ensure `CORS_ORIGIN` secret includes your frontend URL
   - Frontend must allow requests to `/api/auth/*` endpoints
   - Check browser console for CORS errors (may be masked by CPU error)
   ```bash
   # Verify CORS_ORIGIN is set correctly
   npx wrangler secret put CORS_ORIGIN
   # Enter: https://feed.example.com (your frontend domain)
   ```

3. **Better Auth Base URL Mismatch:**
   - Better Auth uses `BASE_URL` or `BETTER_AUTH_URL` for generating callback URLs
   - If not set, defaults to `http://localhost:5173` which breaks in production
   - Set `BASE_URL` secret to your production API URL

**Debugging Steps:**
1. Check Worker logs: `npx wrangler tail --status error`
2. Verify all required secrets are set: `npx wrangler secret list`
3. Test CORS by checking browser Network tab for preflight OPTIONS requests
4. Verify `BASE_URL` matches your actual API domain (not localhost)

**Free Plan Optimization:**
- Free plan has 50ms CPU limit (cannot be increased)
- Ensure Better Auth is properly configured to avoid unnecessary CPU usage
- Set `BASE_URL` and `CORS_ORIGIN` correctly to prevent retry loops
- Monitor CPU usage: `npx wrangler tail` and look for patterns

---

## Shared Topics

### Environment Variables

#### Shared Variables (Both Deployments)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes | - | Secret for Better Auth session management (min 32 chars) |
| `CORS_ORIGIN` | Yes | - | Allowed CORS origins (comma-separated) |
| `NODE_ENV` | No | development | Environment mode |

#### Docker-Only Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_PATH` | No | ./data/tuvix.db | Path to SQLite database |
| `PORT` | No | 3001 | API server port |

#### Cloudflare-Only Variables

**Bindings** (configured in `wrangler.toml`):

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 | Database binding |
| `FREE_API_RATE_LIMIT` | RateLimit | Free plan API rate limiting (60/min) |
| `PRO_API_RATE_LIMIT` | RateLimit | Pro plan API rate limiting (180/min) |
| `ENTERPRISE_API_RATE_LIMIT` | RateLimit | Enterprise/admin plan API rate limiting (600/min) |
| `FEED_RATE_LIMIT` | RateLimit | Public feed rate limiting binding |

**Secrets** (set via `wrangler secret put` - **not in wrangler.toml**):

| Secret | Required | Description |
|--------|----------|-------------|
| `BETTER_AUTH_SECRET` | Yes | Secret for Better Auth session management (min 32 chars) |
| `ALLOW_FIRST_USER_ADMIN` | Yes | Enable first user auto-promotion to admin (set to `"true"`) |
| `CORS_ORIGIN` | Yes | Allowed CORS origins (comma-separated) |
| `BASE_URL` | Yes | Base URL for Better Auth (production API URL, NOT localhost). Used for callback URLs and session management. |
| `RESEND_API_KEY` | No | Resend API key for email service (see [Email System Guide](developer/email-system.md)) |
| `EMAIL_FROM` | No | Email sender address (must match verified domain in Resend) |
| `COOKIE_DOMAIN` | No | Root domain for cross-subdomain cookies (e.g., "example.com") |

**⚠️ Security Note**: Never commit secrets to `wrangler.toml`. Use `wrangler secret put` for all sensitive values. Only `wrangler.example.toml` should be committed (with placeholders); `wrangler.toml` is gitignored.

### Database Migrations

#### Docker Compose Migrations

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

#### Cloudflare D1 Migrations

Must be run manually before deployment:

```bash
cd packages/api

# Generate migration from schema changes
pnpm run db:generate

# Apply to local D1
pnpm run db:migrate:d1:local

# Apply to remote D1
pnpm run db:migrate:d1

# Verify migrations
npx wrangler d1 execute tuvix --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"

# Check migration status
npx wrangler d1 migrations list tuvix
```

#### Migration Workflow

1. **Modify Schema** - Edit `packages/api/src/db/schema.ts`
2. **Generate Migration** - `pnpm run db:generate`
3. **Test Locally** - Run on local database
4. **Deploy**:
   - Docker: Restart containers (auto-migrates)
   - Workers: Run `pnpm run db:migrate:d1` then deploy

### Scheduled Tasks (Cron)

TuvixRSS runs two scheduled tasks:

1. **RSS Feed Fetching** - Fetches new articles from subscribed feeds
2. **Article Pruning** - Removes old articles based on retention policy

#### Docker Compose Cron

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

#### Cloudflare Workers Cron

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

#### Customizing Fetch Interval

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

## CI/CD Integration

TuvixRSS uses GitHub Actions for automated CI/CD with a three-branch workflow: `feature` → `development` → `main`.

### Branch Flow

```
feature branch → PR → development → [Auto Deploy to Dev] → PR → main → Release → [Deploy to Production]
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

#### 3. Deploy to Cloudflare Workers (Dev) (`deploy-dev.yml`)
**Triggers:**
- Pushes to `development` branch (automatic)
- Manual workflow dispatch

**Process:**
1. Checks out `development` branch (or specified branch)
2. Runs type checks and tests for API
3. Builds API
4. Creates `wrangler.toml` from `wrangler.example.toml` and substitutes `D1_DATABASE_ID`
5. Deploys API to Cloudflare Workers (dev environment)
6. Runs database migrations (after successful API deployment)
7. Runs type checks and tests for App
8. Builds App (with `VITE_API_URL` from development environment secrets)
9. Deploys App to Cloudflare Pages (dev environment)
10. Outputs deployment summary with URLs and commit SHA

**Purpose:** Automated development environment deployment on pushes to `development` branch.

**Environment:** Uses `development` GitHub environment (separate secrets from production)

#### 4. Deploy to Cloudflare Workers (Production) (`deploy-cloudflare.yml`)
**Triggers:**
- Published GitHub releases (automatic)
- Manual workflow dispatch

**Process:**
1. Checks out release tag (from release or manual input)
2. Runs type checks and tests for API
3. Builds API
4. Creates `wrangler.toml` from `wrangler.example.toml` and substitutes `D1_DATABASE_ID`
5. Deploys API to Cloudflare Workers
6. Runs database migrations (after successful API deployment)
7. Runs type checks and tests for App
8. Builds App (with `VITE_API_URL` from secrets)
9. Deploys App to Cloudflare Pages (after API deployment succeeds)
10. Outputs deployment summary with URLs

**Purpose:** Automated production deployment on releases.

**Environment:** Uses `production` GitHub environment

### GitHub Environments

TuvixRSS uses GitHub Environments to separate development and production secrets:

- **`development`** - Used by `deploy-dev.yml` workflow
  - Deploys on pushes to `development` branch
  - Uses dev-specific Cloudflare resources (Worker, Pages project, optionally separate D1 database)
  
- **`production`** - Used by `deploy-cloudflare.yml` workflow
  - Deploys on published releases
  - Uses production Cloudflare resources

**Setting up Environments:**

1. Go to **Settings → Environments**
2. Create `development` environment (if it doesn't exist)
3. Create `production` environment (if it doesn't exist)
4. Add environment-specific secrets to each environment

### Required GitHub Secrets

Secrets are configured per environment. Configure these in **Settings → Environments** → Select environment → **Secrets**:

#### Production Environment Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token with Workers, Pages, and D1 permissions (see below) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare account ID |
| `D1_DATABASE_ID` | Yes | Your D1 database ID (from `wrangler d1 create tuvix`) - used for envsubst substitution |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Yes | Cloudflare Pages project name (production) |
| `VITE_API_URL` | Yes | API URL for frontend builds (e.g., `https://api.example.com/trpc` or `https://your-worker.workers.dev/trpc`) |
| `SENTRY_DSN` | No | Backend Sentry DSN (for automatic release tracking) |
| `VITE_SENTRY_DSN` | No | Frontend Sentry DSN (for error tracking) - Get from Sentry project settings |
| `VITE_SENTRY_ENVIRONMENT` | No | Frontend Sentry environment (e.g., `production`, `staging`) |
| `VITE_APP_VERSION` | No | App version (e.g., git commit SHA or version tag) - used for Sentry release tracking and UI display |

#### Development Environment Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token with Workers, Pages, and D1 permissions (can be same as production) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare account ID (same as production) |
| `D1_DATABASE_ID` | Yes | Your D1 database ID (can be same as production or separate dev database) |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Yes | Cloudflare Pages project name (dev environment, e.g., `tuvix-app-dev`) |
| `VITE_API_URL` | Yes | API URL for frontend builds (dev Worker URL, e.g., `https://tuvix-api-dev.workers.dev/trpc`) |
| `CLOUDFLARE_WORKER_NAME_DEV` | No | Dev Worker name override (e.g., `tuvix-api-dev`). If not set, uses default from `wrangler.toml` |
| `SENTRY_DSN` | No | Backend Sentry DSN (optional, for dev error tracking) |

**Note:** 
- If `CLOUDFLARE_WORKER_NAME_DEV` is set, the workflow will temporarily override the worker name in `wrangler.toml` during deployment
- For dev deployments, **recommended** to use separate Cloudflare resources (Worker name, Pages project, optionally separate D1 database) to avoid conflicts with production
- If not using `CLOUDFLARE_WORKER_NAME_DEV`, the default worker name from `wrangler.toml` will be used (same as production)

**Getting Cloudflare Credentials:**

1. **API Token:** Cloudflare Dashboard → My Profile → API Tokens → Create token with:
   - `Account.Cloudflare Workers:Edit` (for deploying Workers)
   - `Account.Cloudflare Pages:Edit` (for deploying Pages)
   - `Account.Cloudflare D1:Edit` (for running D1 migrations) ⚠️ **Required for migrations**
2. **Account ID:** 
   - **Via Wrangler (Recommended):** Run `npx wrangler whoami` - displays your account ID
   - **Via Dashboard:** Cloudflare Dashboard → Right sidebar (under your account name)
3. **D1 Database ID:** Run `npx wrangler d1 create tuvix` locally, copy the `database_id` from output, add as `D1_DATABASE_ID` secret
4. **Pages Project:** 
   - **List existing projects:** Run `npx wrangler pages project list` to see all your Pages projects
   - **Create new project:** Run `npx wrangler pages project create tuvix-app` (or create via Dashboard)
   - **Add project name:** Use the project name as `CLOUDFLARE_PAGES_PROJECT_NAME` secret (must match exactly, case-sensitive)
5. **Worker Name:** Automatically read from `packages/api/wrangler.toml` → `name` field (no secret needed)

### Deployment Process

#### Development Environment Deployment

**Automatic Deployment:**
- Pushing to `development` branch automatically triggers `deploy-dev.yml`
- Deploys to dev Cloudflare resources (separate Worker/Pages project)
- Uses git commit SHA as release version
- Runs all tests and type checks before deployment

**Manual Deployment:**
1. Go to **Actions → Deploy to Cloudflare Workers (Dev)**
2. Click **"Run workflow"**
3. Select branch (default: `development`)
4. Click **"Run workflow"**

**Setting up Dev Resources:**

1. **Create GitHub Development Environment:**
   - Go to **Settings → Environments**
   - Click **"New environment"**
   - Name: `development`
   - Click **"Configure environment"**
   - Add all required secrets (see Development Environment Secrets above)

2. **Create Dev Worker** (recommended - separate from production):
   ```bash
   # The workflow will automatically use a separate worker name if CLOUDFLARE_WORKER_NAME_DEV is set
   # No need to modify wrangler.toml - just set the secret
   
   # In GitHub → Settings → Environments → development → Secrets:
   # Add: CLOUDFLARE_WORKER_NAME_DEV = "tuvix-api-dev"
   ```
   
   **Note:** If you don't set `CLOUDFLARE_WORKER_NAME_DEV`, dev deployments will use the same Worker as production (deploys will overwrite each other).

3. **Create Dev Pages Project:**
   ```bash
   npx wrangler pages project create tuvix-app-dev
   # Add as CLOUDFLARE_PAGES_PROJECT_NAME secret in development environment
   ```

4. **Create Dev D1 Database** (optional - can use same database):
   ```bash
   npx wrangler d1 create tuvix-dev
   # Copy database_id and add as D1_DATABASE_ID secret in development environment
   # Or use the same D1_DATABASE_ID as production (shared database)
   ```

5. **Set Dev Worker Secrets** (after first deployment):
   ```bash
   # Set secrets for the dev worker (same as production setup)
   cd packages/api
   npx wrangler secret put BETTER_AUTH_SECRET --name tuvix-api-dev
   npx wrangler secret put CORS_ORIGIN --name tuvix-api-dev
   npx wrangler secret put BASE_URL --name tuvix-api-dev
   # ... etc (use --name flag to target dev worker)
   ```

#### Production Environment Deployment

**Important:** 
- **Pushing directly to `main` will NOT trigger a deployment** (or any CI checks)
- **CI workflows only run on pull requests**, not direct pushes
- **Deployments only happen when:**
  - A GitHub release is published (automatic)
  - The workflow is manually triggered via GitHub Actions UI

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
   - Runs type checks and tests for API
   - Builds API
   - Substitutes `D1_DATABASE_ID` in `wrangler.toml` using `envsubst`
   - Deploys API to Cloudflare Workers
   - Runs database migrations (after API deployment succeeds)
   - Runs type checks and tests for App
   - Builds App with `VITE_API_URL` from secrets
   - Deploys App to Cloudflare Pages (only after API deployment succeeds)
   - Outputs deployment summary with URLs

#### Manual Deployment

1. Go to **Actions → Deploy to Cloudflare Workers**
2. Click **"Run workflow"**
3. Select branch and enter version tag (e.g., `v1.0.0`)
4. Click **"Run workflow"**

### Workflow Features

#### Production Workflow (`deploy-cloudflare.yml`)
- ✅ **Sequential Deployment:** API deploys first, then App (ensures API is ready)
- ✅ **Wrangler Config Creation:** Creates `wrangler.toml` from `wrangler.example.toml` with substituted values
- ✅ **Validation:** Type checks and tests run before deployment
- ✅ **Database Migrations:** Automatically run after successful API deployment
- ✅ **Concurrency Control:** Prevents duplicate runs
- ✅ **Caching:** Optimized dependency caching
- ✅ **Environment Protection:** Uses `production` GitHub environment
- ✅ **Release Tag Checkout:** Ensures correct code version is deployed
- ✅ **Deployment URLs:** Displayed in workflow summary
- ✅ **Automatic Sentry Release Tracking:** Release version automatically passed to Sentry for both backend and frontend

#### Development Workflow (`deploy-dev.yml`)
- ✅ **Automatic Deployment:** Triggers on pushes to `development` branch
- ✅ **Sequential Deployment:** API deploys first, then App (ensures API is ready)
- ✅ **Wrangler Config Creation:** Creates `wrangler.toml` from `wrangler.example.toml` with substituted values
- ✅ **Validation:** Type checks and tests run before deployment
- ✅ **Database Migrations:** Automatically run after successful API deployment
- ✅ **Concurrency Control:** Cancels in-progress runs (allows rapid iteration)
- ✅ **Caching:** Optimized dependency caching
- ✅ **Environment Protection:** Uses `development` GitHub environment (separate secrets)
- ✅ **Worker Name Override:** Supports separate dev Worker via `-dev` suffix
- ✅ **Commit-based Versioning:** Uses git commit SHA as release version
- ✅ **Deployment URLs:** Displayed in workflow summary with commit SHA

### Sentry Error Tracking Setup

**Purpose:** Monitor errors and performance across frontend and backend with distributed tracing.

**Projects:**
- **Backend:** `tuvix-api` (Cloudflare Workers)
- **Frontend:** `tuvix-app` (Cloudflare Pages)

**Setup Steps:**

1. **Get Sentry DSNs:**
   - Go to https://techsquidtv.sentry.io/settings/projects/
   - Click on `tuvix-api` → Settings → Client Keys (DSN)
   - Copy the DSN (format: `https://xxx@xxx.ingest.sentry.io/xxx`)
   - Repeat for `tuvix-app`

2. **Set Backend Secrets (Cloudflare Workers):**
   ```bash
   cd packages/api
   
   # Required: Backend DSN
   npx wrangler secret put SENTRY_DSN
   # Enter: https://xxx@xxx.ingest.sentry.io/xxx (from tuvix-api project)
   
   # Required: Environment name
   npx wrangler secret put SENTRY_ENVIRONMENT
   # Enter: production (or staging, development, etc.)
   
   # Optional: Release tracking (automatically set during deployment)
   # The deployment workflow automatically sets SENTRY_RELEASE from the release tag
   # You can manually set it if needed:
   # npx wrangler secret put SENTRY_RELEASE
   # Enter: v1.0.0 or git commit SHA
   ```

3. **Set Frontend Secrets (GitHub Actions):**
   - Go to GitHub → Settings → Secrets and variables → Actions
   - Add `VITE_SENTRY_DSN` (from `tuvix-app` project)
   - Add `VITE_SENTRY_ENVIRONMENT` (e.g., `production`)
   - **Note:** `VITE_APP_VERSION` is automatically set during deployment from the release tag
   - You can manually set it if needed (optional, e.g., git commit SHA)

4. **Verify Setup:**
   ```bash
   # Test backend Sentry by triggering an error
   # Check Sentry dashboard for events
   # https://techsquidtv.sentry.io/issues/
   
   # Monitor backend logs
   npx wrangler tail
   ```

**Distributed Tracing:**
- ✅ **Automatic:** Frontend automatically propagates trace headers to backend
- ✅ **Trace Propagation:** Configured in `packages/app/src/main.tsx` → `tracePropagationTargets`
- ✅ **Backend Handling:** Cloudflare Workers automatically accepts trace headers via `Sentry.withSentry()`
- ✅ **View Traces:** In Sentry, click on an error → "View Trace" to see full request flow

**Release Tracking:**
- ✅ **Automatic:** Release version is automatically extracted from GitHub release tag or manual input
- ✅ **Backend:** `SENTRY_RELEASE` secret is automatically updated during deployment workflow
- ✅ **Frontend:** `VITE_APP_VERSION` is automatically passed as environment variable during build
- ✅ **Fallback:** If no release tag is provided, uses git commit SHA

**What Gets Tracked:**
- Frontend: JavaScript errors, unhandled promise rejections, React errors, performance metrics
- Backend: API errors, D1 database queries, rate limit errors, performance metrics
- Distributed: Full request flow from frontend → backend with trace context
- Release: All errors are tagged with the release version for easy tracking

**Troubleshooting:**
- **No events in Sentry:** Check DSNs are set correctly, check browser console for Sentry initialization logs
- **No distributed traces:** Verify `tracePropagationTargets` includes your API URL (e.g., `api.tuvix.app`)
- **Backend not logging:** Check Worker logs (`npx wrangler tail`) for Sentry initialization messages

### Troubleshooting CI/CD

**Workflow Fails:**
- Check Actions tab for specific error messages
- Verify all required secrets are configured (see Required GitHub Secrets above)
- Run checks locally: `pnpm run pre-check`
- Check that `D1_DATABASE_ID` substitution succeeded (look for "Successfully substituted" message)

**Deployment Fails:**
- Verify Cloudflare API token permissions (Workers:Edit, Pages:Edit, **D1:Edit**)
- Check that Worker and Pages projects exist
- Verify `D1_DATABASE_ID` secret is set correctly (workflow will fail if missing)
- If migrations fail with error code 7403: API token lacks D1 permissions or database belongs to different account
- Review Cloudflare dashboard for errors
- Ensure database migrations completed successfully (runs after API deployment)
- Check that worker name in `wrangler.toml` matches your Cloudflare Worker

**Coverage Not Showing:**
- Coverage generates automatically during test runs
- Check that `coverage/lcov.info` files exist
- For private repos, may need `CODECOV_TOKEN` secret

See [`.github/workflows/README.md`](../.github/workflows/README.md) for detailed setup instructions.

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

1. Create admin user (see deployment sections above)
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
