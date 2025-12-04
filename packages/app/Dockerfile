FROM node:20-alpine AS builder

WORKDIR /app

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

# Build argument for API URL
ARG VITE_API_URL=http://localhost:3001/trpc
ENV VITE_API_URL=${VITE_API_URL}

# Build the application
RUN pnpm --filter @tuvixrss/app build

# Production stage with nginx
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/packages/app/dist /usr/share/nginx/html

# Create nginx configuration for SPA routing and health check
RUN echo 'server { \
    listen 80; \
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

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
