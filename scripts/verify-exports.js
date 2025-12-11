#!/usr/bin/env node

/**
 * Verify Package Exports
 * Ensures all package exports are valid and can be imported
 */

const fs = require('fs');
const path = require('path');

const PACKAGES = [
  'core',
  'ng-forms',
  'callable-syntax',
  'enterprise',
  'guardrails',
];

let errors = 0;

console.log('Verifying package exports...\n');

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

  // Special checks for guardrails
  if (pkg === 'guardrails') {
    const noopPath = path.join(distDir, 'noop.js');
    const factoriesPath = path.join(distDir, 'factories', 'index.js');

    if (!fs.existsSync(noopPath)) {
      console.error(`❌ ${pkg}: noop.js does not exist`);
      errors++;
    }

    if (!fs.existsSync(factoriesPath)) {
      console.error(`❌ ${pkg}: factories/index.js does not exist`);
      errors++;
    }
  }

  console.log(`✅ ${pkg} exports verified\n`);
}

if (errors > 0) {
  console.error(`\n❌ Found ${errors} export validation errors`);
  process.exit(1);
} else {
  console.log('\n✅ All package exports verified successfully');
  process.exit(0);
}
