# GitHub Actions Workflows

This directory contains CI/CD workflows for the TuvixRSS project.

## Workflow Overview

### Branch Flow

```
feature branch → development branch → main branch
```

### Workflows

#### 1. CI - Feature Branch (`ci-feature.yml`)

**Triggers:** Pull requests targeting the `development` branch

**Jobs:**

- Lint & Format Check
- Type Check
- Test API
- Test App
- Build

**Purpose:** Validate code quality and ensure builds succeed before merging to development.

#### 2. CI - Development Branch (`ci-development.yml`)

**Triggers:** Pull requests targeting the `main` branch

**Jobs:**

- Lint & Format Check
- Type Check
- Test API (with coverage upload)
- Test App (with coverage upload)
- Build (with artifact upload)

**Purpose:** Comprehensive validation before merging to main, including test coverage tracking.

#### 3. CI - Tricorder Package (`ci-tricorder.yml`)

**Triggers:**

- Pull requests affecting `packages/tricorder/**`
- Pushes to `main` or `development` affecting tricorder
- Manual workflow dispatch

**Jobs:**

- Lint Tricorder
- Format Check Tricorder
- Type Check Tricorder
- Test Tricorder (with coverage upload)
- Build Tricorder

**Purpose:** Independent CI for the tricorder package. Only runs when tricorder-related files change to optimize CI performance.

**Path Filtering:** This workflow uses GitHub's `paths` filter to only run when:

- Files in `packages/tricorder/` are modified
- The workflow file itself is modified
- Shared actions are modified

#### 4. Publish Tricorder Package (`publish-tricorder.yml`)

**Triggers:**

- Tags matching `tricorder-v*.*.*` (e.g., `tricorder-v1.0.1`)
- Manual workflow dispatch with version input

**Jobs:**

1. **Verify**: Lint, format, type-check, test, and build tricorder
2. **Publish**: Publish to NPM registry and create GitHub release

**Purpose:** Automated publishing of @tuvixrss/tricorder package to NPM.

**Safety Features:**

