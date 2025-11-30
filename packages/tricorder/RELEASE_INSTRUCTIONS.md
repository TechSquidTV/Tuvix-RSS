# Quick Release Instructions - GitHub Release Method

This is the streamlined guide for releasing tricorder using the GitHub release UI (like you do for API/App).

## Step-by-Step Release Process

### Step 1: Prepare Release Locally

```bash
cd packages/tricorder

# 1. Update CHANGELOG.md
# Add your changes under ## [Unreleased], then create new version section:
# ## [0.1.0] - 2025-01-30
# ### Added
# - Your changes here

# 2. Update version in package.json
# Change "version": "0.1.0"

# 3. Commit changes
git add CHANGELOG.md package.json
git commit -m "chore(tricorder): prepare release v0.1.0"

# 4. Push to main
git push origin main
```

**⚠️ IMPORTANT**: Do **NOT** create the git tag yet! The GitHub release will create it for you.

---

### Step 2: Create GitHub Release

1. **Go to the Releases Page**:
   - Navigate to: https://github.com/TechSquidTV/TuvixRSS/releases/new
   - Or click "Releases" from repo homepage → "Draft a new release"

2. **Fill in the Release Form**:

   **Choose a tag:**
   ```
   tricorder-v0.1.0
   ```
   - Type this exactly: `tricorder-v0.1.0` (with the `tricorder-` prefix!)
   - Select target: `main`
   - GitHub will show "✓ Excellent! This tag will be created from the target when you publish this release."

   **Release title:**
   ```
   @tuvixrss/tricorder v0.1.0 - Initial Release
   ```

   **Describe this release:**
   ```markdown
   Initial release of the Tricorder feed discovery library!

   ## What's Changed
   * Extracted feed discovery into standalone `@tuvixrss/tricorder` package
   * Platform-agnostic design supporting Node.js, browsers, and Chrome extensions
   * Zero-overhead optional telemetry via dependency injection
   * Extensible plugin-based architecture for discovery services
   * Fixed error type checking to use proper `instanceof` for better minification support

   ## Features
   - **AppleDiscoveryService** - iTunes Search API for Apple Podcasts
   - **StandardDiscoveryService** - Universal feed discovery (path detection, HTML parsing)
   - **Full TypeScript support** with comprehensive type definitions
   - **Zero telemetry overhead** when not used (~0.01ms)

   ## Installation
   ```bash
   npm install @tuvixrss/tricorder
   ```

   ## Documentation
   - [README](https://github.com/TechSquidTV/TuvixRSS/tree/main/packages/tricorder#readme)
   - [CHANGELOG](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md)
   - [Architecture](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/ARCHITECTURE.md)

   ## NPM Package
   https://www.npmjs.com/package/@tuvixrss/tricorder/v/0.1.0

   **Full Changelog**: https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md
   ```

   **Options:**
   - [ ] Set as a pre-release (leave unchecked for stable release)
   - [ ] Set as the latest release (check this!)

3. **Click "Publish release"**

---

### Step 3: What Happens Automatically

