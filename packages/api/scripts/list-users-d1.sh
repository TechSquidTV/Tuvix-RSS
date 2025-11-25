#!/bin/bash
# List all users from Cloudflare D1 database
# This script temporarily updates wrangler.toml with the database ID from wrangler.toml.local
# and then restores it after execution.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WRANGLER_TOML="$API_DIR/wrangler.toml"
WRANGLER_TOML_LOCAL="$API_DIR/wrangler.toml.local"
WRANGLER_TOML_BACKUP="$API_DIR/wrangler.toml.backup"
SQL_FILE="$API_DIR/scripts/list-users.sql"

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

# Function to restore wrangler.toml
restore_wrangler_toml() {
  if [ -f "$WRANGLER_TOML_BACKUP" ]; then
    mv "$WRANGLER_TOML_BACKUP" "$WRANGLER_TOML"
  fi
}

# Trap to ensure cleanup on exit
trap restore_wrangler_toml EXIT

# Run the query
cd "$API_DIR"
# Read SQL and execute as command to get actual results
SQL_QUERY=$(cat "$SQL_FILE" | grep -v '^--' | tr '\n' ' ' | sed 's/  */ /g')
wrangler d1 execute tuvix --remote --command "$SQL_QUERY" --json --yes 2>&1 | grep -v "WARNING\|ratelimits\|Processing wrangler.toml" || true

# Restore is handled by trap
