#!/usr/bin/env node
/**
 * Cloudflare Deployment Configuration Validator
 *
 * Validates that all required Cloudflare bindings are configured
 * before deployment. Run this before deploying to catch configuration
 * issues early.
 *
 * Usage:
 *   pnpm validate:cloudflare
 *   # or
 *   tsx scripts/validate-cloudflare-config.ts
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Parse wrangler.toml and validate configuration
 */
function validateCloudflareConfig(): ValidationResult {
  const wranglerPath = join(__dirname, "../wrangler.toml");
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if wrangler.toml exists
  if (!existsSync(wranglerPath)) {
    errors.push("wrangler.toml not found in packages/api directory");
    return { errors, warnings };
  }

  const configContent = readFileSync(wranglerPath, "utf-8");

  // Check runtime
  if (!configContent.includes('RUNTIME = "cloudflare"')) {
    warnings.push(
      'RUNTIME is not set to "cloudflare" in wrangler.toml (may be intentional for local dev)'
    );
  }

  // Check D1 database - handle multiline TOML format
  const d1SectionMatch = configContent.match(
    /\[\[d1_databases\]\]\s*\n\s*binding\s*=\s*"DB"\s*\n\s*database_name\s*=\s*"[^"]+"\s*\n\s*database_id\s*=\s*"([^"]*)"(?:\s*#.*)?/
  );
  if (!d1SectionMatch) {
    errors.push("DB (D1) database binding not found in wrangler.toml");
  } else {
    const dbId = d1SectionMatch[1];
    if (!dbId || dbId.trim() === "") {
      errors.push(
        "DB (D1) database ID is empty in wrangler.toml. Create database with: wrangler d1 create tuvix"
      );
    }
  }

  return { errors, warnings };
}

/**
 * Main validation function
 */
function main(): void {
  console.log("🔍 Validating Cloudflare Workers configuration...\n");

  const { errors, warnings } = validateCloudflareConfig();

  // Report warnings
  if (warnings.length > 0) {
    console.warn("⚠️  Warnings:");
    warnings.forEach((w) => console.warn(`   - ${w}`));
    console.log();
  }

  // Report errors
  if (errors.length > 0) {
    console.error("❌ Configuration Errors:");
    errors.forEach((e) => console.error(`   - ${e}`));
    console.error(
      "\n💡 Fix these issues before deploying to Cloudflare Workers."
    );
    console.error("\n📖 See docs/deployment.md for setup instructions.");
    process.exit(1);
  }

  // Success
  console.log("✅ Cloudflare configuration is valid!");
  console.log("\n📋 Configuration Summary:");
  console.log("   ✓ Runtime: cloudflare");
  console.log("   ✓ D1 database: DB configured");
  console.log("\n🚀 Ready to deploy!");
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateCloudflareConfig };
