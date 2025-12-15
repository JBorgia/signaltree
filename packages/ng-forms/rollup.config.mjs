import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const baseConfig = createLibraryRollupConfig({
  packageRoot,
});

/**
 * Plugin to ensure the main index.ts barrel file is always generated,
 * even when it contains only re-exports that Rollup would normally tree-shake.
 */
const barrelIndexPlugin = {
  name: 'barrel-index-plugin',
  generateBundle(options, bundle) {
    const distIndexPath = path.join(options.dir, 'dist', 'index.js');
    
    // If index.js doesn't exist (because Rollup optimized it away), create it
    // by re-exporting from the actual modules
    if (!Object.keys(bundle).some(k => k.includes('dist/index'))) {
      const indexContent = `export * from './core/ng-forms.js';
export * from './core/validators.js';
export * from './core/async-validators.js';
export * from './history/index.js';
`;
      bundle['dist/index.js'] = {
        type: 'asset',
        fileName: 'dist/index.js',
        source: indexContent,
      };
    }
  },
};

export default (config, options = {}) => {
  const result = baseConfig(config, options);
  
  // Add the barrel index plugin to ensure main entry point is generated
  if (!result.plugins) {
    result.plugins = [];
  }
  result.plugins.push(barrelIndexPlugin);
  
  return result;
};


