import type {
  SignalTreeBase as SignalTree,
  BatchingMethods,
  Enhancer,
  TreeNode,
  BatchingConfig,
} from '../types';

export function withBatching(
  config: BatchingConfig = {}
): <S>(tree: SignalTree<S>) => SignalTree<S> & BatchingMethods {
  const { debounceMs = 0, maxBatchSize = 1000 } = config;

  const inner = <S>(tree: SignalTree<S>): SignalTree<S> & BatchingMethods => {
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

    const methods: BatchingMethods = {
      batch(fn) {
        queue.push(() => fn());
        if (queue.length >= maxBatchSize) flush();
        else schedule();
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
