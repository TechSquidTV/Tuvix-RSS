#!/bin/bash

# ============================================================================
# Safe Staging Database Wipe Script (Manual/Local Use Only)
# ============================================================================
# This wrapper script provides additional safety checks before wiping the
# staging database. It validates the database name and requires explicit
# confirmation to prevent accidental production database wipes.
#
# IMPORTANT: This is for MANUAL/LOCAL use only!
# - CI/GitHub Actions should use the direct wrangler command (non-interactive)
# - This script is interactive and will fail in automated environments
#
# Usage (local development only):
#   cd packages/api
#   ./scripts/wipe-staging-safe.sh
#
# This script will:
# 1. Verify you're targeting the staging database
# 2. Show you what will be deleted
# 3. Require explicit confirmation (interactive prompts)
# 4. Execute the wipe with proper safety flags
#
# For CI/automated workflows, use:
#   wrangler d1 execute tuvix-staging --remote --env staging --file=scripts/wipe-staging.sql
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Database name validation
STAGING_DB_NAME="tuvix-staging"
PRODUCTION_DB_NAME="tuvix"

echo ""
echo "============================================================================"
echo "🚨 STAGING DATABASE WIPE SCRIPT 🚨"
echo "============================================================================"
echo ""
echo -e "${YELLOW}WARNING: This script will PERMANENTLY DELETE all data from the staging database.${NC}"
echo ""

# Verify we're in the API directory
cd "$API_DIR"

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}ERROR: wrangler is not installed or not in PATH${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Show current databases
echo "📋 Available D1 databases:"
echo ""
wrangler d1 list 2>/dev/null | grep -E "tuvix" || echo "  (No databases found matching 'tuvix')"
echo ""

# Confirm database name
echo -e "${YELLOW}Which database do you want to wipe?${NC}"
echo ""
echo "  1) $STAGING_DB_NAME (SAFE - Staging environment)"
echo -e "  2) $PRODUCTION_DB_NAME ${RED}(DANGER - Production!)${NC}"
echo "  3) Cancel"
echo ""
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        DB_NAME="$STAGING_DB_NAME"
        ENV_FLAG="--env staging"
        ;;
    2)
        echo ""
        echo -e "${RED}============================================================================${NC}"
        echo -e "${RED}🛑 PRODUCTION DATABASE WIPE BLOCKED 🛑${NC}"
        echo -e "${RED}============================================================================${NC}"
        echo ""
        echo "This script is designed for STAGING ONLY."
        echo "Wiping the production database would result in catastrophic data loss."
        echo ""
        echo "If you truly need to wipe production (e.g., for a fresh install):"
        echo "  1. Backup all data first"
        echo "  2. Verify you have a backup"
        echo "  3. Use wrangler directly (not this script)"
        echo "  4. Accept full responsibility for data loss"
        echo ""
        echo -e "${RED}This script will NOT proceed with production database wipe.${NC}"
        echo ""
        exit 1
        ;;
    3)
        echo ""
        echo "✅ Cancelled. No changes made."
        echo ""
        exit 0
        ;;
    *)
        echo ""
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        echo ""
        exit 1
        ;;
esac

# Show what will be deleted
echo ""
echo "============================================================================"
echo "📊 Current tables in $DB_NAME:"
echo "============================================================================"
echo ""

TABLES=$(wrangler d1 execute "$DB_NAME" --remote $ENV_FLAG --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" 2>/dev/null | grep -v "🌀\|Executing\|────" | sed '/^$/d' || echo "  (No tables found or database is empty)")

if [ -z "$TABLES" ] || [ "$TABLES" = "  (No tables found or database is empty)" ]; then
    echo "  ✅ Database is already empty"
    echo ""
    read -p "Database is empty. Continue anyway? (y/N): " continue_empty
    if [[ ! "$continue_empty" =~ ^[Yy]$ ]]; then
        echo ""
        echo "✅ Cancelled. No changes made."
        echo ""
        exit 0
    fi
else
    echo "$TABLES"
fi

echo ""
echo "============================================================================"
echo "⚠️  FINAL CONFIRMATION"
echo "============================================================================"
echo ""
echo -e "${RED}You are about to PERMANENTLY DELETE all data from:${NC}"
echo ""
echo "  Database: $DB_NAME"
echo "  Environment: staging"
echo ""
echo "This action CANNOT be undone."
echo ""
read -p "Type 'WIPE STAGING' to confirm (or anything else to cancel): " confirmation

if [ "$confirmation" != "WIPE STAGING" ]; then
    echo ""
    echo "✅ Cancelled. No changes made."
    echo ""
    exit 0
fi

# Execute the wipe
echo ""
echo "============================================================================"
echo "🗑️  Wiping database..."
echo "============================================================================"
echo ""

wrangler d1 execute "$DB_NAME" --remote $ENV_FLAG --file="scripts/wipe-staging.sql"

echo ""
echo "============================================================================"
echo "✅ Database wipe complete!"
echo "============================================================================"
echo ""
echo "Next steps:"
echo "  1. Apply fresh migrations: wrangler d1 migrations apply $DB_NAME --remote $ENV_FLAG"
echo "  2. Seed test data (if needed)"
echo ""
