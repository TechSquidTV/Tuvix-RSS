#!/bin/bash
# Comprehensive test that exactly simulates CI/CD substitution process
# This catches issues before they reach production

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
WRANGLER_TOML="$API_DIR/wrangler.toml"
# Use a realistic UUID format (36 chars)
TEST_DB_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"

echo "🧪 Testing CI/CD TOML substitution process (exact simulation)..."
echo ""

# Check if wrangler.toml exists
if [ ! -f "$WRANGLER_TOML" ]; then
  echo "❌ Error: wrangler.toml not found at $WRANGLER_TOML"
  exit 1
fi

# Store absolute path (same as CI)
WRANGLER_TOML_PATH=$(cd "$(dirname "$WRANGLER_TOML")" && pwd)/$(basename "$WRANGLER_TOML")
echo "📁 Using path: $WRANGLER_TOML_PATH"

# Verify placeholder exists
if ! grep -q '\${D1_DATABASE_ID}' "$WRANGLER_TOML_PATH"; then
  echo "❌ Error: Placeholder \${D1_DATABASE_ID} not found"
  exit 1
fi

echo "✅ Placeholder found"

# Perform substitution (exact CI process)
export D1_DATABASE_ID="$TEST_DB_ID"
envsubst '$D1_DATABASE_ID' < "$WRANGLER_TOML_PATH" > "$WRANGLER_TOML_PATH".tmp

# Verify substitution succeeded
if grep -q '\${D1_DATABASE_ID}' "$WRANGLER_TOML_PATH".tmp; then
  echo "❌ Error: Substitution failed"
  exit 1
fi

# Verify database_id is not empty
if grep -q 'database_id = ""' "$WRANGLER_TOML_PATH".tmp; then
  echo "❌ Error: database_id is empty"
  exit 1
fi

echo "✅ Substitution successful"

# Trim database ID value (same as CI)
# Use parameter expansion instead of xargs to avoid quote issues
D1_DATABASE_ID="${D1_DATABASE_ID#"${D1_DATABASE_ID%%[![:space:]]*}"}"  # Remove leading whitespace
D1_DATABASE_ID="${D1_DATABASE_ID%"${D1_DATABASE_ID##*[![:space:]]}"}"  # Remove trailing whitespace

# Clean up using reconstruction approach (same as CI)
# Extract the database ID value and reconstruct the line perfectly
DB_VALUE=$(grep '^database_id = ' "$WRANGLER_TOML_PATH".tmp | sed 's/^database_id = "\(.*\)".*/\1/')
if [ -z "$DB_VALUE" ]; then
  echo "❌ Error: Could not extract database_id value"
  exit 1
fi

# Reconstruct the line perfectly: database_id = "value" with newline
awk -v db_value="$DB_VALUE" '/^database_id = / { printf "database_id = \"%s\"\n", db_value; next } { print }' "$WRANGLER_TOML_PATH".tmp > "$WRANGLER_TOML_PATH".tmp2
mv "$WRANGLER_TOML_PATH".tmp2 "$WRANGLER_TOML_PATH".tmp

# Verify database_id line
DB_LINE=$(grep '^database_id = ' "$WRANGLER_TOML_PATH".tmp)
if [ -z "$DB_LINE" ]; then
  echo "❌ Error: database_id line not found"
  exit 1
fi

# Check for trailing whitespace
if echo "$DB_LINE" | grep -q '[[:space:]]$'; then
  echo "❌ Error: Trailing whitespace detected"
  echo "Line: $DB_LINE"
  exit 1
fi

# Verify format
if ! echo "$DB_LINE" | grep -qE '^database_id = "[^"]+"$'; then
  echo "❌ Error: Invalid format"
  echo "Line: $DB_LINE"
  exit 1
fi

echo "✅ Database ID line format correct"

# Ensure file ends with newline
if [ -s "$WRANGLER_TOML_PATH".tmp ]; then
  LAST_BYTE=$(tail -c 1 "$WRANGLER_TOML_PATH".tmp | od -An -tx1 | tr -d ' ')
  if [ "$LAST_BYTE" != "0a" ]; then
    echo "" >> "$WRANGLER_TOML_PATH".tmp
  fi
fi

# Final verification
DB_LINE_FINAL=$(grep '^database_id = ' "$WRANGLER_TOML_PATH".tmp)
LINE_COUNT=$(echo "$DB_LINE_FINAL" | wc -l)
if [ "$LINE_COUNT" -ne 1 ]; then
  echo "❌ Error: database_id line contains newlines"
  echo "Line: $DB_LINE_FINAL"
  exit 1
fi

# Check line 33 specifically (where the error occurs)
LINE_33=$(sed -n '33p' "$WRANGLER_TOML_PATH".tmp)
if [ "$LINE_33" != "$DB_LINE_FINAL" ]; then
  echo "⚠️  Warning: Line 33 doesn't match database_id line"
  echo "Line 33: $LINE_33"
  echo "DB line: $DB_LINE_FINAL"
fi

# Verify column 52 (where error points) - should be the closing quote
if [ ${#DB_LINE_FINAL} -ge 52 ]; then
  CHAR_52=$(echo "$DB_LINE_FINAL" | cut -c52)
  if [ "$CHAR_52" != '"' ]; then
    echo "⚠️  Warning: Character at column 52 is not closing quote"
    echo "Character: $CHAR_52"
    echo "Line length: ${#DB_LINE_FINAL}"
  fi
fi

# Validate with wrangler if available
if command -v wrangler &> /dev/null; then
  echo "🔍 Validating with wrangler..."
  cd "$API_DIR"
  mv "$WRANGLER_TOML" "$WRANGLER_TOML.backup"
  mv "$WRANGLER_TOML_PATH".tmp "$WRANGLER_TOML"
  
  if wrangler deploy --dry-run --outdir /tmp/wrangler-test 2>&1 > /dev/null; then
    echo "✅ Wrangler validation passed"
  else
    echo "❌ Error: Wrangler validation failed"
    wrangler deploy --dry-run --outdir /tmp/wrangler-test 2>&1 | head -20
    mv "$WRANGLER_TOML.backup" "$WRANGLER_TOML"
    rm -rf /tmp/wrangler-test 2>/dev/null || true
    exit 1
  fi
  
  mv "$WRANGLER_TOML" "$WRANGLER_TOML_PATH".tmp
  mv "$WRANGLER_TOML.backup" "$WRANGLER_TOML"
  rm -rf /tmp/wrangler-test 2>/dev/null || true
fi

# Clean up
rm -f "$WRANGLER_TOML_PATH".tmp

echo ""
echo "✅ All CI/CD simulation tests passed!"

