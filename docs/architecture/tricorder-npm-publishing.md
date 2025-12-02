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

### GitHub Secrets

Required secret configured in repository:

- **Name**: `NPM_TOKEN`
- **Type**: Automation token (allows CI/CD publishing)
- **Location**: Repository Settings → Secrets and variables → Actions
- **Permissions**: Publish access to `@tuvixrss` scope

### GitHub Environment

Created environment for additional safety:

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
  - 'packages/tricorder/**'
  - '.github/workflows/ci-tricorder.yml'
  - '.github/actions/**'
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
1. Validate version matches git tag
2. Check if version already published (skip if yes)
3. Publish to NPM registry
4. Create GitHub release with changelog
5. Output success with NPM link

**Safety Features**:
- ✅ Version validation (tag must match package.json)
- ✅ Duplicate detection (won't republish same version)
- ✅ Dry-run mode for testing
- ✅ Package contents verification
- ✅ Automatic GitHub release creation
- ✅ Environment protection
- ✅ Full test suite before publish

## Publishing Process

### Recommended: Automatic via Git Tag

```bash
cd packages/tricorder

# 1. Update CHANGELOG.md with changes

# 2. Bump version
npm version patch  # or minor/major

# 3. Commit
git add .
git commit -m "chore(tricorder): release v1.0.1"

# 4. Create tag
VERSION=$(node -p "require('./package.json').version")
git tag "tricorder-v$VERSION"

# 5. Push (this triggers publish workflow)
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
  "files": [
    "dist",
    "README.md",
    "CHANGELOG.md",
    "ARCHITECTURE.md"
  ],
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
import { discoverFeeds } from '@tuvixrss/tricorder';

// Zero telemetry, zero overhead
const feeds = await discoverFeeds(url);
```

### 3. Other Projects

Anyone can install and use:

```bash
npm install @tuvixrss/tricorder
```

```typescript
import { discoverFeeds, createDefaultRegistry } from '@tuvixrss/tricorder';
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
