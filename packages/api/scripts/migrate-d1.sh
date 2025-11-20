#!/bin/bash

# D1 Migration Script with Local Config Support
# Handles database_id substitution from wrangler.toml.local or D1_DATABASE_ID env var

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
WRANGLER_TOML="$API_DIR/wrangler.toml"
WRANGLER_TOML_LOCAL="$API_DIR/wrangler.toml.local"
WRANGLER_TOML_BACKUP="$API_DIR/wrangler.toml.backup"

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
elif DB_ID=$(get_database_id_from_local); then
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

# Backup original wrangler.toml
cp "$WRANGLER_TOML" "$WRANGLER_TOML_BACKUP"

# Substitute database_id in wrangler.toml
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/\${D1_DATABASE_ID}/$DB_ID/g" "$WRANGLER_TOML"
else
  # Linux
  sed -i "s/\${D1_DATABASE_ID}/$DB_ID/g" "$WRANGLER_TOML"
fi

# Run migrations
echo "🔄 Running D1 migrations..."
cd "$API_DIR"
mkdir -p migrations
cp drizzle/*.sql migrations/ 2>/dev/null || true
wrangler d1 migrations apply tuvix --remote
rm -rf migrations

# Restore original wrangler.toml
mv "$WRANGLER_TOML_BACKUP" "$WRANGLER_TOML"

echo "✅ Migrations complete!"

