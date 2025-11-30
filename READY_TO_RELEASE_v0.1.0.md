# Ready to Release @tuvixrss/tricorder v0.1.0

Everything is prepared and ready to publish! Here's what you need to do.

## ✅ What's Ready

1. **Package Configuration**: `@tuvixrss/tricorder` scope, version 0.1.0
2. **CHANGELOG**: Updated with initial release notes + instanceof fix
3. **Workflows**: CI + Publish workflows configured with path filtering
4. **Documentation**: Complete release guides created
5. **All Tests Passing**: Ready to go!

## 🎯 Release Process (3 Simple Steps)

### Step 1: Commit the Prepared Changes

```bash
# From repository root
git add .
git commit -m "chore(tricorder): prepare release v0.1.0

- Update package name to @tuvixrss/tricorder
- Set version to 0.1.0
- Add CHANGELOG entry for initial release
- Configure NPM publishing workflows
- Add release documentation
"
git push origin main
```

### Step 2: Create GitHub Release

**Go to**: https://github.com/TechSquidTV/TuvixRSS/releases/new

**Fill in**:

1. **Choose a tag**: `tricorder-v0.1.0` (type this exactly!)
   - Target: `main`
   - ⚠️ **Critical**: Must be `tricorder-v0.1.0` format

2. **Release title**: `@tuvixrss/tricorder v0.1.0 - Initial Release`

3. **Describe this release**:

   ````markdown
   Initial release of the Tricorder feed discovery library! 🎉

   ## What's Changed

   - Extracted feed discovery into standalone `@tuvixrss/tricorder` package
   - Platform-agnostic design supporting Node.js, browsers, and Chrome extensions
   - Zero-overhead optional telemetry via dependency injection
   - Extensible plugin-based architecture for discovery services
   - Fixed error type checking to use proper `instanceof` for better minification support

   ## Features

   - **AppleDiscoveryService** - iTunes Search API integration for Apple Podcasts
   - **StandardDiscoveryService** - Universal feed discovery
     - Path extension detection (`.rss`, `.atom`, `.xml`)
     - Common feed path checking (`/feed`, `/rss`, `/atom`, etc.)
     - HTML link tag parsing
   - **Full TypeScript support** with comprehensive type definitions
   - **Zero telemetry overhead** when not used (~0.01ms)
   - **Sentry integration** when telemetry adapter provided

   ## Installation

   ```bash
   npm install @tuvixrss/tricorder
   ```
   ````

   ## Quick Start

   ```typescript
   import { discoverFeeds } from "@tuvixrss/tricorder";

   const feeds = await discoverFeeds("https://example.com");
   console.log(`Found ${feeds.length} feeds`);
   ```

   ## Documentation
   - [README](https://github.com/TechSquidTV/TuvixRSS/tree/main/packages/tricorder#readme)
   - [CHANGELOG](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md)
   - [Architecture](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/ARCHITECTURE.md)
   - [API Documentation](https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/README.md#api)

   ## NPM Package

   https://www.npmjs.com/package/@tuvixrss/tricorder/v/0.1.0

   ## Use Cases
   - **TuvixRSS API** - Server-side feed discovery with Sentry tracing
   - **Browser Extensions** - Zero-overhead feed detection in Chrome/Firefox
   - **RSS Readers** - Automatic feed discovery from any URL
   - **Feed Aggregators** - Batch feed discovery with telemetry

   **Full Changelog**: https://github.com/TechSquidTV/TuvixRSS/blob/main/packages/tricorder/CHANGELOG.md

   ```

   ```

4. **Options**:
   - [ ] Set as a pre-release (leave unchecked)
   - [x] Set as the latest release (check this!)

5. **Click**: "Publish release" 🚀

### Step 3: Monitor & Verify

1. **Watch GitHub Actions**:
   - Go to: https://github.com/TechSquidTV/TuvixRSS/actions
   - "Publish Tricorder Package" should start immediately
   - Wait for green checkmark (usually 2-3 minutes)

2. **Verify NPM**:
   - Visit: https://www.npmjs.com/package/@tuvixrss/tricorder
   - Should show version 0.1.0
   - Download count will start at 0

3. **Test Installation**:
   ```bash
   # In a test directory
   npm install @tuvixrss/tricorder@0.1.0
   node -e "import('@tuvixrss/tricorder').then(m => console.log('✅ Works!', Object.keys(m)))"
   ```

## 🎉 You're Done!

The package is now:

- ✅ Published on NPM
- ✅ Released on GitHub with your notes
- ✅ Ready for browser extension
- ✅ Documented and versioned

## 📋 Files Changed (For Your Review)

**Core Package**:

- `packages/tricorder/package.json` - Version 0.1.0, @tuvixrss scope
- `packages/tricorder/CHANGELOG.md` - v0.1.0 release notes

**API Integration**:

- `packages/api/package.json` - Updated tricorder dependency
- `packages/api/src/routers/subscriptions.ts` - Fixed instanceof, updated imports
- `packages/api/src/adapters/sentry-telemetry.ts` - Updated import

**CI/CD**:

- `.github/workflows/ci-tricorder.yml` - Path-filtered CI (NEW)
- `.github/workflows/publish-tricorder.yml` - NPM publishing (NEW)
- `.github/workflows/README.md` - Updated with tricorder workflows

**Documentation**:

- `packages/tricorder/RELEASING.md` - Quick release guide (NEW)
- `packages/tricorder/RELEASE_INSTRUCTIONS.md` - Step-by-step instructions (NEW)
- `packages/tricorder/RELEASE_WORKFLOW.md` - Detailed workflow options (NEW)
- `packages/tricorder/PUBLISHING.md` - Updated scope
- `packages/tricorder/README.md` - Updated scope throughout
- `docs/architecture/tricorder-npm-publishing.md` - Architecture overview (NEW)

## ⚠️ Before You Start

Make sure you have:

- [ ] **NPM account** with `@tuvixrss` organization created
- [ ] **NPM_TOKEN** added to GitHub secrets
- [ ] **All changes reviewed** (run `git status` and `git diff`)
- [ ] **Tests passing** locally (`pnpm --filter @tuvixrss/tricorder test`)

## 🔑 Required GitHub Secret

If not already added:

1. Go to: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Generate new token (Automation type)
3. Copy the token
4. Go to: https://github.com/TechSquidTV/TuvixRSS/settings/secrets/actions
5. Click "New repository secret"
6. Name: `NPM_TOKEN`
7. Value: (paste token)
8. Click "Add secret"

## 📚 Reference Documentation

- **Quick Guide**: `packages/tricorder/RELEASING.md`
- **Step-by-Step**: `packages/tricorder/RELEASE_INSTRUCTIONS.md`
- **Full Workflow**: `packages/tricorder/RELEASE_WORKFLOW.md`
- **Architecture**: `docs/architecture/tricorder-npm-publishing.md`

## 🆘 Need Help?

Check the troubleshooting sections in:

- `RELEASE_INSTRUCTIONS.md` - Common issues and fixes
- `PUBLISHING.md` - Technical publishing details

## 🎯 Tag Format Reference

**For Tricorder Releases**: `tricorder-v0.1.0`
**For API/App Releases**: `v0.2.2`

This keeps them separate in the releases page!

---

**Ready to publish?** Just follow the 3 steps above! 🚀

The workflow will handle all the technical details:

- ✅ Run tests
- ✅ Build package
- ✅ Publish to NPM
- ✅ Update GitHub release
- ✅ Create version tag

You just create the release with your custom notes! 📝
