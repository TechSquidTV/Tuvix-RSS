#!/bin/bash
# Delete all non-admin users from Cloudflare D1 database
# This script temporarily updates wrangler.toml with the database ID from wrangler.toml.local
# and then restores it after execution.
#
# WARNING: This will permanently delete all users with role != 'admin'
# This action cannot be undone!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
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

# First, show which users will be deleted
echo ""
echo "⚠️  WARNING: This will permanently delete all non-admin users!"
echo "   This action cannot be undone!"
echo ""
echo "📋 Fetching current users..."
cd "$API_DIR"
USERS_JSON=$(wrangler d1 execute tuvix --remote --command "SELECT id, name, email, role FROM user ORDER BY id;" --json --yes 2>&1 | grep -v "WARNING\|ratelimits\|Processing wrangler.toml" || true)

# Extract non-admin users
NON_ADMIN_USERS=$(echo "$USERS_JSON" | python3 -c "
import sys
import json
try:
    data = json.load(sys.stdin)
    if data and len(data) > 0 and 'results' in data[0]:
        users = data[0]['results']
        non_admin = [u for u in users if u.get('role') != 'admin']
        admin_count = len([u for u in users if u.get('role') == 'admin'])
        if non_admin:
            print('Non-admin users to be deleted:')
            for u in non_admin:
                print(f\"  - ID {u['id']}: {u['name']} ({u['email']})\")
            print(f\"\\nTotal: {len(non_admin)} non-admin user(s) will be deleted\")
            print(f\"Admin users ({admin_count}) will be preserved\")
        else:
            print('✅ No non-admin users found. Nothing to delete.')
            sys.exit(0)
    else:
        print('❌ Could not parse user data.')
        sys.exit(1)
except Exception as e:
    print(f'❌ Error parsing JSON: {e}')
    sys.exit(1)
" 2>&1)

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ Error: Could not fetch users or parse response"
  echo "$USERS_JSON"
  exit 1
fi

echo "$NON_ADMIN_USERS"
echo ""

# If no non-admin users found, exit early
if echo "$NON_ADMIN_USERS" | grep -q "No non-admin users found"; then
  exit 0
fi

# Check for --yes flag to skip confirmation (check all arguments)
SKIP_CONFIRM=false
for arg in "$@"; do
  if [ "$arg" = "--yes" ] || [ "$arg" = "-y" ]; then
    SKIP_CONFIRM=true
    break
  fi
done

# Confirm deletion (unless --yes flag is provided)
if [ "$SKIP_CONFIRM" = false ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  DESTRUCTIVE ACTION CONFIRMATION REQUIRED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  read -p "Type 'DELETE' (all caps) to confirm deletion: " CONFIRM
  if [ "$CONFIRM" != "DELETE" ]; then
    echo ""
    echo "❌ Deletion cancelled. No users were deleted."
    exit 0
  fi
  echo ""
else
  echo "⚠️  --yes flag provided, skipping confirmation..."
  echo ""
fi

# Delete non-admin users
# The SQL will cascade delete related data automatically
echo ""
echo "🗑️  Deleting non-admin users..."
SQL_QUERY="
-- Delete verification tokens for non-admin users
DELETE FROM verification WHERE identifier IN (SELECT email FROM user WHERE role != 'admin');

-- Delete audit logs for non-admin users
DELETE FROM security_audit_log WHERE user_id IN (SELECT id FROM user WHERE role != 'admin');

-- Delete API usage logs for non-admin users
DELETE FROM api_usage_log WHERE user_id IN (SELECT id FROM user WHERE role != 'admin');

-- Delete non-admin users (cascade will handle related data)
DELETE FROM user WHERE role != 'admin';
"

RESULT=$(wrangler d1 execute tuvix --remote --command "$SQL_QUERY" --json --yes 2>&1 | grep -v "WARNING\|ratelimits\|Processing wrangler.toml" || true)

# Check if deletion was successful
if echo "$RESULT" | grep -q '"success":\s*true'; then
  echo "✅ Successfully deleted non-admin users!"
  echo ""
  echo "Remaining users:"
  wrangler d1 execute tuvix --remote --command "SELECT id, name, email, role FROM user ORDER BY id;" --json --yes 2>&1 | grep -v "WARNING\|ratelimits\|Processing wrangler.toml" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
else
  echo "❌ Error deleting users:"
  echo "$RESULT"
  exit 1
fi

# Restore is handled by trap

