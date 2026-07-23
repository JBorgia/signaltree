import { effect as angularEffect, untracked } from '@angular/core';

/**
 * v6 Effects Enhancer
 *
 * Contract: (config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T>
 */
/* eslint-disable @typescript-eslint/no-empty-function */
import type { ISignalTree, EffectsMethods, EnhancerMeta } from '../../lib/types';
import { ENHANCER_META } from '../../lib/types';

declare const ngDevMode: boolean | undefined;

let warnedEffectsDeprecated = false;

export interface EffectsConfig {
  /** Enable/disable effects (default: true) */
  enabled?: boolean;
}

/**
 * Enhances a SignalTree with effect capabilities.
 *
 * @deprecated Use Angular's native `effect()` instead — a SignalTree is made
 * of ordinary Angular signals, so `effect(() => tree.$.path())` (or reading
 * the whole tree via `tree()`) gives you the same reactivity with proper
 * injection-context handling. Removal planned for the next major release.
 *
 * Known limitation (will not be fixed): `tree.effect()`/`tree.subscribe()`
 * call Angular's `effect()` without any injector handling, so calling them
 * outside an injection context throws NG0203. Native `effect()` lets you pass
 * `{ injector }` explicitly.
 *
 * @param config - Effects configuration
 * @returns Polymorphic enhancer function
 *
 * @example
 * ```typescript
 * // Deprecated:
 * const tree = signalTree({ count: 0 }).with(effects());
 * tree.effect(state => console.log('Count changed:', state.count));
 *
 * // Preferred (native Angular):
 * const tree = signalTree({ count: 0 });
 * effect(() => console.log('Count changed:', tree.$.count()));
 * ```
 */

export function effects(
  config: EffectsConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T> {
  const { enabled = true } = config;
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    !warnedEffectsDeprecated
  ) {
    warnedEffectsDeprecated = true;
    console.warn(
      '[SignalTree] effects() is deprecated and will be removed in the next major release. ' +
        "Use Angular's native effect() instead: effect(() => tree.$.path()). " +
        'Note: tree.effect()/tree.subscribe() throw NG0203 outside injection contexts.'
    );
  }
  const enhancerFn = <T>(tree: ISignalTree<T>): ISignalTree<T> & EffectsMethods<T> => {
    type S = T;
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

    return Object.assign(tree, methods) as unknown as ISignalTree<T> &
      EffectsMethods<T>;
  };

  const meta: EnhancerMeta = { name: 'effects', provides: ['effects'] };
  (enhancerFn as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancerFn as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancerFn;
}

/**
 * Enable effects with default settings
 */
export function enableEffects(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & EffectsMethods<T> {
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
