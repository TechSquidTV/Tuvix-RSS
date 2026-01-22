#!/bin/bash
set -e

# Get git version (tag or commit SHA)
VERSION=$(git describe --tags --always 2>/dev/null || echo "unknown")

echo "Building TuvixRSS Docker images..."
echo "Version: $VERSION"

# Export for docker-compose
export VITE_APP_VERSION="$VERSION"

# Build images
docker compose build "$@"

echo ""
echo "✅ Build complete!"
echo "   Version: $VERSION"
echo ""
echo "To start: docker compose up -d"
