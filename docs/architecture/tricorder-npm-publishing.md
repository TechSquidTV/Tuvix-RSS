# Tricorder NPM Publishing Setup

This document describes the NPM publishing setup for the `@tuvixrss/tricorder` package.

## Overview

The `@tuvixrss/tricorder` package is published independently to NPM to enable usage in:

1. **TuvixRSS API** (this monorepo) - Uses `workspace:*` during development
2. **Browser Extension** (separate repo) - Installs from NPM
3. **Other projects** - Public package for RSS/Atom feed discovery

## Package Information

- **NPM Package**: `@tuvixrss/tricorder`
- **NPM URL**: https://www.npmjs.com/package/@tuvixrss/tricorder
- **Current Version**: 0.1.0
- **Scope Owner**: `@tuvixrss` organization on NPM

## Publishing Strategy

### Versioning

The package follows [Semantic Versioning](https://semver.org/):

- **Patch (1.0.x)**: Bug fixes, no breaking changes
- **Minor (1.x.0)**: New features, backward compatible
- **Major (x.0.0)**: Breaking API changes

Versioning is **independent** from API/App versions. Tricorder can be on v2.0.0 while API/App are on v0.1.0.

### Scope Setup

1. **Organization Created**: `@tuvixrss` on NPM (https://www.npmjs.com/org/tuvixrss)
2. **Access**: Free for unlimited public packages
3. **Members**: Configure in NPM organization settings

### Trusted Publishing with OIDC (Recommended)

As of npm v11.5.1, **trusted publishing with OpenID Connect (OIDC)** is the recommended approach. This eliminates the need for long-lived tokens and provides automatic provenance attestations.

**Benefits:**

- No token management required
- Short-lived, workflow-specific credentials
- Automatic provenance attestations
- Enhanced security with cryptographic trust

**Setup on npmjs.com:**

1. Go to your package settings at https://www.npmjs.com/package/@tuvixrss/tricorder/access
2. Navigate to "Publishing access" → "Trusted publishers"
3. Click "Add trusted publisher"
4. Select "GitHub Actions" as the provider
5. Configure the trusted publisher:
   - **Organization**: `TechSquidTV`
   - **Repository**: `Tuvix-RSS`
   - **Workflow filename**: `publish-tricorder.yml`
   - **Environment name**: `npm-registry` (optional but recommended)

**Workflow Configuration:**

The workflow must include these permissions at the **workflow level** (not job level):

```yaml
permissions:
  id-token: write # Required for OIDC trusted publishing
  contents: read # Required to read repository contents
```

**Requirements:**

- npm CLI v11.5.1 or later (automatically updated in workflow)
- GitHub-hosted runners (self-hosted runners not yet supported)

### Alternative: GitHub Secrets (Legacy)

If not using trusted publishing, you'll need to configure an NPM token:

- **Name**: `NPM_TOKEN`
- **Type**: Automation token (allows CI/CD publishing)
- **Location**: Repository Settings → Secrets and variables → Actions
- **Permissions**: Publish access to `@tuvixrss` scope

**Note:** This approach is deprecated in favor of OIDC trusted publishing.

### GitHub Environment

Environment configured for deployment tracking:

- **Name**: `npm-registry`
- **URL**: https://www.npmjs.com/package/@tuvixrss/tricorder
- **Protection**: Optional (can add approval requirements)

## CI/CD Workflows

### 1. CI - Tricorder (`ci-tricorder.yml`)

**Purpose**: Independent CI that only runs when tricorder changes.

**Triggers**:

- Pull requests affecting `packages/tricorder/**`
- Pushes to `main`/`development` affecting tricorder
- Manual dispatch

**Path Filtering**:

```yaml
paths:
  - "packages/tricorder/**"
  - ".github/workflows/ci-tricorder.yml"
  - ".github/actions/**"
```

**Jobs**:

- Lint
- Format Check
- Type Check
- Test (with coverage)
- Build

**Benefits**:

- **Fast**: Only runs when tricorder changes
- **Isolated**: Doesn't run full monorepo CI
- **Efficient**: Saves CI minutes, faster feedback

### 2. Publish Tricorder (`publish-tricorder.yml`)

**Purpose**: Automated NPM publishing with safety checks.

**Triggers**:

- Git tags matching `tricorder-v*.*.*` (e.g., `tricorder-v1.0.1`)
- Manual workflow dispatch (with dry-run option)

**Workflow Steps**:

#### Verify Stage

1. Lint code
2. Check formatting
3. Type check
4. Run tests
5. Build package
6. Verify package contents with `npm pack --dry-run`

#### Publish Stage (if verify passes)

1. Update npm to latest version (ensures v11.5.1+ for OIDC support)
2. Validate version matches git tag
3. Check if version already published (skip if yes)
4. Publish to NPM registry using OIDC trusted publishing
5. Create GitHub release
6. Output success with NPM link

**Safety Features**:

- ✅ OIDC trusted publishing (no long-lived tokens)
- ✅ Automatic provenance attestations
- ✅ Version validation (tag must match package.json)
- ✅ Duplicate detection (won't republish same version)
- ✅ Dry-run mode for testing
- ✅ Package contents verification
- ✅ Automatic GitHub release creation
- ✅ Environment protection
- ✅ Full test suite before publish

## Publishing Process

### Prerequisites (One-Time Setup)

**Before first publish, configure trusted publishing on npmjs.com:**

1. Go to https://www.npmjs.com/package/@tuvixrss/tricorder/access
2. Click "Publishing access" → "Trusted publishers" → "Add trusted publisher"
3. Select "GitHub Actions" and configure:
   - Organization: `TechSquidTV`
   - Repository: `Tuvix-RSS`
   - Workflow filename: `publish-tricorder.yml`
   - Environment name: `npm-registry` (optional)
4. Save the configuration

**Optional: Create GitHub environment for tracking**

```bash
gh api repos/:owner/:repo/environments/npm-registry --method PUT --field "wait_timer=0"
```

### Recommended: Automatic via Git Tag

```bash
cd packages/tricorder

# 1. Bump version
npm version patch  # or minor/major

# 2. Commit
git add .
git commit -m "chore(tricorder): release v0.1.1"

# 3. Create tag
VERSION=$(node -p "require('./package.json').version")
git tag "tricorder-v$VERSION"

# 4. Push (this triggers publish workflow with OIDC authentication)
git push origin main --tags
```

### Alternative: Manual via GitHub UI

1. Go to Actions → Publish Tricorder Package
2. Click "Run workflow"
3. Enter version (e.g., `1.0.1`)
4. Optionally enable "Dry run"
5. Click "Run workflow"

## Package Configuration

### package.json Key Fields

```json
{
  "name": "@tuvixrss/tricorder",
  "version": "0.1.0",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "files": ["dist", "README.md", "CHANGELOG.md", "ARCHITECTURE.md"],
  "scripts": {
    "prepublishOnly": "pnpm run build && pnpm run test && pnpm run type-check"
  }
}
```

### What Gets Published

Only these files are included in NPM package:

- `dist/` - Compiled JavaScript and TypeScript declarations
- `README.md` - Package documentation
- `CHANGELOG.md` - Version history
- `ARCHITECTURE.md` - Design decisions
- `package.json` - Package metadata

Source files (`src/`) are **not** published - only built output.

## Usage in Different Contexts

### 1. TuvixRSS API (This Monorepo)

```json
// packages/api/package.json
{
  "dependencies": {
    "@tuvixrss/tricorder": "workspace:*"
  }
}
```

During development:

- Uses local version via workspace protocol
- Changes to tricorder instantly available in API
- No need to publish for testing

When publishing API:

- `workspace:*` resolves to local version
- Or can pin specific version: `"@tuvixrss/tricorder": "^1.0.0"`

### 2. Browser Extension (Separate Repo)

```json
// package.json
{
  "dependencies": {
    "@tuvixrss/tricorder": "^1.0.0"
  }
}
```

```bash
npm install @tuvixrss/tricorder
```

```typescript
import { discoverFeeds } from "@tuvixrss/tricorder";

// Zero telemetry, zero overhead
const feeds = await discoverFeeds(url);
```

### 3. Other Projects

Anyone can install and use:

```bash
npm install @tuvixrss/tricorder
```

```typescript
import { discoverFeeds, createDefaultRegistry } from "@tuvixrss/tricorder";
```

## Monitoring and Maintenance

### NPM Package Dashboard

- **URL**: https://www.npmjs.com/package/@tuvixrss/tricorder
- **Stats**: Downloads, dependents, version history
- **Management**: Deprecate versions, manage collaborators

### GitHub Releases

- **URL**: https://github.com/TechSquidTV/TuvixRSS/releases
- **Created**: Automatically on successful publish
- **Content**: Changelog, NPM link

### Version History

See `packages/tricorder/CHANGELOG.md` for detailed version history.

## Troubleshooting

### "Version already published"

**Cause**: Version already exists on NPM.
**Solution**: Bump version and republish.

### "NPM_TOKEN not found"

**Cause**: Secret missing or expired.
**Solution**: Generate new token, update GitHub secret.

### "Permission denied"

**Cause**: Token doesn't have access to `@tuvixrss` scope.
**Solution**: Ensure you're a member of the organization, regenerate token.

### TypeScript Errors in API

**Cause**: Workspace reference not resolving.
**Solution**: Run `pnpm install` to update symlinks.

### CI Failing

**Cause**: Tests or checks failing.
**Solution**: Run locally:

```bash
cd packages/tricorder
pnpm test
pnpm type-check
pnpm build
```

## Future Enhancements

### Potential Additions

1. **Automated Releases**
   - Conventional Commits
   - Semantic Release
   - Automated CHANGELOG generation

2. **Additional Distribution**
   - CDN (unpkg, jsDelivr)
   - GitHub Packages
   - Multiple registries

3. **Enhanced Monitoring**
   - NPM download analytics
   - Bundle size tracking
   - Breaking change detection

4. **Community Features**
   - Contributing guide
   - Issue templates
   - Discussion forum

## Related Documentation

- **Publishing Guide**: `/packages/tricorder/PUBLISHING.md`
- **Package README**: `/packages/tricorder/README.md`
- **Architecture**: `/packages/tricorder/ARCHITECTURE.md`
- **Changelog**: `/packages/tricorder/CHANGELOG.md`
- **Workflows**: `/.github/workflows/README.md`

## Summary

The tricorder package is set up for:

- ✅ Independent versioning from main app
- ✅ Automated NPM publishing via CI/CD
- ✅ Path-filtered CI (only runs when tricorder changes)
- ✅ Safety checks (version validation, duplicate detection)
- ✅ Dual usage (local workspace + NPM registry)
- ✅ Public distribution for browser extensions
- ✅ Professional package management

The setup enables rapid iteration on tricorder while maintaining stability for consumers.
