#!/usr/bin/env python3
"""
Create wrangler.toml from wrangler.example.toml with D1_DATABASE_ID substitution.
This script provides robust validation similar to the CI/CD action.
"""

import os
import re
import sys
from pathlib import Path
from typing import Optional


def get_database_id_from_local(wrangler_local_path: Path) -> Optional[str]:
    """Extract database_id from wrangler.toml.local if it exists."""
    if not wrangler_local_path.exists():
        return None

    try:
        content = wrangler_local_path.read_text(encoding="utf-8")
        # Look for database_id in d1_databases section
        pattern = re.compile(r'database_id\s*=\s*"([^"]+)"')
        match = pattern.search(content)
        return match.group(1).strip() if match else None
    except Exception as e:
        print(f"⚠️  Warning: Failed to read wrangler.toml.local: {e}", file=sys.stderr)
        return None


def validate_database_id(db_id: str) -> bool:
    """Validate that database_id looks reasonable (UUID format)."""
    # D1 database IDs are UUIDs: 8-4-4-4-12 hex digits
    uuid_pattern = re.compile(
        r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    )
    return bool(uuid_pattern.match(db_id))


def main():
    # Get paths
    script_dir = Path(__file__).parent
    api_dir = script_dir.parent
    wrangler_example = api_dir / "wrangler.example.toml"
    wrangler_toml = api_dir / "wrangler.toml"
    wrangler_local = api_dir / "wrangler.toml.local"

    # Get database ID from environment or local config
    db_id = os.environ.get("D1_DATABASE_ID")
    source = "environment variable"

    if not db_id:
        db_id = get_database_id_from_local(wrangler_local)
        source = "wrangler.toml.local"

    if not db_id:
        print("❌ Error: D1_DATABASE_ID not found", file=sys.stderr)
        print(
            "   Set D1_DATABASE_ID environment variable or create wrangler.toml.local",
            file=sys.stderr,
        )
        print(
            "   See wrangler.toml.local.example for reference",
            file=sys.stderr,
        )
        sys.exit(1)

    # Trim whitespace
    db_id = db_id.strip()

    if not db_id:
        print("❌ Error: database_id is empty", file=sys.stderr)
        sys.exit(1)

    # Validate format
    if not validate_database_id(db_id):
        print(
            f"⚠️  Warning: database_id doesn't match expected UUID format: {db_id[:8]}...",
            file=sys.stderr,
        )
        print("   Continuing anyway, but this may cause issues", file=sys.stderr)

    print(f"📦 Database ID: {db_id[:8]}...{db_id[-8:]} (from {source})")

    # Check if example exists
    if not wrangler_example.exists():
        print(
            f"❌ Error: wrangler.example.toml not found at {wrangler_example}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Read example file
    print("📋 Creating wrangler.toml from wrangler.example.toml...")
    try:
        content = wrangler_example.read_text(encoding="utf-8")
    except Exception as e:
        print(f"❌ Error: Failed to read wrangler.example.toml: {e}", file=sys.stderr)
        sys.exit(1)

    # Verify placeholder exists
    placeholder = "${D1_DATABASE_ID}"
    if placeholder not in content:
        print(
            f"❌ Error: Placeholder {placeholder} not found in wrangler.example.toml",
            file=sys.stderr,
        )
        sys.exit(1)

    # Perform substitution
    substituted_content = content.replace(placeholder, db_id)

    # Verify substitution succeeded
    if placeholder in substituted_content:
        print(
            "❌ Error: Substitution failed - placeholder still present",
            file=sys.stderr,
        )
        sys.exit(1)

    # Verify database_id is not empty after substitution
    if 'database_id = ""' in substituted_content:
        print(
            "❌ Error: database_id is empty after substitution", file=sys.stderr
        )
        sys.exit(1)

    # Clean up database_id line (remove any trailing content/whitespace)
    lines = substituted_content.splitlines(keepends=False)
    found = False

    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("database_id = "):
            match = re.search(r'database_id\s*=\s*"([^"]+)"', line)
            if match:
                db_value = match.group(1).strip()
                if not db_value:
                    print("❌ Error: database_id value is empty", file=sys.stderr)
                    sys.exit(1)

                # Get indentation
                indent_match = re.match(r"^(\s*)", line)
                indent_str = indent_match.group(1) if indent_match else ""

                # Create clean line
                lines[i] = f'{indent_str}database_id = "{db_value}"'
                found = True
                break

    if not found:
        print("❌ Error: database_id line not found in file", file=sys.stderr)
        sys.exit(1)

    # Join lines
    output = "\n".join(lines)
    if output and not output.endswith("\n"):
        output += "\n"

    # Write to wrangler.toml
    try:
        wrangler_toml.write_text(output, encoding="utf-8")
    except Exception as e:
        print(f"❌ Error: Failed to write wrangler.toml: {e}", file=sys.stderr)
        sys.exit(1)

    # Verify file exists
    if not wrangler_toml.exists():
        print(
            "❌ Error: wrangler.toml disappeared after writing", file=sys.stderr
        )
        sys.exit(1)

    # Final verification - check that database_id line is properly formatted
    try:
        final_content = wrangler_toml.read_text(encoding="utf-8")
        database_id_pattern = re.compile(r'^\s*database_id\s*=\s*"[^"]+"\s*$', re.MULTILINE)

        if not database_id_pattern.search(final_content):
            print(
                "❌ Error: database_id line format verification failed",
                file=sys.stderr,
            )
            # Show the problematic line
            for line_num, line in enumerate(final_content.splitlines(), 1):
                if "database_id" in line:
                    print(f"   Line {line_num}: {repr(line)}", file=sys.stderr)
            sys.exit(1)

        # Verify no placeholder remains
        if placeholder in final_content:
            print(
                "❌ Error: Placeholder still present in final file", file=sys.stderr
            )
            sys.exit(1)

    except Exception as e:
        print(f"❌ Error: Failed to verify wrangler.toml: {e}", file=sys.stderr)
        sys.exit(1)

    print("✅ Successfully created wrangler.toml with validated database_id")
    print(f"   Source: {wrangler_example}")
    print(f"   Target: {wrangler_toml}")


if __name__ == "__main__":
    main()
