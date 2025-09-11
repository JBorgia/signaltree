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

// Package configuration with size targets
const packages = [
  { name: 'core', maxSize: 7800, claimed: 7250 }, // Current: 7.25KB
  { name: 'batching', maxSize: 1400, claimed: 1270 }, // Current: 1.27KB
  { name: 'memoization', maxSize: 1900, claimed: 1800 }, // Current: 1.80KB
  { name: 'time-travel', maxSize: 1800, claimed: 1750 }, // Current: 1.75KB
  { name: 'async', maxSize: 1900, claimed: 1800 }, // Current: 1.80KB
  { name: 'entities', maxSize: 1000, claimed: 980 }, // Current: 0.98KB
  { name: 'middleware', maxSize: 1450, claimed: 1380 }, // Current: 1.38KB
  { name: 'devtools', maxSize: 2600, claimed: 2490 }, // Current: 2.49KB
  { name: 'serialization', maxSize: 5000, claimed: 4620 }, // Current: 4.62KB
  { name: 'ng-forms', maxSize: 3600, claimed: 3380 }, // Current: 3.38KB
  { name: 'presets', maxSize: 900, claimed: 840 }, // Current: 0.84KB
];

class BundleAnalyzer {
  constructor() {
    this.results = {
      packages: [],
      demoApp: null,
      recommendations: [],
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

  execCommand(
    command,
    description,
    { continueOnError } = { continueOnError: false }
  ) {
    this.log(`${description}...`);
    try {
      execSync(command, { stdio: 'pipe', cwd: process.cwd() });
      this.log(`${description} completed`, 'success');
    } catch (error) {
      this.log(`${description} failed: ${error.message}`, 'error');
      if (!continueOnError) throw error;
    }
  }

  cleanAndBuild() {
    this.log('🧹 Cleaning previous builds...');

    // Clear Nx cache and dist folder
    this.execCommand('pnpm nx reset', 'Clearing Nx cache');
    this.execCommand('rm -rf dist', 'Removing dist folder');

    this.log('🔨 Building all packages...');

    // Build all packages
    const packageNames = packages.map((p) => p.name).join(',');
    this.execCommand(
      `pnpm nx run-many --target=build --projects=${packageNames} --configuration=production`,
      'Building SignalTree packages'
    );

    // Build demo app
    this.execCommand(
      'pnpm nx build demo --configuration=production',
      'Building demo application',
      { continueOnError: true }
    );
  }

  analyzePackages() {
    this.log('\\n📦 Analyzing SignalTree Package Bundles');
    console.log('==========================================\\n');

    let totalPassed = 0;
    let totalFailed = 0;
    let totalActualSize = 0;
    let totalClaimedSize = 0;

    packages.forEach((pkg) => {
      const distPath = path.join(
        process.cwd(),
        `dist/packages/${pkg.name}/fesm2022/signaltree-${pkg.name}.mjs`
      );

      if (!fs.existsSync(distPath)) {
        this.log(`${pkg.name}: Build not found`, 'warning');
        return;
      }

      const content = fs.readFileSync(distPath);
      const rawSize = content.length;
      const gzipSize = this.getGzipSize(content);

      const passed = gzipSize <= pkg.maxSize;
      const claimMet = gzipSize <= pkg.claimed;

      if (passed) totalPassed++;
      else totalFailed++;

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
      console.log();
    });

    console.log('==========================================\\n');
    console.log('📊 Package Summary:');
    console.log(`   Packages Passed: ${totalPassed}/${packages.length}`);
    console.log(`   Packages Failed: ${totalFailed}/${packages.length}`);
    console.log(`   Total Actual Size: ${this.formatSize(totalActualSize)}`);
    console.log(`   Total Claimed Size: ${this.formatSize(totalClaimedSize)}`);
    console.log(
      `   Efficiency: ${
        totalActualSize <= totalClaimedSize
          ? '✅ Claims Met'
          : '❌ Claims Exceeded'
      }`
    );

    return { totalPassed, totalFailed, totalActualSize, totalClaimedSize };
  }

  analyzeDemoApp() {
    this.log('\\n🎯 Analyzing Demo Application Bundle');
    console.log('=====================================\\n');

    const demoPath = path.join(process.cwd(), 'dist/apps/demo');

    if (!fs.existsSync(demoPath)) {
      this.log('Demo app build not found', 'error');
      return null;
    }

    // Get total size
    const totalSize = this.getDirectorySize(demoPath);

    // Analyze individual files
    const jsFiles = this.findFiles(demoPath, '*.js');
    const cssFiles = this.findFiles(demoPath, '*.css');

    const largeJsFiles = jsFiles.filter((file) => {
      const size = fs.statSync(file).size;
      return size > 100 * 1024; // >100KB
    });

    const largeCssFiles = cssFiles.filter((file) => {
      const size = fs.statSync(file).size;
      return size > 50 * 1024; // >50KB
    });

    console.log(`Total Bundle Size: ${this.formatSize(totalSize)}`);
    console.log(`JavaScript Files: ${jsFiles.length}`);
    console.log(`CSS Files: ${cssFiles.length}`);

    if (largeJsFiles.length > 0) {
      console.log('\\n⚠️  Large JavaScript Files (>100KB):');
      largeJsFiles.forEach((file) => {
        const size = fs.statSync(file).size;
        console.log(`   ${path.basename(file)}: ${this.formatSize(size)}`);
      });
    }

    if (largeCssFiles.length > 0) {
      console.log('\\n⚠️  Large CSS Files (>50KB):');
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
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        totalSize += this.getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    });

    return totalSize;
  }

  findFiles(dir, pattern) {
    const files = [];
    const extension = pattern.replace('*.', '.');

    const search = (currentDir) => {
      const items = fs.readdirSync(currentDir);

      items.forEach((item) => {
        const itemPath = path.join(currentDir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          search(itemPath);
        } else if (item.endsWith(extension)) {
          files.push(itemPath);
        }
      });
    };

    search(dir);
    return files;
  }

  generateRecommendations() {
    this.log('\\n🎯 Bundle Optimization Recommendations');
    console.log('=======================================\\n');

    const recommendations = [];

    // Package recommendations
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

    // Demo app recommendations
    if (this.results.demoApp) {
      const demoRecommendations = [];

      if (this.results.demoApp.totalSize > 500 * 1024) {
        demoRecommendations.push(
          'Consider reducing demo complexity or implementing more aggressive code splitting'
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

    // General recommendations
    recommendations.push({
      category: 'General Optimization',
      items: [
        'Enable tree shaking for all packages',
        'Use dynamic imports for optional features',
        'Consider lazy loading non-critical components',
        'Implement bundle splitting for vendor dependencies',
        'Add compression middleware (gzip/brotli) for serving',
      ],
    });

    recommendations.forEach((rec) => {
      console.log(`📋 ${rec.category}:`);
      rec.items.forEach((item) => console.log(`   • ${item}`));
      console.log();
    });

    this.results.recommendations = recommendations;
  }

  run() {
    console.log('🚀 SignalTree Consolidated Bundle Analysis');
    console.log('==========================================\\n');

    try {
      // Clean and rebuild everything
      this.cleanAndBuild();

      // Analyze packages
      const packageResults = this.analyzePackages();

      // Analyze demo app
      this.analyzeDemoApp();

      // Generate recommendations
      this.generateRecommendations();

      // Final summary
      console.log('\\n🎉 Analysis Complete!');
      console.log('======================');
      console.log(
        `📦 SignalTree Total: ${this.formatSize(
          packageResults.totalActualSize
        )} gzipped`
      );
      if (this.results.demoApp) {
        console.log(
          `🎯 Demo App Total: ${this.formatSize(
            this.results.demoApp.totalSize
          )} uncompressed`
        );
      }

      // Exit code based on package validation
      const exitCode = packageResults.totalFailed > 0 ? 1 : 0;
      process.exit(exitCode);
    } catch (error) {
      this.log(`Analysis failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const analyzer = new BundleAnalyzer();
  analyzer.run();
}

module.exports = BundleAnalyzer;
