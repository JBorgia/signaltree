import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyOptimisticEntityChange,
  EntitySnapshotAccessor,
  OptimisticUpdateManager,
} from './optimistic-updates';

function makeUpdate(correlationId: string, overrides: Partial<{ rollback: () => void }> = {}) {
  return {
    id: `update-${correlationId}`,
    correlationId,
    type: 'TestUpdate',
    data: { value: correlationId },
    previousData: { value: 'prev' },
    appliedAt: new Date(),
    timeoutMs: 5000,
    rollback: overrides.rollback ?? vi.fn(),
  };
}

describe('OptimisticUpdateManager', () => {
  let manager: OptimisticUpdateManager;

  beforeEach(() => {
    manager = new OptimisticUpdateManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('starts empty', () => {
    expect(manager.pendingCount()).toBe(0);
    expect(manager.hasPending()).toBe(false);
    expect(manager.pending()).toEqual([]);
  });

  it('tracks an applied update', () => {
    const update = makeUpdate('c1');
    manager.apply(update);

    expect(manager.pendingCount()).toBe(1);
    expect(manager.hasPending()).toBe(true);
    expect(manager.isPending('c1')).toBe(true);
    expect(manager.get('c1')).toEqual(update);
  });

  it('confirm removes a pending update without invoking rollback', () => {
    const rollback = vi.fn();
    manager.apply(makeUpdate('c1', { rollback }));

    expect(manager.confirm('c1')).toBe(true);
    expect(manager.pendingCount()).toBe(0);
    expect(manager.isPending('c1')).toBe(false);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('confirm returns false for an unknown correlation id', () => {
    expect(manager.confirm('missing')).toBe(false);
  });

  it('rollback invokes the rollback closure and removes the update', () => {
    const rollback = vi.fn();
    manager.apply(makeUpdate('c1', { rollback }));

    expect(manager.rollback('c1')).toBe(true);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(manager.pendingCount()).toBe(0);
  });

  it('rollback swallows errors thrown by the rollback closure', () => {
    const rollback = vi.fn(() => {
      throw new Error('boom');
    });
    manager.apply(makeUpdate('c1', { rollback }));

    expect(() => manager.rollback('c1')).not.toThrow();
    expect(manager.pendingCount()).toBe(0);
  });

  it('rollbackAll rolls back every pending update and reports the count', () => {
    const rollbacks = ['c1', 'c2', 'c3'].map(() => vi.fn());
    ['c1', 'c2', 'c3'].forEach((id, i) =>
      manager.apply(makeUpdate(id, { rollback: rollbacks[i] }))
    );

    const count = manager.rollbackAll();

    expect(count).toBe(3);
    expect(manager.pendingCount()).toBe(0);
    rollbacks.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  });

  it('clear removes all updates without invoking rollback', () => {
    const rollback = vi.fn();
    manager.apply(makeUpdate('c1', { rollback }));
    manager.apply(makeUpdate('c2'));

    manager.clear();

    expect(manager.pendingCount()).toBe(0);
    expect(rollback).not.toHaveBeenCalled();
  });

  it('automatically rolls back on timeout', () => {
    vi.useFakeTimers();
    const rollback = vi.fn();
    manager.apply({ ...makeUpdate('c1', { rollback }), timeoutMs: 1000 });

    expect(manager.pendingCount()).toBe(1);
    vi.advanceTimersByTime(1000);

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(manager.pendingCount()).toBe(0);
  });

  describe('correctness under a burst (O(n^2) clone fix)', () => {
    it('keeps pending/count/get/isPending consistent across a large apply burst', () => {
      const N = 500;
      for (let i = 0; i < N; i++) {
        manager.apply(makeUpdate(`c${i}`));
      }

      expect(manager.pendingCount()).toBe(N);
      expect(manager.pending()).toHaveLength(N);
      expect(manager.isPending('c0')).toBe(true);
      expect(manager.isPending(`c${N - 1}`)).toBe(true);
      expect(manager.get('c250')?.correlationId).toBe('c250');
    });

    it('interleaved apply/confirm/rollback burst nets out to the correct survivors', () => {
      const N = 300;
      const rollbacks = new Map<string, ReturnType<typeof vi.fn>>();

      for (let i = 0; i < N; i++) {
        const rollback = vi.fn();
        rollbacks.set(`c${i}`, rollback);
        manager.apply(makeUpdate(`c${i}`, { rollback }));
      }

      // Confirm every 3rd, roll back every 5th (confirm takes priority when
      // both apply, e.g. i=15), leave the rest pending.
      const confirmed = new Set<string>();
      const rolledBack = new Set<string>();
      for (let i = 0; i < N; i++) {
        const id = `c${i}`;
        if (i % 3 === 0) {
          manager.confirm(id);
          confirmed.add(id);
        } else if (i % 5 === 0) {
          manager.rollback(id);
          rolledBack.add(id);
        }
      }

      const expectedRemaining = N - confirmed.size - rolledBack.size;
      expect(manager.pendingCount()).toBe(expectedRemaining);

      for (const id of confirmed) {
        expect(manager.isPending(id)).toBe(false);
      }
      for (const id of rolledBack) {
        expect(manager.isPending(id)).toBe(false);
        expect(rollbacks.get(id)).toHaveBeenCalledTimes(1);
      }
      for (let i = 0; i < N; i++) {
        const id = `c${i}`;
        if (!confirmed.has(id) && !rolledBack.has(id)) {
          expect(manager.isPending(id)).toBe(true);
        }
      }
    });

    it('completes a large apply+confirm burst quickly (sanity check against O(n^2))', () => {
      const N = 4000;
      const start = performance.now();

      for (let i = 0; i < N; i++) {
        manager.apply(makeUpdate(`c${i}`));
      }
      for (let i = 0; i < N; i++) {
        manager.confirm(`c${i}`);
      }

      const elapsedMs = performance.now() - start;

      expect(manager.pendingCount()).toBe(0);
      // Generous bound: an O(n^2) Map-clone-per-op implementation is orders
      // of magnitude slower than this for N=4000; this is a sanity check,
      // not a strict benchmark.
      expect(elapsedMs).toBeLessThan(1000);
    });
  });
});

describe('applyOptimisticEntityChange', () => {
  interface Item extends Record<string, unknown> {
    id: string;
    name: string;
    qty?: number;
  }

  function createFakeAccessor(initial: Item[] = []) {
    const store = new Map<string, Item>(initial.map((i) => [i.id, i]));
    const upsertOne = vi.fn((entity: Item) => {
      store.set(entity.id, entity);
      return entity.id;
    });
    const removeOne = vi.fn((id: string) => {
      store.delete(id);
    });
    const map = () => store;

    return {
      store,
      upsertOne,
      removeOne,
      map,
    } as unknown as EntitySnapshotAccessor<Item, string> & {
      store: Map<string, Item>;
      upsertOne: typeof upsertOne;
      removeOne: typeof removeOne;
    };
  }

  it('merges the change onto the existing entity and returns previousData', () => {
    const entities = createFakeAccessor([{ id: '1', name: 'a', qty: 1 }]);

    const patch = applyOptimisticEntityChange(entities, '1', { qty: 2 });

    expect(patch.previousData).toEqual({ id: '1', name: 'a', qty: 1 });
    expect(patch.data).toEqual({ id: '1', name: 'a', qty: 2 });
    expect(entities.store.get('1')).toEqual({ id: '1', name: 'a', qty: 2 });
  });

  it('rollback restores the previous entity for an existing entity', () => {
    const entities = createFakeAccessor([{ id: '1', name: 'a', qty: 1 }]);

    const { rollback } = applyOptimisticEntityChange(entities, '1', { qty: 99 });
    expect(entities.store.get('1')?.qty).toBe(99);

    rollback();

    expect(entities.store.get('1')).toEqual({ id: '1', name: 'a', qty: 1 });
  });

  it('treats a change to a nonexistent id as a create, with previousData undefined', () => {
    const entities = createFakeAccessor([]);

    const patch = applyOptimisticEntityChange(entities, 'new-1', {
      id: 'new-1',
      name: 'brand new',
    });

    expect(patch.previousData).toBeUndefined();
    expect(patch.data).toEqual({ id: 'new-1', name: 'brand new' });
    expect(entities.store.get('new-1')).toEqual({
      id: 'new-1',
      name: 'brand new',
    });
  });

  it('rollback removes a newly-created entity instead of resurrecting a partial record', () => {
    const entities = createFakeAccessor([]);

    const { rollback } = applyOptimisticEntityChange(entities, 'new-1', {
      id: 'new-1',
      name: 'brand new',
    });
    expect(entities.store.has('new-1')).toBe(true);

    rollback();

    expect(entities.store.has('new-1')).toBe(false);
    expect(entities.removeOne).toHaveBeenCalledWith('new-1');
  });

  it('rollback is a no-op if the newly-created entity was already removed by other means', () => {
    const entities = createFakeAccessor([]);

    const { rollback } = applyOptimisticEntityChange(entities, 'new-1', {
      id: 'new-1',
      name: 'brand new',
    });
    entities.store.delete('new-1'); // removed elsewhere before rollback runs

    expect(() => rollback()).not.toThrow();
    expect(entities.removeOne).not.toHaveBeenCalled();
  });
});
