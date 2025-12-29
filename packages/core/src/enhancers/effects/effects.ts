// ============================================================================
// FILE: src/enhancers/effects/effects.ts
// ============================================================================

/**
 * v6 Effects Enhancer
import { effect as angularEffect, untracked } from '@angular/core';

 *
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EffectsMethods<S>
 */

import type { SignalTreeBase, EffectsMethods } from '../../lib/types';

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
 *   .with(withEffects());
 *
 * // Register an effect
 * const cleanup = tree.effect(state => {
 *   console.log('Count changed:', state.count);
 * });
 *
 * // Later: cleanup the effect
 * cleanup();
 * ```
 */
export function withEffects(
  config: EffectsConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EffectsMethods<S> {
  const { enabled = true } = config;

  return <S>(
    tree: SignalTreeBase<S>
  ): SignalTreeBase<S> & EffectsMethods<S> => {
    const cleanupFns: Array<() => void> = [];

    const methods: EffectsMethods<S> = {
      effect(effectFn: (state: S) => void | (() => void)): () => void {
        if (!enabled) {
          return () => {}; // no-op
        }

        let innerCleanup: (() => void) | void;

        const effectRef = angularEffect(() => {
          // Get current state (this creates the signal dependency)
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
        // No-op implementation to satisfy EffectsMethods interface
        return () => {};
      },
    };

    // Override destroy to cleanup all effects
    const originalDestroy = tree.destroy?.bind(tree);
    (tree as any).destroy = () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.length = 0;
      if (originalDestroy) {
        originalDestroy();
      }
    };

    return Object.assign(tree, methods);
  };
}

/**
 * Enable effects with default settings
 */
export function enableEffects(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & EffectsMethods<S> {
  return withEffects({ enabled: true });
}
