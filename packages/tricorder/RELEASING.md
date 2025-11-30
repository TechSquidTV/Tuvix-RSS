# 📦 Releasing Tricorder

Quick links for releasing new versions of `@tuvixrss/tricorder`:

## Quick Start

👉 **[RELEASE_INSTRUCTIONS.md](./RELEASE_INSTRUCTIONS.md)** - Step-by-step guide (START HERE!)

📚 **[RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md)** - Detailed workflow options and strategies

## TL;DR - GitHub Release Method

1. **Prepare release**:
   ```bash
   cd packages/tricorder
   # Update CHANGELOG.md and package.json
   git add CHANGELOG.md package.json
   git commit -m "chore(tricorder): prepare release v0.1.0"
   git push origin main
   ```

2. **Create GitHub release**:
   - Go to: https://github.com/TechSquidTV/TuvixRSS/releases/new
   - **Tag**: `tricorder-v0.1.0` ⚠️ (exact format required!)
   - **Target**: `main`
   - **Title**: `@tuvixrss/tricorder v0.1.0 - Your Title`
   - **Description**: Write your release notes
   - Click "Publish release"

3. **Workflow handles the rest**:
   - ✅ Runs tests and builds
   - ✅ Publishes to NPM
   - ✅ Your release notes stay intact

## Tag Format

**Correct**: `tricorder-v0.1.0`

The `tricorder-` prefix keeps these releases separate from your main app releases (`v0.2.2`).

## Documentation

- [README.md](./README.md) - Package documentation and usage
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [PUBLISHING.md](./PUBLISHING.md) - Publishing configuration details
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Design decisions

## Questions?

See the detailed guides linked above or ask in:
- GitHub Issues: https://github.com/TechSquidTV/TuvixRSS/issues
- GitHub Discussions: https://github.com/TechSquidTV/TuvixRSS/discussions
