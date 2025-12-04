#!/bin/bash
# Check GitHub Actions for updates
# Usage: ./scripts/check-gha-versions.sh

set -e

echo "Checking GitHub Actions versions..."
echo ""

# Extract all action versions from workflows
grep -r "uses: " .github/workflows/ | grep -v "^#" | sed 's/.*uses: //' | sort -u | while read -r action; do
    # Split action@version
    action_name=$(echo "$action" | cut -d'@' -f1)
    current_version=$(echo "$action" | cut -d'@' -f2)

    # Get owner and repo
    owner=$(echo "$action_name" | cut -d'/' -f1)
    repo=$(echo "$action_name" | cut -d'/' -f2)

    # Fetch latest version from GitHub API
    latest=$(curl -s "https://api.github.com/repos/$owner/$repo/releases/latest" | grep '"tag_name"' | cut -d'"' -f4)

    if [ -z "$latest" ]; then
        echo "⚠️  $action_name@$current_version (no releases found)"
    elif [ "$current_version" = "$latest" ]; then
        echo "✅ $action_name@$current_version (up to date)"
    else
        echo "⬆️  $action_name@$current_version → $latest (update available)"
    fi
done

echo ""
echo "To update manually, edit .github/workflows/*.yml"
echo "Or wait for Dependabot's monthly check"
