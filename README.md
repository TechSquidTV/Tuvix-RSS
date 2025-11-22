# TuvixRSS

Self-hosted RSS aggregator that merges sources into new feeds.

## Quick Start

### Prerequisites

- Node.js 20+ (with pnpm)
- SQLite3

### Installation

```bash
# Install all dependencies
pnpm install
```

### Development

```bash
# Run both API and frontend in development mode
pnpm run dev

# Or run separately:
pnpm run dev:api    # tRPC API on :3001
pnpm run dev:app    # Frontend on :5173
```

---

## Available Scripts

### **Development**

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `pnpm run dev`     | Run both API and app in parallel          |
| `pnpm run dev:api` | Run tRPC API server with hot reload (tsx) |
| `pnpm run dev:app` | Run Vite dev server for frontend          |

### **Building**

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `pnpm run build`     | Build both API and app for production |
| `pnpm run build:api` | Build TypeScript API to `api/dist`    |
| `pnpm run build:app` | Build frontend to `app/dist`          |

### **Starting Production Build**

| Command              | Description                       |
| -------------------- | --------------------------------- |
| `pnpm run start:api` | Run production API server         |
| `pnpm run start:app` | Preview production frontend build |

### **API Documentation**

The API uses tRPC with end-to-end TypeScript type safety. No separate API documentation is needed as types are automatically inferred from the backend.

**API Endpoint:** `http://localhost:3001/trpc`

### **Testing**

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `pnpm run test`     | Run all tests (API + frontend) |
| `pnpm run test:api` | Run API tests (TypeScript)     |
| `pnpm run test:app` | Run frontend tests             |

### **Linting & Formatting**

| Command               | Description                       |
| --------------------- | --------------------------------- |
| `pnpm run lint`       | Lint both API and app             |
| `pnpm run lint:api`   | Lint API code (TypeScript/ESLint) |
| `pnpm run lint:app`   | Lint frontend code                |
| `pnpm run format:api` | Format API code (Prettier)        |

### **Database Management**

| Command                  | Description                             |
| ------------------------ | --------------------------------------- |
| `pnpm run db:generate`   | Generate Drizzle migrations from schema |
| `pnpm run db:migrate`    | Run database migrations (local SQLite)  |
| `pnpm run db:migrate:d1` | Run migrations on Cloudflare D1         |
| `pnpm run db:studio`     | Open Drizzle Studio (database GUI)      |
| `pnpm run db:push`       | Push schema changes directly to DB      |

### **Docker**

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `pnpm run docker:build` | Build Docker images            |
| `pnpm run docker:up`    | Start containers in background |
| `pnpm run docker:down`  | Stop containers                |
| `pnpm run docker:logs`  | View container logs            |

### **Cleanup**

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `pnpm run clean`     | Remove build artifacts and databases     |
| `pnpm run clean:all` | Remove everything including node_modules |

---

## Project Structure

```
TuvixRSS/
├── packages/
│   ├── api/              # tRPC TypeScript backend
│   │   ├── src/
│   │   │   ├── adapters/   # Express & Cloudflare Workers adapters
│   │   │   ├── auth/       # JWT, password hashing, security
│   │   │   ├── cron/       # Scheduled tasks (RSS fetching)
│   │   │   ├── db/         # Drizzle ORM schema & client
│   │   │   ├── routers/    # tRPC procedure definitions
│   │   │   ├── services/   # Business logic
│   │   │   ├── trpc/       # tRPC initialization
│   │   │   ├── types/      # TypeScript types & Zod schemas
│   │   │   └── utils/      # Utility functions
│   │   ├── drizzle/      # Database migrations
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── app/              # React + TanStack Router frontend
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── lib/          # Utilities & hooks
│       │   │   ├── api/      # tRPC client
│       │   │   └── hooks/    # React Query hooks
│       │   └── routes/       # TanStack Router routes
│       ├── public/
│       ├── package.json
│       └── vite.config.ts
├── data/                 # SQLite database (gitignored)
├── package.json          # Root scripts
└── docker-compose.yml
```

---

## Configuration

### Environment Variables

TuvixRSS is configured entirely through environment variables.

**Setup:**

```bash
# Copy the example file
cp .env.example .env

# Edit with your values (especially BETTER_AUTH_SECRET)
vim .env
```

**Required:**

- `BETTER_AUTH_SECRET` - Secret key for Better Auth (generate: `openssl rand -base64 32`)

**Optional (with defaults):**

- `DATABASE_PATH` - Database location (default: `../../data/tuvix.db` from api directory)
- `PORT` - API port (default: `3001`)
- `TUVIX_ENV` - Environment: `dev` or `prod` (default: `dev`)
- `CORS_ORIGIN` - Allowed CORS origin (default: `http://localhost:5173`)
- `FETCH_INTERVAL_MINUTES` - Feed fetch interval (default: `60`)

