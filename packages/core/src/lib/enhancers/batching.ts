import { snapshotState } from '../utils';

import type {
  SignalTreeBase as SignalTree,
  BatchingMethods,
  Enhancer,
  TreeNode,
  BatchingConfig,
} from '../types';

export function withBatching(
  config: BatchingConfig = {}
): <S>(tree: SignalTree<S>) => SignalTree<S> & BatchingMethods<S> {
  const { debounceMs = 0, maxBatchSize = 1000 } = config;

  const inner = <S>(
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
        queue.push(() => updater());
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

  (inner as any).metadata = {
    name: 'withBatching',
    provides: ['batch', 'batchUpdate'],
  };

  return inner;
}
