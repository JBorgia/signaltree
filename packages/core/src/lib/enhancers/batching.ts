import { snapshotState } from '../utils';

import type {
  SignalTreeBase as SignalTree,
  BatchingMethods,
  Enhancer,
  TreeNode,
} from '../types';
export interface BatchingConfig {
  debounceMs?: number;
  maxBatchSize?: number;
}

export function withBatching<T>(
  config: BatchingConfig = {}
): Enhancer<BatchingMethods<T>> {
  const { debounceMs = 0, maxBatchSize = 1000 } = config;

  const enhancer = <S>(
    tree: SignalTree<S>
  ): SignalTree<S> & BatchingMethods<S> => {
    let queue: Array<() => void> = [];
    let scheduled = false;

    const flush = () => {
      scheduled = false;
      const q = queue;
      queue = [];
      for (const fn of q) {
        try {
          fn();
        } catch (e) {
          console.error('[SignalTree] batch error', e);
        }
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      if (debounceMs > 0) setTimeout(flush, debounceMs);
      else queueMicrotask(flush);
    };

    const methods: BatchingMethods<S> = {
      batch(updater) {
        queue.push(() => updater((tree as any).$ as TreeNode<S>));
        if (queue.length >= maxBatchSize) flush();
        else schedule();
      },

      batchUpdate(updater) {
        methods.batch(() => {
          const current = snapshotState((tree as any).state) as S;
          const updates = updater(current);
          // naive apply: use tree() updater
          (tree as any)((cur: S) => ({ ...cur, ...updates }));
        });
      },
    };

    return Object.assign(tree, methods);
  };

  (enhancer as any).metadata = {
    name: 'withBatching',
    provides: ['batch', 'batchUpdate'],
  };
  return enhancer as unknown as Enhancer<BatchingMethods<T>>;
}
