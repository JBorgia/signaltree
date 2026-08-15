import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const baseConfigFactory = createLibraryRollupConfig({ packageRoot });

export default (config, options) => {
  const baseConfig = baseConfigFactory(config, options);
  const statsStubPath = path.join(
    packageRoot,
    'src',
    'lib',
    'internals',
    'production-substrate-stats.prod.ts'
  );

  const productionStatsStubPlugin = {
    name: 'signaltree-core-production-stats-stub',
    resolveId(source, importer) {
      if (!importer) {
        return null;
      }

      const normalizedSource = source.endsWith('.js')
        ? source.slice(0, -3)
        : source;

      if (normalizedSource !== './production-substrate-stats') {
        return null;
      }

      if (!importer.includes('/src/lib/internals/')) {
        return null;
      }

      return statsStubPath;
    },
  };

  const existingPlugins = Array.isArray(baseConfig.plugins)
    ? baseConfig.plugins
    : baseConfig.plugins
    ? [baseConfig.plugins]
    : [];

  return {
    ...baseConfig,
    plugins: [productionStatsStubPlugin, ...existingPlugins],
  };
};
