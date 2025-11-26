#!/bin/bash
# List all users from Cloudflare D1 database
# Uses wrangler.toml.local via --config flag for database ID resolution

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WRANGLER_TOML_LOCAL="$API_DIR/wrangler.toml.local"
SQL_FILE="$API_DIR/scripts/list-users.sql"

# Function to extract database_id from wrangler.toml.local
get_database_id_from_local() {
  if [ -f "$WRANGLER_TOML_LOCAL" ]; then
    grep "database_id" "$WRANGLER_TOML_LOCAL" | sed 's/.*database_id = "\(.*\)".*/\1/' | head -1
  fi
}

# Get database ID from environment variable or local config (just for display)
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
echo ""

# Run the query using --config flag to load wrangler.toml.local
cd "$API_DIR"
# Read SQL and execute as command to get actual results
SQL_QUERY=$(cat "$SQL_FILE" | grep -v '^--' | tr '\n' ' ' | sed 's/  */ /g')
wrangler d1 execute tuvix --config wrangler.toml.local --remote --command "$SQL_QUERY" --json --yes 2>&1 | grep -v "WARNING\|ratelimits\|Processing wrangler.toml\|update available\|Executing on" || true
