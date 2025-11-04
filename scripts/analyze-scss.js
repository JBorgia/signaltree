#!/usr/bin/env node

/**
 * SCSS Refactoring Helper
 *
 * This script helps identify common SCSS patterns in example components
 * that could be refactored to use the shared styling system.
 */

const fs = require('fs');
const path = require('path');

const EXAMPLES_DIR = path.join(
  __dirname,
  '..',
  'apps',
  'demo',
  'src',
  'app',
  'examples'
);

// Patterns to detect
const patterns = {
  hardCodedColors: {
    regex: /(#[0-9a-f]{3,6}|rgba?\([^)]+\))/gi,
    suggestion:
      'Use color variables from shared styles ($primary, $secondary, etc.)',
    severity: 'warning',
  },
  hardCodedSpacing: {
    regex: /(?:padding|margin):\s*[\d.]+(?:px|rem|em)/gi,
    suggestion: 'Use spacing variables ($spacing-xs, $spacing-sm, etc.)',
    severity: 'info',
  },
  duplicateCardStyles: {
    regex: /border-radius:\s*[\d.]+.*;\s*box-shadow:/gi,
    suggestion: 'Use @include card mixin',
    severity: 'warning',
  },
  duplicateButtonStyles: {
    regex: /(?:padding|border-radius|cursor:\s*pointer).*transition/gi,
    suggestion: 'Use @include button-base mixin or .btn classes',
    severity: 'warning',
  },
  mediaQueries: {
    regex: /@media\s*\([^)]+\)/gi,
    suggestion: 'Use @include respond-to($breakpoint) mixin',
    severity: 'info',
  },
  missingSharedImport: {
    regex: /^(?!.*@use.*shared\/styles)/m,
    suggestion: 'Add: @use "../../shared/styles" as *;',
    severity: 'error',
  },
};

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  const relativePath = path.relative(EXAMPLES_DIR, filePath);

  for (const [patternName, pattern] of Object.entries(patterns)) {
    const matches = content.match(pattern.regex);
    if (matches && matches.length > 0) {
      issues.push({
        file: relativePath,
        pattern: patternName,
        count: matches.length,
        suggestion: pattern.suggestion,
        severity: pattern.severity,
        examples: matches.slice(0, 3), // Show first 3 examples
      });
    }
  }

  return issues;
}

function scanDirectory(dir) {
  const allIssues = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        entry.name !== 'styles'
      ) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.scss')) {
        const issues = analyzeFile(fullPath);
        allIssues.push(...issues);
      }
    }
  }

  scan(dir);
  return allIssues;
}

function generateReport(issues) {
  const grouped = {};

  for (const issue of issues) {
    if (!grouped[issue.file]) {
      grouped[issue.file] = [];
    }
    grouped[issue.file].push(issue);
  }

  console.log('\n📊 SCSS Refactoring Report\n');
  console.log('='.repeat(80));

  const severityCounts = { error: 0, warning: 0, info: 0 };

  for (const [file, fileIssues] of Object.entries(grouped)) {
    console.log(`\n📄 ${file}`);
    console.log('-'.repeat(80));

    for (const issue of fileIssues) {
      severityCounts[issue.severity]++;

      const icon =
        issue.severity === 'error'
          ? '❌'
          : issue.severity === 'warning'
          ? '⚠️'
          : 'ℹ️';

      console.log(
        `\n${icon} ${issue.pattern} (${issue.count} occurrence${
          issue.count > 1 ? 's' : ''
        })`
      );
      console.log(`   💡 ${issue.suggestion}`);

      if (issue.examples.length > 0) {
        console.log(`   Examples:`);
        issue.examples.forEach((ex) => console.log(`     - ${ex.trim()}`));
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📈 Summary:');
  console.log(`   ❌ Errors: ${severityCounts.error}`);
  console.log(`   ⚠️  Warnings: ${severityCounts.warning}`);
  console.log(`   ℹ️  Info: ${severityCounts.info}`);
  console.log(`   📁 Files analyzed: ${Object.keys(grouped).length}`);

  console.log('\n💡 Next Steps:');
  console.log(
    '   1. Review the shared styling system: apps/demo/src/app/examples/shared/styles/README.md'
  );
  console.log('   2. Start with files marked with ❌ errors');
  console.log('   3. Gradually refactor files with ⚠️ warnings');
  console.log('   4. Test your changes thoroughly');
  console.log('\n');
}

// Run the analysis
try {
  console.log('🔍 Scanning SCSS files in examples directory...\n');
  const issues = scanDirectory(EXAMPLES_DIR);

  if (issues.length === 0) {
    console.log(
      '✅ No issues found! Your SCSS is already following best practices.\n'
    );
  } else {
    generateReport(issues);
  }
} catch (error) {
  console.error('❌ Error running analysis:', error.message);
  process.exit(1);
}
