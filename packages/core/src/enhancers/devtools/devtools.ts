/**
 * v6 DevTools Enhancer — thin shell.
 *
 * Contract: (config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods
 *
 * This shell exists to make devtools tree-shake out of production bundles. In a
 * prod build (`ngDevMode` defined as false), `devTools()` returns a tiny noop
 * enhancer and never references `createDevToolsEnhancer`. esbuild folds the
 * guard to a constant, the `./devtools-impl` import becomes dead, and the entire
 * ~12KB implementation module tree-shakes away. Dev builds (`ngDevMode`
 * undefined/true) delegate to the full implementation unchanged.
 */
import { createDevToolsEnhancer } from './devtools-impl';
import type {
  ISignalTree,
  DevToolsConfig,
  DevToolsMethods,
  EnhancerMeta,
} from '../../lib/types';
import { ENHANCER_META } from '../../lib/types';

// Preserve the public type surface that used to be declared in this file
// (re-exported through ./index.ts via `export *`).
export type {
  ModuleMetadata,
  ModularPerformanceMetrics,
  ModuleActivityTracker,
  CompositionLogger,
  ModularDevToolsInterface,
} from './devtools-impl';

// Angular's compile-time dev flag. A production build defines it as false.
declare const ngDevMode: boolean | undefined;

/**
 * Production noop enhancer. Carries enhancer metadata so composition/ordering
 * still recognizes it, but does nothing else and references no heavy code.
 */
function prodNoopDevTools(
  _config: DevToolsConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  const enhancerFn = <T>(
    tree: ISignalTree<T>
  ): ISignalTree<T> & DevToolsMethods =>
    Object.assign(tree, {
      connectDevTools(): void {
        /* stripped in production */
      },
      disconnectDevTools(): void {
        /* stripped in production */
      },
    }) as unknown as ISignalTree<T> & DevToolsMethods;
  const meta: EnhancerMeta = { name: 'devTools', provides: ['devTools'] };
  (enhancerFn as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancerFn as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancerFn;
}

// Module-level selection. In a production build `ngDevMode` is defined as false,
// so esbuild constant-folds this ternary to `prodNoopDevTools` — the
// `createDevToolsEnhancer` reference disappears entirely and the whole
// ./devtools-impl module (~12KB gzip) tree-shakes out. A call site inside a
// function body would NOT achieve this: esbuild keeps an import whose symbol
// appears anywhere in the AST, even in a branch it later folds away. A
// module-level constant selection is the form that actually drops the import.
const devToolsImpl =
  typeof ngDevMode !== 'undefined' && !ngDevMode
    ? prodNoopDevTools
    : createDevToolsEnhancer;

/**
 * DevTools enhancer. Connects a tree to Redux DevTools, time-travel, activity
 * tracking, and composition logging.
 *
 * Production (`ngDevMode === false`): resolves to a noop and the entire
 * implementation tree-shakes out — `.with(devTools())` costs ~nothing in prod.
 * Apps that genuinely need devtools in production should use a non-prod build.
 */
export function devTools(
  config: DevToolsConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return devToolsImpl(config);
}

// ============================================================================
// Convenience Helpers (v6 Pattern - no outer generic)
// ============================================================================

/**
 * Enable devtools with default settings
 */
export function enableDevTools(
  treeName = 'SignalTree'
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return devTools({ treeName, enabled: true });
}

/**
 * Full-featured devtools for intensive debugging
 */
export function fullDevTools(
  treeName = 'SignalTree'
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return devTools({
    treeName,
    enabled: true,
    enableBrowserDevTools: true,
    enableLogging: true,
    performanceThreshold: 10,
  });
}

/**
 * Lightweight devtools for production
 */
export function productionDevTools(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & DevToolsMethods {
  return devTools({
    enabled: true,
    enableBrowserDevTools: false,
    enableLogging: false,
    performanceThreshold: 50,
  });
}

// v12: removed the deprecated `withDevTools` alias — use `devTools()`.
