import { effect as angularEffect, untracked } from '@angular/core';

/**
 * v6 Effects Enhancer
 *
 * Contract: (config?) => <S>(tree: ISignalTree<S>) => ISignalTree<S> & EffectsMethods<S>
 */
/* eslint-disable @typescript-eslint/no-empty-function */
import type { ISignalTree, EffectsMethods } from '../../lib/types';

export interface EffectsConfig {
  /** Enable/disable effects (default: true) */
  enabled?: boolean;
}

/**
 * Enhances a SignalTree with effect capabilities.
 *
 * @param config - Effects configuration
 * @returns Polymorphic enhancer function
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0 })
 *   .with(effects());
 *
 * // Register an effect with cleanup
 * const cleanup = tree.effect(state => {
 *   console.log('Count changed:', state.count);
 *   return () => console.log('Cleanup');
 * });
 *
 * // Or use subscribe for simpler cases
 * const unsub = tree.subscribe(state => {
 *   console.log('State:', state);
 * });
 *
 * // Later: cleanup
 * cleanup();
 * unsub();
 * ```
 */

export function effects(
  config: EffectsConfig = {}
): <Tree extends ISignalTree<any>>(tree: Tree) => Tree & EffectsMethods<any> {
  const { enabled = true } = config;
  return <Tree extends ISignalTree<any>>(
    tree: Tree
  ): Tree & EffectsMethods<any> => {
    type S = Tree extends ISignalTree<infer U> ? U : unknown;
    const cleanupFns: Array<() => void> = [];

    const methods: EffectsMethods<S> = {
      effect(effectFn: (state: S) => void | (() => void)): () => void {
        if (!enabled) {
          return () => {};
        }

        let innerCleanup: (() => void) | void;

        const effectRef = angularEffect(() => {
          // Get current state (creates signal dependency)
          const state = tree() as S;

          // Clean up previous effect run
          if (innerCleanup) {
            untracked(() => innerCleanup!());
          }

          // Run effect and capture cleanup
          innerCleanup = untracked(() => effectFn(state));
        });

        const cleanup = () => {
          if (innerCleanup) {
            innerCleanup();
          }
          effectRef.destroy();
        };

        cleanupFns.push(cleanup);

        return cleanup;
      },

      subscribe(fn: (state: S) => void): () => void {
        if (!enabled) {
          return () => {};
        }

        // Subscribe is a simpler version of effect without cleanup return
        const effectRef = angularEffect(() => {
          const state = tree() as S;
          untracked(() => fn(state));
        });

        const cleanup = () => {
          effectRef.destroy();
        };

        cleanupFns.push(cleanup);

        return cleanup;
      },
    };

    // Override destroy to cleanup all effects
    const originalDestroy = tree.destroy?.bind(tree);
    (tree as unknown as { destroy: () => void }).destroy = () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.length = 0;
      if (originalDestroy) {
        originalDestroy();
      }
    };

    return Object.assign(tree, methods) as unknown as Tree &
      EffectsMethods<any>;
  };
}

/**
 * Enable effects with default settings
 */
export function enableEffects(): <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & EffectsMethods<any> {
  return effects({ enabled: true });
}
/**
 * @deprecated Use `effects()` as the primary enhancer. This legacy
 * `withEffects` factory will be removed in a future major release.
 */
export const withEffects = Object.assign(
  (config: EffectsConfig = {}) => effects(config),
  {
    enable: enableEffects,
  }
);
