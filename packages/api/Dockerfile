FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.19.0

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package files
COPY packages/api/package.json ./packages/api/
COPY packages/tricorder/package.json ./packages/tricorder/

# Install all dependencies (includes workspace deps)
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code for all needed packages
COPY packages/api ./packages/api
COPY packages/tricorder ./packages/tricorder

# Build the application with tsup (bundles and resolves ESM)
RUN pnpm --filter @tuvixrss/api build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.19.0

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package files
COPY packages/api/package.json ./packages/api/
COPY packages/tricorder/package.json ./packages/tricorder/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files from builder
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/drizzle ./packages/api/drizzle

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose the API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the server (migrations run automatically inside node.ts)
CMD ["node", "packages/api/dist/entries/node.js"]
