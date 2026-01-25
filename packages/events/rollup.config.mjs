import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const baseConfig = createLibraryRollupConfig({
  packageRoot,
});

export default (config, options = {}) => {
  return baseConfig(config, options);
};
