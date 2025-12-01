#!/bin/bash

# Deploy Script with wrangler.example.toml Pattern
# Creates wrangler.toml from example and substitutes database_id using Python validation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

# Use Python script for robust config creation with validation
# Note: set -e will automatically exit if this fails
echo "📋 Creating wrangler.toml from wrangler.example.toml..."
python3 "$SCRIPT_DIR/create-wrangler-config.py"

# Deploy
echo ""
echo "🚀 Deploying to Cloudflare Workers..."
cd "$API_DIR"
npx wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Note: wrangler.toml was created for this deployment and is gitignored."
echo "      It will be recreated on next deployment from wrangler.example.toml"
