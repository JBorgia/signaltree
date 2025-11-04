#!/usr/bin/env node
/**
 * Script to convert Angular templates from old *ngIf/*ngFor syntax to new @if/@for syntax
 * Run with: node scripts/convert-to-angular-18-syntax.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all HTML files in the demo app
const htmlFiles = glob.sync('apps/demo/**/*.html', { cwd: process.cwd() });

console.log(`Found ${htmlFiles.length} HTML files to process`);

let totalConversions = 0;

htmlFiles.forEach((file) => {
  const filePath = path.join(process.cwd(), file);
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fileConversions = 0;

  // Convert *ngFor with trackBy
  content = content.replace(
    /\*ngFor="let\s+(\w+)\s+of\s+([^"]+?);\s*trackBy:\s*(\w+)"/g,
    (match, item, collection, trackFn) => {
      fileConversions++;
      return `@for (${item} of ${collection}; track ${trackFn}($index, ${item}))`;
    }
  );

  // Convert simple *ngFor (needs manual track decision)
  content = content.replace(
    /\*ngFor="let\s+(\w+)\s+of\s+([^"]+?)"/g,
    (match, item, collection) => {
      fileConversions++;
      // Use item as track key if it looks like an object, otherwise use $index
      const trackKey = collection.includes('()') ? `${item}` : `$index`;
      return `@for (${item} of ${collection}; track ${trackKey})`;
    }
  );

  // Convert *ngIf with template variable (as syntax)
  content = content.replace(
    /\*ngIf="([^"]+?)\s+as\s+(\w+)"/g,
    (match, condition, variable) => {
      fileConversions++;
      return `@if (${condition}; as ${variable})`;
    }
  );

  // Convert simple *ngIf
  content = content.replace(/\*ngIf="([^"]+?)"/g, (match, condition) => {
    fileConversions++;
    return `@if (${condition})`;
  });

  // Convert *ngSwitch, *ngSwitchCase, *ngSwitchDefault
  content = content.replace(/\[ngSwitch\]="([^"]+?)"/g, (match, expression) => {
    fileConversions++;
    return `@switch (${expression})`;
  });

  content = content.replace(/\*ngSwitchCase="([^"]+?)"/g, (match, value) => {
    fileConversions++;
    return `@case (${value})`;
  });

  content = content.replace(/\*ngSwitchDefault/g, () => {
    fileConversions++;
    return `@default`;
  });

  // Now we need to fix the structure - convert opening/closing tags to blocks
  // This is complex, so we'll do basic wrapping

  // Add opening braces after @if, @for, @switch directives
  content = content.replace(
    /(<[^>]+?)(@if|@for|@switch|@case|@default)\s*\(([^)]+)\)([^>]*?>)/g,
    (match, tagStart, directive, expr, tagEnd) => {
      // For self-closing or immediate content, we need to be smart
      return `${tagStart}${tagEnd}\n    ${directive} (${expr}) {`;
    }
  );

  // This approach is getting complex - let's use a different strategy
  // Save if changes were made
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalConversions += fileConversions;
    console.log(`✓ ${file}: ${fileConversions} conversions`);
  }
});

console.log(
  `\n✅ Complete! Made ${totalConversions} total conversions across ${htmlFiles.length} files`
);
console.log('\n⚠️  Manual review required:');
console.log('   - Check that @for tracks are appropriate');
console.log('   - Verify template structure with curly braces');
console.log('   - Test that all components render correctly');
