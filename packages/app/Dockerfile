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
COPY packages/app/package.json ./packages/app/
COPY packages/api/package.json ./packages/api/
COPY packages/tricorder/package.json ./packages/tricorder/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/app ./packages/app

# Build arguments
ARG VITE_API_URL=http://localhost:3001/trpc
ARG VITE_APP_VERSION
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# Build the application
RUN pnpm --filter @tuvixrss/app build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html

# Create non-root user for nginx
RUN addgroup -g 1001 -S nginx-app && \
    adduser -S nginx-app -u 1001 && \
    chown -R nginx-app:nginx-app /usr/share/nginx/html && \
    chown -R nginx-app:nginx-app /var/cache/nginx && \
    chown -R nginx-app:nginx-app /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx-app:nginx-app /var/run/nginx.pid

# Create nginx configuration for SPA routing and health check
# Listen on port 8080 (non-privileged) since we run as non-root user
RUN echo 'server { \
    listen 8080; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Health check endpoint \
    location /health { \
        return 200 "ok"; \
        add_header Content-Type text/plain; \
    } \
    \
    # Main app - SPA routing \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

USER nginx-app

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