See `.env.example` for all options with detailed documentation.

### Docker Configuration

Set environment variables in `docker-compose.yml` or create a `.env` file in the project root:

```env
BETTER_AUTH_SECRET=your-generated-secret-here
DATABASE_PATH=/app/data/tuvix.db
```

The docker-compose.yml already includes sensible defaults. You only need to set `BETTER_AUTH_SECRET` for production deployments.

**Migration from config.yml:**
If you were using `config.yml`, copy your settings to `.env` and update paths:

- `database_path: /config/tuvix.db` → `DATABASE_PATH=/app/data/tuvix.db` (Docker)
- `database_path: ./config/tuvix.db` → `DATABASE_PATH=../../data/tuvix.db` (local dev)
- Remove the `./config:/config` volume mount from your docker-compose.yml

### Frontend Configuration

The frontend connects to the API via Vite proxy (configured in `app/vite.config.ts`).

---

## 📚 Documentation

Comprehensive documentation is available in the [`docs/`](./docs/) directory:

- **[Documentation Index](./docs/README.md)** - Complete navigation guide
- **[Deployment Guide](./docs/deployment.md)** - Docker & Cloudflare Workers deployment
- **[tRPC API Architecture](./docs/trpc-api-architecture.md)** - Complete API reference
- **[Project Integration](./docs/project-integration.md)** - Frontend-backend integration guide
- **[API Package README](./packages/api/README.md)** - API package documentation

---

## API Documentation

The API uses tRPC with end-to-end TypeScript type safety. All API endpoints are available through the tRPC router at `/trpc`. Type definitions are automatically inferred from the backend, providing full type safety in the frontend.

### **Key Routers**

| Category          | Procedures                                   |
| ----------------- | -------------------------------------------- |
| **Auth**          | `auth.register`, `auth.login`, `auth.me`     |
| **Subscriptions** | `subscriptions.*` (CRUD operations)          |
| **Articles**      | `articles.*` with filtering, read/save state |
| **Categories**    | `categories.*` (CRUD)                        |
| **Feeds**         | `feeds.*` (CRUD for public RSS feeds)        |
| **Settings**      | `userSettings.*` (GET, PUT)                  |
| **Public**        | `feeds.getPublicFeed` (RSS XML)              |

---

## Development Workflow

### **1. First Time Setup**

```bash
# Install all dependencies
pnpm install

# Run database migrations
pnpm run db:migrate
```

### **2. Daily Development**

```bash
# Start both API and frontend
pnpm run dev

# Run tests
pnpm run test
```

### **3. Before Committing**

```bash
# Format and lint
pnpm run format:api
pnpm run lint

# Run tests
pnpm run test
```

### **4. Production Build**

```bash
# Build everything
pnpm run build

# Run production build
pnpm run start:api
pnpm run start:app
```

---

## Docker Deployment

```bash
# Build and start
pnpm run docker:build
pnpm run docker:up

# View logs
pnpm run docker:logs

# Stop
pnpm run docker:down
```

**For complete deployment documentation including Cloudflare Workers, cron configuration, and production workflows, see [docs/deployment.md](./docs/deployment.md)**

---

## Features

- Subscribe to RSS/Atom feeds
- Organize with categories
- Create custom public RSS feeds
- Mark articles as read/saved
- Background feed fetching
- tRPC API with end-to-end TypeScript type safety
- JWT authentication
- SQLite database with WAL mode

---

## Authentication

The API uses JWT-based authentication. Authentication is handled automatically by the tRPC client when using the frontend. For direct API access, include a Bearer token in the Authorization header.

The tRPC client handles authentication automatically - tokens are stored and sent with each request after login.

---

## License

MIT

---

## > Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## Troubleshooting

### **Port already in use**

```bash
# Change PORT in .env file
PORT=3002
```

### **Database locked error**

```bash
# Stop all running instances and reset
pnpm run db:reset
```

### **Migrating from config.yml to environment variables**

If you were previously using `config.yml`:

1. Create `.env` file from `.env.example`: `cp .env.example .env`
2. Copy your settings from `config.yml` to `.env`
3. Update database path:
   - Docker: `database_path: /config/tuvix.db` → `DATABASE_PATH=/app/data/tuvix.db`
   - Local dev: `database_path: ./config/tuvix.db` → `DATABASE_PATH=../../data/tuvix.db`
4. If using Docker, remove the `./config:/config` volume mount from `docker-compose.yml`
5. Delete old `config.yml` files

---

## Support

For issues, please open a GitHub issue with:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version)