1. ✅ **Tag Created**: GitHub creates the `tricorder-v0.1.0` tag on `main` branch
2. ✅ **Workflow Triggered**: The tag triggers `.github/workflows/publish-tricorder.yml`
3. ✅ **CI Checks**: Workflow runs lint, format, type-check, test, build
4. ✅ **NPM Publish**: Package is published to https://www.npmjs.com/package/@tuvixrss/tricorder
5. ✅ **Release Updated**: Workflow detects existing release (won't overwrite your notes)
6. ✅ **Done!**: Package is live on NPM, release is on GitHub

---

### Step 4: Monitor the Workflow

1. **Watch the Action**:
   - Go to: https://github.com/TechSquidTV/TuvixRSS/actions
   - Look for "Publish Tricorder Package" workflow
   - Should start within 1 minute of creating the release

2. **Check for Success**:
   - Green checkmark = Success ✅
   - Red X = Failed ❌ (check logs)

3. **Expected Output**:
   ```
   ✅ Version matches: 0.1.0
   ✅ Version 0.1.0 is not published yet
   📦 Successfully published @tuvixrss/tricorder@0.1.0
   🔗 https://www.npmjs.com/package/@tuvixrss/tricorder/v/0.1.0
   ✅ Release already exists - skipping creation
   ```

---

### Step 5: Verify Publication

1. **Check NPM**:
   - Visit: https://www.npmjs.com/package/@tuvixrss/tricorder
   - Should show version 0.1.0
   - Verify package contents look correct

2. **Test Installation**:
   ```bash
   # In a test directory
   npm install @tuvixrss/tricorder@0.1.0

   # Test import
   node -e "import('@tuvixrss/tricorder').then(m => console.log('✅ Import works:', Object.keys(m)))"
   ```

3. **Check GitHub Release**:
   - Go to: https://github.com/TechSquidTV/TuvixRSS/releases
   - Your release should be visible with your custom notes
   - Tag `tricorder-v0.1.0` should exist

---

## Tag Format Rules

**✅ Correct Tag Format:**
```
tricorder-v0.1.0
tricorder-v0.1.1
tricorder-v0.2.0
tricorder-v1.0.0
```

**❌ Incorrect (Won't Work):**
```
v0.1.0           # Missing tricorder- prefix (conflicts with API/App releases)
tricorder-0.1.0  # Missing 'v' after tricorder-
0.1.0            # No prefix at all
tricorder/v0.1.0 # Wrong separator
```

**Why the `tricorder-` prefix?**
- Your main app uses tags like `v0.2.2`
- Tricorder needs its own namespace: `tricorder-v0.1.0`
- This keeps the release lists separate and organized

---

## Version Numbering Guide

Follow [Semantic Versioning](https://semver.org/):

### Patch Release (0.1.x)
**For:** Bug fixes, no API changes
```
tricorder-v0.1.0 → tricorder-v0.1.1
```
**Examples:**
- Fixed Apple Podcasts discovery
- Improved error messages
- Updated dependencies (non-breaking)

### Minor Release (0.x.0)
**For:** New features, backward compatible
```
tricorder-v0.1.1 → tricorder-v0.2.0
```
**Examples:**
- Added YouTube discovery service
- New utility functions
- Enhanced telemetry options

### Major Release (x.0.0)
**For:** Breaking changes
```
tricorder-v0.2.0 → tricorder-v1.0.0
```
**Examples:**
- Changed TelemetryAdapter interface
- Removed deprecated functions
- Changed DiscoveryService API

---

## Release Checklist

### Before Creating Release:

- [ ] **Local changes committed and pushed**
  ```bash
  git status  # Should be clean or changes pushed
  ```

- [ ] **CHANGELOG.md updated** with version and changes
- [ ] **package.json version** matches release version
- [ ] **Tests passing locally**
  ```bash
  pnpm --filter @tuvixrss/tricorder test
  ```

- [ ] **Build successful**
  ```bash
  pnpm --filter @tuvixrss/tricorder build
  ```

- [ ] **NPM_TOKEN configured** in GitHub secrets
  - Settings → Secrets and variables → Actions → NPM_TOKEN

### After Creating Release:

- [ ] **Workflow completed successfully** (check GitHub Actions)
- [ ] **Package visible on NPM**
- [ ] **Test installation works**
- [ ] **GitHub release shows your notes**
- [ ] **Tag created** (visible in repo)

---

## Troubleshooting

### "Workflow didn't trigger"

**Check:**
1. Tag format is correct: `tricorder-v0.1.0`
2. Tag was created (go to Tags page)
3. Workflow file exists: `.github/workflows/publish-tricorder.yml`

**Fix:**
- Delete and recreate the release with correct tag format

### "Version already published"

**Meaning:** This version already exists on NPM.

**Fix:**
1. Bump version to next number
2. Update CHANGELOG and package.json
3. Create new release with new version

### "NPM_TOKEN not found"

**Meaning:** GitHub secret is missing or expired.

**Fix:**
1. Generate new token on npmjs.com (Automation type)
2. Add to GitHub: Settings → Secrets and variables → Actions
3. Re-run the workflow

### "Permission denied" on NPM

**Meaning:** Your NPM token doesn't have access to `@tuvixrss` scope.

**Fix:**
1. Verify you're a member of `@tuvixrss` organization on NPM
2. Regenerate token with correct permissions
3. Update GitHub secret

### "Tests failing in CI"

**Meaning:** Tests pass locally but fail in GitHub Actions.

**Fix:**
1. Check the Actions logs for specific error
2. Run tests in clean environment locally:
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   pnpm --filter @tuvixrss/tricorder test
   ```
3. Fix the issue, commit, delete release/tag, try again

---

## Quick Reference

### Create Release
```
Tag: tricorder-v0.1.0
Title: @tuvixrss/tricorder v0.1.0 - Your Title
Target: main
```

### Monitor Progress
```
https://github.com/TechSquidTV/TuvixRSS/actions
```

### Check NPM
```
https://www.npmjs.com/package/@tuvixrss/tricorder
```

### View Releases
```bash
# All releases
gh release list

# Tricorder only
gh release list | grep tricorder

# API/App only
gh release list | grep -v tricorder
```

### Delete Release (if needed)
```bash
# Delete release and tag
gh release delete tricorder-v0.1.0 --yes
git push origin --delete tricorder-v0.1.0
```

---

## Example Release Notes Template

Copy and customize this for future releases:

```markdown
Brief description of what's in this release.

## What's Changed
* Feature/fix description by @username in #PR
* Another change by @username in #PR

## Features (for feature releases)
- New feature 1
- New feature 2

## Installation
```bash
npm install @tuvixrss/tricorder@0.1.0
```

## Documentation
- [README](https://github.com/TechSquidTV/TuvixRSS/tree/main/packages/tricorder#readme)
- [CHANGELOG](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md)

## NPM Package
https://www.npmjs.com/package/@tuvixrss/tricorder/v/0.1.0

**Full Changelog**: https://github.com/TechSquidTV/TuvixRSS/compare/tricorder-v0.0.0...tricorder-v0.1.0
```

---

## Next Steps After v0.1.0

1. ✅ Release is published
2. Update API package (optional):
   ```json
   // packages/api/package.json
   "@tuvixrss/tricorder": "^0.1.0"  // Instead of workspace:*
   ```
3. Use in browser extension:
   ```bash
   npm install @tuvixrss/tricorder
   ```
4. Announce release (Discord, Twitter, etc.)
5. Monitor for issues from users

---

## Summary

**To release tricorder:**
1. ✅ Commit CHANGELOG + package.json changes
2. ✅ Go to GitHub releases → "Draft a new release"
3. ✅ Tag: `tricorder-v0.1.0` | Target: `main`
4. ✅ Write release notes
5. ✅ Click "Publish release"
6. ✅ Workflow publishes to NPM automatically
7. ✅ Done!

**The key is the tag format:** `tricorder-v0.1.0` 🎯

This keeps tricorder releases separate from your main app releases (`v0.2.2`).
