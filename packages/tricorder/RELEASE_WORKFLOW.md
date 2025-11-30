# Tricorder Release Workflow

This document explains how to manage releases for the tricorder package, including options for managing release notes like you do for the API/App.

## Release Tracks

Your repository has **two independent release tracks**:

### 1. API/App Releases
- **Tags**: `v0.2.2`, `v0.2.1`, `v0.1.0`, etc.
- **Covers**: API and App changes
- **Workflow**: `deploy-cloudflare.yml`
- **Releases**: https://github.com/TechSquidTV/TuvixRSS/releases (main releases)

### 2. Tricorder Package Releases (New)
- **Tags**: `tricorder-v0.1.0`, `tricorder-v0.1.1`, etc.
- **Covers**: Only tricorder package changes
- **Workflow**: `publish-tricorder.yml`
- **NPM**: https://www.npmjs.com/package/@tuvixrss/tricorder
- **Releases**: https://github.com/TechSquidTV/TuvixRSS/releases (tagged with `tricorder-v*`)

## Release Methods

You have **three options** for managing tricorder releases:

---

## Option 1: Automatic Release (Simplest)

Let the workflow handle everything automatically.

### Steps:

```bash
cd packages/tricorder

# 1. Update CHANGELOG.md with your changes
# Add entries under ## [Unreleased], then move to new version section

# 2. Commit changes
git add CHANGELOG.md package.json
git commit -m "chore(tricorder): release v0.1.0"

# 3. Create and push tag
git tag tricorder-v0.1.0
git push origin main --tags
```

### What Happens:
1. ✅ Tag triggers `publish-tricorder.yml` workflow
2. ✅ Runs all checks (lint, test, build)
3. ✅ Publishes to NPM
4. ✅ Creates GitHub release with CHANGELOG content
5. ✅ Release appears in GitHub UI

### Pros:
- ✅ Fully automated
- ✅ CHANGELOG is single source of truth
- ✅ No manual steps after push

### Cons:
- ❌ Release notes come from CHANGELOG (not curated)
- ❌ Less control over presentation

---

## Option 2: Manual Release First (Like API/App) ⭐ RECOMMENDED

Create the GitHub release manually with curated notes, then let workflow publish to NPM.

### Steps:

```bash
# 1. Update CHANGELOG.md and package.json
cd packages/tricorder
# Edit CHANGELOG.md with your changes
# Edit package.json version to match
git add CHANGELOG.md package.json
git commit -m "chore(tricorder): prepare release v0.1.0"
git push origin main

# 2. Create GitHub release via UI (RECOMMENDED)
# See RELEASE_INSTRUCTIONS.md for detailed step-by-step
```

### Via GitHub UI (Recommended):

1. **Go to**: https://github.com/TechSquidTV/TuvixRSS/releases/new

2. **Choose a tag**: Type `tricorder-v0.1.0` (GitHub will create this tag)
   - ⚠️ **IMPORTANT**: Must be exactly `tricorder-v0.1.0` format
   - Select target: `main`

3. **Release title**: `@tuvixrss/tricorder v0.1.0 - Initial Release`

4. **Description**: Write your curated release notes (see template in RELEASE_INSTRUCTIONS.md)

5. **Click**: "Publish release"

### Or via GitHub CLI:

```bash
gh release create tricorder-v0.1.0 \
  --title "@tuvixrss/tricorder v0.1.0 - Initial Release" \
  --notes "## What's Changed
* Extracted feed discovery into standalone package by @KyleTryon
* Added zero-overhead optional telemetry
* Fixed instanceof error checking for better minification support
* Full TypeScript support with comprehensive documentation

## Installation
\`\`\`bash
npm install @tuvixrss/tricorder
\`\`\`

## NPM Package
https://www.npmjs.com/package/@tuvixrss/tricorder/v/0.1.0

**Full Changelog**: https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md"
```

### ⚠️ Tag Format is Critical

**Must be**: `tricorder-v0.1.0` (with `tricorder-` prefix and `v`)

**NOT**:
- ❌ `v0.1.0` (conflicts with API/App releases)
- ❌ `tricorder-0.1.0` (missing `v`)
- ❌ `0.1.0` (no prefix)

