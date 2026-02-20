import { workspaceRoot } from '@nx/devkit';
import path from 'node:path';
import fs from 'node:fs/promises';

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

    // Some published packages bundle @signaltree/shared at build-time (internal/private),
    // but generated declaration files can still reference it. This plugin rewrites
    // those imports so the published types remain self-contained.
    const inlineSharedTypesPlugin = {
      name: 'signaltree-inline-shared-types',
      async writeBundle() {
        if (!options?.outputPath) {
          return;
        }

        const targetPackageRoot = path.join(workspaceRoot, options.outputPath);
        const dtsRoot = path.join(targetPackageRoot, 'src');

        const INLINE_DECLARATIONS = `
// Inlined from @signaltree/shared (internal package)
declare function deepEqual<T>(a: T, b: T): boolean;
declare function deepClone<T>(obj: T): T;
declare function isBuiltInObject(value: unknown): boolean;
declare function parsePath(path: string): string[];
declare function matchPath(path: string[], pattern: string[]): boolean;
declare function mergeDeep<T>(target: T, source: unknown): T;
declare function snapshotsEqual<T>(a: T, b: T): boolean;
declare function getChanges<T>(prev: T, next: T): unknown;
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

        const rewriteDts = (content) => {
          if (!content.includes('@signaltree/shared')) {
            return null;
          }

          let next = content;
          let needsInlineDeclarations = false;

          // Remove import statements from @signaltree/shared
          const importRegex =
            /import\s*\{[^}]+\}\s*from\s*['"]@signaltree\/shared['"];?\n?/g;
          next = next.replace(importRegex, () => {
            needsInlineDeclarations = true;
            return '';
          });

          // Replace re-exports with local exports
          const exportRegex =
            /export\s*\{([^}]+)\}\s*from\s*['"]@signaltree\/shared['"];?\n?/g;
          next = next.replace(exportRegex, (match, exports) => {
            needsInlineDeclarations = true;
            const exportList = exports
              .split(',')
              .map((e) => e.trim())
              .join(', ');
            return `export { ${exportList} };\n`;
          });

          if (needsInlineDeclarations) {
            const lastImportIndex = next.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
              const endOfImport = next.indexOf('\n', lastImportIndex);
              next =
                next.slice(0, endOfImport + 1) +
                INLINE_DECLARATIONS +
                next.slice(endOfImport + 1);
            } else {
              next = INLINE_DECLARATIONS + next;
            }
          }

          return next === content ? null : next;
        };

        const walk = async (dir) => {
          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }

          await Promise.all(
            entries.map(async (entry) => {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (entry.name === 'node_modules') {
                  return;
                }
                await walk(fullPath);
                return;
              }

              if (!entry.isFile() || !entry.name.endsWith('.d.ts')) {
                return;
              }

              const content = await fs.readFile(fullPath, 'utf8');
              const updated = rewriteDts(content);
              if (updated) {
                await fs.writeFile(fullPath, updated);
              }
            })
          );
        };

        await walk(dtsRoot);
      },
    };

    const plugins = Array.isArray(config.plugins)
      ? config.plugins
      : config.plugins
      ? [config.plugins]
      : [];

    return {
      ...config,
      plugins: [...plugins, inlineSharedTypesPlugin],
      output: Array.isArray(config.output) ? updatedOutputs : updatedOutputs[0],
      treeshake: {
        ...(config.treeshake || {}),
        moduleSideEffects: false,
      },
    };
  };
}
