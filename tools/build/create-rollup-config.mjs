import { workspaceRoot } from '@nx/devkit';
import path from 'node:path';

/**
 * Adjusts the Nx-generated Rollup configuration so each library emits
 * preserveModules-style ESM output in the layout our package manifests expect.
 */
export function createLibraryRollupConfig({
  packageRoot,
  moduleSubDir = 'dist',
} = {}) {
  if (!packageRoot) {
    throw new Error('createLibraryRollupConfig requires a packageRoot');
  }

  const resolvedPackageRoot = path.resolve(packageRoot);
  const srcRoot = path.join(resolvedPackageRoot, 'src');
  const sharedSrcRoot = path.join(workspaceRoot, 'packages', 'shared', 'src');

  const normalizeForOutput = (moduleId) => {
    if (!moduleId) {
      return null;
    }

    const fromSrc = path.relative(srcRoot, moduleId);
    if (!fromSrc.startsWith('..')) {
      return fromSrc;
    }

    const fromShared = path.relative(sharedSrcRoot, moduleId);
    if (!fromShared.startsWith('..')) {
      return path.join('shared', fromShared);
    }

    // Fall back to module path relative to the package root to keep the layout stable.
    const fromPackage = path.relative(resolvedPackageRoot, moduleId);
    if (!fromPackage.startsWith('..')) {
      return fromPackage;
    }

    return path.basename(moduleId);
  };

  return (config, options = {}) => {
    const outputs = Array.isArray(config.output)
      ? config.output
      : [config.output ?? {}];

    const targetRoot = path.join(workspaceRoot, options.outputPath);
    const moduleDir = moduleSubDir ? moduleSubDir.replace(/\\/g, '/') : '';

    const toOutputPath = (moduleId, fallback) => {
      const normalized = normalizeForOutput(moduleId);
      const basePath = normalized
        ? normalized.replace(/\\/g, '/').replace(/\.[jt]sx?$/i, '')
        : fallback;

      if (!basePath) {
        return moduleDir ? `${moduleDir}/[name].js` : '[name].js';
      }

      return moduleDir ? `${moduleDir}/${basePath}.js` : `${basePath}.js`;
    };

    const updatedOutputs = outputs.map((output) => ({
      ...output,
      dir: targetRoot,
      format: 'esm',
      entryFileNames: (chunkInfo) =>
        toOutputPath(chunkInfo.facadeModuleId, chunkInfo.name),
      chunkFileNames: (chunkInfo) =>
        toOutputPath(
          chunkInfo.facadeModuleId ?? chunkInfo.moduleIds?.[0],
          chunkInfo.name
        ),
      exports: 'named',
      preserveModules: true,
      preserveModulesRoot: srcRoot,
      sourcemap: false,
    }));

    return {
      ...config,
      output: Array.isArray(config.output) ? updatedOutputs : updatedOutputs[0],
      treeshake: {
        ...(config.treeshake || {}),
        moduleSideEffects: false,
      },
    };
  };
}
