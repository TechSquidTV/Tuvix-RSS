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

# Build tricorder first (dependency of api)
RUN pnpm --filter @tuvixrss/tricorder build

# Build the application with tsup (bundles and resolves ESM)
RUN pnpm --filter @tuvixrss/api build

# Production stage
FROM node:20-alpine

# Create non-root user FIRST (before any files to avoid permission layer bloat)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Install pnpm for production dependencies
RUN npm install -g pnpm@10.19.0

# Copy package files with ownership
COPY --chown=nodejs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nodejs:nodejs packages/api/package.json ./packages/api/
COPY --chown=nodejs:nodejs packages/tricorder/package.json ./packages/tricorder/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts with correct ownership
COPY --from=builder --chown=nodejs:nodejs /app/packages/api/dist ./packages/api/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/api/drizzle ./packages/api/drizzle

# Create data directory with ownership
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

USER nodejs

# Expose the API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start the server (migrations run automatically inside node.ts)
CMD ["node", "packages/api/dist/entries/node.js"]
