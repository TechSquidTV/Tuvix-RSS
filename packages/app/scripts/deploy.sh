#!/bin/bash

# Frontend Deployment Script for Cloudflare Pages
# Builds and deploys the frontend to Cloudflare Pages

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Default project name (can be overridden with PAGES_PROJECT_NAME env var)
PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-tuvix-app}"

echo "🚀 Deploying frontend to Cloudflare Pages..."
echo "📦 Project: $PAGES_PROJECT_NAME"

# Check if VITE_API_URL is set
if [ -z "$VITE_API_URL" ]; then
  echo "⚠️  Warning: VITE_API_URL not set"
  echo "   Using default: http://localhost:3001/trpc"
  echo "   Set VITE_API_URL environment variable for production deployment"
fi

# Build the frontend
echo "🔨 Building frontend..."
cd "$APP_DIR"
pnpm run build

# Check if dist directory exists
if [ ! -d "dist" ]; then
  echo "❌ Error: dist directory not found after build"
  exit 1
fi

# Deploy to Cloudflare Pages
echo "📤 Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name="$PAGES_PROJECT_NAME"

echo "✅ Deployment complete!"
echo "🌐 Check your deployment at: https://$PAGES_PROJECT_NAME.pages.dev"
echo "   Or your custom domain if configured"

