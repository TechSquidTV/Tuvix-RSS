# Publishing @tuvixrss/tricorder to NPM

This guide covers how to publish new versions of the tricorder package to NPM.

## Prerequisites

### 1. NPM Account Setup
- Create account at https://npmjs.com if you don't have one
- Choose scope ownership:
  - **@tuvix**: Create organization at https://www.npmjs.com/org/create (free for public packages)
  - **@techsquidtv**: Uses your username automatically (no setup needed)

### 2. NPM Token (for CI/CD)
1. Log in to npmjs.com
2. Profile → Access Tokens → Generate New Token
3. Choose "Automation" type (allows CI/CD publishing)
4. Copy the token
5. Add to GitHub:
   - Go to repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: (paste token)

### 3. NPM Environment (GitHub)
1. Go to repository Settings → Environments
2. Create environment named: `npm-registry`
3. Optionally add protection rules (require approval, restrict branches)

## Publishing Methods

### Method 1: Automatic via Git Tag (Recommended)

This triggers the GitHub Actions workflow automatically.

```bash
# 1. Make your changes to tricorder
cd packages/tricorder

# 2. Update CHANGELOG.md
# Add a new section for the version with your changes

# 3. Run tests locally
pnpm test
pnpm build

# 4. Bump version (this updates package.json and creates a git tag)
npm version patch   # For bug fixes (1.0.0 → 1.0.1)
npm version minor   # For new features (1.0.0 → 1.1.0)
npm version major   # For breaking changes (1.0.0 → 2.0.0)

# 5. Commit the version bump
git add .
git commit -m "chore(tricorder): release v$(node -p "require('./package.json').version")"

# 6. Create tag with tricorder prefix
VERSION=$(node -p "require('./package.json').version")
git tag "tricorder-v$VERSION"

# 7. Push to GitHub (this triggers the publish workflow)
git push origin main
git push origin --tags

# 8. Check GitHub Actions
# Go to: https://github.com/TechSquidTV/TuvixRSS/actions
# The "Publish Tricorder Package" workflow should be running
```

### Method 2: Manual via GitHub UI

Useful for republishing or testing.

1. Go to: https://github.com/TechSquidTV/TuvixRSS/actions/workflows/publish-tricorder.yml
2. Click "Run workflow"
3. Select branch: `main`
4. Enter version: e.g., `1.0.1`
5. Dry run: ☐ (leave unchecked to actually publish)
6. Click "Run workflow"

### Method 3: Local Publishing (Not Recommended)

Only use this if CI/CD is unavailable.

```bash
cd packages/tricorder

# 1. Login to NPM
npm login

# 2. Build
pnpm build

# 3. Publish (this runs prepublishOnly script automatically)
npm publish

# 4. Create GitHub release manually
```

## Versioning Guidelines

Follow [Semantic Versioning](https://semver.org/):

### Patch Release (1.0.x)
Bug fixes, no API changes, no breaking changes.

**Examples:**
- Fix error handling in AppleDiscoveryService
- Improve type definitions
- Update dependencies (non-breaking)

**Command:** `npm version patch`

### Minor Release (1.x.0)
New features, backward compatible.

**Examples:**
- Add new discovery service (YouTube, Reddit)
- Add new utility functions
- Enhance telemetry options

**Command:** `npm version minor`

### Major Release (x.0.0)
Breaking changes to public API.

**Examples:**
- Change TelemetryAdapter interface
- Remove deprecated functions
- Change DiscoveryService interface

**Command:** `npm version major`

## Pre-Publish Checklist

Before publishing, verify:

- [ ] **CHANGELOG.md updated** with version and changes
- [ ] **Tests passing** (`pnpm --filter @tuvixrss/tricorder test`)
- [ ] **Type check passing** (`pnpm --filter @tuvixrss/tricorder type-check`)
- [ ] **Build successful** (`pnpm --filter @tuvixrss/tricorder build`)
- [ ] **Lint passing** (`pnpm --filter @tuvixrss/tricorder lint`)
- [ ] **Format passing** (`pnpm --filter @tuvixrss/tricorder format:check`)
- [ ] **README.md up to date** with new features/changes
- [ ] **Breaking changes documented** in CHANGELOG and README
- [ ] **Version bumped** in package.json
- [ ] **Git tag created** (if using automatic method)

## Post-Publish Checklist

After publishing:

- [ ] **Verify on NPM**: https://www.npmjs.com/package/@tuvixrss/tricorder
- [ ] **Check GitHub release**: https://github.com/TechSquidTV/TuvixRSS/releases
- [ ] **Test installation**: `npm install @tuvixrss/tricorder@latest` in a test project
- [ ] **Update API package** (if needed): Change `workspace:*` to specific version
- [ ] **Update browser extension** to use new version
- [ ] **Announce release** (Discord, Twitter, etc.)

## Troubleshooting

### "Version already published"
The workflow checks for existing versions and skips publishing. This is safe.

**Solution:** Bump version again and republish.

### "NPM_TOKEN not found"
The secret is missing or expired.

**Solution:**
1. Generate new token on npmjs.com
2. Update GitHub secret
3. Re-run workflow

### "Permission denied"
Your NPM token doesn't have access to the scope.

**Solution:**
1. For `@tuvix`: Add yourself to organization members
2. For `@techsquidtv`: Use your own username
3. Regenerate token with correct permissions

### "Tests failing in CI"
CI found issues that passed locally.

**Solution:**
1. Check GitHub Actions logs
2. Run tests locally in clean environment:
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   pnpm --filter @tuvixrss/tricorder test
   ```
3. Fix issues and try again

### "Version mismatch"
Git tag version doesn't match package.json version.

**Solution:**
1. Delete incorrect tag: `git tag -d tricorder-vX.X.X`
2. Ensure package.json version is correct
3. Create correct tag: `git tag tricorder-vX.X.X`
4. Push: `git push origin --tags`

## Rollback

If you need to unpublish a version:

```bash
# Unpublish within 72 hours (only if no one is using it)
npm unpublish @tuvixrss/tricorder@1.0.1

# After 72 hours, deprecate instead
npm deprecate @tuvixrss/tricorder@1.0.1 "Critical bug, use 1.0.2 instead"
```

**Important:** NPM doesn't allow republishing the same version. Always bump version.

## CI/CD Workflow Features

The `publish-tricorder.yml` workflow includes:

1. **Verification Stage**
   - Lints code
   - Checks formatting
   - Type checks
   - Runs tests
   - Builds package
   - Verifies package contents

2. **Publish Stage**
   - Validates version matches tag
   - Checks if version already published (skips if yes)
   - Publishes to NPM registry
   - Creates GitHub release with changelog
   - Adds release notes with NPM link

3. **Safety Features**
   - Dry-run mode for testing
   - Version validation
   - Duplicate detection
   - Environment protection
   - Automatic changelog extraction

## Package Configuration

Key files for publishing:

```
packages/tricorder/
├── package.json         # Version, name, publishConfig
├── CHANGELOG.md         # Release notes (auto-added to GitHub releases)
├── README.md            # Package documentation (shown on NPM)
├── ARCHITECTURE.md      # Design decisions (included in package)
├── tsconfig.json        # TypeScript build config
└── dist/                # Built files (generated, published to NPM)
    ├── index.js
    ├── index.d.ts
    ├── browser.js
    └── browser.d.ts
```

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

## Questions?

- **Issues:** https://github.com/TechSquidTV/TuvixRSS/issues
- **Discussions:** https://github.com/TechSquidTV/TuvixRSS/discussions
- **NPM Package:** https://www.npmjs.com/package/@tuvixrss/tricorder
