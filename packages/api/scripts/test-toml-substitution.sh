#!/bin/bash
# Test script to validate TOML substitution process (simulates CI/CD)
# This helps catch TOML syntax errors before they reach production

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
WRANGLER_TOML="$API_DIR/wrangler.toml"
TEST_DB_ID="test-uuid-12345678-1234-1234-1234-123456789012"

echo "🧪 Testing TOML substitution process..."
echo ""

# Check if wrangler.toml exists
if [ ! -f "$WRANGLER_TOML" ]; then
  echo "❌ Error: wrangler.toml not found at $WRANGLER_TOML"
  exit 1
fi

# Check if placeholder exists
if ! grep -q '\${D1_DATABASE_ID}' "$WRANGLER_TOML"; then
  echo "❌ Error: Placeholder \${D1_DATABASE_ID} not found in wrangler.toml"
  exit 1
fi

echo "✅ Placeholder found in wrangler.toml"

# Perform substitution (simulating envsubst)
echo "🔄 Performing substitution..."
export D1_DATABASE_ID="$TEST_DB_ID"
envsubst '$D1_DATABASE_ID' < "$WRANGLER_TOML" > "$WRANGLER_TOML.test"

# Verify substitution succeeded
if grep -q '\${D1_DATABASE_ID}' "$WRANGLER_TOML.test"; then
  echo "❌ Error: Substitution failed - placeholder still present"
  rm -f "$WRANGLER_TOML.test"
  exit 1
fi

# Verify database_id is not empty
if grep -q 'database_id = ""' "$WRANGLER_TOML.test"; then
  echo "❌ Error: database_id is empty after substitution"
  rm -f "$WRANGLER_TOML.test"
  exit 1
fi

echo "✅ Substitution successful"

# Clean up trailing whitespace (same as CI/CD)
echo "🧹 Cleaning up trailing whitespace..."
sed -i '' 's/^\(database_id = ".*"\)[[:space:]]*$/\1/' "$WRANGLER_TOML.test" 2>/dev/null || \
sed -i 's/^\(database_id = ".*"\)[[:space:]]*$/\1/' "$WRANGLER_TOML.test"

# Verify database_id line format
DB_LINE=$(grep '^database_id = ' "$WRANGLER_TOML.test")
if [ -z "$DB_LINE" ]; then
  echo "❌ Error: database_id line not found after substitution"
  rm -f "$WRANGLER_TOML.test"
  exit 1
fi

# Check for trailing whitespace
if echo "$DB_LINE" | grep -q '[[:space:]]$'; then
  echo "❌ Error: Trailing whitespace detected on database_id line"
  echo "Line: $DB_LINE"
  rm -f "$WRANGLER_TOML.test"
  exit 1
fi

echo "✅ Database ID line format correct: $DB_LINE"

# Validate TOML syntax using wrangler if available
if command -v wrangler &> /dev/null; then
  echo "🔍 Validating TOML syntax with wrangler..."
  cd "$API_DIR"
  
  # Temporarily replace wrangler.toml for validation
  mv "$WRANGLER_TOML" "$WRANGLER_TOML.backup"
  mv "$WRANGLER_TOML.test" "$WRANGLER_TOML"
  
  # Validate using wrangler
  if wrangler deploy --dry-run --outdir /tmp/wrangler-test 2>&1 > /dev/null; then
    echo "✅ TOML syntax validated successfully by wrangler"
  else
    echo "❌ Error: TOML validation failed"
    echo "Wrangler output:"
    wrangler deploy --dry-run --outdir /tmp/wrangler-test 2>&1 | head -20
    mv "$WRANGLER_TOML.backup" "$WRANGLER_TOML"
    rm -rf /tmp/wrangler-test 2>/dev/null || true
    exit 1
  fi
  
  # Restore original file
  mv "$WRANGLER_TOML" "$WRANGLER_TOML.test"
  mv "$WRANGLER_TOML.backup" "$WRANGLER_TOML"
  rm -rf /tmp/wrangler-test 2>/dev/null || true
else
  echo "⚠️  wrangler not found, skipping TOML validation"
fi

# Clean up
rm -f "$WRANGLER_TOML.test"

echo ""
echo "✅ All tests passed! TOML substitution process is valid."

