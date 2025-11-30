# Codecov Setup Guide

This guide explains how to complete the Codecov integration for the TuvixRSS monorepo.

## What's Already Done

✅ **CI Workflow Updated** - `.github/workflows/ci-reusable.yml` now uses Codecov v5
✅ **Codecov Badge Added** - README.md includes the coverage badge
✅ **Codecov Config Created** - `codecov.yml` configured for monorepo with separate flags for API and App
✅ **Coverage Reports** - Both packages already generate lcov reports via vitest

## Required Steps to Complete Setup

### 1. Add CODECOV_TOKEN to GitHub Secrets

1. **Get your Codecov token:**
   - Go to [https://codecov.io/](https://codecov.io/)
   - Sign up or log in with your GitHub account
   - Add the repository: `TechSquidTV/Tuvix-RSS`
   - Copy the upload token from the Codecov dashboard

2. **Add token to GitHub:**
   - Go to your repository: https://github.com/TechSquidTV/Tuvix-RSS/settings/secrets/actions
   - Click "New repository secret"
   - Name: `CODECOV_TOKEN`
   - Value: Paste your Codecov token
   - Click "Add secret"

### 2. Verify Setup

After merging to `main`:

1. Check the Actions tab for successful coverage uploads
2. Visit your Codecov dashboard: https://codecov.io/gh/TechSquidTV/Tuvix-RSS
3. Verify both API and App flags are showing coverage
4. Check that the README badge is displaying correctly

## How It Works

### Monorepo Coverage

The setup handles both packages in your monorepo:

- **API Package** (`packages/api/`)
  - Coverage flag: `api`
  - Config: `packages/api/vitest.config.ts`
  - Output: `packages/api/coverage/lcov.info`

- **App Package** (`packages/app/`)
  - Coverage flag: `app`
  - Config: `packages/app/vite.config.ts` (vitest config included)
  - Output: `packages/app/coverage/lcov.info`

### Coverage Workflow

1. **Test Execution**

   ```bash
   # API tests
   pnpm run test:coverage:api

   # App tests
   pnpm run test:coverage:app
   ```

2. **Coverage Upload** (in CI)
   - Runs after tests complete
   - Uploads `lcov.info` files separately with flags
   - Codecov merges them into a unified report

3. **PR Comments**
   - Codecov automatically comments on PRs with coverage diff
   - Shows overall coverage and per-file changes
   - Displays coverage for both API and App flags

### Configuration Files

#### `codecov.yml`

Main Codecov configuration:

- Sets coverage precision and range
- Configures project and patch status checks
- Defines flags for API and App
- Excludes test files and generated code

#### Vitest Configs

Both packages have coverage configured:

**API** (`packages/api/vitest.config.ts`):

- Provider: `v8`
- Reporters: `text`, `json`, `html`, `lcov`
- Excludes: tests, migrations, CLI, adapters

**App** (`packages/app/vite.config.ts`):

- Provider: `v8`
- Reporters: `text`, `json`, `html`, `lcov`
- Excludes: shadcn/ui components, generated files, tests
- Thresholds: 60% (lines, branches, functions, statements)

## Running Coverage Locally

### Individual Packages

```bash
# API coverage
pnpm run test:coverage:api
open packages/api/coverage/index.html

# App coverage
pnpm run test:coverage:app
open packages/app/coverage/index.html
```

### Merged Coverage (Monorepo)

```bash
# Generate and merge coverage from both packages
pnpm run test:coverage

# This runs:
# 1. test:coverage:api
# 2. test:coverage:app
# 3. Merges reports with nyc
# 4. Generates combined HTML report

open coverage/index.html
```

## Codecov Dashboard Features

Once set up, you'll have access to:

1. **Coverage Graphs** - Historical coverage trends
2. **File Browser** - Coverage by file with line-by-line view
3. **Flags** - Separate views for API and App coverage
4. **Pull Requests** - Automatic PR comments with coverage diff
5. **Sunburst Chart** - Visual representation of coverage by directory

## Troubleshooting

### Coverage not uploading

Check that:

- `CODECOV_TOKEN` is set in GitHub secrets
- Tests are generating `lcov.info` files
- CI workflow has the `secrets: inherit` parameter

### Badge not showing

- Badge may take a few minutes to update after first upload
- Check the badge URL matches your repo: `TechSquidTV/Tuvix-RSS`
- Ensure at least one coverage report has been uploaded

### Monorepo coverage not separating

- Verify flags are set in CI: `flags: api` and `flags: app`
- Check `codecov.yml` has correct path mappings
- Ensure coverage files are uploaded with correct flags

## Additional Resources

- [Codecov Documentation](https://docs.codecov.com/)
- [Monorepo Configuration](https://docs.codecov.com/docs/flags)
- [GitHub Actions Integration](https://docs.codecov.com/docs/github-actions)
- [Coverage Configuration](https://docs.codecov.com/docs/coverage-configuration)

## Coverage Goals

Current thresholds:

- **API**: 0% (aspirational thresholds in config)
- **App**: 60% (enforced in vitest config)

Consider gradually increasing API coverage thresholds as tests are added.
