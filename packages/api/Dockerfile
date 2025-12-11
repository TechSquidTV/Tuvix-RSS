FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, bcrypt)
# Python and build tools are required when prebuilt binaries aren't available
RUN apk add --no-cache python3 make g++

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

# Build tricorder first (dependency of api)
RUN pnpm --filter @tuvixrss/tricorder build

# Build the application with tsup (bundles and resolves ESM)
RUN pnpm --filter @tuvixrss/api build

# Use pnpm deploy to create a self-contained production package
# This properly resolves workspace dependencies and includes only prod deps
RUN pnpm --filter @tuvixrss/api deploy /app/deploy --prod

# Copy built artifacts to deploy directory
RUN cp -r /app/packages/api/dist /app/deploy/dist && \
    cp -r /app/packages/api/drizzle /app/deploy/drizzle

# Production stage
FROM node:20-alpine

# Create non-root user FIRST (before any files to avoid permission layer bloat)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy the deployed package from builder (self-contained with all prod deps)
COPY --from=builder --chown=nodejs:nodejs /app/deploy ./

# Create data directory with ownership
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

USER nodejs

# Expose the API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the server (migrations run automatically inside node.ts)
CMD ["node", "dist/entries/node.js"]
