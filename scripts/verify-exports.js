#!/usr/bin/env node

/**
 * Verify Package Exports
 * Ensures all package exports are valid and can be imported
 *
 * Note: ng-forms and enterprise are built during release (after core is published)
 * so they may not be present during pre-publish validation. Use --all to check all packages.
 */

const fs = require('fs');
const path = require('path');

// Default: verify every package that scripts/release.sh publishes.
// (Pre-publish validation now builds all of these.)
const PUBLISHED_PACKAGES = [
  'core',
  'events',
  'ng-forms',
  'realtime',
  'callable-syntax',
  'enterprise',
  'guardrails',
];

const PACKAGES = PUBLISHED_PACKAGES;

let errors = 0;

console.log('Verifying package exports (published packages)...\n');

for (const pkg of PACKAGES) {
  const distDir = path.join(__dirname, '..', 'dist', 'packages', pkg);
  const packageJsonPath = path.join(distDir, 'package.json');

  console.log(`Checking ${pkg}...`);

  // Check if dist/package.json exists
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`❌ Missing package.json in dist/packages/${pkg}`);
    errors++;
    continue;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Verify main/module/types fields
  if (!packageJson.main && !packageJson.exports) {
    console.error(`❌ ${pkg}: No main or exports field found`);
    errors++;
  }

  if (
    packageJson.main &&
    !fs.existsSync(path.join(distDir, packageJson.main))
  ) {
    console.error(`❌ ${pkg}: main file "${packageJson.main}" does not exist`);
    errors++;
  }

  if (
    packageJson.module &&
    !fs.existsSync(path.join(distDir, packageJson.module))
  ) {
    console.error(
      `❌ ${pkg}: module file "${packageJson.module}" does not exist`
    );
    errors++;
  }

  if (
    packageJson.types &&
    !fs.existsSync(path.join(distDir, packageJson.types))
  ) {
    console.error(
      `❌ ${pkg}: types file "${packageJson.types}" does not exist`
    );
    errors++;
  }

  // Verify exports field if present
  if (packageJson.exports) {
    const verifyExportPath = (exportPath, exportKey) => {
      if (typeof exportPath === 'string') {
        const fullPath = path.join(distDir, exportPath);
        if (!fs.existsSync(fullPath)) {
          console.error(
            `❌ ${pkg}: export "${exportKey}" points to non-existent file: ${exportPath}`
          );
          errors++;
        }
      } else if (typeof exportPath === 'object') {
        for (const [condition, conditionPath] of Object.entries(exportPath)) {
          if (typeof conditionPath === 'string') {
            const fullPath = path.join(distDir, conditionPath);
            if (!fs.existsSync(fullPath)) {
              console.error(
                `❌ ${pkg}: export "${exportKey}" condition "${condition}" points to non-existent file: ${conditionPath}`
              );
              errors++;
            }
          }
        }
      }
    };

    for (const [exportKey, exportValue] of Object.entries(
      packageJson.exports
    )) {
      verifyExportPath(exportValue, exportKey);
    }
  }

  // Note: guardrails special files (noop.js, factories/) are validated by exports above
  // No additional checks needed since package.json exports cover them

  console.log(`✅ ${pkg} exports verified\n`);
}

if (errors > 0) {
  console.error(`\n❌ Found ${errors} export validation errors`);
  process.exit(1);
} else {
  console.log('\n✅ All package exports verified successfully');
  process.exit(0);
}
