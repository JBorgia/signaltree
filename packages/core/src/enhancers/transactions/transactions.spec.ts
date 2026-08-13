import { describe, expect, it, vi } from 'vitest';

import { entityMap } from '../../lib/markers/entity-map';
import { LoadingState, status } from '../../lib/markers/status';
import { stored } from '../../lib/markers/stored';
import { signalTree } from '../../lib/signal-tree';
import { SignalTreeRollbackError } from '../../lib/types';
import { transactions } from './transactions';

describe('transactions enhancer', () => {
  const expectRollbackError = (
    attempt: () => void,
    expectedCause: Record<string, unknown>
  ): void => {
    try {
      attempt();
      throw new Error('Expected rollback to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SignalTreeRollbackError);
      const rollbackError = error as SignalTreeRollbackError;
      expect(rollbackError.code).toBe('SIGNALTREE_ROLLBACK_FAILED');
      expect(rollbackError.cause).toMatchObject(expectedCause);
    }
  };

  it('adds transaction semantics without exposing temporal history methods', () => {
    const store = signalTree({ count: 0 }).with(transactions()) as Record<
      string,
      unknown
    >;

    expect(typeof store.transaction).toBe('function');
    expect(store.undo).toBeUndefined();
    expect(store.redo).toBeUndefined();
    expect(store.canUndo).toBeUndefined();
    expect(store.canRedo).toBeUndefined();
    expect(store.getHistory).toBeUndefined();
    expect(store.jumpTo).toBeUndefined();
    expect(store.getCurrentIndex).toBeUndefined();
    expect(store.__timeTravel).toBeUndefined();
  });

  it('keeps pending transactions out of confirmed causal turns until confirm', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({ count: 0 }).with(transactions()) as {
      (): { count: number };
      $: { count: () => number };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
      __transactions: {
        getConfirmedTurnCount(): number;
        getPendingTurnCount(): number;
      };
    };

    const pending = store.transaction(() => {
      store.$.count.set(1);
    });

    expect(store.$.count()).toBe(1);
    expect(store.__transactions.getConfirmedTurnCount()).toBe(0);
    expect(store.__transactions.getPendingTurnCount()).toBe(1);

    pending.confirm();

    expect(store.__transactions.getConfirmedTurnCount()).toBe(1);
    expect(store.__transactions.getPendingTurnCount()).toBe(0);
  });

  it('rolls back a pending optimistic transaction without reverting later confirmed work', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({ inside: '', outside: '' }).with(transactions());

    const pending = store.transaction(() => {
      store.$.inside.set('grouped');
    });

    store.$.outside.set('later');

    await Promise.resolve();
    await Promise.resolve();

    pending.rollback();

    expect(store()).toEqual({ inside: '', outside: 'later' });
  });

  it('rolls back pending status source-signal writes without status-specific logic', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({ job: status() }).with(transactions());

    const pending = store.transaction(() => {
      store.$.job.state.set(LoadingState.Error);
      store.$.job.error.set(new Error('boom'));
    });

    expect(store.$.job.state()).toBe(LoadingState.Error);
    expect(store.$.job.error()?.message).toBe('boom');

    pending.rollback();

    expect(store.$.job.state()).toBe(LoadingState.NotLoaded);
    expect(store.$.job.error()).toBe(null);
  });

  it('rolls back pending stored writes and restores persisted state', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const map = new Map<string, string>();
    const adapter: Storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      get length() {
        return map.size;
      },
    };
    map.set('tx-stored', JSON.stringify({ __v: 1, data: 'light' }));

    const store = signalTree({
      theme: stored('tx-stored', 'light', { storage: adapter, debounceMs: 0 }),
    }).with(transactions()) as {
      $: { theme: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
      __transactions: {
        getConfirmedTurnCount(): number;
        getPendingTurnCount(): number;
      };
    };

    const pending = store.transaction(() => {
      store.$.theme.set('dark');
    });

    expect(store.$.theme()).toBe('dark');
    expect(JSON.parse(map.get('tx-stored') as string).data).toBe('dark');

    pending.rollback();

    expect(store.$.theme()).toBe('light');
    expect(JSON.parse(map.get('tx-stored') as string).data).toBe('light');
    expect(store.__transactions.getConfirmedTurnCount()).toBe(0);
    expect(store.__transactions.getPendingTurnCount()).toBe(0);
  });

  it('aborts a thrown transaction callback by undoing only transaction writes', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const store = signalTree({ left: '', right: '', outside: 'stable' }).with(
      transactions()
    );

    expect(() =>
      store.transaction(() => {
        store.$.left.set('L');
        store.$.right.set('R');
        throw new Error('boom');
      })
    ).toThrow('boom');

    await Promise.resolve();
    expect(store()).toEqual({ left: '', right: '', outside: 'stable' });
  });

  it('keeps the primary transaction error when capture release cleanup also fails', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    const {
      MUTATION_CAPTURE_RUNTIME,
    } = await import('../../lib/internals/mutation-capture-runtime');
    const { getOrCreateInternalTransactionRuntime } = await import(
      './transactions'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const store = signalTree({ left: '', outside: 'stable' });
    const cleanupFailure = new Error('cleanup failed');
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (store as unknown as Record<symbol, unknown>)[MUTATION_CAPTURE_RUNTIME] = {
      isCaptureActive: () => false,
      activateCapture: () => () => {
        throw cleanupFailure;
      },
    };

    const runtime = getOrCreateInternalTransactionRuntime(store, () => {
      /* no-op */
    });

    expect(() =>
      runtime.transaction(() => {
        store.$.left.set('L');
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(report).toHaveBeenCalledWith(
      'SignalTree: transactions() cleanup failed during transaction capture release after failure.',
      cleanupFailure
    );

    report.mockRestore();
  });

  it('surfaces capture release cleanup failure when the transaction body succeeds', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    const {
      MUTATION_CAPTURE_RUNTIME,
    } = await import('../../lib/internals/mutation-capture-runtime');
    const { getOrCreateInternalTransactionRuntime } = await import(
      './transactions'
    );
    resetPathNotifier();

    const store = signalTree({ count: 0 });
    const cleanupFailure = new Error('cleanup failed');
    (store as unknown as Record<symbol, unknown>)[MUTATION_CAPTURE_RUNTIME] = {
      isCaptureActive: () => false,
      activateCapture: () => () => {
        throw cleanupFailure;
      },
    };

    const runtime = getOrCreateInternalTransactionRuntime(store, () => {
      /* no-op */
    });

    expect(() =>
      runtime.transaction(() => {
        store.$.count.set(1);
      })
    ).toThrow('cleanup failed');
  });

  it('preserves a later same-subject field write when rolling back a pending rekey', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(transactions());

    store.$.rows.addOne({ id: 7, name: 'target' });
    await Promise.resolve();
    await Promise.resolve();

    const pending = store.transaction(() => {
      store.$.rows.changeId(7, 42);
    });

    store.$.rows.byIdOrFail(42).name.set('later');
    await Promise.resolve();
    await Promise.resolve();

    pending.rollback();

    expect(store.$.rows.ids()).toEqual([7]);
    expect(store.$.rows.byIdOrFail(7).name()).toBe('later');
  });

  it('rejects rollback of a pending add when later same-subject field work depends on that existence', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(transactions());

    const pending = store.transaction(() => {
      store.$.rows.addOne({ id: 17, name: 'pending' });
    });

    store.$.rows.byIdOrFail(17).name.set('later');
    await Promise.resolve();
    await Promise.resolve();

    expectRollbackError(() => pending.rollback(), {
      kind: 'later-confirmed-dependency',
      pendingEffect: { kind: 'add' },
      conflictingEffect: { kind: 'set' },
    });
    expect(store.$.rows.ids()).toEqual([17]);
    expect(store.$.rows.byIdOrFail(17).name()).toBe('later');
  });

  it('supports an optimistic workflow where rollback reverts optimistic state but preserves later unrelated activity', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({
      order: { status: 'open' as 'open' | 'assigned' },
      driver: { orderId: null as number | null },
      telemetry: entityMap<{ id: number; lat: number }, number>({
        selectId: (row) => row.id,
      }),
    }).with(transactions());

    const pending = store.transaction(() => {
      store.$.order.status.set('assigned');
      store.$.driver.orderId.set(17);
    });

    store.$.telemetry.addOne({ id: 9, lat: 42 });
    await Promise.resolve();
    await Promise.resolve();

    pending.rollback();

    expect(store()).toEqual({
      order: { status: 'open' },
      driver: { orderId: null },
      telemetry: { all: [{ id: 9, lat: 42 }] },
    });
  });

  it('supports application refetch fallback when rollback is conservatively rejected', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(transactions());

    const pending = store.transaction(() => {
      store.$.rows.addOne({ id: 17, name: 'optimistic' });
    });

    store.$.rows.byIdOrFail(17).name.set('dependent-later');
    await Promise.resolve();
    await Promise.resolve();

    try {
      pending.rollback();
      throw new Error('Expected rollback to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SignalTreeRollbackError);
      store.$.rows.removeOne(17);
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(store.$.rows.ids()).toEqual([]);
  });
});
