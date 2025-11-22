#!/bin/bash

# Database Migration Script for TuvixRSS
# This script runs migrations in Docker to avoid native binding issues

set -e

echo "🔄 Running database migrations..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker or run migrations manually."
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p ./data

# Run migrations using Node 20 in Docker
docker run --rm \
  -v "$(pwd):/app" \
  -w /app \
  node:20-alpine \
  sh -c "npm install -g pnpm@10.19.0 && pnpm install && npx tsx src/db/migrate-local.ts"

echo "✅ Migrations complete!"
echo "📁 Database location: ./data/tuvix.db"

