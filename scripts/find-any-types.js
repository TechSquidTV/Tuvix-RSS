#!/usr/bin/env node
/**
 * Find all explicit `any` types in TypeScript files
 *
 * Usage:
 *   pnpm find-any-types
 *   pnpm find-any-types --fix  # Show files that need fixing
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const EXCLUDE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.gen\./,
  /generated/,
  /\.test\./,
  /animate-ui/,
  /ui\/.*\.tsx$/, // UI library components
];

const EXCLUDE_FILES = ["eslint.config.js"];

function shouldExclude(filePath) {
  return (
    EXCLUDE_PATTERNS.some((pattern) => pattern.test(filePath)) ||
    EXCLUDE_FILES.some((file) => filePath.includes(file))
  );
}

function findAnyTypes(dir, rootDir = dir, results = []) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = relative(rootDir, fullPath);

    if (shouldExclude(relativePath)) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      findAnyTypes(fullPath, rootDir, results);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          // Match explicit `any` types but not in comments
          const anyMatches = [
            // : any
            /:\s*any\b/g,
            // <any>
            /<\s*any\s*>/g,
            // any[]
            /\bany\[\]/g,
            // Record<string, any>
            /Record<[^>]*,\s*any\s*>/g,
            // { [key: string]: any }
            /\{\s*\[[^\]]+\]:\s*any\s*\}/g,
          ];

          anyMatches.forEach((regex) => {
            let match;
            while ((match = regex.exec(line)) !== null) {
              // Skip if in comment
              const beforeMatch = line.substring(0, match.index);
              if (!beforeMatch.includes("//") && !beforeMatch.includes("/*")) {
                results.push({
                  file: relativePath,
                  line: index + 1,
                  column: match.index + 1,
                  match: match[0],
                  context: line.trim(),
                });
              }
            }
          });
        });
      } catch (error) {
        console.error(`Error reading ${fullPath}:`, error.message);
      }
    }
  }

  return results;
}

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix");

  const packages = [
    { name: "app", path: "packages/app/src" },
    { name: "api", path: "packages/api/src" },
  ];

  let totalFound = 0;

  for (const pkg of packages) {
    console.log(`\n🔍 Searching ${pkg.name}...`);
    const results = findAnyTypes(pkg.path);

    if (results.length === 0) {
      console.log(`✅ No explicit 'any' types found in ${pkg.name}`);
    } else {
      totalFound += results.length;
      console.log(
        `\n❌ Found ${results.length} explicit 'any' type(s) in ${pkg.name}:\n`
      );

      // Group by file
      const byFile = {};
      results.forEach((result) => {
        if (!byFile[result.file]) {
          byFile[result.file] = [];
        }
        byFile[result.file].push(result);
      });

      Object.entries(byFile).forEach(([file, matches]) => {
        console.log(`  📄 ${file}`);
        matches.forEach(({ line, column, match, context }) => {
          console.log(`     Line ${line}:${column} - ${match}`);
          console.log(`     ${context}`);
        });
        console.log();
      });
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  if (totalFound === 0) {
    console.log("✅ No explicit 'any' types found!");
    process.exit(0);
  } else {
    console.log(`❌ Total: ${totalFound} explicit 'any' type(s) found`);
    console.log(
      "\n💡 Tip: Use proper types instead of 'any' for better type safety."
    );
    console.log("   Consider using:");
    console.log("   - `unknown` for truly unknown types");
    console.log("   - Proper type definitions");
    console.log("   - Type inference where possible");
    process.exit(1);
  }
}

main();
