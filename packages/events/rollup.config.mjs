import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from '@nx/devkit';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(packageRoot, 'src');

/**
 * Custom rollup config for @signaltree/events.
 *
 * SignalTree packages ship pure ESM output with preserveModules enabled.
 * This maintains tree-shaking compatibility while keeping publishing reliable.
 */
export default (config, options = {}) => {
  // Merge additionalEntryPoints into config.input
  const additionalEntryPoints = options.additionalEntryPoints || [];
  const mergedInput = {};
  
  // Always ensure main entry point is included
  const mainEntryPoint = path.join(packageRoot, 'src', 'index.ts');
  mergedInput['index'] = mainEntryPoint;
  
  for (const entryPoint of additionalEntryPoints) {
    const fullPath = path.join(workspaceRoot, entryPoint);
    // Extract the entry name from the path (e.g., 'nestjs/index.ts' -> 'nestjs')
    const relativePath = path.relative(srcRoot, fullPath);
    const entryName = relativePath.replace(/\/index\.[jt]sx?$/, '').replace(/\.[jt]sx?$/, '');
    mergedInput[entryName] = fullPath;
  }
  
  const targetRoot = path.join(workspaceRoot, options.outputPath);
  
  const normalizeForOutput = (moduleId) => {
    if (!moduleId) return null;
    const fromSrc = path.relative(srcRoot, moduleId);
    if (!fromSrc.startsWith('..')) return fromSrc;
    return path.basename(moduleId);
  };

  const toOutputPath = (moduleId, fallback, ext = 'js') => {
    const normalized = normalizeForOutput(moduleId);
    const basePath = normalized
      ? normalized.replace(/\\/g, '/').replace(/\.[jt]sx?$/i, '')
      : fallback;
    return basePath ? `dist/${basePath}.${ext}` : `dist/[name].${ext}`;
  };

  // Create ESM output
  const esmOutput = {
    dir: targetRoot,
    format: 'esm',
    entryFileNames: (chunkInfo) => toOutputPath(chunkInfo.facadeModuleId, chunkInfo.name, 'js'),
    chunkFileNames: (chunkInfo) => toOutputPath(chunkInfo.facadeModuleId ?? chunkInfo.moduleIds?.[0], chunkInfo.name, 'js'),
    exports: 'named',
    preserveModules: true,
    preserveModulesRoot: srcRoot,
    sourcemap: false,
  };

  return {
    ...config,
    input: mergedInput,
    output: esmOutput,
    treeshake: {
      moduleSideEffects: true,
    },
  };
};
