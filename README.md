# Tuvix

**Take back your feed.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![codecov](https://codecov.io/gh/TechSquidTV/Tuvix-RSS/branch/main/graph/badge.svg)](https://codecov.io/gh/TechSquidTV/Tuvix-RSS)

Tuvix is a modern RSS aggregator that helps you follow all your favorite blogs, podcasts, and news sources in one place. It's not a social network, it's not an algorithmic feed, it's just old-fashioned RSS.

<div align="center">
  <video src="https://github.com/user-attachments/assets/2977b151-6a0f-4e9f-a0ee-6d039f935b5a" width="400" />
</div>

## Hosted

Head over to **[tuvix.app](https://tuvix.app)** to create your free account and start reading!

Immediately begin subscribing to your favorite feeds. Remember, you can always export your data to OPML and migrate to your own self-hosted instance, or any other RSS reader.

---

## 🚀 Deployment

Tuvix supports two deployment methods:

- **🐳 Docker Compose** - Self-hosted with containers
- **☁️ Cloudflare** - Serverless edge deployment (Workers + Pages)

See the **[Deployment Guide](./docs/deployment.md)** for detailed instructions.

### Quick Start (Docker)

```bash
git clone https://github.com/TechSquidTV/Tuvix-RSS.git
cd Tuvix-RSS
cp env.example .env
# Edit .env and set BETTER_AUTH_SECRET (generate: openssl rand -base64 32)
docker compose up -d
```

Visit `http://localhost:5173` to access your instance.

### Development Setup

**Prerequisites:** Node.js 20+ (with pnpm), SQLite3

```bash
pnpm install
cp env.example .env
# Edit .env and set BETTER_AUTH_SECRET
pnpm run db:migrate
pnpm run dev
```

App: `http://localhost:5173` | API: `http://localhost:3001`

---

## 👨‍💻 Development

### Git Workflow

Tuvix uses a **trunk-based development** workflow with branch protection:

- **`main`** - Production-ready code, protected, deploys to production
- **`dev`** - Active development branch, protected, deploys to staging
- **Feature branches** - Created from `dev`, merged back via PR

**Development Process:**
1. Create feature branches from `dev`: `git checkout -b feature/my-feature`
2. Open PRs targeting `dev` for review and CI checks
3. After approval, changes merge to `dev` and deploy to staging
4. Periodic releases merge `dev` → `main` for production deployment

### Configuration

**Required:** `BETTER_AUTH_SECRET` (generate: `openssl rand -base64 32`)

**Optional:** `DATABASE_PATH`, `PORT`, `CORS_ORIGIN`

See `env.example` for all options.

---

## 📚 Documentation

- **[Documentation Index](./docs/README.md)** - Complete guide
- **[Deployment Guide](./docs/deployment.md)** - Docker & Cloudflare Workers
- **[tRPC API Architecture](./docs/developer/trpc-api-architecture.md)** - API reference
- **[Project Integration](./docs/developer/project-integration.md)** - Frontend-backend guide

---

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### Quick Start for Contributors

1. Fork the repository
2. Checkout the `dev` branch: `git checkout dev`
3. Create your feature branch: `git checkout -b feature/amazing-feature`
4. Make your changes and test them
5. Commit using [conventional commits](https://www.conventionalcommits.org/): `git commit -m 'feat: add amazing feature'`
6. Push to your fork: `git push origin feature/amazing-feature`
7. Open a Pull Request targeting the `dev` branch

### Before Contributing

- Read our [Contributing Guide](CONTRIBUTING.md) for detailed guidelines
- Check out our [Code of Conduct](CODE_OF_CONDUCT.md)
- Browse [existing issues](https://github.com/TechSquidTV/Tuvix-RSS/issues) or create a new one
- Join our community discussions

### Good First Issues

New to the project? Look for issues tagged with `good first issue` to get started!

### Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/Tuvix-RSS.git
cd Tuvix-RSS
git checkout dev
pnpm install
cp env.example .env
# Edit .env and set BETTER_AUTH_SECRET (generate: openssl rand -base64 32)
pnpm run db:migrate
pnpm run dev
```

See the [Contributing Guide](CONTRIBUTING.md) and [developer documentation](./docs/developer/) for more details.

---

## 📄 License

AGPLv3 - see the [LICENSE](./LICENSE) file for details.

---

Made with ❤️ by the TechSquidTV community