### What Happens:
1. ✅ Creating release creates the tag
2. ✅ Tag triggers `publish-tricorder.yml` workflow
3. ✅ Workflow publishes to NPM
4. ✅ Workflow detects existing release (won't overwrite)
5. ✅ You edit release to add NPM link after publish

### Pros:
- ✅ Full control over release notes
- ✅ Can add PR links, screenshots, highlights
- ✅ Same format as your API/App releases

### Cons:
- ❌ Two-step process (create release, then edit to add NPM link)
- ❌ More manual work

---

## Option 3: Dry-Run Then Tag (Safest)

Test the workflow first, then create the release.

### Steps:

```bash
# 1. Prepare release locally
cd packages/tricorder
# Update CHANGELOG.md and package.json
git add CHANGELOG.md package.json
git commit -m "chore(tricorder): release v0.1.0"
git push origin main

# 2. Test with dry-run via GitHub UI
# Go to: https://github.com/TechSquidTV/TuvixRSS/actions/workflows/publish-tricorder.yml
# Click "Run workflow"
# - Branch: main
# - Version: 0.1.0
# - Dry run: ✅ CHECK THIS
# - Click "Run workflow"

# 3. Verify dry-run passed, then create tag
git tag tricorder-v0.1.0
git push origin --tags
```

### What Happens:
1. ✅ Dry-run tests everything without publishing
2. ✅ You verify build/tests pass
3. ✅ Tag triggers real publish
4. ✅ Workflow creates release automatically

### Pros:
- ✅ Test before publish
- ✅ Catch issues early
- ✅ Still automatic release creation

### Cons:
- ❌ Requires GitHub UI interaction
- ❌ Two-step process

---

## Recommended Workflow (Hybrid)

Combine Option 2 and automation for best of both worlds:

```bash
# 1. Prepare release
cd packages/tricorder
# Update CHANGELOG.md
git add CHANGELOG.md package.json
git commit -m "chore(tricorder): release v0.1.0"
git push origin main

# 2. Create draft release via CLI
gh release create tricorder-v0.1.0 \
  --title "@tuvixrss/tricorder v0.1.0" \
  --draft \
  --generate-notes

# 3. Edit draft in GitHub UI to curate notes
# Go to: https://github.com/TechSquidTV/TuvixRSS/releases
# Edit the draft release, add highlights, organize PRs

# 4. Publish the release
# This creates the tag and triggers workflow
# Workflow publishes to NPM
# You can then add NPM link to release description
```

---

## Release Note Template

Use this template for manual releases:

```markdown
## What's Changed
* Feature description by @username in #PR
* Bug fix description by @username in #PR
* Documentation update by @username in #PR

## Installation
\`\`\`bash
npm install @tuvixrss/tricorder@0.1.0
\`\`\`

## Documentation
- [README](https://github.com/TechSquidTV/TuvixRSS/tree/main/packages/tricorder#readme)
- [CHANGELOG](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md)
- [NPM Package](https://www.npmjs.com/package/@tuvixrss/tricorder/v/0.1.0)

**Full Changelog**: https://github.com/TechSquidTV/TuvixRSS/compare/tricorder-v0.0.0...tricorder-v0.1.0
```

---

## Version Bumping

### Semantic Versioning

- **Patch (0.1.x)**: Bug fixes, no breaking changes
  ```bash
  npm version patch
  ```

- **Minor (0.x.0)**: New features, backward compatible
  ```bash
  npm version minor
  ```

- **Major (x.0.0)**: Breaking API changes
  ```bash
  npm version major
  ```

### Manual Version Update

```bash
# Edit package.json manually
"version": "0.1.0"

# Edit CHANGELOG.md
## [0.1.0] - 2025-01-30

# Commit
git add package.json CHANGELOG.md
git commit -m "chore(tricorder): bump version to 0.1.0"
```

---

## Publishing Checklist

Before creating a release:

- [ ] **CHANGELOG.md updated** with all changes
- [ ] **Version bumped** in package.json
- [ ] **Tests passing** locally (`pnpm --filter @tuvixrss/tricorder test`)
- [ ] **Build successful** (`pnpm --filter @tuvixrss/tricorder build`)
- [ ] **Committed** to main branch
- [ ] **NPM_TOKEN** configured in GitHub secrets

After publishing:

- [ ] **Verify NPM**: https://www.npmjs.com/package/@tuvixrss/tricorder
- [ ] **Check GitHub release**: https://github.com/TechSquidTV/TuvixRSS/releases
- [ ] **Test installation**: `npm install @tuvixrss/tricorder@0.1.0`
- [ ] **Update API** if needed (change `workspace:*` to specific version)

---

## Viewing Releases

### All Releases
```bash
gh release list
```

### Tricorder Releases Only
```bash
gh release list | grep tricorder
```

### API/App Releases Only
```bash
gh release list | grep -v tricorder
```

---

## Managing Multiple Release Tracks

### Separate Release Pages (Future)

You could create a separate GitHub repository just for tricorder releases:
- `TechSquidTV/tricorder` - Public package repo with releases
- `TechSquidTV/TuvixRSS` - Main app repo with releases

Benefits:
- Clear separation
- Better discoverability for package users
- Separate issue tracking

Drawbacks:
- More repos to manage
- Split development history

### Single Repo with Tags (Current - Recommended)

Keep everything in one repo, use tag prefixes:
- `v0.2.2` - API/App releases
- `tricorder-v0.1.0` - Tricorder releases

Benefits:
- Unified development
- Shared issues/PRs
- Easier to cross-reference

Current approach: **Single repo with tag prefixes** ✅

---

## Example Release Scenarios

### Scenario 1: Bug Fix in Tricorder

```bash
# 1. Fix the bug
cd packages/tricorder
# Make changes

# 2. Update CHANGELOG
## [0.1.1] - 2025-02-01
### Fixed
- Fixed Apple Podcasts discovery for international URLs

# 3. Bump version
npm version patch  # 0.1.0 → 0.1.1

# 4. Commit and tag
git add .
git commit -m "fix(tricorder): Apple Podcasts international URLs"
git tag tricorder-v0.1.1
git push origin main --tags
```

### Scenario 2: New Feature in Tricorder

```bash
# 1. Add feature
cd packages/tricorder
# Implement YouTube discovery service

# 2. Update CHANGELOG
## [0.2.0] - 2025-02-15
### Added
- YouTube channel and playlist RSS discovery

# 3. Bump version
npm version minor  # 0.1.1 → 0.2.0

# 4. Create release with notes
gh release create tricorder-v0.2.0 \
  --title "@tuvixrss/tricorder v0.2.0 - YouTube Support" \
  --notes "Added YouTube discovery service for channels and playlists"

# Workflow handles NPM publish
```

### Scenario 3: Release Both API and Tricorder

```bash
# If changes affect both:

# 1. Release tricorder first
cd packages/tricorder
git tag tricorder-v0.2.0
git push origin --tags

# 2. Wait for NPM publish

# 3. Update API to use new version (optional)
cd packages/api
# Change workspace:* to ^0.2.0 in package.json

# 4. Release API/App
git tag v0.3.0
git push origin --tags
```

---

## Troubleshooting

### Release Already Exists

If you create a manual release first, the workflow won't overwrite it:

```
✅ Release already exists - skipping creation
```

This is expected and safe.

### Wrong Tag Format

Tags must be: `tricorder-v0.1.0` (with `tricorder-` prefix)

Incorrect:
- ❌ `v0.1.0` (conflicts with API/App)
- ❌ `tricorder-0.1.0` (missing `v`)
- ❌ `0.1.0` (no prefix)

### Workflow Not Triggering

Check:
1. Tag pushed to remote: `git push origin --tags`
2. Tag format correct: `tricorder-v0.1.0`
3. Workflow file exists: `.github/workflows/publish-tricorder.yml`

---

## Summary

**For v0.1.0 initial release, I recommend:**

1. ✅ Files already prepared (CHANGELOG, package.json updated to 0.1.0)
2. ✅ Use **Option 2** (Manual release first) for better control
3. ✅ Create release via GitHub UI with curated notes
4. ✅ Let workflow publish to NPM automatically
5. ✅ Edit release to add NPM link after publish

**For future releases:**
- Use **Option 1** (Automatic) for quick bug fixes
- Use **Option 2** (Manual) for major feature releases
- Use **Option 3** (Dry-run) when uncertain

Choose what works best for your workflow! The system is flexible.
