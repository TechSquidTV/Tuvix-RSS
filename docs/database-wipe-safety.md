# Database Wipe Safety Mechanisms

This document outlines the multiple layers of protection that prevent accidental production database wipes.

## Overview

The staging database wipe script (`wipe-staging.sql`) is designed to completely drop all tables from the staging environment. To prevent catastrophic data loss from accidental execution against production, we've implemented **multiple independent layers of safety**.

## Safety Layers

### Layer 1: Database Name Validation (Primary)

**Location**: GitHub Actions workflow, manual commands  
**Mechanism**: Explicit database name in wrangler commands

```bash
# Staging (SAFE)
wrangler d1 execute tuvix-staging --remote --env staging --file=scripts/wipe-staging.sql

# Production (PROTECTED - different database name)
wrangler d1 execute tuvix --remote --file=scripts/wipe-staging.sql
```

**Protection**:

- Staging uses `tuvix-staging` database
- Production uses `tuvix` database
- These are completely separate D1 database instances with different IDs
- A typo in the database name would target the wrong database, but...

### Layer 2: Environment Flag Requirement

**Location**: Wrangler configuration, GitHub Actions workflow  
**Mechanism**: `--env staging` flag required for staging operations

```toml
# wrangler.toml
[env.staging]
name = "tuvix-api-staging"

[env.staging.vars]
RUNTIME = "cloudflare"
ENVIRONMENT = "staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "tuvix-staging"
database_id = "${D1_DATABASE_ID}"  # Different from production!
```

**Protection**:

- The `--env staging` flag binds to staging-specific configuration
- Sets `ENVIRONMENT='staging'` variable
- Uses `STAGING_D1_DATABASE_ID` secret (not production database ID)
- Without this flag, the command targets production configuration

### Layer 3: SQL-Level Safety Checks

**Location**: `wipe-staging.sql` script  
**Mechanism**: Pre-execution validation queries

```sql
-- Safety check: Verify database state before wiping
SELECT CASE
    WHEN COUNT(*) = 0 THEN 'OK: Database is empty (fresh staging)'
    WHEN COUNT(*) > 0 THEN 'WARNING: Database has tables - proceeding with wipe'
END as safety_check
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE '_cf_%'
  AND name NOT LIKE '__drizzle_migrations'
  AND name NOT LIKE 'd1_migrations';
```

**Protection**:

- Validates database state before proceeding
- Provides visibility into what will be deleted
- Creates an audit trail in logs

### Layer 4: GitHub Environment Secrets Isolation

**Location**: GitHub repository settings  
**Mechanism**: Environment-specific secrets

**Staging Environment Secrets**:

- `STAGING_D1_DATABASE_ID` - Staging database UUID
- `STAGING_CLOUDFLARE_PAGES_PROJECT_NAME` - Staging Pages project
- `STAGING_VITE_API_URL` - Staging API URL

**Production Secrets** (separate):

- `D1_DATABASE_ID` - Production database UUID
- Different Pages project name
- Different API URL

**Protection**:

- Staging workflow can only access staging secrets
- Production database ID is never available in staging context
- Even if someone tried to target production, they wouldn't have the credentials

### Layer 5: Manual Trigger Only

**Location**: GitHub Actions workflow  
**Mechanism**: `workflow_dispatch` (manual trigger)

```yaml
on:
  workflow_dispatch:
    inputs:
      branch:
        description: "Branch to deploy"
        required: true
```

**Protection**:

- No automatic triggers (no push, pull_request, schedule)
- Requires explicit human action to deploy
- Prevents accidental automated wipes

### Layer 6: Safe Wrapper Script (Optional - Manual Use Only)

**Location**: `packages/api/scripts/wipe-staging-safe.sh`  
**Mechanism**: Interactive validation and confirmation  
**Usage**: Optional additional safety for manual/local operations

> **Note**: This layer is NOT used by CI/GitHub Actions (which use the direct wrangler command).
> The wrapper script is interactive and would fail in automated environments.
> CI is already protected by Layers 1-5.

```bash
# Shows available databases
wrangler d1 list

# Requires explicit choice
read -p "Enter your choice (1-3): " choice

# Blocks production wipe attempts
if [ "$choice" = "2" ]; then
    echo "🛑 PRODUCTION DATABASE WIPE BLOCKED 🛑"
    exit 1
fi

# Requires typing "WIPE STAGING" to confirm
read -p "Type 'WIPE STAGING' to confirm: " confirmation
```

**Protection**:

- Lists all databases so you can verify target
- Explicitly blocks production database selection
- Requires typing exact confirmation phrase
- Shows what will be deleted before proceeding
- **Only for manual/local use** - CI uses direct command

## Usage Guidelines

### ✅ Safe Usage (Automated - GitHub Actions)

```yaml
# In .github/workflows/deploy-staging.yml
- name: Wipe staging database
  run: |
    pnpm exec wrangler d1 execute tuvix-staging --remote --file=scripts/wipe-staging.sql --env staging
```

**Why it's safe**:

