/**
 * @signaltree/core/lazy
 *
 * Opt-in lazy signal creation. Import `lazy()` and pass it as `signalTree(state,
 * { lazy: lazy() })` to materialize signals on-demand for large trees. Keeping
 * it here (not in the core entry) means the lazy Proxy machinery +
 * `SignalMemoryManager` (~2.6KB) tree-shake out of every bundle that doesn't
 * opt in.
 */
import { createLazySignalTree } from './lib/lazy/lazy-tree';
import { SignalMemoryManager } from './lib/memory/memory-manager';
import type { LazyFeature, TreeNode } from './lib/types';

export { SignalMemoryManager } from './lib/memory/memory-manager';
export type { LazyFeature } from './lib/types';

/**
 * Create the opt-in lazy feature for `signalTree`. With it injected, large
 * trees (or `useLazySignals: true`) create signals lazily through a Proxy
 * backed by a memory manager; without it, trees are always eager.
 *
 * @example
 * ```ts
 * import { signalTree } from '@signaltree/core';
 * import { lazy } from '@signaltree/core/lazy';
 *
 * const tree = signalTree(largeState, { lazy: lazy() });
 * ```
 */
export function lazy(): LazyFeature {
  return {
    __signalTreeLazy: true,
    build<T extends object>(
      obj: T,
      equalityFn: (a: unknown, b: unknown) => boolean
    ): { tree: TreeNode<T>; dispose: () => void } {
      const manager = new SignalMemoryManager();
      const tree = createLazySignalTree(
        obj,
        equalityFn,
        '',
        manager
      ) as TreeNode<T>;
      return { tree, dispose: () => manager.dispose() };
    },
  };
}
