import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLibraryRollupConfig } from '../../tools/build/create-rollup-config.mjs';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(packageRoot, '../..');

const copyDirectory = async (source, destination) => {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    }
  }
};

const baseFactory = createLibraryRollupConfig({
  packageRoot,
});

export default (config, options = {}) => {
  const baseConfig = baseFactory(config, options);
  const plugins = Array.isArray(baseConfig.plugins)
    ? baseConfig.plugins
    : baseConfig.plugins
    ? [baseConfig.plugins]
    : [];

  const workspaceMirrorPlugin = {
    name: 'signaltree-shared-workspace-mirror',
    async writeBundle() {
      if (!options?.outputPath) {
        return;
      }

      const sourceDist = path.join(workspaceDir, options.outputPath, 'dist');
      const targetDist = path.join(packageRoot, 'dist');

      try {
        await fs.access(sourceDist);
      } catch {
        return;
      }

      await fs.rm(targetDist, { recursive: true, force: true });
      await fs.mkdir(targetDist, { recursive: true });
      await copyDirectory(sourceDist, targetDist);
    },
  };

  return {
    ...baseConfig,
    plugins: [...plugins, workspaceMirrorPlugin],
  };
};
