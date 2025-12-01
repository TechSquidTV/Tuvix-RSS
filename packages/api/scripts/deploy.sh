#!/bin/bash

# Deploy Script with wrangler.example.toml Pattern
# Creates wrangler.toml from example and substitutes database_id from wrangler.toml.local or D1_DATABASE_ID env var

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
WRANGLER_TOML="$API_DIR/wrangler.toml"
WRANGLER_EXAMPLE="$API_DIR/wrangler.example.toml"
WRANGLER_TOML_LOCAL="$API_DIR/wrangler.toml.local"

# Function to extract database_id from wrangler.toml.local
get_database_id_from_local() {
  if [ -f "$WRANGLER_TOML_LOCAL" ]; then
    grep -A 3 "\[\[d1_databases\]\]" "$WRANGLER_TOML_LOCAL" | grep "database_id" | sed 's/.*database_id = "\(.*\)".*/\1/' | head -1
  fi
}

# Get database ID from environment variable or local config
if [ -n "$D1_DATABASE_ID" ]; then
  DB_ID="$D1_DATABASE_ID"
  echo "Using D1_DATABASE_ID from environment variable"
elif DB_ID=$(get_database_id_from_local) && [ -n "$DB_ID" ]; then
  echo "Using database_id from wrangler.toml.local"
else
  echo "❌ Error: D1_DATABASE_ID not found"
  echo "   Set D1_DATABASE_ID environment variable or create wrangler.toml.local"
  echo "   See wrangler.toml.local.example for reference"
  exit 1
fi

if [ -z "$DB_ID" ]; then
  echo "❌ Error: database_id is empty"
  exit 1
fi

echo "📦 Database ID: $DB_ID"

# Check if wrangler.example.toml exists
if [ ! -f "$WRANGLER_EXAMPLE" ]; then
  echo "❌ Error: wrangler.example.toml not found at $WRANGLER_EXAMPLE"
  exit 1
fi

# Create wrangler.toml from example
echo "📋 Creating wrangler.toml from wrangler.example.toml..."
cp "$WRANGLER_EXAMPLE" "$WRANGLER_TOML"

# Substitute database_id in wrangler.toml
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/\${D1_DATABASE_ID}/$DB_ID/g" "$WRANGLER_TOML"
else
  # Linux
  sed -i "s/\${D1_DATABASE_ID}/$DB_ID/g" "$WRANGLER_TOML"
fi

echo "✅ Created wrangler.toml with substituted database_id"

# Deploy
echo "🚀 Deploying to Cloudflare Workers..."
cd "$API_DIR"
npx wrangler deploy

echo "✅ Deployment complete!"
echo ""
echo "Note: wrangler.toml was created for this deployment and is gitignored."
echo "      It will be recreated on next deployment from wrangler.example.toml"
