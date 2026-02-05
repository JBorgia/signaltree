import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const baseConfig = createLibraryRollupConfig({
  packageRoot,
});

/**
 * Plugin to ensure the main index.ts barrel file is always generated,
 * even when it contains only re-exports that Rollup would normally tree-shake.
 * Updated to use the actual output file structure.
 */
const barrelIndexPlugin = {
  name: 'barrel-index-plugin',
  generateBundle(options, bundle) {
    // If index.js doesn't exist (because Rollup optimized it away), create it
    // by re-exporting from the actual modules that were built
    if (!Object.keys(bundle).some((k) => k.includes('dist/index'))) {
      // Use the actual output structure - files are built directly (not in subdirectory barrels)
      const indexContent = `export * from './core/ng-forms.js';
export * from './core/validators.js';
export * from './core/async-validators.js';
export * from './history/history.js';
export * from './enhancer/form-bridge.js';
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
