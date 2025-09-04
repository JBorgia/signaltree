#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

// This script attempts to run @microsoft/api-extractor for each package to
// create a single rolled up index.d.ts that preserves JSDoc comments.
// If api-extractor is not installed, it falls back to the copy-declarations approach.

const workspacePackagesDir = path.resolve(__dirname, '..', 'packages');
const tempDir = path.join(__dirname, '.api-extractor-temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

function discoverPackages() {
  const pkgs = [];
  for (const name of fs.readdirSync(workspacePackagesDir)) {
    const pkgDir = path.join(workspacePackagesDir, name);
    const ngpkg = path.join(pkgDir, 'ng-package.json');
    if (fs.existsSync(ngpkg)) pkgs.push(name);
  }
  return pkgs;
}

function hasApiExtractor() {
  try {
    // Prefer a locally installed binary if present
    const localBin = path.join(
      __dirname,
      '..',
      'node_modules',
      '.bin',
      'api-extractor'
    );
    if (fs.existsSync(localBin)) return true;

    const res = child_process.spawnSync(
      'npx',
      ['--no-install', 'api-extractor', '--version'],
      { stdio: 'ignore', shell: true }
    );
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

async function run() {
  const pkgs = discoverPackages();
  if (pkgs.length === 0) {
    console.error('No packages discovered to roll up declarations.');
    process.exit(2);
  }

  const useApiExtractor = hasApiExtractor();
  if (!useApiExtractor) {
    console.warn(
      'api-extractor not found via npx --no-install. Falling back to copy-declarations.js'
    );
    // run existing script as fallback
    const fallback = path.join(__dirname, 'copy-declarations.js');
    const res = child_process.spawnSync('node', [fallback], {
      stdio: 'inherit',
    });
    process.exit(res.status || 0);
  }

  let hadError = false;
  for (const pkg of pkgs) {
    try {
      const entry = path.join(
        'dist',
        'out-tsc',
        'packages',
        pkg,
        'src',
        'index.d.ts'
      );
      if (!fs.existsSync(entry)) {
        console.warn(`Skipping ${pkg}: entry ${entry} not found`);
        continue;
      }
      const projectFolder = path.resolve(__dirname, '..', 'packages', pkg);
      const entryAbs = path.resolve(__dirname, '..', entry);
      const mainEntryRelative = path.relative(projectFolder, entryAbs);

      const cfg = {
        $schema:
          'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json',
        projectFolder: projectFolder,
        mainEntryPointFilePath: mainEntryRelative,
        apiReport: { enabled: false },
        docModel: { enabled: false },
        dtsRollup: {
          enabled: true,
          untrimmedFilePath: path.join('dist', 'packages', pkg, 'index.d.ts'),
        },
        compiler: {
          tsconfigFilePath: path.join(projectFolder, 'tsconfig.lib.json'),
        },
      };

      const cfgPath = path.join(tempDir, `api-extractor-${pkg}.json`);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

      console.log(
        `Running api-extractor for ${pkg} -> ${cfg.dtsRollup.untrimmedFilePath}`
      );

      // If a local binary exists, invoke it directly to avoid npx resolution quirks.
      const localBin = path.join(
        __dirname,
        '..',
        'node_modules',
        '.bin',
        'api-extractor'
      );
      const cmd = fs.existsSync(localBin) ? localBin : 'npx';
      const args = fs.existsSync(localBin)
        ? ['run', '--local', '--verbose', '--config', cfgPath]
        : ['api-extractor', 'run', '--local', '--verbose', '--config', cfgPath];

      const useShell = !fs.existsSync(localBin);
      const res = child_process.spawnSync(cmd, args, {
        stdio: 'inherit',
        shell: useShell,
      });
      if (res.status !== 0) {
        console.error(`api-extractor failed for ${pkg}`);
        hadError = true;
      }
    } catch (e) {
      console.error(
        `Unexpected error rolling declarations for ${pkg}:`,
        e && e.message ? e.message : e
      );
      hadError = true;
    }
  }

  if (hadError) {
    console.error(
      '\nOne or more api-extractor runs failed. Falling back to copy-declarations.'
    );
    const fallback = path.join(__dirname, 'copy-declarations.js');
    const res = child_process.spawnSync('node', [fallback], {
      stdio: 'inherit',
    });
    process.exit(res.status || 1);
  }

  console.log('Rolled declaration generation complete');
}

run();
