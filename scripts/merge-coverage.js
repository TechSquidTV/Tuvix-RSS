#!/usr/bin/env node

/**
 * Merge coverage reports from multiple packages into a single report
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const coverageDir = path.join(rootDir, "coverage");
const tempDir = path.join(coverageDir, ".nyc_output");

// Ensure directories exist
if (!fs.existsSync(coverageDir)) {
  fs.mkdirSync(coverageDir, { recursive: true });
}
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Copy coverage files from each package
const packages = ["api", "app"];
let fileIndex = 0;

packages.forEach((pkg) => {
  const pkgCoverageFile = path.join(
    rootDir,
    "packages",
    pkg,
    "coverage",
    "coverage-final.json"
  );

  if (fs.existsSync(pkgCoverageFile)) {
    const destFile = path.join(tempDir, `${pkg}-${fileIndex++}.json`);
    console.log(`Copying coverage from ${pkg}...`);

    // Read, parse, and adjust file paths
    const coverage = JSON.parse(fs.readFileSync(pkgCoverageFile, "utf8"));
    const adjustedCoverage = {};

    // Adjust paths to be relative to root
    Object.keys(coverage).forEach((filePath) => {
      // Make paths relative to workspace root
      let adjustedPath = filePath;
      if (!filePath.startsWith("/")) {
        adjustedPath = path.join(rootDir, "packages", pkg, filePath);
      }
      adjustedCoverage[adjustedPath] = coverage[filePath];
    });

    fs.writeFileSync(destFile, JSON.stringify(adjustedCoverage, null, 2));
    console.log(`✓ Copied coverage from ${pkg}`);
  } else {
    console.warn(`⚠ No coverage file found for ${pkg}`);
  }
});

console.log("\n✓ Coverage files merged successfully");
console.log(`Run "pnpm test:coverage:report" to generate HTML report\n`);