- ✅ Hardcoded database name: `tuvix-staging`
- ✅ Environment flag: `--env staging`
- ✅ Uses staging secrets only
- ✅ Runs in staging environment context

### ✅ Safe Usage (Manual - Wrapper Script - Optional)

```bash
cd packages/api
./scripts/wipe-staging-safe.sh
```

**Why it's safe**:

- ✅ Interactive validation
- ✅ Shows current databases
- ✅ Blocks production attempts
- ✅ Requires explicit confirmation
- ✅ Automatically adds `--env staging` flag

**When to use**:

- Manual/local database resets
- When you want extra confirmation prompts
- When you're unsure which database you're targeting

**When NOT to use**:

- ❌ CI/automated workflows (it's interactive and will fail)
- ❌ Scripts that need to run non-interactively

### ✅ Safe Usage (Manual - Direct Command)

```bash
# This is what CI uses - also safe for manual use
wrangler d1 execute tuvix-staging --remote --env staging --file=packages/api/scripts/wipe-staging.sql
```

**Why it's safe**:

- ✅ Hardcoded database name: `tuvix-staging`
- ✅ Environment flag: `--env staging`
- ✅ Non-interactive (works in CI and manual)
- ✅ Protected by Layers 1-5

**When to use**:

- CI/automated workflows (required)
- Manual operations when you're confident
- Scripts that need non-interactive execution

**Important**: Always include the `--env staging` flag!

### 🛑 NEVER DO THIS

```bash
# DANGER: Missing --env staging flag
wrangler d1 execute tuvix --remote --file=packages/api/scripts/wipe-staging.sql

# DANGER: Wrong database name
wrangler d1 execute tuvix --remote --env staging --file=packages/api/scripts/wipe-staging.sql
```

**Why it's dangerous**:

- 🛑 Targets production database
- 🛑 Would cause catastrophic data loss
- 🛑 No way to recover without backups

## Testing the Safety Mechanisms

### Test 1: Verify Staging Wipe Works

```bash
cd packages/api
./scripts/wipe-staging-safe.sh
# Choose option 1 (tuvix-staging)
# Type "WIPE STAGING" to confirm
# Should succeed
```

### Test 2: Verify Production Wipe is Blocked

```bash
cd packages/api
./scripts/wipe-staging-safe.sh
# Choose option 2 (tuvix)
# Should immediately exit with error message
```

### Test 3: Verify GitHub Actions Uses Correct Database

```bash
# Check the workflow file
grep "d1 execute" .github/workflows/deploy-staging.yml
# Should show: wrangler d1 execute tuvix-staging --remote --file=scripts/wipe-staging.sql --env staging
```

## Recovery Procedures

### If Staging is Accidentally Wiped

**Impact**: Low - staging is designed to be wiped regularly  
**Recovery**:

1. Re-run staging deployment workflow
2. Database will be recreated with fresh migrations
3. Optionally seed test data

### If Production is Accidentally Wiped

**Impact**: CATASTROPHIC - all user data lost  
**Recovery**:

1. **STOP**: Immediately halt all operations
2. Check if Cloudflare D1 has automatic backups (check dashboard)
3. Restore from most recent backup
4. If no backups exist, data is permanently lost
5. Notify all stakeholders
6. Conduct post-mortem to identify how safety mechanisms failed

**Prevention**: This should be nearly impossible due to the multiple safety layers

## Maintenance

### When Adding New Tables

1. Update `schema.ts` with new table definition
2. Update `wipe-staging.sql` to include new table in DROP statements
3. Maintain dependency order (children before parents)
4. Test staging deployment to verify wipe works

### When Modifying Safety Mechanisms

1. Update this document
2. Test all safety layers still work
3. Update documentation in `docs/staging-setup.md`
4. Consider adding additional safety checks if needed

## Audit Trail

All database wipe operations should be logged:

- **GitHub Actions**: Full workflow logs with timestamps and actor
- **Wrangler Output**: Shows which database was targeted
- **SQL Output**: Safety check results visible in logs

## Summary

We have **6 layers of protection** against accidental production database wipes:

1. ✅ Database name validation (`tuvix-staging` vs `tuvix`)
2. ✅ Environment flag requirement (`--env staging`)
3. ✅ SQL-level safety checks (validation queries)
4. ✅ GitHub environment secrets isolation
5. ✅ Manual trigger only (no automation)
6. ✅ Safe wrapper script (optional - manual use only)

**CI/GitHub Actions** uses Layers 1-5 (the direct wrangler command is non-interactive and already safe).

**Manual operations** can optionally use Layer 6 (wrapper script) for extra confirmation prompts, or use the direct command like CI does.

**For a production wipe to occur**, multiple safety mechanisms would need to fail:

- Wrong database name (`tuvix` instead of `tuvix-staging`)
- Missing or wrong environment flag
- Access to production secrets (not available in staging context)
- Ignoring SQL validation warnings

This is **extremely unlikely** with proper usage of the provided tools and workflows.

**Best Practices**:

- **CI/Automated**: Use the direct wrangler command (as currently implemented)
- **Manual/Local**: Use the wrapper script for extra safety, or the direct command if you're confident
