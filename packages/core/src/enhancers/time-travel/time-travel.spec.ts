import { describe, expect, it } from 'vitest';

import { entityMap } from '../../lib/markers/entity-map';
import { form } from '../../lib/markers/form';
import { interceptLeafSignals } from '../../lib/internals/intercept-leaf-signals';
import { status } from '../../lib/markers/status';
import { stored } from '../../lib/markers/stored';
import { signalTree } from '../../lib/signal-tree';
import { enableTimeTravel, timeTravel, withTimeTravel } from './time-travel';

describe('time-travel enhancer', () => {
  it('exports factory and aliases', () => {
    expect(typeof timeTravel).toBe('function');
    expect(typeof timeTravel()).toBe('function');
    expect(typeof withTimeTravel).toBe('function');
    expect(typeof enableTimeTravel).toBe('function');
  });

  it('records a single history entry per PathNotifier flush when batching is enabled', async () => {
    // Create the enhanced store
    const store = (await import('../../lib/signal-tree'))
      .signalTree({ count: 0 })
      .with(timeTravel());
    const t = (store as any).__timeTravel;

    // Ensure global notifier is in default state and enabled for batching
    const { resetPathNotifier, getPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();
    const notifier = getPathNotifier();
    notifier.setBatchingEnabled(true);

    // Simulate a subscriber updating the tree during flush (real systems
    // typically have subscribers that apply state changes in response to
    // PathNotifier events). This ensures timeTravel snapshots a changed
    // state rather than deduping an identical snapshot.
    notifier.subscribe('count', (v) => {
      store({ count: v as number });
    });

    notifier.notify('count', 1, 0);
    notifier.notify('count', 2, 0);

    // Allow microtask flush
    await Promise.resolve();

    const history = t.getHistory();
    // INIT + 1 batch
    expect(history.length).toBeGreaterThanOrEqual(2);
    // Ensure the last entry reflects the latest value (not every PathNotifier will change tree, but timeTravel should snapshot tree())
    const last = history[history.length - 1];
    expect(last.state).toBeDefined();
  });

  it('records history when a top-level leaf signal is written via .set()', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = (await import('../../lib/signal-tree'))
      .signalTree({ count: 0 })
      .with(timeTravel());
    const t = (store as any).__timeTravel;
    const initial = t.getHistory().length;

    (store as any).$.count.set(5);

    await Promise.resolve();
    await Promise.resolve();

    const history = t.getHistory();
    expect(history.length).toBeGreaterThan(initial);
    expect(history[history.length - 1].state).toEqual({ count: 5 });
  });

  it('records history when a nested leaf signal is written via .set()', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = (await import('../../lib/signal-tree'))
      .signalTree({ user: { profile: { name: 'Ada' } } })
      .with(timeTravel());
    const t = (store as any).__timeTravel;
    const initial = t.getHistory().length;

    (store as any).$.user.profile.name.set('Grace');

    await Promise.resolve();
    await Promise.resolve();

    const history = t.getHistory();
    expect(history.length).toBeGreaterThan(initial);
    expect(history[history.length - 1].state).toEqual({
      user: { profile: { name: 'Grace' } },
    });
  });

  it('records deduped owner paths for a mixed batched write', async () => {
    const store = signalTree({
      profile: form<{ name: string }>({ initial: { name: '' } }),
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      load: status(),
      theme: stored('time-travel-owner-paths', 'light'),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;
    const initial = t.getHistory().length;

    store.$.profile.$.name.set('Ada');
    store.$.rows.addOne({ id: 1, name: 'A' });
    store.$.load.setLoading();
    store.$.theme.set('dark');

    await Promise.resolve();
    await Promise.resolve();

    const history = t.getHistory();
    expect(history.length).toBeGreaterThan(initial);
    expect([...(history.at(-1)?.__ownerPaths ?? [])].sort()).toEqual([
      'load',
      'profile',
      'rows',
      'theme',
    ]);
  });

  it('records one canonical turn across multiple owner positions in one flush', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'assigned' });
    store.$.trucks.addOne({ id: 12, driverId: 7 });
    store.$.orders.addOne({ id: 99, status: 'dispatched' });

    await Promise.resolve();
    await Promise.resolve();

    const entry = t.getHistory().at(-1) as {
      __turnId?: number;
      __positionIds?: number[];
    };
    const turnId = entry.__turnId;
    const positionIds = [...(entry.__positionIds ?? [])].sort((a, b) => a - b);
    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      historyIndex: number;
    };

    expect(turnId).toBeDefined();
    expect(positionIds).toHaveLength(3);
    expect(turn.id).toBe(turnId);
    expect([...(turn.__positionIds ?? [])].sort((a, b) => a - b)).toEqual(
      positionIds
    );
    expect(turn.historyIndex).toBe(t.getHistory().length - 1);

    for (const positionId of positionIds) {
      expect(t.getTurnIdsForPosition(positionId)).toEqual([turnId]);
    }
  });

  it('indexes one position across many turns without duplicating the canonical turn', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'assigned' });
    store.$.trucks.addOne({ id: 12, driverId: 7 });
    await Promise.resolve();
    await Promise.resolve();

    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };

    store.$.drivers.updateOne(7, { status: 'released' });
    await Promise.resolve();
    await Promise.resolve();

    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const driverPositionId = secondTurn.__positionIds?.[0];
    const truckPositionId = (firstTurn.__positionIds ?? []).find(
      (positionId) => positionId !== driverPositionId
    );

    expect(firstTurn.__positionIds).toHaveLength(2);
    expect(secondTurn.__positionIds).toEqual([driverPositionId]);
    expect(truckPositionId).toBeDefined();
    expect(t.getTurnIdsForPosition(driverPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
    ]);
    expect(t.getTurnIdsForPosition(truckPositionId as number)).toEqual([
      firstTurn.id,
    ]);
  });

  it('resolves the full canonical turn from any indexed position', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'assigned' });
    store.$.trucks.addOne({ id: 12, driverId: 7 });

    await Promise.resolve();
    await Promise.resolve();

    const entry = t.getHistory().at(-1) as {
      __turnId?: number;
      __positionIds?: number[];
    };
    const turnId = entry.__turnId as number;
    const [leftPositionId, rightPositionId] = entry.__positionIds ?? [];

    expect(t.getTurnIdsForPosition(leftPositionId)).toEqual([turnId]);
    expect(t.getTurnIdsForPosition(rightPositionId)).toEqual([turnId]);
    expect(t.getTurn(turnId)).toMatchObject({
      id: turnId,
      __positionIds: expect.arrayContaining([leftPositionId, rightPositionId]),
    });
  });

  it('stores the history entry and canonical turn as the same object reference', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'assigned' });
    store.$.trucks.addOne({ id: 12, driverId: 7 });

    await Promise.resolve();
    await Promise.resolve();

    const historyIndex = t.getHistory().length - 1;
    const turnId = t.getHistory().at(-1).__turnId as number;

    expect(t.getTurnRef(turnId)).toBe(t.getHistoryRef(historyIndex));
  });

  it('undoes the frontier closure needed to keep every position prefix-closed', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });

    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);

    await Promise.resolve();
    await Promise.resolve();

    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };

    store.$.drivers.byIdOrFail(7).status.set('released');

    await Promise.resolve();
    await Promise.resolve();

    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const driverPositionId = secondTurn.__positionIds?.[0] as number;
    const truckPositionId = (firstTurn.__positionIds ?? []).find(
      (positionId: number) => positionId !== driverPositionId
    ) as number;

    expect(t.resolveUndoClosure(truckPositionId)).toEqual([
      secondTurn.id,
      firstTurn.id,
    ]);

    expect(t.undoPosition(truckPositionId)).toEqual([
      secondTurn.id,
      firstTurn.id,
    ]);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(truckPositionId)).toEqual([]);
    expect(t.getFrontier(driverPositionId)).toBe(0);
    expect(t.getFrontier(truckPositionId)).toBe(0);
    expect(t.isTurnApplied(firstTurn.id)).toBe(false);
    expect(t.isTurnApplied(secondTurn.id)).toBe(false);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBeNull();
  });

  it('undoes transitive dependents until the closure reaches a fixed point', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      depots: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    store.$.depots.addOne({ id: 5, status: 'ready' });

    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);

    await Promise.resolve();
    await Promise.resolve();

    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const driverPositionId = firstTurn.__positionIds?.[0] as number;
    const truckPositionId = firstTurn.__positionIds?.[1] as number;

    store.$.drivers.byIdOrFail(7).status.set('loading');
    store.$.orders.byIdOrFail(99).status.set('queued');

    await Promise.resolve();
    await Promise.resolve();

    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const orderPositionId = (secondTurn.__positionIds ?? []).find(
      (positionId: number) => positionId !== driverPositionId
    ) as number;

    store.$.orders.byIdOrFail(99).status.set('dispatched');

    await Promise.resolve();
    await Promise.resolve();

    const thirdTurn = t.getTurns().at(-1) as {
      id: number;
    };

    store.$.depots.byIdOrFail(5).status.set('busy');

    await Promise.resolve();
    await Promise.resolve();

    const fourthTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const depotPositionId = fourthTurn.__positionIds?.[0] as number;

    expect(t.resolveUndoClosure(truckPositionId)).toEqual([
      thirdTurn.id,
      secondTurn.id,
      firstTurn.id,
    ]);

    expect(t.undoPosition(truckPositionId)).toEqual([
      thirdTurn.id,
      secondTurn.id,
      firstTurn.id,
    ]);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(truckPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(orderPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(depotPositionId)).toEqual([
      fourthTurn.id,
    ]);
    expect(t.getFrontier(driverPositionId)).toBe(0);
    expect(t.getFrontier(truckPositionId)).toBe(0);
    expect(t.getFrontier(orderPositionId)).toBe(0);
    expect(t.getFrontier(depotPositionId)).toBe(1);
    expect(t.isTurnApplied(firstTurn.id)).toBe(false);
    expect(t.isTurnApplied(secondTurn.id)).toBe(false);
    expect(t.isTurnApplied(thirdTurn.id)).toBe(false);
    expect(t.getTurnStatus(fourthTurn.id)).toBe('applied');
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBeNull();
    expect(store.$.orders.byIdOrFail(99).status()).toBe('new');
    expect(store.$.depots.byIdOrFail(5).status()).toBe('busy');
  });

  it('preserves an unrelated later turn while selectively undoing a closure', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });

    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();

    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const driverPositionId = firstTurn.__positionIds?.[0] as number;
    const truckPositionId = firstTurn.__positionIds?.[1] as number;

    store.$.drivers.byIdOrFail(7).status.set('released');
    await Promise.resolve();
    await Promise.resolve();

    const secondTurn = t.getTurns().at(-1) as { id: number };

    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();

    const thirdTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const orderPositionId = thirdTurn.__positionIds?.[0] as number;

    expect(t.resolveUndoClosure(truckPositionId)).toEqual([
      secondTurn.id,
      firstTurn.id,
    ]);

    expect(t.undoPosition(truckPositionId)).toEqual([
      secondTurn.id,
      firstTurn.id,
    ]);

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBeNull();
    expect(store.$.orders.byIdOrFail(99).status()).toBe('queued');
    expect(t.getAppliedTurnIdsForPosition(driverPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(truckPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(orderPositionId)).toEqual([
      thirdTurn.id,
    ]);
    expect(t.getTurnStatus(firstTurn.id)).toBe('unapplied');
    expect(t.getTurnStatus(secondTurn.id)).toBe('unapplied');
    expect(t.getTurnStatus(thirdTurn.id)).toBe('applied');
  });

  it('fails before mutating state or frontiers when a closure contains an unsupported effect', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();

    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };

    store.$.drivers.byIdOrFail(7).status.set('released');
    await Promise.resolve();
    await Promise.resolve();

    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const driverPositionId = secondTurn.__positionIds?.[0] as number;
    const truckPositionId = (firstTurn.__positionIds ?? []).find(
      (positionId: number) => positionId !== driverPositionId
    ) as number;

    const poisonedTurn = t.getTurnRef(firstTurn.id) as {
      __effects?: Array<Record<string, unknown>>;
    };
    poisonedTurn.__effects?.push({
      kind: 'set',
      position: driverPositionId,
      ownerPath: 'drivers',
      path: 'drivers.7.status',
      before: { invalid: true },
      after: 'ignored',
      subject: 999,
    });

    expect(() => t.undoPosition(truckPositionId)).toThrow(
      'Unsupported scoped undo effect'
    );
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('released');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBe(7);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
    ]);
    expect(t.getAppliedTurnIdsForPosition(truckPositionId)).toEqual([
      firstTurn.id,
    ]);
  });

  it('reapplies prerequisite closure oldest-to-newest when redoing from a dependent position', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };

    store.$.drivers.byIdOrFail(7).status.set('loading');
    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const orderPositionId = (secondTurn.__positionIds ?? []).find(
      (positionId: number) =>
        positionId !== (firstTurn.__positionIds?.[0] as number)
    ) as number;

    store.$.orders.byIdOrFail(99).status.set('dispatched');
    await Promise.resolve();
    await Promise.resolve();
    const thirdTurn = t.getTurns().at(-1) as { id: number };

    const truckPositionId = firstTurn.__positionIds?.[1] as number;
    expect(t.undoPosition(truckPositionId)).toEqual([
      thirdTurn.id,
      secondTurn.id,
      firstTurn.id,
    ]);

    expect(t.resolveRedoClosure(orderPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
    ]);
    expect(t.redoPosition(orderPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
    ]);

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('loading');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBe(7);
    expect(store.$.orders.byIdOrFail(99).status()).toBe('queued');
    expect(t.getTurnStatus(firstTurn.id)).toBe('applied');
    expect(t.getTurnStatus(secondTurn.id)).toBe('applied');
    expect(t.getTurnStatus(thirdTurn.id)).toBe('unapplied');
  });

  it('reapplies transitive prerequisites while preserving unrelated applied state', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      depots: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      yards: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    store.$.depots.addOne({ id: 5, status: 'ready' });
    store.$.yards.addOne({ id: 2, status: 'clear' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const truckPositionId = firstTurn.__positionIds?.[1] as number;

    store.$.drivers.byIdOrFail(7).status.set('loading');
    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };

    store.$.orders.byIdOrFail(99).status.set('dispatched');
    store.$.depots.byIdOrFail(5).status.set('busy');
    await Promise.resolve();
    await Promise.resolve();
    const thirdTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const depotPositionId = (thirdTurn.__positionIds ?? []).find(
      (positionId: number) =>
        positionId !== ((secondTurn.__positionIds ?? []).find(
          (candidate: number) => candidate !== (firstTurn.__positionIds?.[0] as number)
        ) as number)
    ) as number;

    store.$.yards.byIdOrFail(2).status.set('occupied');
    await Promise.resolve();
    await Promise.resolve();
    const fourthTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const yardPositionId = fourthTurn.__positionIds?.[0] as number;

    expect(t.undoPosition(truckPositionId)).toEqual([
      thirdTurn.id,
      secondTurn.id,
      firstTurn.id,
    ]);
    expect(t.resolveRedoClosure(depotPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
      thirdTurn.id,
    ]);
    expect(t.redoPosition(depotPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
      thirdTurn.id,
    ]);

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('loading');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBe(7);
    expect(store.$.orders.byIdOrFail(99).status()).toBe('dispatched');
    expect(store.$.depots.byIdOrFail(5).status()).toBe('busy');
    expect(store.$.yards.byIdOrFail(2).status()).toBe('occupied');
    expect(t.getAppliedTurnIdsForPosition(yardPositionId)).toEqual([
      fourthTurn.id,
    ]);
    expect(t.getTurnStatus(fourthTurn.id)).toBe('applied');
  });

  it('canonically truncates abandoned future turns across every position index on a new write', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const firstPositionIds = firstTurn.__positionIds ?? [];

    store.$.drivers.byIdOrFail(7).status.set('loading');
    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const secondPositionIds = secondTurn.__positionIds ?? [];
    const driverPositionId = firstPositionIds.find((positionId: number) =>
      secondPositionIds.includes(positionId)
    ) as number;
    const orderPositionId = secondPositionIds.find(
      (positionId: number) => !firstPositionIds.includes(positionId)
    ) as number;

    store.$.orders.byIdOrFail(99).status.set('dispatched');
    await Promise.resolve();
    await Promise.resolve();
    const thirdTurn = t.getTurns().at(-1) as { id: number };

    expect(t.undoPosition(driverPositionId)).toEqual([
      thirdTurn.id,
      secondTurn.id,
    ]);

    store.$.drivers.byIdOrFail(7).status.set('staged');
    await Promise.resolve();
    await Promise.resolve();

    const fourthTurn = t.getTurns().at(-1) as { id: number };

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('staged');
    expect(t.getTurn(secondTurn.id)).toBeUndefined();
    expect(t.getTurn(thirdTurn.id)).toBeUndefined();
    expect(t.getTurnIdsForPosition(orderPositionId)).toEqual([]);
    expect(t.resolveRedoClosure(orderPositionId)).toEqual([]);
    expect(t.redoPosition(orderPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId)).toEqual([
      firstTurn.id,
      fourthTurn.id,
    ]);
  });

  it('truncates the global canonical future even when the new write is on an unrelated position', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      depots: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    store.$.depots.addOne({ id: 5, status: 'ready' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const driverPositionId = firstTurn.__positionIds?.[0] as number;

    store.$.drivers.byIdOrFail(7).status.set('loading');
    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const orderPositionId = (secondTurn.__positionIds ?? []).find(
      (positionId: number) => positionId !== driverPositionId
    ) as number;

    store.$.orders.byIdOrFail(99).status.set('dispatched');
    await Promise.resolve();
    await Promise.resolve();
    const thirdTurn = t.getTurns().at(-1) as { id: number };

    expect(t.undoPosition(driverPositionId)).toEqual([
      thirdTurn.id,
      secondTurn.id,
    ]);

    store.$.depots.byIdOrFail(5).status.set('busy');
    await Promise.resolve();
    await Promise.resolve();

    const fourthTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const depotPositionId = fourthTurn.__positionIds?.[0] as number;

    expect(t.getTurn(secondTurn.id)).toBeUndefined();
    expect(t.getTurn(thirdTurn.id)).toBeUndefined();
    expect(t.getHistory().map((entry: { id: number }) => entry.id)).toEqual([
      1,
      firstTurn.id,
      fourthTurn.id,
    ]);
    expect(t.getTurnIdsForPosition(driverPositionId)).toEqual([firstTurn.id]);
    expect(t.getTurnIdsForPosition(orderPositionId)).toEqual([]);
    expect(t.resolveRedoClosure(driverPositionId)).toEqual([]);
    expect(t.resolveRedoClosure(orderPositionId)).toEqual([]);
    expect(t.redoPosition(driverPositionId)).toEqual([]);
    expect(t.redoPosition(orderPositionId)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(depotPositionId)).toEqual([
      fourthTurn.id,
    ]);
  });

  it('keeps TurnId monotonic after truncation and a new write', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, status: 'one' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.byIdOrFail(7).status.set('two');
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as { id: number; __positionIds?: number[] };

    store.$.rows.byIdOrFail(7).status.set('three');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as { id: number; __positionIds?: number[] };

    store.$.rows.byIdOrFail(7).status.set('four');
    await Promise.resolve();
    await Promise.resolve();
    const thirdTurn = t.getTurns().at(-1) as { id: number };

    expect(t.undoPosition(firstTurn.__positionIds?.[0] as number)).toEqual([
      thirdTurn.id,
    ]);

    store.$.rows.byIdOrFail(7).status.set('five');
    await Promise.resolve();
    await Promise.resolve();
    const fourthTurn = t.getTurns().at(-1) as { id: number };

    expect(fourthTurn.id).toBeGreaterThan(thirdTurn.id);
  });

  it('coalesces repeated writes to one scalar path into one canonical effect', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string; active: boolean }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'one', active: false });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.byIdOrFail(7).name.set('two');
    store.$.rows.byIdOrFail(7).name.set('three');
    store.$.rows.byIdOrFail(7).name.set('four');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      __effects?: Array<{
        kind: string;
        path: string;
        before: unknown;
        after: unknown;
        subject?: number;
        position: number;
      }>;
    };

    expect(turn.__effects).toHaveLength(1);
    expect(turn.__effects?.[0]).toMatchObject({
      kind: 'set',
      path: 'rows.7.name',
      before: 'one',
      after: 'four',
    });
    expect(turn.__effects?.[0].subject).toBeTypeOf('number');
    expect(turn.__effects?.[0].position).toBeTypeOf('number');
  });

  it('suppresses a canonical turn when every scalar effect coalesces to net zero', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string; active: boolean }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'one', active: false });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();
    const baselineTurnCount = t.getTurns().length;
    const baselineHistoryCount = t.getHistory().length;

    store.$.rows.byIdOrFail(7).name.set('two');
    store.$.rows.byIdOrFail(7).name.set('one');
    await Promise.resolve();
    await Promise.resolve();

    expect(t.getTurns()).toHaveLength(baselineTurnCount);
    expect(t.getHistory()).toHaveLength(baselineHistoryCount);
  });

  it('retains only non-zero scalar effects in a mixed flush', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string; active: boolean }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'one', active: false });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.byIdOrFail(7).name.set('two');
    store.$.rows.byIdOrFail(7).name.set('one');
    store.$.rows.byIdOrFail(7).active.set(true);
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      __effects?: Array<{
        kind: string;
        path: string;
        before: unknown;
        after: unknown;
      }>;
    };

    expect(turn.__effects).toEqual([
      expect.objectContaining({
        kind: 'set',
        path: 'rows.7.active',
        before: false,
        after: true,
      }),
    ]);
  });

  it('keeps independent scalar effects separate while sharing owner and subject identity', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string; active: boolean }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'one', active: false });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.byIdOrFail(7).name.set('two');
    store.$.rows.byIdOrFail(7).active.set(true);
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      __effects?: Array<{
        kind: string;
        path: string;
        before: unknown;
        after: unknown;
        subject?: number;
        position: number;
      }>;
    };

    expect(turn.__effects).toHaveLength(2);
    expect(turn.__effects?.map((effect) => effect.path).sort()).toEqual([
      'rows.7.active',
      'rows.7.name',
    ]);
    expect(turn.__effects?.every((effect) => effect.kind === 'set')).toBe(true);
    expect(turn.__effects?.[0].subject).toEqual(turn.__effects?.[1].subject);
    expect(turn.__effects?.[0].position).toEqual(turn.__effects?.[1].position);
  });

  it('undoes and redoes a single collection remove while preserving SubjectId and order', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addMany([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.removeOne(2);
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{ kind: string; subject?: number; key?: number }>;
    };
    const collectionPositionId = turn.__positionIds?.[0] as number;
    const removeEffect = turn.__effects?.[0] as {
      kind: string;
      subject?: number;
      key?: number;
    };

    expect(store.$.rows.ids()).toEqual([1, 3]);
    expect(turn.__effects).toEqual([
      expect.objectContaining({
        kind: 'remove',
        subject: expect.any(Number),
        key: 2,
      }),
    ]);

    expect(t.undoPosition(collectionPositionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1, 2, 3]);
    expect(store.$.rows.byIdOrFail(2).name.__subjectIds?.[0]).toBe(
      removeEffect.subject
    );

    expect(t.redoPosition(collectionPositionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1, 3]);
  });

  it('undoes a collection remove closure while preserving an unrelated later scalar turn', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addMany([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ]);
    store.$.drivers.addOne({ id: 7, status: 'idle' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.removeOne(2);
    await Promise.resolve();
    await Promise.resolve();
    const removeTurn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const collectionPositionId = removeTurn.__positionIds?.[0] as number;

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();
    const scalarTurn = t.getTurns().at(-1) as { id: number; __positionIds?: number[] };
    const driverPositionId = scalarTurn.__positionIds?.[0] as number;

    expect(t.undoPosition(collectionPositionId)).toEqual([removeTurn.id]);
    expect(store.$.rows.ids()).toEqual([1, 2, 3]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('assigned');
    expect(t.getAppliedTurnIdsForPosition(driverPositionId)).toEqual([
      scalarTurn.id,
    ]);
  });

  it('undos and redoes one mixed turn containing collection remove and scalar effects atomically', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; state: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addMany([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ]);
    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.orders.addOne({ id: 31, state: 'open' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.removeOne(2);
    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.orders.byIdOrFail(31).state.set('dispatched');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{ kind: string; path: string }>;
    };
    const [collectionPositionId, driverPositionId, orderPositionId] =
      turn.__positionIds ?? [];

    expect(turn.__effects?.map((effect) => effect.kind).sort()).toEqual([
      'remove',
      'set',
      'set',
    ]);
    expect(turn.__effects?.map((effect) => effect.path).sort()).toEqual([
      'drivers.7.status',
      'orders.31.state',
      'rows.2',
    ]);
    expect(t.resolveUndoClosure(orderPositionId as number)).toEqual([turn.id]);

    expect(t.undoPosition(orderPositionId as number)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1, 2, 3]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(store.$.orders.byIdOrFail(31).state()).toBe('open');
    expect(t.getFrontier(collectionPositionId as number)).toBe(0);
    expect(t.getFrontier(driverPositionId as number)).toBe(0);
    expect(t.getFrontier(orderPositionId as number)).toBe(0);

    expect(t.redoPosition(collectionPositionId as number)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1, 3]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('assigned');
    expect(store.$.orders.byIdOrFail(31).state()).toBe('dispatched');
  });

  it('undoes and redoes an added row while preserving SubjectId continuity', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    t.resetHistory();

    store.$.rows.addOne({ id: 7, name: 'B' });
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{
        kind: string;
        subject?: number;
        key?: number;
      }>;
    };
    const positionId = turn.__positionIds?.[0] as number;
    const addEffect = turn.__effects?.[0] as {
      subject: number;
      key: number;
    };

    expect(turn.__effects).toEqual([
      expect.objectContaining({ kind: 'add', key: 7, subject: expect.any(Number) }),
    ]);
    expect(store.$.rows.byIdOrFail(7).name.__subjectIds?.[0]).toBe(addEffect.subject);

    expect(t.undoPosition(positionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([]);

    expect(t.redoPosition(positionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([7]);
    expect(store.$.rows.byIdOrFail(7).name.__subjectIds?.[0]).toBe(addEffect.subject);
  });

  it('replays a prepended add at its anchored position', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 1, name: 'A' });
    store.$.rows.addOne({ id: 3, name: 'C' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.prependOne({ id: 2, name: 'B' });
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{
        kind: string;
        subject?: number;
        afterSubject?: number;
      }>;
    };
    const positionId = turn.__positionIds?.[0] as number;
    const addEffect = turn.__effects?.[0] as {
      subject: number;
      afterSubject?: number;
    };

    expect(store.$.rows.ids()).toEqual([2, 1, 3]);
    expect(addEffect.afterSubject).toBe(store.$.rows.byIdOrFail(1).name.__subjectIds?.[0]);

    expect(t.undoPosition(positionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1, 3]);

    expect(t.redoPosition(positionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([2, 1, 3]);
    expect(store.$.rows.byIdOrFail(2).name.__subjectIds?.[0]).toBe(addEffect.subject);
  });

  it('undos and redoes a mixed add turn atomically', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 1, name: 'A' });
    store.$.drivers.addOne({ id: 7, status: 'idle' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.addOne({ id: 2, name: 'B' });
    store.$.drivers.byIdOrFail(7).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{ kind: string }>;
    };
    const [collectionPositionId, driverPositionId] = turn.__positionIds ?? [];

    expect(turn.__effects?.map((effect) => effect.kind).sort()).toEqual([
      'add',
      'set',
    ]);

    expect(t.undoPosition(driverPositionId as number)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(t.getFrontier(collectionPositionId as number)).toBe(0);
    expect(t.getFrontier(driverPositionId as number)).toBe(0);

    expect(t.redoPosition(collectionPositionId as number)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1, 2]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('assigned');
  });

  it('fails atomically when redoing a mixed add turn cannot restore the added subject', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 1, name: 'A' });
    store.$.drivers.addOne({ id: 7, status: 'idle' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.addOne({ id: 2, name: 'B' });
    store.$.drivers.byIdOrFail(7).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const [collectionPositionId, driverPositionId] = turn.__positionIds ?? [];

    expect(t.undoPosition(driverPositionId as number)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([1]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');

    const poisonedTurn = t.getTurnRef(turn.id) as {
      __effects?: Array<Record<string, unknown>>;
    };
    const addEffect = poisonedTurn.__effects?.find(
      (effect) => effect.kind === 'add'
    );
    if (!addEffect) {
      throw new Error('Expected add effect');
    }
    addEffect.key = 1;

    expect(() => t.redoPosition(collectionPositionId as number)).toThrow(
      'Cannot restore added entity'
    );
    expect(store.$.rows.ids()).toEqual([1]);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(t.getAppliedTurnIdsForPosition(collectionPositionId as number)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId as number)).toEqual([]);
    expect(t.getFrontier(collectionPositionId as number)).toBe(0);
    expect(t.getFrontier(driverPositionId as number)).toBe(0);
  });

  it('keeps owner paths stable across changeId while notifier paths change', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;
    const initial = t.getHistory().length;
    const seenPaths: string[] = [];
    const notifier = getPathNotifier();
    const unsubscribe = notifier.subscribe('rows.*', (_next, _prev, path) => {
      seenPaths.push(path);
    });

    store.$.rows.addOne({ id: -1, name: 'temp' });
    await Promise.resolve();
    await Promise.resolve();
    const addEntry = t.getHistory().at(-1);
    expect(t.getHistory().length).toBeGreaterThan(initial);

    store.$.rows.changeId(-1, 42);
    await Promise.resolve();
    await Promise.resolve();
    const changeIdEntry = t.getHistory().at(-1);
    const observed = t.getObservedBatches();

    unsubscribe();

    expect(addEntry?.__ownerPaths).toEqual(['rows']);
    expect(changeIdEntry?.__ownerPaths).toEqual(['rows']);
    expect(observed.at(-2)).toEqual({
      action: 'batch',
      ownerPaths: ['rows'],
      recorded: true,
    });
    expect(observed.at(-1)).toEqual({
      action: 'batch',
      ownerPaths: ['rows'],
      recorded: true,
    });
    // `changeId` notifies with the same entity object as both prev and next,
    // so the generic PathNotifier flush dedupes that path out. The owner-path
    // probe still records the owning position through the marker interceptor,
    // which is what makes the batch record even though a generic subscriber
    // does not see `rows.42`.
    expect(seenPaths).toEqual(['rows.-1']);
  });

  it('records the user branch, not the replay branch, when undo and a user write share a tick', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({ count: 0 }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.count.set(1);
    await Promise.resolve();
    await Promise.resolve();

    store.$.count.set(2);
    await Promise.resolve();
    await Promise.resolve();

    t.undo();
    store.$.count.set(3);
    await Promise.resolve();
    await Promise.resolve();

    const historyStates = t.getHistory().map((entry: { state: { count: number } }) => entry.state.count);

    expect(store().count).toBe(3);
    expect(historyStates).toEqual([0, 1, 3]);
  });

  it('does not retain a user transition when a queued user write is undone in the same tick', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({ count: 0 }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.count.set(1);
    await Promise.resolve();
    await Promise.resolve();

    store.$.count.set(2);
    await Promise.resolve();
    await Promise.resolve();

    store.$.count.set(3);
    t.undo();
    await Promise.resolve();
    await Promise.resolve();

    const historyStates = t.getHistory().map((entry: { state: { count: number } }) => entry.state.count);

    expect(store().count).toBe(1);
    expect(historyStates).not.toContain(3);
    expect(historyStates.at(-1)).toBe(1);
  });

  it('keeps one owner position stable while row subjects churn', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const notifier = getPathNotifier();
    const t = (store as any).__timeTravel;
    const liveOwnerTokens: number[][] = [];
    const liveSubjectTokens: number[][] = [];
    const replayOwnerTokens: number[][] = [];

    const unsubscribe = notifier.subscribe(
      'rows',
      (_next, _prev, _path, _ownerPath, source, subjectIds, positionIds) => {
        if (source === 'time-travel') {
          return;
        }
        if (subjectIds && subjectIds.length > 0) {
          liveSubjectTokens.push(subjectIds);
        }
        if (positionIds && positionIds.length > 0) {
          liveOwnerTokens.push(positionIds);
        }
      }
    );
    const restoreReplayObserver = interceptLeafSignals(
      (store as any).$,
      (_path, _next, _prev, meta) => {
        if (meta?.source !== 'time-travel') {
          return;
        }
        const positionIds = meta.positionIds;
        if (Array.isArray(positionIds) && positionIds.length > 0) {
          replayOwnerTokens.push(positionIds as number[]);
        }
      }
    );

    store.$.rows.addOne({ id: 7, name: 'original' });
    await Promise.resolve();
    await Promise.resolve();
    const ownerAfterFirstAdd = [
      ...(((t.getHistory().at(-1) as { __positionIds?: number[] })?.__positionIds) ?? []),
    ];
    const subjectAfterFirstAdd = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.addOne({ id: 8, name: 'second' });
    await Promise.resolve();
    await Promise.resolve();
    const ownerAfterSecondAdd = [
      ...(((t.getHistory().at(-1) as { __positionIds?: number[] })?.__positionIds) ?? []),
    ];
    const subjectAfterSecondAdd = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.changeId(7, 70);
    await Promise.resolve();
    await Promise.resolve();
    const ownerAfterRekey = [
      ...(((t.getHistory().at(-1) as { __positionIds?: number[] })?.__positionIds) ?? []),
    ];

    store.$.rows.removeOne(8);
    await Promise.resolve();
    await Promise.resolve();

    store.$.rows.addOne({ id: 8, name: 'replacement' });
    await Promise.resolve();
    await Promise.resolve();
    const ownerAfterReuse = [
      ...(((t.getHistory().at(-1) as { __positionIds?: number[] })?.__positionIds) ?? []),
    ];
    const subjectAfterReuse = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    t.undo();
    await Promise.resolve();
    await Promise.resolve();

    restoreReplayObserver();
    unsubscribe();

    expect(ownerAfterFirstAdd).toHaveLength(1);
    expect(ownerAfterSecondAdd).toEqual(ownerAfterFirstAdd);
    expect(ownerAfterRekey).toEqual(ownerAfterFirstAdd);
    expect(ownerAfterReuse).toEqual(ownerAfterFirstAdd);
    expect(subjectAfterFirstAdd).toHaveLength(1);
    expect(subjectAfterSecondAdd).toHaveLength(1);
    expect(subjectAfterSecondAdd).not.toEqual(subjectAfterFirstAdd);
    expect(subjectAfterReuse).toHaveLength(1);
    expect(subjectAfterReuse).not.toEqual(subjectAfterSecondAdd);
    expect(liveOwnerTokens).toContainEqual(ownerAfterFirstAdd);
    expect(replayOwnerTokens).toContainEqual(ownerAfterFirstAdd);
    expect(liveSubjectTokens).toContainEqual(subjectAfterFirstAdd);
    expect(liveSubjectTokens).toContainEqual(subjectAfterSecondAdd);
    expect(liveSubjectTokens).toContainEqual(subjectAfterReuse);
  });

  it('does not collapse same-path remove-plus-readd across a subject boundary in one flush', async () => {
    const { resetPathNotifier } = await import('../../lib/path-notifier');
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'first' });
    await Promise.resolve();
    await Promise.resolve();

    const beforeBoundaryEntry = t.getHistory().at(-1) as {
      __positionIds?: number[];
      __subjectIds?: number[];
    };

    store.$.rows.removeOne(7);
    store.$.rows.addOne({ id: 7, name: 'replacement' });
    await Promise.resolve();
    await Promise.resolve();

    const boundaryEntry = t.getHistory().at(-1) as {
      __positionIds?: number[];
      __subjectIds?: number[];
    };

    expect(boundaryEntry.__positionIds).toEqual(beforeBoundaryEntry.__positionIds);
    expect(boundaryEntry.__subjectIds).toHaveLength(2);
    expect(boundaryEntry.__subjectIds?.[0]).toBe(
      beforeBoundaryEntry.__subjectIds?.[0]
    );
    expect(boundaryEntry.__subjectIds?.[1]).not.toBe(
      beforeBoundaryEntry.__subjectIds?.[0]
    );
  });

  it('carries one stable subject token across live, retained, and replay observation for a rekeyed row', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const notifier = getPathNotifier();
    const t = (store as any).__timeTravel;
    const liveSubjectTokens: number[][] = [];
    const replaySubjectTokens: number[][] = [];

    const unsubscribe = notifier.subscribe(
      'rows',
      (_next, _prev, _path, _ownerPath, source, subjectIds) => {
        if (source === 'time-travel') {
          return;
        }
        if (subjectIds && subjectIds.length > 0) {
          liveSubjectTokens.push(subjectIds);
        }
      }
    );
    const restoreReplayObserver = interceptLeafSignals(
      (store as any).$,
      (_path, _next, _prev, meta) => {
        if (meta?.source !== 'time-travel') {
          return;
        }
        const subjectIds = meta.subjectIds;
        if (Array.isArray(subjectIds) && subjectIds.length > 0) {
          replaySubjectTokens.push(subjectIds as number[]);
        }
      }
    );

    store.$.rows.addOne({ id: -1, name: 'temp' });
    await Promise.resolve();
    await Promise.resolve();
    const addedToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.changeId(-1, 42);
    await Promise.resolve();
    await Promise.resolve();
    const rekeyedToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.byIdOrFail(42).name.set('server');
    await Promise.resolve();
    await Promise.resolve();
    const retainedToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.addOne({ id: -1, name: 'replacement' });
    await Promise.resolve();
    await Promise.resolve();
    const reusedPathToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    t.undo();
    await Promise.resolve();
    await Promise.resolve();
    t.undo();
    await Promise.resolve();
    await Promise.resolve();

    restoreReplayObserver();
    unsubscribe();

    expect(addedToken).toHaveLength(1);
    expect(rekeyedToken).toEqual(addedToken);
    expect(retainedToken).toEqual(addedToken);
    expect(reusedPathToken).toHaveLength(1);
    expect(reusedPathToken).not.toEqual(addedToken);
    expect(liveSubjectTokens).toContainEqual(addedToken);
    expect(liveSubjectTokens).toContainEqual(rekeyedToken);
    expect(liveSubjectTokens).toContainEqual(retainedToken);
    expect(liveSubjectTokens).toContainEqual(reusedPathToken);
    expect(replaySubjectTokens).toContainEqual(reusedPathToken);
    expect(replaySubjectTokens).toContainEqual(retainedToken);
  });

  it('undoes and redoes a rekey while preserving SubjectId continuity', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    const beforeSubject = store.$.rows.byIdOrFail(7).name.__subjectIds?.[0] as number;

    store.$.rows.changeId(7, 42);
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{
        kind: string;
        subject?: number;
        beforeKey?: number;
        afterKey?: number;
      }>;
    };
    const positionId = turn.__positionIds?.[0] as number;
    const rekeyEffect = turn.__effects?.[0] as {
      subject: number;
      beforeKey: number;
      afterKey: number;
    };

    expect(turn.__effects).toEqual([
      expect.objectContaining({
        kind: 'rekey',
        subject: beforeSubject,
        beforeKey: 7,
        afterKey: 42,
      }),
    ]);
    expect(store.$.rows.byIdOrFail(42).name.__subjectIds?.[0]).toBe(beforeSubject);

    expect(t.undoPosition(positionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([7]);
    expect(store.$.rows.byIdOrFail(7).name.__subjectIds?.[0]).toBe(beforeSubject);

    expect(t.redoPosition(positionId)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([42]);
    expect(store.$.rows.byIdOrFail(42).name.__subjectIds?.[0]).toBe(rekeyEffect.subject);
  });

  it('fails atomically when undoing a mixed rekey turn would steal an occupied key', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'A' });
    store.$.drivers.addOne({ id: 1, status: 'idle' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.changeId(7, 42);
    store.$.drivers.byIdOrFail(1).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const [rowsPositionId, driverPositionId] = turn.__positionIds ?? [];

    const poisonedTurn = t.getTurnRef(turn.id) as {
      __effects?: Array<Record<string, unknown>>;
    };
    const rekeyEffect = poisonedTurn.__effects?.find(
      (effect) => effect.kind === 'rekey'
    );
    if (!rekeyEffect) {
      throw new Error('Expected rekey effect');
    }
    rekeyEffect.beforeKey = 42;

    expect(() => t.undoPosition(rowsPositionId as number)).toThrow(
      'Cannot rekey to occupied key'
    );
    expect(store.$.rows.ids()).toEqual([42]);
    expect(store.$.drivers.byIdOrFail(1).status()).toBe('assigned');
    expect(t.getAppliedTurnIdsForPosition(rowsPositionId as number)).toEqual([
      turn.id,
    ]);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId as number)).toEqual([
      turn.id,
    ]);
    expect(t.getFrontier(rowsPositionId as number)).toBe(1);
    expect(t.getFrontier(driverPositionId as number)).toBe(1);
  });

  it('fails atomically when redoing a mixed rekey turn would steal an occupied key', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'A' });
    store.$.drivers.addOne({ id: 1, status: 'idle' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.changeId(7, 42);
    store.$.drivers.byIdOrFail(1).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as {
      id: number;
      __positionIds?: number[];
    };
    const [rowsPositionId, driverPositionId] = turn.__positionIds ?? [];

    expect(t.undoPosition(rowsPositionId as number)).toEqual([turn.id]);
    expect(store.$.rows.ids()).toEqual([7]);
    expect(store.$.drivers.byIdOrFail(1).status()).toBe('idle');

    const poisonedTurn = t.getTurnRef(turn.id) as {
      __effects?: Array<Record<string, unknown>>;
    };
    const rekeyEffect = poisonedTurn.__effects?.find(
      (effect) => effect.kind === 'rekey'
    );
    if (!rekeyEffect) {
      throw new Error('Expected rekey effect');
    }
    rekeyEffect.afterKey = 7;

    expect(() => t.redoPosition(rowsPositionId as number)).toThrow(
      'Cannot rekey to occupied key'
    );
    expect(store.$.rows.ids()).toEqual([7]);
    expect(store.$.drivers.byIdOrFail(1).status()).toBe('idle');
    expect(t.getAppliedTurnIdsForPosition(rowsPositionId as number)).toEqual([]);
    expect(t.getAppliedTurnIdsForPosition(driverPositionId as number)).toEqual([]);
    expect(t.getFrontier(rowsPositionId as number)).toBe(0);
    expect(t.getFrontier(driverPositionId as number)).toBe(0);
  });

  it('keeps removed and reused subjects distinct across live, retained, and replay observation', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../../lib/path-notifier'
    );
    resetPathNotifier();

    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const notifier = getPathNotifier();
    const t = (store as any).__timeTravel;
    const liveSubjectTokens: number[][] = [];
    const replaySubjectTokens: number[][] = [];

    const unsubscribe = notifier.subscribe(
      'rows',
      (_next, _prev, _path, _ownerPath, source, subjectIds) => {
        if (source === 'time-travel') {
          return;
        }
        if (subjectIds && subjectIds.length > 0) {
          liveSubjectTokens.push(subjectIds);
        }
      }
    );
    const restoreReplayObserver = interceptLeafSignals(
      (store as any).$,
      (_path, _next, _prev, meta) => {
        if (meta?.source !== 'time-travel') {
          return;
        }
        const subjectIds = meta.subjectIds;
        if (Array.isArray(subjectIds) && subjectIds.length > 0) {
          replaySubjectTokens.push(subjectIds as number[]);
        }
      }
    );

    store.$.rows.addOne({ id: 7, name: 'original' });
    await Promise.resolve();
    await Promise.resolve();
    const originalToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.removeOne(7);
    await Promise.resolve();
    await Promise.resolve();
    const removedToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    store.$.rows.addOne({ id: 7, name: 'replacement' });
    await Promise.resolve();
    await Promise.resolve();
    const replacementToken = [
      ...(((t.getHistory().at(-1) as { __subjectIds?: number[] })?.__subjectIds) ?? []),
    ];

    t.undo();
    await Promise.resolve();
    await Promise.resolve();
    t.undo();
    await Promise.resolve();
    await Promise.resolve();

    restoreReplayObserver();
    unsubscribe();

    expect(originalToken).toHaveLength(1);
    expect(removedToken).toEqual(originalToken);
    expect(replacementToken).toHaveLength(1);
    expect(replacementToken).not.toEqual(originalToken);
    expect(liveSubjectTokens).toContainEqual(originalToken);
    expect(liveSubjectTokens).toContainEqual(removedToken);
    expect(liveSubjectTokens).toContainEqual(replacementToken);
    expect(replaySubjectTokens).toContainEqual(replacementToken);
    expect(replaySubjectTokens).toContainEqual(removedToken);
  });

  it('records history for stored clear() and reload()', async () => {
    const storage = new Map<string, string>();
    const key = 'time-travel-stored-clear-reload';
    const store = signalTree({
      theme: stored(key, 'light', {
        storage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => {
            storage.delete(key);
          },
          clear: () => {
            storage.clear();
          },
          key: (index: number) => Array.from(storage.keys())[index] ?? null,
          get length() {
            return storage.size;
          },
        },
        debounceMs: 100,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;
    const initial = t.getHistory().length;

    store.$.theme.set('dark');
    await Promise.resolve();
    await Promise.resolve();

    store.$.theme.clear();
    await Promise.resolve();
    await Promise.resolve();

    expect(t.getHistory().length).toBeGreaterThan(initial + 1);
    expect(t.getHistory().at(-1)?.state).toEqual({ theme: 'light' });
    expect(t.getHistory().at(-1)?.__ownerPaths).toEqual(['theme']);

    storage.set(key, JSON.stringify('navy'));
    store.$.theme.set('pink');
    await Promise.resolve();
    await Promise.resolve();

    store.$.theme.reload();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.$.theme()).toBe('navy');
    expect(t.getHistory().at(-1)?.state).toEqual({ theme: 'navy' });
    expect(t.getHistory().at(-1)?.__ownerPaths).toEqual(['theme']);
  });

  it('records history for status promise-vocabulary aliases', async () => {
    const store = signalTree({ load: status<string>() }).with(timeTravel());
    const t = (store as any).__timeTravel;
    const initial = t.getHistory().length;

    store.$.load.start();
    await Promise.resolve();
    await Promise.resolve();

    store.$.load.fail('boom');
    await Promise.resolve();
    await Promise.resolve();

    const history = t.getHistory();
    expect(history.length).toBeGreaterThan(initial + 1);
    expect(history.at(-1)?.__ownerPaths).toEqual(['load']);

    store.undo();
    expect(store.$.load.hasError()).toBe(false);
    expect(store.$.load.loading()).toBe(true);

    store.undo();
    expect(store.$.load.notLoaded()).toBe(true);
  });

  it('routes public undo through turn frontiers for a single scalar write', async () => {
    const store = signalTree({ count: 0 }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.count.set(1);
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const positionId = turn.__positionIds?.[0] as number;

    expect(t.getFrontier(positionId)).toBe(1);

    store.undo();

    expect(store.$.count()).toBe(0);
    expect(t.getFrontier(positionId)).toBe(0);
  });

  it('routes public undo through turn frontiers for a single entity-field write', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.byIdOrFail(7).name.set('B');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const positionId = turn.__positionIds?.[0] as number;

    expect(t.getFrontier(positionId)).toBe(1);

    store.undo();

    expect(store.$.rows.byIdOrFail(7).name()).toBe('A');
    expect(t.getFrontier(positionId)).toBe(0);
  });

  it('routes public undo through turn frontiers for collection add, remove, and rekey', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();

    const addTurn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const addPositionId = addTurn.__positionIds?.[0] as number;
    expect(t.getFrontier(addPositionId)).toBe(1);
    store.undo();
    expect(store.$.rows.ids()).toEqual([]);
    expect(t.getFrontier(addPositionId)).toBe(0);

    store.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();
    t.resetHistory();

    store.$.rows.removeOne(7);
    await Promise.resolve();
    await Promise.resolve();

    const removeTurn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const removePositionId = removeTurn.__positionIds?.[0] as number;
    expect(t.getFrontier(removePositionId)).toBe(1);
    store.undo();
    expect(store.$.rows.ids()).toEqual([7]);
    expect(store.$.rows.byIdOrFail(7).name()).toBe('A');
    expect(t.getFrontier(removePositionId)).toBe(0);

    t.resetHistory();

    store.$.rows.changeId(7, 42);
    await Promise.resolve();
    await Promise.resolve();

    const rekeyTurn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const rekeyPositionId = rekeyTurn.__positionIds?.[0] as number;
    expect(t.getFrontier(rekeyPositionId)).toBe(1);
    store.undo();
    expect(store.$.rows.ids()).toEqual([7]);
    expect(t.getFrontier(rekeyPositionId)).toBe(0);
  });

  it('uses one root PositionId for ordinary scalar turns and undoes them through one frontier', async () => {
    const store = signalTree({ count: 0, title: 'A' }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.count.set(1);
    await Promise.resolve();
    await Promise.resolve();

    const firstTurn = t.getTurns().at(-1) as { __positionIds?: number[] };

    store.$.title.set('B');
    await Promise.resolve();
    await Promise.resolve();

    const secondTurn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const firstPositionId = firstTurn.__positionIds?.[0] as number;
    const secondPositionId = secondTurn.__positionIds?.[0] as number;

    expect(firstPositionId).toBe(secondPositionId);
    expect(t.getAppliedTurnIdsForPosition(firstPositionId)).toEqual([
      firstTurn.id,
      secondTurn.id,
    ]);
    expect(t.getFrontier(firstPositionId)).toBe(2);

    store.undo();
    expect(store.$.count()).toBe(1);
    expect(store.$.title()).toBe('A');
    expect(t.getFrontier(firstPositionId)).toBe(1);

    store.undo();
    expect(store.$.count()).toBe(0);
    expect(t.getFrontier(firstPositionId)).toBe(0);
  });

  it('indexes one root callable partial update as one P_root turn with two scalar effects and atomic undo/redo', async () => {
    const store = signalTree({ count: 1, title: 'A' }).with(timeTravel());
    const t = (store as any).__timeTravel;

    t.resetHistory();

    store({ count: 2, title: 'B' });
    await Promise.resolve();
    await Promise.resolve();

    const indexedTurns = t
      .getTurns()
      .filter((turn: { __positionIds?: number[] }) => (turn.__positionIds?.length ?? 0) > 0);
    const turn = indexedTurns.at(-1) as {
      id: number;
      __positionIds?: number[];
      __effects?: Array<{
        kind: string;
        path: string;
        before: unknown;
        after: unknown;
        position: number;
      }>;
    };
    const positionId = turn.__positionIds?.[0] as number;

    expect(indexedTurns).toHaveLength(1);
    expect(turn.__positionIds).toEqual([positionId]);
    expect(turn.__effects).toHaveLength(2);
    expect(turn.__effects?.map((effect) => effect.path).sort()).toEqual([
      'count',
      'title',
    ]);
    expect(turn.__effects?.every((effect) => effect.kind === 'set')).toBe(true);
    expect(turn.__effects?.every((effect) => effect.position === positionId)).toBe(
      true
    );
    expect(turn.__effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'count', before: 1, after: 2 }),
        expect.objectContaining({ path: 'title', before: 'A', after: 'B' }),
      ])
    );
    expect(t.getFrontier(positionId)).toBe(1);

    store.undo();

    expect(store.$.count()).toBe(1);
    expect(store.$.title()).toBe('A');
    expect(t.getFrontier(positionId)).toBe(0);

    store.redo();

    expect(store.$.count()).toBe(2);
    expect(store.$.title()).toBe('B');
    expect(t.getFrontier(positionId)).toBe(1);
  });

  it('routes public redo through turn frontiers for a single scalar write', async () => {
    const store = signalTree({ count: 0 }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.count.set(1);
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const positionId = turn.__positionIds?.[0] as number;

    store.undo();
    expect(t.getFrontier(positionId)).toBe(0);

    store.redo();

    expect(store.$.count()).toBe(1);
    expect(t.getFrontier(positionId)).toBe(1);
  });

  it('routes public redo through turn frontiers for a single entity-field write', async () => {
    const store = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.rows.byIdOrFail(7).name.set('B');
    await Promise.resolve();
    await Promise.resolve();

    const turn = t.getTurns().at(-1) as { __positionIds?: number[] };
    const positionId = turn.__positionIds?.[0] as number;

    store.undo();
    expect(t.getFrontier(positionId)).toBe(0);

    store.redo();

    expect(store.$.rows.byIdOrFail(7).name()).toBe('B');
    expect(t.getFrontier(positionId)).toBe(1);
  });

  it('routes public redo through turn frontiers for collection add while preserving SubjectId', async () => {
    const addStore = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const addTimeTravel = (addStore as any).__timeTravel;

    addStore.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();

    const addedToken = addStore.$.rows.byIdOrFail(7).name.__subjectIds?.[0] as number;
    const addTurn = addTimeTravel.getTurns().at(-1) as { __positionIds?: number[] };
    const addPositionId = addTurn.__positionIds?.[0] as number;
    addStore.undo();
    addStore.redo();
    expect(addStore.$.rows.ids()).toEqual([7]);
    expect(addStore.$.rows.byIdOrFail(7).name.__subjectIds?.[0]).toBe(addedToken);
    expect(addTimeTravel.getFrontier(addPositionId)).toBe(1);
  });

  it('routes public redo through turn frontiers for collection remove while preserving SubjectId on undo', async () => {
    const removeStore = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const removeTimeTravel = (removeStore as any).__timeTravel;

    removeStore.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();
    const originalRemoveToken = removeStore.$.rows.byIdOrFail(7).name.__subjectIds?.[0] as number;
    removeTimeTravel.resetHistory();

    removeStore.$.rows.removeOne(7);
    await Promise.resolve();
    await Promise.resolve();

    const removeTurn = removeTimeTravel.getTurns().at(-1) as { __positionIds?: number[] };
    const removePositionId = removeTurn.__positionIds?.[0] as number;
    removeStore.undo();
    expect(removeStore.$.rows.byIdOrFail(7).name.__subjectIds?.[0]).toBe(originalRemoveToken);
    removeStore.redo();
    expect(removeStore.$.rows.ids()).toEqual([]);
    expect(removeTimeTravel.getFrontier(removePositionId)).toBe(1);
  });

  it('routes public redo through turn frontiers for collection rekey while preserving SubjectId', async () => {
    const rekeyStore = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const rekeyTimeTravel = (rekeyStore as any).__timeTravel;

    rekeyStore.$.rows.addOne({ id: 7, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();
    rekeyTimeTravel.resetHistory();

    const beforeRekeyToken = rekeyStore.$.rows.byIdOrFail(7).name.__subjectIds?.[0] as number;
    rekeyStore.$.rows.changeId(7, 42);
    await Promise.resolve();
    await Promise.resolve();

    const rekeyTurn = rekeyTimeTravel.getTurns().at(-1) as { __positionIds?: number[] };
    const rekeyPositionId = rekeyTurn.__positionIds?.[0] as number;
    rekeyStore.undo();
    rekeyStore.redo();
    expect(rekeyStore.$.rows.ids()).toEqual([42]);
    expect(rekeyStore.$.rows.byIdOrFail(42).name.__subjectIds?.[0]).toBe(beforeRekeyToken);
    expect(rekeyTimeTravel.getFrontier(rekeyPositionId)).toBe(1);
  });

  it('routes public redo sequentially through turn history using turn/frontier authority', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const t = (store as any).__timeTravel;

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    await Promise.resolve();
    await Promise.resolve();

    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as { id: number; __positionIds?: number[] };

    store.$.drivers.byIdOrFail(7).status.set('loading');
    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as { id: number; __positionIds?: number[] };

    store.undo();
    store.undo();

    const orderPositionId = (secondTurn.__positionIds ?? []).find(
      (positionId: number) => positionId !== (firstTurn.__positionIds?.[0] as number)
    ) as number;
    expect(t.getFrontier(orderPositionId)).toBe(0);

    store.redo();

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('assigned');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBe(7);
    expect(store.$.orders.byIdOrFail(99).status()).toBe('new');
    expect(t.getAppliedTurnIdsForPosition(orderPositionId)).toEqual([]);

    store.redo();

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('loading');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBe(7);
    expect(store.$.orders.byIdOrFail(99).status()).toBe('queued');
    expect(t.getTurnStatus(firstTurn.id)).toBe('applied');
    expect(t.getTurnStatus(secondTurn.id)).toBe('applied');
    expect(t.getAppliedTurnIdsForPosition(orderPositionId)).toEqual([secondTurn.id]);
  });

  it('allows public canUndo and canRedo to both be true when an earlier turn is unapplied and a later turn remains applied', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.orders.addOne({ id: 99, status: 'new' });
    await Promise.resolve();
    await Promise.resolve();

    const t = (store as any).__timeTravel;
    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as { __positionIds?: number[] };

    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as { __positionIds?: number[]; id: number };

    const firstPositionId = firstTurn.__positionIds?.[0] as number;

    t.undoPosition(firstPositionId);

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(store.$.orders.byIdOrFail(99).status()).toBe('queued');
    expect(t.getTurnStatus(secondTurn.id)).toBe('applied');
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);
  });

  it('keeps confirmed frontiers causal while jumpTo answers a temporal snapshot question', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      trucks: entityMap<{ id: number; driverId: number | null }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.trucks.addOne({ id: 12, driverId: null });
    store.$.orders.addOne({ id: 99, status: 'new' });
    await Promise.resolve();
    await Promise.resolve();

    const t = (store as any).__timeTravel;
    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    store.$.trucks.byIdOrFail(12).driverId.set(7);
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as {
      id: number;
      historyIndex: number;
      __positionIds?: number[];
    };

    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as { id: number };

    const truckPositionId = (firstTurn.__positionIds ?? []).find(
      (positionId: number) =>
        positionId !== (firstTurn.__positionIds?.[0] as number)
    ) as number;

    expect(t.undoPosition(truckPositionId)).toEqual([firstTurn.id]);

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('idle');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBeNull();
    expect(store.$.orders.byIdOrFail(99).status()).toBe('queued');
    expect(t.getTurnStatus(firstTurn.id)).toBe('unapplied');
    expect(t.getTurnStatus(secondTurn.id)).toBe('applied');
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);

    store.jumpTo(firstTurn.historyIndex);

    expect(store.getCurrentIndex()).toBe(firstTurn.historyIndex);
    expect(store.$.drivers.byIdOrFail(7).status()).toBe('assigned');
    expect(store.$.trucks.byIdOrFail(12).driverId()).toBe(7);
    expect(store.$.orders.byIdOrFail(99).status()).toBe('new');
    expect(t.getTurnStatus(firstTurn.id)).toBe('unapplied');
    expect(t.getTurnStatus(secondTurn.id)).toBe('applied');
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);
  });

  it('clears public redo availability when a new confirmed write truncates the abandoned future in a mixed frontier state', async () => {
    const store = signalTree({
      drivers: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());

    store.$.drivers.addOne({ id: 7, status: 'idle' });
    store.$.orders.addOne({ id: 99, status: 'new' });
    await Promise.resolve();
    await Promise.resolve();

    const t = (store as any).__timeTravel;
    t.resetHistory();

    store.$.drivers.byIdOrFail(7).status.set('assigned');
    await Promise.resolve();
    await Promise.resolve();
    const firstTurn = t.getTurns().at(-1) as { id: number; __positionIds?: number[] };

    store.$.orders.byIdOrFail(99).status.set('queued');
    await Promise.resolve();
    await Promise.resolve();
    const secondTurn = t.getTurns().at(-1) as { id: number };

    const firstPositionId = firstTurn.__positionIds?.[0] as number;

    t.undoPosition(firstPositionId);
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);

    store.$.drivers.byIdOrFail(7).status.set('loading');
    await Promise.resolve();
    await Promise.resolve();

    const remainingTurnIds = t.getTurns().map((turn: { id: number }) => turn.id);

    expect(store.$.drivers.byIdOrFail(7).status()).toBe('loading');
    expect(store.$.orders.byIdOrFail(99).status()).toBe('queued');
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
    expect(remainingTurnIds).not.toContain(firstTurn.id);
    expect(remainingTurnIds).toContain(secondTurn.id);
  });

  it('does not record unrelated writes from another tree that shares top-level keys', async () => {
    const first = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const second = signalTree({
      rows: entityMap<{ id: number; name: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());

    const firstBaseline = first.getHistory().length;
    const secondBaseline = second.getHistory().length;

    first.$.rows.addOne({ id: 1, name: 'A' });
    await Promise.resolve();
    await Promise.resolve();

    expect(first.getHistory().length).toBeGreaterThan(firstBaseline);
    expect(second.getHistory().length).toBe(secondBaseline);
    expect(second.canUndo()).toBe(false);
  });
});
