// v6 Batching Enhancer
// See migration doc for contract and usage

import type {
  SignalTreeBase,
  BatchingMethods,
  BatchingConfig,
} from '../../lib/types';

export function withBatching(
  config: BatchingConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & BatchingMethods {
  const { debounceMs = 0, maxBatchSize = 100 } = config;

  return <S>(tree: SignalTreeBase<S>): SignalTreeBase<S> & BatchingMethods => {
    let queue: Array<() => void> = [];
    let scheduled = false;

    const flush = (): void => {
      scheduled = false;
      for (const fn of queue) fn();
      queue = [];
    };

    const schedule = (): void => {
      if (scheduled) return;
      scheduled = true;
      if (debounceMs > 0) {
        setTimeout(flush, debounceMs);
      } else {
        Promise.resolve().then(flush);
      }
    };

    const methods: BatchingMethods = {
      batch(fn: () => void): void {
        queue.push(fn);
        if (queue.length >= maxBatchSize) {
          flush();
        } else {
          schedule();
        }
      },
    };

    return Object.assign(tree, methods);
  };
}

export function withHighPerformanceBatching(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & BatchingMethods {
  return withBatching({ maxBatchSize: 200 });
}
