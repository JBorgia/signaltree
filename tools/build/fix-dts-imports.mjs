/**
 * Post-build script to fix @signaltree/shared imports in .d.ts files
 * 
 * The @signaltree/shared package is bundled at build time, but TypeScript
 * generates .d.ts files that still reference it. This script inlines the
 * type declarations since they're simple utility types.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

// Packages that import from @signaltree/shared
const PACKAGES_TO_FIX = ['core', 'enterprise', 'ng-forms', 'guardrails'];

// Inline type declarations for shared utilities
// These replace the imports from @signaltree/shared
const INLINE_DECLARATIONS = `
// Inlined from @signaltree/shared (internal package)
declare function deepEqual<T>(a: T, b: T): boolean;
declare function deepClone<T>(obj: T): T;
declare function isBuiltInObject(value: unknown): boolean;
declare function parsePath(path: string): string[];
declare class LRUCache<K, V> {
  constructor(maxSize: number);
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  get size(): number;
}
declare const DEFAULT_PATH_CACHE_SIZE: number;
`;

async function findDtsFiles(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name === 'node_modules') continue;
      await findDtsFiles(fullPath, files);
    } else if (entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function fixDtsFile(filePath, packageRoot) {
  const content = await readFile(filePath, 'utf8');
  
  // Check if file imports from @signaltree/shared
  if (!content.includes('@signaltree/shared')) {
    return false;
  }

  let newContent = content;
  let needsInlineDeclarations = false;
  
  // Remove import statements from @signaltree/shared
  // Pattern: import { X, Y } from '@signaltree/shared';
  const importRegex = /import\s*\{[^}]+\}\s*from\s*['"]@signaltree\/shared['"];?\n?/g;
  newContent = newContent.replace(importRegex, () => {
    needsInlineDeclarations = true;
    return ''; // Remove the import
  });
  
  // Replace export statements with local exports
  // Pattern: export { X, Y } from '@signaltree/shared';
  const exportRegex = /export\s*\{([^}]+)\}\s*from\s*['"]@signaltree\/shared['"];?\n?/g;
  newContent = newContent.replace(exportRegex, (match, exports) => {
    needsInlineDeclarations = true;
    // Convert re-exports to local exports (the declarations will be inlined)
    const exportList = exports.split(',').map(e => e.trim()).join(', ');
    return `export { ${exportList} };\n`;
  });
  
  // Add inline declarations at the top if needed
  if (needsInlineDeclarations) {
    // Find a good place to insert (after other imports)
    const lastImportIndex = newContent.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
      const endOfImport = newContent.indexOf('\n', lastImportIndex);
      newContent = newContent.slice(0, endOfImport + 1) + INLINE_DECLARATIONS + newContent.slice(endOfImport + 1);
    } else {
      // No imports, add at the top
      newContent = INLINE_DECLARATIONS + newContent;
    }
  }

  if (newContent !== content) {
    await writeFile(filePath, newContent);
    console.log(`  Fixed: ${relative(ROOT, filePath)}`);
    return true;
  }
  
  return false;
}

async function main() {
  console.log('Fixing @signaltree/shared imports in .d.ts files...\n');
  
  let totalFixed = 0;
  
  for (const pkg of PACKAGES_TO_FIX) {
    const packageRoot = join(ROOT, 'dist/packages', pkg);
    const srcDir = join(packageRoot, 'src');
    
    try {
      await stat(srcDir);
    } catch {
      console.log(`Skipping ${pkg}: no src directory found`);
      continue;
    }
    
    console.log(`Processing ${pkg}...`);
    const dtsFiles = await findDtsFiles(srcDir);
    
    for (const file of dtsFiles) {
      const fixed = await fixDtsFile(file, packageRoot);
      if (fixed) totalFixed++;
    }
  }
  
  console.log(`\nDone! Fixed ${totalFixed} file(s).`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

