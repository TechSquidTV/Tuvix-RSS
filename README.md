# Tuvix

**Take back your feed.**

Tuvix is a modern RSS aggregator that helps you follow all your favorite blogs, podcasts, and news sources in one place. It's not a social network, it's not an algorithmic feed, it's just what the early internet was supposed to be.

## 🚀 Try it Now

Head over to **[tuvix.app](https://tuvix.app)** to create your free account and start reading!

No installation needed - just sign up and start adding your favorite RSS feeds.

---

## 🏠 Self-Hosting

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

### Configuration

**Required:** `BETTER_AUTH_SECRET` (generate: `openssl rand -base64 32`)

**Optional:** `DATABASE_PATH`, `PORT`, `CORS_ORIGIN`

See `env.example` for all options.

---

## 📚 Documentation

- **[Documentation Index](./docs/README.md)** - Complete guide
- **[Deployment Guide](./docs/deployment.md)** - Docker & Cloudflare Workers
- **[tRPC API Architecture](./docs/trpc-api-architecture.md)** - API reference
- **[Project Integration](./docs/project-integration.md)** - Frontend-backend guide

---

## 🤝 Contributing

1. Fork the repository
2. Checkout the `dev` branch: `git checkout dev`
3. Create your feature branch: `git checkout -b feature/amazing-feature`
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request targeting the `dev` branch

See the [developer documentation](./docs/developer/) for detailed contributor guidelines.

---

## 🐛 Troubleshooting

**Port already in use:** Change `PORT` in `.env`

**Database locked:** `pnpm run db:reset`

**Need help?** [Open an issue](https://github.com/techsquidtv/TuvixRSS/issues)

---

## 📄 License

MIT - feel free to use Tuvix for personal or commercial projects!

_But_ we would _appreciate_ a link back to [tuvix.app](https://tuvix.app) if you do!

---

Made with ❤️ by the Tuvix community
