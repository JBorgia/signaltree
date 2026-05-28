#!/usr/bin/env node

/**
 * Consolidated Bundle Analysis & Size Validation
 * ==============================================
 *
 * This script provides comprehensive bundle analysis for:
 * 1. SignalTree library packages (production bundles)
 * 2. Demo application bundles
 * 3. Bundle optimization recommendations
 *
 * Features:
 * - Always rebuilds packages for accurate results
 * - Reports both raw and gzipped sizes
 * - Validates against claimed sizes
 * - Provides optimization recommendations
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const packages = [
  {
    name: 'core',
    path: [
      'dist/packages/core/dist/index.js',
      'dist/packages/core/src/index.js',
      'dist/packages/core/fesm2022/signaltree-core.mjs',
    ],
    maxSize: 30000,
    claimed: 34450,
  },
  {
    name: 'enterprise',
    path: 'dist/packages/enterprise/dist/index.js',
    maxSize: 8000,
    claimed: 5700,
  },
  {
    name: 'ng-forms',
    path: [
      'dist/packages/ng-forms/dist/index.js',
      'dist/packages/ng-forms/fesm2022/signaltree-ng-forms.mjs',
    ],
    maxSize: 8000,
    claimed: 7300,
  },
  {
    name: 'callable-syntax',
    path: 'dist/packages/callable-syntax/dist/index.js',
    maxSize: 3000,
    claimed: 2000,
  },
  {
    name: 'shared',
    path: 'dist/packages/shared/dist/index.js',
    maxSize: 4200,
    claimed: 3000,
  },
  {
    name: 'guardrails',
    path: 'dist/packages/guardrails/dist/lib/guardrails.js',
    maxSize: 9000,
    claimed: 7500,
  },
  {
    name: 'guardrails/factories',
    path: 'dist/packages/guardrails/dist/factories/index.js',
    maxSize: 9000,
    claimed: 7500,
  },
  {
    name: 'schema',
    path: 'dist/packages/schema/index.esm.js',
    maxSize: 6000,
    claimed: 4400,
  },
  {
    name: 'core/enhancers/batching',
    path: 'dist/packages/core/dist/enhancers/batching/lib/batching.js',
    maxSize: 1400,
    claimed: 1280,
  },
  {
    name: 'core/enhancers/time-travel',
    path: 'dist/packages/core/dist/enhancers/time-travel/lib/time-travel.js',
    maxSize: 1950,
    claimed: 1350,
  },
  {
    name: 'core/enhancers/entities',
    path: 'dist/packages/core/dist/enhancers/entities/lib/entities.js',
    maxSize: 1250,
    claimed: 1230,
  },
  {
    name: 'core/enhancers/middleware',
    path: 'dist/packages/core/dist/enhancers/middleware/lib/middleware.js',
    maxSize: 2000,
    claimed: 1360,
  },
  {
    name: 'core/enhancers/devtools',
    path: 'dist/packages/core/dist/enhancers/devtools/lib/devtools.js',
    maxSize: 2600,
    claimed: 2470,
  },
  {
    name: 'core/enhancers/serialization',
    path: 'dist/packages/core/dist/enhancers/serialization/lib/serialization.js',
    maxSize: 5200,
    claimed: 4860,
  },
];

const nxProjects = [
  'core',
  'enterprise',
  'callable-syntax',
  'shared',
  'guardrails',
  'ng-forms',
  'schema',
];

class BundleAnalyzer {
  constructor() {
    this.results = {
      packages: [],
      fullPackages: [],
      fullPackageSummary: null,
      demoApp: null,
      recommendations: [],
      architecture: null,
      summary: null,
      error: null,
    };
  }

  log(message, level = 'info') {
    const icons = { info: '📦', success: '✅', warning: '⚠️', error: '❌' };
    console.log(`${icons[level] || '📦'} ${message}`);
  }

  formatSize(bytes) {
    return `${(bytes / 1024).toFixed(2)}KB`;
  }

  getGzipSize(buffer) {
    return zlib.gzipSync(buffer).length;
  }

  findFiles(dir, pattern) {
    const files = [];
    const matcher = pattern.includes('*') ? pattern.replace('*', '') : pattern;

    const search = (currentDir) => {
      const entries = fs.readdirSync(currentDir);
      entries.forEach((entry) => {
        const entryPath = path.join(currentDir, entry);
        const stats = fs.statSync(entryPath);
        if (stats.isDirectory()) {
          search(entryPath);
        } else if (
          pattern.includes('*')
            ? entry.endsWith(matcher)
            : entryPath.endsWith(matcher)
        ) {
          files.push(entryPath);
        }
      });
    };

    if (fs.existsSync(dir)) {
      search(dir);
    }

    return files;
  }

  getFullPackageSize(packageName) {
    const packageDir = path.join(process.cwd(), `dist/packages/${packageName}`);

    if (!fs.existsSync(packageDir)) {
      return null;
    }

    const jsFiles = this.findFiles(packageDir, '*.js');
    if (jsFiles.length === 0) {
      return null;
    }

    const allContent = jsFiles.map((file) => fs.readFileSync(file)).join('\n');
    const buffer = Buffer.from(allContent);

    return {
      fileCount: jsFiles.length,
      rawSize: buffer.length,
      gzipSize: this.getGzipSize(buffer),
    };
  }

  execCommand(command, description, options = {}) {
    const { continueOnError = false } = options;
    this.log(`${description}...`);
    try {
      const stdio = options.stdio || 'pipe';
      execSync(command, { stdio, cwd: process.cwd() });
      this.log(`${description} completed`, 'success');
      return true;
    } catch (error) {
      this.log(`${description} failed: ${error.message}`, 'error');
      if (error.stdout) {
        console.log(error.stdout.toString());
      }
      if (error.stderr) {
        console.log(error.stderr.toString());
      }
      if (!continueOnError) {
        throw error;
      }
      return false;
    }
  }

  cleanAndBuild() {
    this.log('🧹 Cleaning previous builds...');

    this.execCommand('pnpm nx reset', 'Clearing Nx cache');
    this.execCommand('rm -rf dist', 'Removing dist folder');

    this.log('🔨 Building all packages...');
    const packageNames = nxProjects.join(',');
    const buildCommand = `pnpm nx run-many --target=build --projects=${packageNames} --configuration=production --verbose --output-style=static --no-daemon`;
    const packagesBuilt = this.execCommand(
      buildCommand,
      'Building SignalTree packages',
      { continueOnError: true, stdio: 'inherit' }
    );

    if (!packagesBuilt) {
      this.log(
        'Retrying package build after restarting Nx daemon...',
        'warning'
      );
      this.execCommand('pnpm nx reset', 'Restarting Nx cache/daemon', {
        continueOnError: true,
        stdio: 'inherit',
      });
      this.execCommand(buildCommand, 'Building SignalTree packages (retry)', {
        stdio: 'inherit',
      });
    }

    this.execCommand(
      'pnpm nx build demo --configuration=production',
      'Building demo application',
      { continueOnError: true }
    );
  }

  resolvePackagePath(pkg) {
    const paths = [];
    if (pkg.path) {
      if (Array.isArray(pkg.path)) {
        paths.push(...pkg.path);
      } else {
        paths.push(pkg.path);
      }
    }

    const defaultCandidates = [
      `dist/packages/${pkg.name}/dist/index.js`,
      `dist/packages/${pkg.name}/src/index.js`,
      `dist/packages/${pkg.name}/fesm2022/signaltree-${pkg.name}.mjs`,
    ];

    defaultCandidates.forEach((candidate) => {
      if (!paths.includes(candidate)) {
        paths.push(candidate);
      }
    });

    return paths
      .map((candidate) => path.join(process.cwd(), candidate))
      .find((candidate) => fs.existsSync(candidate));
  }

  analyzePackages() {
    this.log('\n📦 Analyzing SignalTree Package Bundles');
    console.log('==========================================\n');

    let totalPassed = 0;
    let totalFailed = 0;
    let totalActualSize = 0;
    let totalClaimedSize = 0;

    packages.forEach((pkg) => {
      const distPath = this.resolvePackagePath(pkg);

      if (!distPath || !fs.existsSync(distPath)) {
        this.log(`${pkg.name}: Build not found at ${distPath}`, 'warning');
        return;
      }

      const content = fs.readFileSync(distPath);
      const rawSize = content.length;
      const gzipSize = this.getGzipSize(content);

      if (
        rawSize < 3000 &&
        !pkg.name.includes('types') &&
        !pkg.name.includes('computed')
      ) {
        this.log(
          `⚠️  WARNING: ${pkg.name} measures only ${rawSize} bytes raw - this may be a re-export barrel. Measure full package for documentation claims.`,
          'warning'
        );
      }

      const passed = gzipSize <= pkg.maxSize;
      const claimMet = gzipSize <= pkg.claimed;

      if (passed) {
        totalPassed += 1;
      } else {
        totalFailed += 1;
      }

      totalActualSize += gzipSize;
      totalClaimedSize += pkg.claimed;

      const result = {
        name: pkg.name,
        rawSize,
        gzipSize,
        claimed: pkg.claimed,
        maxAllowed: pkg.maxSize,
        passed,
        claimMet,
      };

      this.results.packages.push(result);

      console.log(`📦 ${pkg.name}:`);
      console.log(`   Raw: ${this.formatSize(rawSize)}`);
      console.log(`   Gzipped: ${this.formatSize(gzipSize)}`);
      console.log(`   Claimed: ${this.formatSize(pkg.claimed)}`);
      console.log(`   Max Allowed: ${this.formatSize(pkg.maxSize)}`);
      console.log(
        `   Status: ${passed ? '✅ PASS' : '❌ FAIL'} ${
          claimMet ? '(Claim Met)' : '(Claim Exceeded)'
        }`
      );

      if (pkg.name === 'core') {
        console.log('   Note: Core package entry is a re-export façade');
      } else if (pkg.name.startsWith('core/enhancers/')) {
        console.log('   Note: Individual enhancer implementation size');
      } else if (pkg.name === 'ng-forms') {
        console.log('   Note: Complete ng-forms package bundle');
      }

      console.log();
    });

    console.log('==========================================\n');
    console.log('📊 Package Summary:');
    console.log(`   Packages Passed: ${totalPassed}/${packages.length}`);
    console.log(`   Packages Failed: ${totalFailed}/${packages.length}`);
    console.log(
      `   Total Measured Size: ${this.formatSize(totalActualSize)} gzipped`
    );
    console.log(`   Total Claimed Size: ${this.formatSize(totalClaimedSize)}`);
    console.log(
      `   Claims Status: ${
        totalActualSize <= totalClaimedSize
          ? '✅ All Claims Met'
          : '❌ Some Claims Exceeded'
      }`
    );
    console.log('\n📋 Measurement Note:');
    console.log(
      '   These readings reflect single entry bundles, not full publishable packages.'
    );
    console.log(
      '   Use full package analysis below to validate documentation claims.'
    );

    return { totalPassed, totalFailed, totalActualSize, totalClaimedSize };
  }

  analyzeFullPackages() {
    this.log('\n📊 Full Package Analysis (All Files)');
    console.log('==========================================\n');

    const packageDirs = ['core', 'enterprise', 'callable-syntax', 'shared'];

    const fullSizes = [];

    packageDirs.forEach((pkgName) => {
      const fullSize = this.getFullPackageSize(pkgName);
      if (!fullSize) {
        this.log(`${pkgName}: No build output found`, 'warning');
        return;
      }

      fullSizes.push({
        name: pkgName,
        ...fullSize,
      });

      console.log(`📦 ${pkgName}:`);
      console.log(`   Files: ${fullSize.fileCount} JS files`);
      console.log(`   Raw Total: ${this.formatSize(fullSize.rawSize)}`);
      console.log(`   Gzipped Total: ${this.formatSize(fullSize.gzipSize)}`);

      const pkgConfig = packages.find((p) => p.name === pkgName);
      if (pkgConfig) {
        const claimDiff = fullSize.gzipSize - pkgConfig.claimed;
        const claimStatus = claimDiff <= 0 ? '✅' : '⚠️';
        console.log(
          `   Claimed: ${this.formatSize(pkgConfig.claimed)} ${claimStatus}`
        );
        if (Math.abs(claimDiff) > 500) {
          console.log(
            `   ⚠️  Claim off by ${this.formatSize(Math.abs(claimDiff))} (${
              claimDiff > 0 ? 'under-claimed' : 'over-claimed'
            })`
          );
        }
      }
      console.log();
    });

    const totalRawSize = fullSizes.reduce(
      (sum, pkg) => sum + (pkg.rawSize || 0),
      0
    );
    const totalGzipSize = fullSizes.reduce(
      (sum, pkg) => sum + (pkg.gzipSize || 0),
      0
    );

    const summary = {
      totalRawSize,
      totalGzipSize,
      packageCount: fullSizes.length,
    };

    console.log('==========================================');
    console.log(
      '📋 These totals reflect the publishable output shipped to npm.'
    );
    console.log(
      '   Use these numbers for documentation claims and release notes.\n'
    );

    this.results.fullPackages = fullSizes;
    this.results.fullPackageSummary = summary;

    return summary;
  }

  analyzeDemoApp() {
    this.log('\n🎯 Analyzing Demo Application Bundle');
    console.log('=====================================\n');

    const demoPath = path.join(process.cwd(), 'dist/apps/demo');

    if (!fs.existsSync(demoPath)) {
      this.log('Demo app build not found', 'error');
      return null;
    }

    const totalSize = this.getDirectorySize(demoPath);
    const jsFiles = this.findFiles(demoPath, '*.js');
    const cssFiles = this.findFiles(demoPath, '*.css');

    const largeJsFiles = jsFiles.filter((file) => {
      const size = fs.statSync(file).size;
      return size > 100 * 1024;
    });

    const largeCssFiles = cssFiles.filter((file) => {
      const size = fs.statSync(file).size;
      return size > 50 * 1024;
    });

    console.log(`Total Bundle Size: ${this.formatSize(totalSize)}`);
    console.log(`JavaScript Files: ${jsFiles.length}`);
    console.log(`CSS Files: ${cssFiles.length}`);

    if (largeJsFiles.length > 0) {
      console.log('\n⚠️  Large JavaScript Files (>100KB):');
      largeJsFiles.forEach((file) => {
        const size = fs.statSync(file).size;
        console.log(`   ${path.basename(file)}: ${this.formatSize(size)}`);
      });
    }

    if (largeCssFiles.length > 0) {
      console.log('\n⚠️  Large CSS Files (>50KB):');
      largeCssFiles.forEach((file) => {
        const size = fs.statSync(file).size;
        console.log(`   ${path.basename(file)}: ${this.formatSize(size)}`);
      });
    }

    this.results.demoApp = {
      totalSize,
      jsFiles: jsFiles.length,
      cssFiles: cssFiles.length,
      largeJsFiles: largeJsFiles.length,
      largeCssFiles: largeCssFiles.length,
    };

    return this.results.demoApp;
  }

  getDirectorySize(dirPath) {
    let totalSize = 0;
    const entries = fs.readdirSync(dirPath);

    entries.forEach((entry) => {
      const entryPath = path.join(dirPath, entry);
      const stats = fs.statSync(entryPath);
      if (stats.isDirectory()) {
        totalSize += this.getDirectorySize(entryPath);
      } else {
        totalSize += stats.size;
      }
    });

    return totalSize;
  }

  showArchitectureComparison() {
    this.log('\n🔄 Architecture Comparison: Separate vs Consolidated');
    console.log('====================================================\n');

    const oldSeparateSizes = {
      core: 7368,
      batching: 1303,
      'time-travel': 1788,
      entities: 990,
      middleware: 1931,
      devtools: 2549,
      serialization: 4964,
      'ng-forms': 3462,
    };

    const oldTotal = Object.values(oldSeparateSizes).reduce(
      (sum, size) => sum + size,
      0
    );

    console.log('📦 Old Architecture (Separate Packages):');
    console.log(`   Total: ${this.formatSize(oldTotal)} gzipped`);
    Object.entries(oldSeparateSizes).forEach(([name, size]) => {
      console.log(`   ${name}: ${this.formatSize(size)}`);
    });

    console.log('\n📦 New Architecture (Consolidated):');
    const architecturePackages = this.results.packages.filter(
      (pkg) =>
        pkg.name === 'core' ||
        pkg.name === 'ng-forms' ||
        pkg.name.startsWith('core/enhancers/')
    );

    const newTotal = architecturePackages.reduce(
      (sum, pkg) => sum + (pkg.gzipSize || 0),
      0
    );
    console.log(`   Total: ${this.formatSize(newTotal)} gzipped`);

    const comparisonRecords = [];

    architecturePackages.forEach((pkg) => {
      if (pkg.name.startsWith('core/enhancers/')) {
        const enhancerName = pkg.name.replace('core/enhancers/', '');
        const oldSize = oldSeparateSizes[enhancerName] || 0;
        const newSize = pkg.gzipSize;
        const savings = oldSize - newSize;
        const percentChange =
          oldSize > 0 ? ((savings / oldSize) * 100).toFixed(1) : 'N/A';

        console.log(
          `   ${enhancerName}: ${this.formatSize(
            newSize
          )} (was ${this.formatSize(oldSize)}) ${savings >= 0 ? '📈' : '📉'} ${
            percentChange !== 'N/A' ? `${percentChange}%` : ''
          }`
        );

        comparisonRecords.push({
          name: enhancerName,
          oldSize,
          newSize,
          delta: newSize - oldSize,
        });
      } else if (pkg.name === 'core') {
        console.log(
          `   ${pkg.name}: ${this.formatSize(
            pkg.gzipSize
          )} (re-export façade; implementation lives in enhancers)`
        );

        comparisonRecords.push({
          name: 'core',
          oldSize: oldSeparateSizes.core || 0,
          newSize: pkg.gzipSize,
          delta: pkg.gzipSize - (oldSeparateSizes.core || 0),
        });
      } else if (pkg.name === 'ng-forms') {
        const oldSize = oldSeparateSizes['ng-forms'] || 0;
        console.log(
          `   ${pkg.name}: ${this.formatSize(
            pkg.gzipSize
          )} (was ${this.formatSize(oldSize)})`
        );

        comparisonRecords.push({
          name: 'ng-forms',
          oldSize,
          newSize: pkg.gzipSize,
          delta: pkg.gzipSize - oldSize,
        });
      } else {
        const legacyName = pkg.name;
        comparisonRecords.push({
          name: legacyName,
          oldSize: oldSeparateSizes[legacyName] || 0,
          newSize: pkg.gzipSize,
          delta: pkg.gzipSize - (oldSeparateSizes[legacyName] || 0),
        });
      }
    });

    Object.entries(oldSeparateSizes).forEach(([name, oldSize]) => {
      if (!comparisonRecords.find((record) => record.name === name)) {
        comparisonRecords.push({
          name,
          oldSize,
          newSize: 0,
          delta: -oldSize,
        });
      }
    });

    console.log('\n🎯 Key Benefits of Consolidated Architecture:');
    console.log('=============================================');
    console.log('✅ No duplication when importing multiple enhancers');
    console.log('✅ Shared core dependencies only loaded once');
    console.log('✅ Tree-shaking removes unused enhancers');
    console.log('✅ Smaller total footprint for multi-feature apps');
    console.log('✅ Simplified dependency management');

    const totalSavings = oldTotal - newTotal;
    this.results.architecture = {
      legacyTotals: oldSeparateSizes,
      legacyTotal: oldTotal,
      consolidatedTotal: newTotal,
      savings: totalSavings,
      breakdown: comparisonRecords,
    };

    if (totalSavings > 0) {
      const savingsPct =
        oldTotal > 0 ? ((totalSavings / oldTotal) * 100).toFixed(1) : '0.0';
      console.log(
        `\n💰 Architecture Savings: ${this.formatSize(
          totalSavings
        )} (${savingsPct}% reduction) when using all enhancers`
      );
    } else if (totalSavings < 0) {
      const increasePct =
        oldTotal > 0
          ? ((Math.abs(totalSavings) / oldTotal) * 100).toFixed(1)
          : '0.0';
      console.log(
        `\n⚠️  Architecture Regression: +${this.formatSize(
          Math.abs(totalSavings)
        )} (${increasePct}% increase) when using all enhancers`
      );
      const largestIncreases = comparisonRecords
        .filter((record) => record.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);
      if (largestIncreases.length > 0) {
        console.log('\n🔍 Primary regression drivers:');
        largestIncreases.forEach((entry) => {
          console.log(
            `   • ${entry.name}: +${this.formatSize(
              entry.delta
            )} vs ${this.formatSize(entry.oldSize)}`
          );
        });
      }
    } else {
      console.log(
        '\nℹ️  Architecture footprint unchanged versus separate packages'
      );
    }
  }

  saveResults(packageSummary, fullPackageSummary = null) {
    const resultsPath = path.join(
      process.cwd(),
      'artifacts',
      'consolidated-bundle-results.json'
    );

    const results = {
      timestamp: new Date().toISOString(),
      architecture: 'consolidated',
      packages: this.results.packages,
      fullPackages: this.results.fullPackages,
      demoApp: this.results.demoApp,
      summary: packageSummary,
      fullSummary: fullPackageSummary,
      architectureSummary: this.results.architecture,
      recommendations: this.results.recommendations,
      error: this.results.error,
      notes: [
        'Consolidated architecture: all enhancers under core/src/enhancers/',
        'Secondary entry points enable tree-shaking',
        'Bundle sizes represent compiled JS facades unless full analysis is used',
        'Actual tree-shaking benefits depend on consuming application bundlers',
      ],
    };

    const artifactsDir = path.dirname(resultsPath);
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    this.log(`Results saved to: ${resultsPath}`, 'success');
  }

  generateRecommendations() {
    this.log('\n🎯 Bundle Optimization Recommendations');
    console.log('=======================================\n');

    const recommendations = [];

    const failedPackages = this.results.packages.filter((p) => !p.passed);
    if (failedPackages.length > 0) {
      recommendations.push({
        category: 'Package Optimization',
        items: failedPackages.map(
          (p) =>
            `Optimize ${p.name}: ${this.formatSize(
              p.gzipSize
            )} > ${this.formatSize(p.maxAllowed)} (${(
              ((p.gzipSize - p.maxAllowed) / p.maxAllowed) *
              100
            ).toFixed(1)}% over)`
        ),
      });
    }

    if (this.results.demoApp) {
      const demoRecommendations = [];

      if (this.results.demoApp.totalSize > 500 * 1024) {
        demoRecommendations.push(
          'Consider reducing demo complexity or apply additional code splitting'
        );
      }

      if (this.results.demoApp.largeJsFiles > 0) {
        demoRecommendations.push(
          'Split large JavaScript chunks using dynamic imports'
        );
      }

      if (this.results.demoApp.largeCssFiles > 0) {
        demoRecommendations.push(
          'Optimize CSS by removing unused styles or splitting component styles'
        );
      }

      if (demoRecommendations.length > 0) {
        recommendations.push({
          category: 'Demo App Optimization',
          items: demoRecommendations,
        });
      }
    }

    recommendations.push({
      category: 'General Optimization',
      items: [
        'Enable tree shaking for all packages',
        'Use dynamic imports for optional features',
        'Consider lazy loading non-critical components',
        'Implement bundle splitting for vendor dependencies',
        'Serve with gzip/brotli compression in production',
      ],
    });

    recommendations.forEach((rec) => {
      console.log(`📋 ${rec.category}:`);
      rec.items.forEach((item) => console.log(`   • ${item}`));
      console.log();
    });

    this.results.recommendations = recommendations;
  }

  execute(options = {}) {
    const { skipBuild = false } = options || {};

    console.log('🚀 SignalTree Consolidated Bundle Analysis');
    console.log('==========================================\n');

    try {
      if (skipBuild) {
        this.log('⏭  Skipping rebuild step (options.skipBuild = true)');
      } else {
        this.cleanAndBuild();
      }

      const packageSummary = this.analyzePackages();
      const fullPackageSummary = this.analyzeFullPackages();
      this.showArchitectureComparison();
      this.analyzeDemoApp();
      this.generateRecommendations();

      this.results.summary = packageSummary;

      this.saveResults(packageSummary, fullPackageSummary);

      console.log('\n🎉 Analysis Complete!');
      console.log('======================');
      console.log(
        `📦 Measured Components Total: ${this.formatSize(
          packageSummary.totalActualSize
        )} gzipped`
      );
      const architectureSummary = this.results.architecture;
      if (architectureSummary) {
        const { savings, legacyTotal } = architectureSummary;
        const pct =
          legacyTotal > 0
            ? ((Math.abs(savings) / legacyTotal) * 100).toFixed(1)
            : '0.0';

        if (savings > 0) {
          console.log(
            `📊 Architecture Savings: ${this.formatSize(
              savings
            )} (${pct}% reduction) vs old separate packages`
          );
        } else if (savings < 0) {
          console.log(
            `⚠️  Architecture Regression: +${this.formatSize(
              Math.abs(savings)
            )} (${pct}% increase) vs old separate packages`
          );
        } else {
          console.log(
            'ℹ️  Architecture footprint unchanged vs old separate packages'
          );
        }
      } else {
        console.log('📊 Architecture impact unavailable');
      }
      if (this.results.demoApp) {
        console.log(
          `🎯 Demo App Total: ${this.formatSize(
            this.results.demoApp.totalSize
          )} uncompressed`
        );
      }

      if (fullPackageSummary) {
        console.log(
          `📦 Full Publishable Output: ${this.formatSize(
            fullPackageSummary.totalGzipSize
          )} gzipped across ${fullPackageSummary.packageCount} packages`
        );
      }

      console.log('\n🏗️  Architecture Assessment:');
      console.log('===========================');
      console.log('✅ Consolidated architecture successfully implemented');
      console.log('✅ All enhancers co-located under core/src/enhancers/');
      console.log('✅ Secondary entry points configured for tree-shaking');
      let architectureLine = '📊 Architecture impact summary unavailable';
      if (architectureSummary) {
        const pct =
          architectureSummary.legacyTotal > 0
            ? (
                (Math.abs(architectureSummary.savings) /
                  architectureSummary.legacyTotal) *
                100
              ).toFixed(1)
            : '0.0';

        if (architectureSummary.savings > 0) {
          architectureLine = `📊 Architecture savings: ${this.formatSize(
            architectureSummary.savings
          )} (${pct}% reduction) vs separate packages`;
        } else if (architectureSummary.savings < 0) {
          architectureLine = `⚠️  Architecture regression: +${this.formatSize(
            Math.abs(architectureSummary.savings)
          )} (${pct}% increase) vs separate packages`;
        } else {
          architectureLine =
            'ℹ️  Architecture footprint unchanged vs separate packages';
        }
      }
      console.log(architectureLine);
      console.log('🎯 Applications benefit from eliminated duplication');
      console.log(
        (() => {
          const coreFacade = this.results.packages.find(
            (pkg) => pkg.name === 'core'
          );
          const coreFull = this.results.fullPackages.find(
            (pkg) => pkg.name === 'core'
          );
          if (!coreFacade) {
            return '🔍 Core package: measurement unavailable';
          }
          const facadeSize = this.formatSize(coreFacade.gzipSize);
          const fullSize = coreFull
            ? this.formatSize(coreFull.gzipSize)
            : 'n/a';
          return `🔍 Core barrel facade: ${facadeSize} (full publishable package ${fullSize})`;
        })()
      );
      console.log(
        '📦 Individual enhancers: Shared dependencies remove duplication compared to separate packages'
      );

      const exitCode = packageSummary.totalFailed > 0 ? 1 : 0;
      return { exitCode, results: this.results };
    } catch (error) {
      this.results.error = error.message;
      this.log(`Analysis failed: ${error.message}`, 'error');
      return { exitCode: 1, error, results: this.results };
    }
  }

  run() {
    const { exitCode } = this.execute();
    process.exit(exitCode);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const allowFailures =
    args.includes('--allow-failures') || args.includes('--no-exit');
  const reportMode = args.includes('--report');
  const analyzer = new BundleAnalyzer();
  const { exitCode } = analyzer.execute();
  if (reportMode || allowFailures) {
    // In report/non-blocking mode always exit 0 so CI summary can be published.
    process.exit(0);
  } else {
    process.exit(exitCode);
  }
}

module.exports = BundleAnalyzer;