- Version validation (tag must match package.json)
- Duplicate check (won't republish existing versions)
- Dry-run mode for testing
- Package contents verification
- Automatic GitHub release creation with changelog

#### 5. Deploy to Cloudflare Workers (`deploy-cloudflare.yml`)

**Triggers:**

- Published releases
- Manual workflow dispatch

**Jobs:**

- Deploy API to Cloudflare Workers
- Deploy App to Cloudflare Pages
- Run database migrations
- Notify deployment status

**Purpose:** Automated deployment to production on releases.

## Required Secrets

Configure these secrets in your GitHub repository settings:

### NPM Secrets

- `NPM_TOKEN` - NPM authentication token for publishing packages

**How to Get NPM Token:**

1. Log in to npmjs.com
2. Click your profile → "Access Tokens"
3. Click "Generate New Token" → Choose "Automation" type
4. Copy the token
5. Add to GitHub: Settings → Secrets and variables → Actions → New repository secret
6. Name: `NPM_TOKEN`, Value: (paste token)

**NPM Scope Setup:**

- If using `@tuvixrss/tricorder`: Create organization at https://www.npmjs.com/org/create
- If using `@techsquidtv/tricorder`: No setup needed (uses your username automatically)
- Ensure your token has publish permissions for the scope

### Cloudflare Secrets

- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Workers and Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `D1_DATABASE_ID` - Your D1 database ID (from `wrangler d1 create tuvix`)
- `CLOUDFLARE_WORKER_NAME` - Name of your Cloudflare Worker (e.g., `tuvix-api`)
- `CLOUDFLARE_PAGES_PROJECT_NAME` - Name of your Cloudflare Pages project
- `VITE_API_URL` - API URL for the frontend build (e.g., `https://api.yourdomain.com/trpc`)

### How to Get Cloudflare Credentials

1. **API Token:**
   - Go to Cloudflare Dashboard → My Profile → API Tokens
   - Create token with permissions: `Account.Cloudflare Workers:Edit`, `Account.Cloudflare Pages:Edit`
   - Copy the token

2. **Account ID:**
   - Found in Cloudflare Dashboard → Right sidebar under "Account ID"

3. **D1 Database ID:**
   - Run `npx wrangler d1 create tuvix` locally
   - Copy the `database_id` from the output
   - Go to GitHub repository → Settings → Secrets and variables → Actions
   - Click the **"Secrets"** tab (not "Variables" - we use Secrets for sensitive data)
   - Click "New repository secret"
   - Name: `D1_DATABASE_ID` (must match exactly - this is used by the workflow)
   - Value: Paste your database ID
   - Click "Add secret"
   - The workflow reads this secret (via `${{ secrets.D1_DATABASE_ID }}`) and sets it as an environment variable for the deployment step

4. **Worker Name:**
   - Check `packages/api/wrangler.toml` → `name` field

5. **Pages Project Name:**
   - Create a Pages project in Cloudflare Dashboard or use existing name

## Usage

### Feature Branch Workflow

1. Create a feature branch from `development`
2. Make changes and push
3. Create a PR targeting `development`
4. CI runs automatically on PR open/update

### Development Branch Workflow

1. Merge feature branch to `development`
2. Create a PR from `development` to `main`
3. CI runs automatically with coverage tracking
4. Once merged, code is on `main` and ready for release

### Tricorder Publishing Workflow

The tricorder package is published independently from the main TuvixRSS application.

#### Method 1: Automatic (via Git Tag) - Recommended

1. Update `packages/tricorder/CHANGELOG.md` with changes
2. Bump version in `packages/tricorder/package.json`:
   ```bash
   cd packages/tricorder
   npm version patch  # or minor/major
   ```
3. Commit changes:
   ```bash
   git add .
   git commit -m "chore(tricorder): release v1.0.1"
   ```
4. Create and push tag:
   ```bash
   git tag tricorder-v1.0.1
   git push origin main --tags
   ```
5. Workflow automatically runs and publishes to NPM

#### Method 2: Manual Workflow Dispatch

1. Go to Actions → Publish Tricorder Package
2. Click "Run workflow"
3. Enter version (e.g., `1.0.1`)
4. Optionally enable "Dry run" to test without publishing
5. Click "Run workflow"

#### Pre-Publish Checklist

- [ ] CHANGELOG.md updated with changes
- [ ] Version bumped in package.json
- [ ] All tests passing locally (`pnpm --filter @tuvixrss/tricorder test`)
- [ ] Build successful (`pnpm --filter @tuvixrss/tricorder build`)
- [ ] NPM_TOKEN secret configured in GitHub
- [ ] NPM scope ownership confirmed (@tuvix or @techsquidtv)

#### Post-Publish Steps

1. GitHub release is automatically created with changelog
2. Verify package on NPM: https://www.npmjs.com/package/@tuvixrss/tricorder
3. Update API package if needed to use new version
4. Update browser extension to use new version

#### Versioning Strategy

- **Patch (1.0.x)**: Bug fixes, no breaking changes
- **Minor (1.x.0)**: New features, backward compatible
- **Major (x.0.0)**: Breaking API changes

**Examples:**

- Fixed error handling bug → `1.0.1`
- Added YouTube discovery service → `1.1.0`
- Changed telemetry interface → `2.0.0`

### Deployment Workflow (API & App)

#### Automatic (on Release)

1. Create a new release in GitHub (tagged version, e.g., `v1.0.0`)
2. Workflow automatically deploys to Cloudflare

#### Manual

1. Go to Actions → Deploy to Cloudflare Workers
2. Click "Run workflow"
3. Enter version tag (e.g., `v1.0.0`)
4. Click "Run workflow"

## Workflow Features

- **Parallel Jobs:** All CI jobs run in parallel for faster feedback
- **Concurrency Control:** Duplicate workflow runs are cancelled automatically
- **Caching:** pnpm and Node.js dependencies are cached
- **Artifacts:** Build artifacts and coverage reports are uploaded
- **Coverage Reporting:** Coverage is uploaded to GitHub and displayed in PRs
- **Environment Protection:** Production deployment uses GitHub environments
- **Database Migrations:** Automatically runs D1 migrations after successful deployment
- **Status Notifications:** Deployment summary in GitHub Actions
- **Release Tag Checkout:** Deployment workflow checks out the specific release tag

## Troubleshooting

### Workflow Fails on Lint/Format

- Run `pnpm run lint:fix` and `pnpm run format:fix` locally
- Commit and push fixes

### Deployment Fails

- Check Cloudflare API token permissions
- Verify account ID is correct
- Ensure Worker and Pages projects exist
- Check Cloudflare dashboard for error details

### Tests Fail

- Run tests locally: `pnpm run test`
- Check test output for specific failures
- Ensure all dependencies are installed

### Coverage Not Showing

- Coverage is generated automatically during test runs
- Check that `coverage/lcov.info` files exist in package directories
- Coverage reports appear in PR comments automatically
- View detailed coverage reports in the Actions artifacts

## Customization

### Adding New Checks

Edit the appropriate workflow file and add a new job:

```yaml
new-check:
  name: New Check
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    # ... your steps
```

### Changing Node/pnpm Versions

Update the `env` section in workflow files or individual job steps.

### Extending Deployment

Add additional deployment targets or steps in `deploy-cloudflare.yml`.

## Branch Protection Setup

To ensure CI checks are enforced, configure branch protection rules:

### For `development` branch:

1. Go to Settings → Branches → Add rule
2. Branch name pattern: `development`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
4. Required status checks:
   - `lint-and-format`
   - `type-check`
   - `test-api`
   - `test-app`
   - `build`

### For `main` branch:

1. Go to Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Require review from code owners (optional)
4. Required status checks:
   - `lint-and-format`
   - `type-check`
   - `test-api`
   - `test-app`
   - `build`

## Dependabot

Dependabot is configured to:

- Check for updates monthly
- Group production and development dependencies separately
- Create PRs with appropriate labels
- Use conventional commit messages

PRs created by Dependabot will automatically trigger CI workflows.

## Coverage Reporting

Coverage is automatically generated and reported in several ways:

### In Pull Requests

- Coverage comments are automatically posted to PRs showing:
  - Overall coverage percentage
  - Coverage changes (increase/decrease)
  - Coverage by package (API vs App)
- Coverage diff shows what changed in the PR

### Coverage Artifacts

- Full HTML coverage reports are uploaded as artifacts
- Download from Actions → Workflow run → Artifacts
- View detailed line-by-line coverage in your browser

### Coverage Files

Coverage is generated in multiple formats:

- `lcov.info` - Used for GitHub integration
- `coverage-final.json` - JSON format for merging
- `index.html` - HTML report (in artifacts)

### Viewing Coverage Locally

```bash
# Generate coverage for both packages
pnpm run test:coverage

# View merged coverage report
open coverage/index.html
```

### Coverage Thresholds

- **App:** 60% minimum (lines, branches, functions, statements)
- **API:** Currently no thresholds (aspirational - will increase over time)

Coverage reporting uses Codecov's GitHub Action, which works automatically for public repositories. For private repositories, you may need to add a `CODECOV_TOKEN` secret.
