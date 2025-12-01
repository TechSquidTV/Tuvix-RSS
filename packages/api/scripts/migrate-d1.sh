#!/bin/bash

# D1 Migration Script with wrangler.example.toml Pattern
# Creates wrangler.toml from example and substitutes database_id using Python validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

# Use Python script for robust config creation with validation
# Note: set -e will automatically exit if this fails
echo "📋 Creating wrangler.toml from wrangler.example.toml..."
python3 "$SCRIPT_DIR/create-wrangler-config.py"

# Run migrations
echo ""
echo "🔄 Running D1 migrations..."
cd "$API_DIR"
mkdir -p migrations
cp drizzle/*.sql migrations/ 2>/dev/null || true
wrangler d1 migrations apply tuvix --remote
rm -rf migrations

echo ""
echo "✅ Migrations complete!"
echo ""
echo "Note: wrangler.toml was created for this migration and is gitignored."
echo "      It will be recreated on next migration from wrangler.example.toml"
