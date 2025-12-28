import { effect as ngEffect, inject, Injector, runInInjectionContext } from '@angular/core';

import { snapshotState } from '../utils';

import type { Signal } from '@angular/core';
import type { SignalTree, EffectsMethods, Enhancer } from '../types';
export interface EffectsConfig {
  autoCleanup?: boolean;
  injector?: Injector | null;
}

export function withEffects<T>(
  config: EffectsConfig = {}
): Enhancer<EffectsMethods<T>> {
  const { autoCleanup = true, injector: configInjector = null } = config;

  const enhancer = <S>(
    tree: SignalTree<S>
  ): SignalTree<S> & EffectsMethods<S> => {
    const cleanupFns = new Set<() => void>();

    let effectInjector: Injector | null = configInjector;
    try {
      if (!effectInjector && autoCleanup) {
        effectInjector = inject(Injector);
        const destroyRef = inject((globalThis as any).DestroyRef as any);
        destroyRef?.onDestroy(() => {
          cleanupFns.forEach((fn) => {
            try {
              fn();
            } catch {}
          });
          cleanupFns.clear();
        });
      }
    } catch {
      // Not in injection context; manual cleanup required
    }

    const methods: EffectsMethods<S> = {
      effect(fn) {
        const create = () =>
          ngEffect(() => fn(snapshotState((tree as any).state) as S));
        const ref = effectInjector
          ? runInInjectionContext(effectInjector, create)
          : create();

        const cleanup = () => {
          try {
            ref.destroy();
          } catch {}
          cleanupFns.delete(cleanup);
        };

        cleanupFns.add(cleanup);
        return cleanup;
      },

      subscribe(fn) {
        return methods.effect(fn as any);
      },
    };

    const originalDestroy = tree.destroy.bind(tree);
    (tree as any).destroy = () => {
      cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      cleanupFns.clear();
      originalDestroy();
    };

    return Object.assign(tree, methods);
  };

  (enhancer as any).metadata = {
    name: 'withEffects',
    provides: ['effect', 'subscribe'],
  };
  return enhancer as unknown as Enhancer<EffectsMethods<T>>;
}
