import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';
import type { DeepSignalify } from '@signaltree/core';

// Helper to invoke batchUpdate on the callable proxy while keeping TypeScript
// happy. Tests assume the core installs a stub when the batching enhancer
// isn't enabled. We cast to the expected shape so we can call it without
// non-null assertions in test code.
function callBatch<T>(
  tree: { $: DeepSignalify<T> },
  updater: (s: T) => Partial<T>
) {
  (
    tree.$ as unknown as { batchUpdate: (u: (c: T) => Partial<T>) => void }
  ).batchUpdate(updater as (c: T) => Partial<T>);
}
import {
  withBatching,
  enableBatching,
  withHighPerformanceBatching,
  flushBatchedUpdates,
  hasPendingUpdates,
  getBatchQueueSize,
} from './batching';

describe('Batching', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should enhance tree with batching capabilities', () => {
    const tree = signalTree({ count: 0 }).pipe(withBatching());

    expect(tree.$.batchUpdate).toBeDefined();
  });

  it('should batch multiple updates', async () => {
    const tree = signalTree({ count: 0, name: 'test' }).pipe(withBatching());

    // Track how many times signals actually update (for future testing)
    let updateCount = 0;
    void updateCount; // Mark as intentionally unused for now
    tree.state.count.set = ((originalSet) => {
      return function (this: unknown, value: number) {
        updateCount++;
        return originalSet.call(this, value);
      };
    })(tree.state.count.set);

    // Perform multiple batched updates
    tree.$.batchUpdate((state) => ({ count: state.count + 1 }));
    tree.$.batchUpdate((state) => ({ count: state.count + 1 }));
    tree.$.batchUpdate((state) => ({ count: state.count + 1 }));

    // Updates should be batched (not executed immediately)
    expect(tree.state.count()).toBe(0);
    expect(hasPendingUpdates()).toBe(true);
    expect(getBatchQueueSize()).toBe(3);

    // Wait for microtask to complete
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Now updates should be applied
    expect(tree.state.count()).toBe(3);
    expect(hasPendingUpdates()).toBe(false);
    expect(getBatchQueueSize()).toBe(0);
  });

  it('should allow manual flush of batched updates', () => {
    const tree = signalTree({ count: 0 }).pipe(withBatching());

    tree.$.batchUpdate((state) => ({ count: state.count + 5 }));

    // Should be pending
    expect(tree.state.count()).toBe(0);
    expect(hasPendingUpdates()).toBe(true);

    // Manual flush
    flushBatchedUpdates();

    // Should be applied immediately
    expect(tree.state.count()).toBe(5);
    expect(hasPendingUpdates()).toBe(false);
  });
  it('should work with enableBatching convenience function', () => {
    const tree = signalTree({ count: 0 }).pipe(enableBatching());

    expect(tree.$.batchUpdate).toBeDefined();

    tree.$.batchUpdate(() => ({ count: 10 }));
    expect(hasPendingUpdates()).toBe(true);
  });

  it('should work with high performance batching', () => {
    const tree = signalTree({ count: 0 }).pipe(withHighPerformanceBatching());

    expect(tree.$.batchUpdate).toBeDefined();

    // Should handle larger batch sizes
    for (let i = 0; i < 50; i++) {
      tree.$.batchUpdate((state) => ({ count: state.count + 1 }));
    }

    expect(getBatchQueueSize()).toBe(50);
  });

  it('should disable batching when enabled is false', () => {
    const tree = signalTree({ count: 0 }).pipe(
      withBatching({ enabled: false })
    );

    // Should still have batchUpdate method but it should be the original stub
    tree.$.batchUpdate(() => ({ count: 5 }));

    // Should update immediately since batching is disabled
    expect(tree.state.count()).toBe(5);
    expect(hasPendingUpdates()).toBe(false);
  });

  it('should respect maxBatchSize configuration', async () => {
    const tree = signalTree({ count: 0 }).pipe(
      withBatching({ maxBatchSize: 2 })
    );

    // First 2 updates should be batched
    tree.$.update((state) => ({ count: state.count + 1 }));
    tree.$.update((state) => ({ count: state.count + 1 }));

    expect(tree.state.count()).toBe(0); // Still batched

    // Third update should trigger immediate execution due to maxBatchSize
    tree.$.update((state) => ({ count: state.count + 1 }));

    // Wait for any batched updates
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(tree.state.count()).toBe(3);
  });
});
