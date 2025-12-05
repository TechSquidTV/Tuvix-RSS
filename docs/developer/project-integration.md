# Project Integration: Frontend ↔ Backend

This document explains how the TuvixRSS frontend (React app) and backend (tRPC API) are linked, how they communicate, and how types are shared between them.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Package Structure](#package-structure)
- [tRPC Client Setup](#trpc-client-setup)
- [Type Sharing Mechanism](#type-sharing-mechanism)
- [Authentication Flow](#authentication-flow)
- [API Communication](#api-communication)
- [Development Workflow](#development-workflow)
- [Build & Deployment](#build--deployment)
- [Environment Configuration](#environment-configuration)

## Architecture Overview

TuvixRSS uses a monorepo structure with two main packages:

```
TuvixRSS/
├── packages/
│   ├── api/          # tRPC backend (Node.js/Cloudflare Workers)
│   └── app/          # React frontend (Vite)
└── package.json      # Workspace root
```

### Communication Flow

```
React Component
    ↓
Custom Hook (e.g., useArticles)
    ↓
trpc.articles.list.useQuery()
    ↓
httpBatchLink
    ↓
POST /trpc/articles.list (with session cookie)
    ↓
Express/Cloudflare Adapter
    ↓
Context Middleware (DB + Better Auth session)
    ↓
Middleware Stack (auth, rate limit, permissions)
    ↓
Procedure Handler (articles.list)
    ↓
Database Query (Drizzle ORM)
    ↓
JSON Response
    ↓
TanStack Query Cache
    ↓
React Component Re-render (with typed data)
```

## Package Structure

### API Package (`packages/api`)

```
packages/api/
├── src/
│   ├── trpc/
│   │   ├── init.ts          # tRPC instance & middleware
│   │   ├── router.ts        # Main router (exports AppRouter type)
│   │   └── context.ts       # Request context
│   ├── routers/             # API endpoints
│   ├── adapters/            # Express & Cloudflare
│   ├── db/                  # Database schema & client
│   ├── auth/                # JWT & authentication
│   └── types/               # Shared types
├── package.json
└── tsconfig.json
```

**Key Export:** `AppRouter` type from `packages/api/src/trpc/router.ts`

### App Package (`packages/app`)

```
packages/app/
├── src/
│   ├── lib/
│   │   ├── api/
│   │   │   ├── trpc.ts      # tRPC client setup
│   │   │   └── hooks/       # Custom API hooks
│   │   └── utils.ts
│   ├── components/          # React components
│   ├── pages/               # Route components
│   └── main.tsx             # App entry point
├── package.json
└── tsconfig.json
```

**Key Import:** `AppRouter` type from `@tuvix/api`

## tRPC Client Setup

**Location:** `packages/app/src/lib/api/trpc.ts`

### Client Configuration

```typescript
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@tuvix/api";

// Create typed tRPC instance
export const trpc = createTRPCReact<AppRouter>();

// Create client with configuration
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_API_URL || "http://localhost:3001/trpc",
      // Better Auth handles authentication via HTTP-only cookies
      // No need to manually add Authorization headers
      headers() {
        return {};
      },
    }),
  ],
});
```

### Key Features

1. **Type Inference**
   - Imports `AppRouter` type from backend
   - Zero runtime connection - pure TypeScript type inference
   - Full autocomplete for all procedures

2. **HTTP Batch Link**
   - Batches multiple requests into single HTTP call
   - Reduces network overhead
   - Configurable URL via environment variable

3. **Authentication**
   - Better Auth handles sessions via HTTP-only cookies
   - No manual token management needed
   - Sessions automatically included in requests

4. **Type Exports**

```typescript
import type { RouterInputs, RouterOutputs } from "@trpc/react-query";

// Input types for procedures
export type ArticleListInput = RouterInputs<AppRouter>["articles"]["list"];

// Output types for procedures
export type ArticleListOutput = RouterOutputs<AppRouter>["articles"]["list"];
```

### Provider Setup

**Location:** `packages/app/src/main.tsx`

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc, trpcClient } from './lib/api/trpc'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
)
```

## Type Sharing Mechanism

TuvixRSS achieves full type safety without code generation through TypeScript's module system.

### Monorepo Configuration

**Root `package.json`:**

```json
{
  "workspaces": ["packages/api", "packages/app"]
}
```

**API `package.json`:**

```json
{
  "name": "@tuvix/api",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./dist/index.js"
    }
  }
}
```

**App `package.json`:**

```json
{
  "name": "@tuvix/app",
  "dependencies": {
    "@tuvix/api": "workspace:*"
  }
}
```

### Type Import Flow

1. **Backend exports type:**

```typescript
// packages/api/src/trpc/router.ts
export const appRouter = router({
  auth: authRouter,
  articles: articlesRouter,
  // ...
});

export type AppRouter = typeof appRouter;
```

2. **Frontend imports type:**

```typescript
// packages/app/src/lib/api/trpc.ts
import type { AppRouter } from "@tuvix/api";

export const trpc = createTRPCReact<AppRouter>();
```

3. **TypeScript resolves types at compile time:**
   - App's `tsconfig.json` includes `paths` mapping for `@tuvix/api`
   - TypeScript compiler reads types directly from source
   - No build step required for types
   - Changes to backend immediately available to frontend

### Benefits

- **No Code Generation:** No build step for types
- **Instant Updates:** Type changes reflect immediately
- **Full Type Safety:** Input/output types for all procedures
- **Autocomplete:** VSCode/IDE autocomplete for all API calls
- **Compile-Time Errors:** Invalid API calls caught before runtime

## Authentication Flow

### 1. User Registration

```typescript
// Frontend: packages/app/src/lib/hooks/useAuth.ts
export function useRegister() {
  return authClient.signUp.email.useMutation({
    onSuccess: () => {
      // Better Auth automatically creates session via HTTP-only cookie
      // Redirect to dashboard
    },
  });
}

// Usage in component:
const register = useRegister();
register.mutate({
  email: "john@example.com",
  password: "secure123",
  name: "john", // Username
});
```

Backend flow:

1. Better Auth validates input
2. Hashes password with scrypt
3. Creates user in database
4. Creates session (HTTP-only cookie)
5. Returns user data

### 2. User Login

```typescript
export function useLogin() {
  return authClient.signIn.username.useMutation({
    onSuccess: () => {
      // Better Auth automatically creates session via HTTP-only cookie
      // Redirect to dashboard
    },
  });
}

// Usage:
const login = useLogin();
login.mutate({
  username: "john",
  password: "secure123",
});
```

Backend flow:

1. Find user by username
2. Verify password with scrypt (Better Auth)
3. Check if user banned
4. Check account lockout (after maxLoginAttempts failed attempts)
5. Create session (HTTP-only cookie)
6. Log security event
7. Return user data

### 3. Session Management

Better Auth manages sessions via HTTP-only cookies. No manual token handling needed.

### 4. Session Verification (Backend)

**Location:** `packages/api/src/trpc/context.ts`

```typescript
export async function createContext({ req, env }): Promise<Context> {
  let user: AuthUser | null = null;

  // Better Auth handles session extraction from HTTP-only cookies
  const session = await auth.api.getSession({ headers: req.headers });
  if (session?.user) {
    user = {
      userId: session.user.id as number,
      username: session.user.username || session.user.name || "",
      role: (session.user.role || "user") as "user" | "admin",
    };
  }

  return {
    db: initDatabase(env),
    user,
    env,
    headers: Object.fromEntries(req.headers),
    req,
  };
}
```

### 5. Protected Procedures

```typescript
// Backend: packages/api/src/trpc/init.ts
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Check if user exists and not banned
  const user = await ctx.db.query.user.findFirst({
    where: eq(schema.user.id, ctx.user.userId),
  });

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  if (user.banned) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Account is banned",
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

### 6. Logout

```typescript
export function useLogout() {
  const queryClient = useQueryClient();

  return authClient.signOut.useMutation({
    onSuccess: () => {
      queryClient.clear(); // Clear all cached data
      // Redirect to login
    },
  });
}
```

## API Communication

### Query Example: List Articles

**Frontend Hook:**

```typescript
// packages/app/src/lib/api/hooks/useArticles.ts
export function useArticles(filters: ArticleFilters) {
  return trpc.articles.list.useQuery({
    offset: filters.page * filters.limit,
    limit: filters.limit,
    filter: filters.filter, // "all" | "unread" | "read" | "saved"
    subscriptionId: filters.subscriptionId,
    categoryId: filters.categoryId,
    searchTerm: filters.searchTerm,
  });
}
```

**Component Usage:**

```typescript
// packages/app/src/components/ArticleList.tsx
export function ArticleList() {
  const { data, isLoading, error } = useArticles({
    page: 0,
    limit: 50,
    filter: 'unread'
  })

  if (isLoading) return <Loading />
  if (error) return <Error message={error.message} />

  return (
    <div>
      {data.map(article => (
        <ArticleItem key={article.id} article={article} />
      ))}
    </div>
  )
}
```

**Type Safety:**

```typescript
// Full autocomplete and type checking
data: Article[]  // Inferred from backend
error: TRPCClientError  // Typed error
isLoading: boolean
```

### Mutation Example: Mark Article Read

**Frontend Hook:**

```typescript
export function useMarkArticleRead() {
  const queryClient = useQueryClient();

  return trpc.articles.markRead.useMutation({
    onSuccess: () => {
      // Invalidate articles cache to refetch
      queryClient.invalidateQueries(["trpc", "articles", "list"]);
    },
  });
}
```

**Component Usage:**

```typescript
export function ArticleItem({ article }) {
  const markRead = useMarkArticleRead()

  const handleMarkRead = () => {
    markRead.mutate({
      id: article.id,
      read: true
    })
  }

  return (
    <div>
      <h3>{article.title}</h3>
      <button onClick={handleMarkRead}>
        Mark as Read
      </button>
    </div>
  )
}
```

### Infinite Query Example: Infinite Scroll

```typescript
export function useInfiniteArticles(filters: ArticleFilters) {
  return trpc.articles.list.useInfiniteQuery(
    {
      limit: 50,
      filter: filters.filter,
    },
    {
      getNextPageParam: (lastPage, allPages) => {
        if (lastPage.length < 50) return undefined;
        return allPages.length * 50; // Next offset
      },
    }
  );
}

// Usage:
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  useInfiniteArticles({ filter: "unread" });
```

### Optimistic Updates

```typescript
export function useMarkArticleSaved() {
  const queryClient = useQueryClient();

  return trpc.articles.markSaved.useMutation({
    onMutate: async ({ id, saved }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(["trpc", "articles", "list"]);

      // Snapshot current value
      const previous = queryClient.getQueryData(["trpc", "articles", "list"]);

      // Optimistically update
      queryClient.setQueryData(["trpc", "articles", "list"], (old) =>
        old.map((article) =>
          article.id === id ? { ...article, saved } : article
        )
      );

      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(["trpc", "articles", "list"], context.previous);
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries(["trpc", "articles", "list"]);
    },
  });
}
```

## Development Workflow

### Starting Development Servers

**Root `package.json` scripts:**

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm dev:api\" \"pnpm dev:app\"",
    "dev:api": "pnpm --filter @tuvix/api dev",
    "dev:app": "pnpm --filter @tuvix/app dev"
  }
}
```

**Starting development:**

```bash
# Start both API and app
pnpm dev

# Or individually:
pnpm dev:api  # Starts on http://localhost:3001
pnpm dev:app  # Starts on http://localhost:5173
```

### Hot Module Replacement

- **API:** Uses `tsx watch` for automatic restart on changes
- **App:** Vite HMR for instant updates
- **Types:** TypeScript compiler watches both projects

### Type Checking

```bash
# Check types in both packages
pnpm type-check

# Individual packages
pnpm --filter @tuvix/api type-check
pnpm --filter @tuvix/app type-check
```

### Database Migrations

```bash
# Generate migration from schema changes
pnpm db:generate

# Run migrations
pnpm db:migrate
```

## Build & Deployment

### Build Process

**Root `package.json`:**

```json
{
  "scripts": {
    "build": "pnpm build:api && pnpm build:app",
    "build:api": "pnpm --filter @tuvix/api build",
    "build:app": "pnpm --filter @tuvix/app build"
  }
}
```

**Build order matters:** API must be built first for type resolution.

### API Build

```json
{
  "scripts": {
    "build": "tsc && esbuild src/adapters/express.ts --bundle --platform=node --outfile=dist/express.js"
  }
}
```

**Output:**

- `dist/express.js` - Bundled Express server
- Type declarations in `dist/`

### App Build

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

**Output:**

- `dist/` - Static files (HTML, JS, CSS)
- Optimized and minified for production

### Deployment Options

#### Option 1: Docker (Express + Static Nginx)

```dockerfile
# Multi-stage build
FROM node:20 AS builder
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./api
COPY --from=builder /app/packages/app/dist ./app
CMD ["node", "api/express.js"]
```

**Docker Compose:**

```yaml
services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_PATH=/data/tuvix.db
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - CORS_ORIGIN=https://app.tuvix.dev
    volumes:
      - ./data:/data

  app:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./packages/app/dist:/usr/share/nginx/html
    environment:
      - VITE_API_URL=https://api.tuvix.dev/trpc
```

#### Option 2: Cloudflare (Workers + Pages)

**API:** Cloudflare Workers

```bash
# Deploy API
cd packages/api
pnpm wrangler deploy
```

**App:** Cloudflare Pages

```bash
# Deploy frontend
cd packages/app
pnpm build
pnpm wrangler pages deploy dist
```

**Environment Variables (Cloudflare Dashboard):**

- `VITE_API_URL=https://api.tuvix.dev/trpc`

#### Option 3: Vercel (Serverless Functions + Static)

**API:** Vercel Serverless Functions

```json
// vercel.json
{
  "rewrites": [{ "source": "/trpc/:path*", "destination": "/api/trpc" }]
}
```

**App:** Static Site

```bash
vercel --prod
```

## Environment Configuration

### Development

**API (`.env`):**

```bash
DATABASE_PATH=./data/tuvix.db
PORT=3001
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
BETTER_AUTH_SECRET=dev-secret-change-in-production
```

**App (`.env`):**

```bash
VITE_API_URL=http://localhost:3001/trpc
```

### Production

**API:**

```bash
DATABASE_PATH=/data/tuvix.db
PORT=3001
CORS_ORIGIN=https://app.tuvix.dev,https://www.tuvix.dev
NODE_ENV=production
BETTER_AUTH_SECRET=<strong-random-secret>
BASE_URL=https://api.tuvix.dev
RESEND_API_KEY=<resend-api-key>
# Optional: For cross-subdomain cookies (if frontend and API on different subdomains)
# COOKIE_DOMAIN=tuvix.dev
```

**App:**

```bash
VITE_API_URL=https://api.tuvix.dev/trpc
```

### Environment Variable Loading

**API:**

- Node.js: Uses `dotenv` package
- Cloudflare: Configured in `wrangler.toml` or dashboard

**App:**

- Vite loads `.env` files automatically
- Variables prefixed with `VITE_` are exposed to client
- Build-time replacement (not runtime)

## Request/Response Examples

### Example 1: Login Request

**Request:**

```
POST /trpc/auth.login HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "username": "john",
  "password": "secure123"
}
```

**Response:**

```json
{
  "result": {
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### Example 2: List Articles (Authenticated)

**Request:**

```
POST /trpc/articles.list HTTP/1.1
Host: localhost:3001
Cookie: better-auth.session_token=...
Content-Type: application/json

{
  "offset": 0,
  "limit": 50,
  "filter": "unread"
}
```

**Response:**

```json
{
  "result": {
    "data": [
      {
        "id": 1,
        "title": "Article Title",
        "description": "Article description...",
        "link": "https://example.com/article",
        "pubDate": "2025-01-13T00:00:00.000Z",
        "read": false,
        "saved": false,
        "source": {
          "id": 1,
          "title": "Example Blog",
          "url": "https://example.com/feed.xml"
        }
      }
    ]
  }
}
```

### Example 3: Batch Request

tRPC batches multiple requests into a single HTTP call:

**Request:**

```
POST /trpc/articles.list,articles.markRead HTTP/1.1
Host: localhost:3001
Cookie: better-auth.session_token=...
Content-Type: application/json

[
  {
    "offset": 0,
    "limit": 50
  },
  {
    "id": 1,
    "read": true
  }
]
```

**Response:**

```json
[
  {
    "result": {
      "data": [
        /* articles */
      ]
    }
  },
  {
    "result": {
      "data": {
        "success": true
      }
    }
  }
]
```

## Error Handling

### Backend Errors

```typescript
// Backend: packages/api/src/routers/articles.ts
throw new TRPCError({
  code: "BAD_REQUEST",
  message: "Article not found",
});
```

### Frontend Error Handling

```typescript
const { data, error } = trpc.articles.list.useQuery(...)

if (error) {
  // error.data.code: 'BAD_REQUEST' | 'UNAUTHORIZED' | etc.
  // error.message: Human-readable message
  console.error(error.message)
}
```

### Error Codes

- `BAD_REQUEST` - Invalid input
- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Not authorized (e.g., suspended, not admin)
- `NOT_FOUND` - Resource not found
- `TOO_MANY_REQUESTS` - Rate limit exceeded
- `INTERNAL_SERVER_ERROR` - Server error

## Summary

The TuvixRSS frontend and backend are integrated through:

1. **Monorepo Structure:** Shared types via workspace packages
2. **tRPC:** Type-safe API calls with zero code generation
3. **TypeScript:** End-to-end type safety from database to UI
4. **TanStack Query:** Caching, invalidation, optimistic updates
5. **JWT Authentication:** Secure token-based auth
6. **Environment Variables:** Configuration for different deployments
7. **Build Pipeline:** API first, then app

This architecture provides:

- Full type safety across the stack
- Instant type updates between packages
- Excellent developer experience with autocomplete
- Flexible deployment options (Docker, Cloudflare, Vercel)
- Secure authentication and authorization
- Optimized performance with caching and batching

---

**Last Updated:** 2025-01-13
