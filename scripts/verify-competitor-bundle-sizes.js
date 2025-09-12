#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function createTempBundle(packageName, imports) {
  const tempDir = '/tmp/bundle-test';
  const packageJsonPath = path.join(tempDir, 'package.json');
  const indexPath = path.join(tempDir, 'index.js');

  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create minimal package.json
  const packageJson = {
    name: 'bundle-test',
    version: '1.0.0',
    type: 'module',
    dependencies: {},
  };
  packageJson.dependencies[packageName] = 'latest';

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Create index.js with imports
  fs.writeFileSync(indexPath, imports);

  try {
    // Install package
    console.log(`📦 Installing ${packageName}...`);
    await execAsync('npm install', { cwd: tempDir });

    // Bundle with esbuild (lightweight bundler)
    const bundlePath = path.join(tempDir, 'bundle.js');
    await execAsync(
      `npx esbuild index.js --bundle --minify --outfile=bundle.js`,
      { cwd: tempDir }
    );

    // Get size
    const stats = fs.statSync(bundlePath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(`✅ ${packageName}: ${sizeKB}KB (minified)`);
    return sizeKB;
  } catch (error) {
    console.error(`❌ Error bundling ${packageName}:`, error.message);
    return 'Error';
  } finally {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  console.log('🔍 Verifying Competitor Bundle Sizes');
  console.log('=====================================\n');

  const packages = [
    {
      name: '@ngrx/store',
      imports: `import { createAction, createReducer, Store } from '@ngrx/store';`,
      reported: '25KB',
    },
    {
      name: '@ngrx/signals',
      imports: `import { signalStore, withState } from '@ngrx/signals';`,
      reported: '12KB',
    },
    {
      name: '@datorama/akita',
      imports: `import { Store, EntityStore } from '@datorama/akita';`,
      reported: '20KB',
    },
    {
      name: '@ngneat/elf',
      imports: `import { createStore } from '@ngneat/elf';`,
      reported: '2KB',
    },
  ];

  for (const pkg of packages) {
    console.log(`Testing ${pkg.name} (reported: ${pkg.reported})...`);
    const actualSize = await createTempBundle(pkg.name, pkg.imports);

    if (actualSize !== 'Error') {
      const reported = parseFloat(pkg.reported);
      const actual = parseFloat(actualSize);
      const diff = Math.abs(actual - reported);
      const diffPercent = ((diff / reported) * 100).toFixed(1);

      if (diffPercent > 20) {
        console.log(
          `⚠️  Large difference: ${diffPercent}% (actual: ${actualSize}KB vs reported: ${pkg.reported})`
        );
      } else {
        console.log(`✅ Within reasonable range: ${diffPercent}% difference`);
      }
    }
    console.log('');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
