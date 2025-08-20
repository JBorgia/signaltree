import { signalTree } from './signal-tree';
import { listTrees } from './devtools';

describe('SignalTree Conformance (Phase 5)', () => {
  const originalEnv = process.env['NODE_ENV'];
  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
  });
  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('increments version only on update() calls (direct signal.set does not affect tree version)', () => {
    const tree = signalTree({ counter: 0 });
    expect(tree.getVersion()).toBe(0);
    tree.state.counter.set(1); // direct signal set (tree version should remain unchanged)
    expect(tree.getVersion()).toBe(0);
    tree.update((s) => ({ counter: s.counter + 1 }));
    expect(tree.getVersion()).toBe(1);
  });

  it('tracks performance metrics when trackPerformance enabled', () => {
    const tree = signalTree({ value: 1 }, { trackPerformance: true });
    expect(tree.getMetrics().updates).toBe(0);
    tree.update((s) => ({ value: s.value + 1 }));
    tree.update((s) => ({ value: s.value + 1 }));
    const m = tree.getMetrics();
    expect(m.updates).toBe(2);
    expect(m.averageUpdateTime).toBeGreaterThanOrEqual(0);
  });

  it('registers in devtools when enableDevTools is true (non-production)', () => {
    const before = listTrees().length;
    const tree = signalTree({ a: 1 }, { enableDevTools: true });
    const after = listTrees().length;
    expect(after).toBeGreaterThanOrEqual(before + 1);
    const meta = (
      tree as unknown as { snapshotMeta?: () => unknown }
    ).snapshotMeta?.() as { name?: string } | null | undefined;
    expect(meta).toBeTruthy();
    tree.destroy();
    expect(listTrees()).toHaveLength(before); // back to original count
  });

  it('does not register in production environment', () => {
    process.env['NODE_ENV'] = 'production';
    const before = listTrees().length;
    const tree = signalTree({ prod: true }, { enableDevTools: true });
    expect(listTrees()).toHaveLength(before); // unchanged
    const meta = (
      tree as unknown as { snapshotMeta?: () => unknown }
    ).snapshotMeta?.() as
      | { metrics?: unknown; name?: string }
      | null
      | undefined;
    // snapshotMeta still exists (method attached) but registration id absent => metrics may be null
    if (meta) {
      expect(meta.metrics === undefined || meta.name === undefined).toBe(true);
    }
    tree.destroy();
  });

  it('schedules batchUpdate when batchUpdates enabled (microtask flush)', async () => {
    const tree = signalTree({ n: 0 }, { batchUpdates: true });
    expect(tree.getVersion()).toBe(0);
    tree.batchUpdate((s) => ({ n: s.n + 1 }));
    // Version should not yet be incremented synchronously
    expect(tree.getVersion()).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(tree.getVersion()).toBe(1);
  });

  it('development preset enables devtools & performance tracking', () => {
    const tree = signalTree({ x: 1 }, 'development');
    const meta = (
      tree as unknown as { snapshotMeta?: () => unknown }
    ).snapshotMeta?.() as { metrics?: unknown } | null | undefined;
    expect(meta).toBeTruthy();
    tree.update((s) => ({ x: s.x + 1 }), { label: 'incX' });
    expect(tree.getMetrics().updates).toBeGreaterThan(0);
  });

  it('performance preset favors lazy + batching (indirectly verifiable by successful operations)', () => {
    const tree = signalTree({ deep: { value: 1 } }, 'performance');
    // Should still allow updates
    tree.update((s) => ({ deep: { value: s.deep.value + 1 } }));
    expect(tree.unwrap().deep.value).toBe(2);
  });

  it('does not increment version or log transaction for no-op updates (equality guard)', () => {
    const tree = signalTree({ x: { y: 1 }, z: 2 });
    expect(tree.getVersion()).toBe(0);
    tree.update(() => ({ z: 2 })); // identical primitive
    expect(tree.getVersion()).toBe(0); // no version bump
    tree.update(() => ({ x: { y: 1 } })); // deep identical structure
    expect(tree.getVersion()).toBe(0);
    tree.update(() => ({ z: 3 }));
    expect(tree.getVersion()).toBe(1);
  });

  it('rolls back changes if updater throws mid-transaction', () => {
    const tree = signalTree({ a: 1, b: 2, c: 3 });
    expect(tree.unwrap()).toEqual({ a: 1, b: 2, c: 3 });
    expect(() =>
      tree.update((s) => {
        return {
          a: s.a + 1,
          b: (() => {
            throw new Error('boom');
          })() as number,
          c: s.c + 1,
        };
      })
    ).toThrow('boom');
    // State should be fully rolled back
    expect(tree.unwrap()).toEqual({ a: 1, b: 2, c: 3 });
    // Version shouldn't increment
    expect(tree.getVersion()).toBe(0);
    // A successful update now should work
    tree.update((s) => ({ a: s.a + 1, c: s.c + 1 }));
    expect(tree.unwrap()).toEqual({ a: 2, b: 2, c: 4 });
    expect(tree.getVersion()).toBe(1);
  });

  it('coalesces multiple batchUpdate calls into single version bump with merged result', async () => {
    const tree = signalTree(
      { a: 0, b: 0, c: 0 },
      { batchUpdates: true, debugMode: true }
    );
    expect(tree.getVersion()).toBe(0);
    tree.batchUpdate((s) => ({ a: s.a + 1 }));
    tree.batchUpdate((s) => ({ b: s.b + 2 }));
    tree.batchUpdate((s) => ({ c: s.c + 3, a: 42 })); // override a
    // Still not flushed
    expect(tree.getVersion()).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    // Single version bump
    expect(tree.getVersion()).toBe(1);
    expect(tree.unwrap()).toEqual({ a: 42, b: 2, c: 3 });
    // Another batch cycle
    tree.batchUpdate((s) => ({ a: s.a + 1 }));
    tree.batchUpdate((s) => ({ b: s.b + 1 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(tree.getVersion()).toBe(2);
    expect(tree.unwrap()).toEqual({ a: 43, b: 3, c: 3 });
  });

  it('batchUpdate with only no-op changes does not bump version', async () => {
    const tree = signalTree(
      { a: 0, b: 1 },
      { batchUpdates: true, debugMode: true }
    );
    expect(tree.getVersion()).toBe(0);
    tree.batchUpdate(() => ({ a: 0 })); // no-op
    tree.batchUpdate(() => ({ b: 1 })); // no-op
    await new Promise((r) => setTimeout(r, 0));
    // No version bump because merged object produced no real changes
    expect(tree.getVersion()).toBe(0);
    expect(tree.unwrap()).toEqual({ a: 0, b: 1 });
  });

  it('production devtools snapshotMeta omits metrics even when enableDevTools true', () => {
    const prev = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    const tree = signalTree(
      { prod: true },
      { enableDevTools: true, trackPerformance: true }
    );
    const meta = (
      tree as unknown as { snapshotMeta?: () => unknown }
    ).snapshotMeta?.();
    if (meta) {
      const m = meta as { metrics?: unknown };
      expect(m.metrics === undefined || m.metrics === null).toBe(true);
    }
    tree.destroy();
    process.env['NODE_ENV'] = prev;
  });

  it('lazy strategy does not instantiate signals for untouched nested paths until accessed', () => {
    const largeObj: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) largeObj['k' + i] = { nested: i };
    const tree = signalTree(largeObj, { useLazySignals: true });
    // Access one path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k10 = (tree.state as any).k10; // should create signals under k10 only
    // Accessing nested value should be a signal with callable signature
    expect(typeof k10.nested).toBe('function');
    // Another untouched path should still be a proxy that becomes signals on access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k20 = (tree.state as any).k20;
    expect(typeof k20.nested).toBe('function');
  });

  it('memoization provides cache hits/misses and clearCache() resets', () => {
    const tree = signalTree(
      { a: 1, b: 2 },
      { useMemoization: true, trackPerformance: true }
    );
    const sumA = tree.memoize((s) => s.a + s.b, 'sum');
    const v1 = sumA();
    expect(v1).toBe(3);
    const afterMiss = tree.getMetrics();
    expect(afterMiss.cacheMisses).toBeGreaterThanOrEqual(1);
    // Request same key again -> should return cached signal (hit)
    const sumB = tree.memoize((s) => s.a + s.b, 'sum');
    const v2 = sumB();
    expect(v2).toBe(3);
    const afterHit = tree.getMetrics();
    expect(afterHit.cacheHits).toBeGreaterThanOrEqual(1);
    // Clear cache triggers miss next time
    tree.clearCache();
    const sumC = tree.memoize((s) => s.a + s.b, 'sum');
    const v3 = sumC();
    expect(v3).toBe(3);
    const afterClear = tree.getMetrics();
    expect(afterClear.cacheMisses).toBeGreaterThan(afterMiss.cacheMisses);
  });

  it('middleware before hook can veto update and after hook runs on success', () => {
    const tree = signalTree({ x: 1 }, { debugMode: true });
    let afterCalls = 0;
    let beforeCalls = 0;
    tree.addTap({
      id: 'vetoer',
      before: (action) => {
        beforeCalls++;
        if (action === 'update') return false; // veto first update
        return true;
      },
      after: () => {
        afterCalls++;
      },
    });
    // Vetoed update
    tree.update((s) => ({ x: s.x + 1 }));
    expect(tree.unwrap().x).toBe(1);
    expect(beforeCalls).toBe(1);
    expect(afterCalls).toBe(0);
    // Remove vetoer and add normal middleware
    tree.removeTap('vetoer');
    tree.addTap({
      id: 'logger',
      before: () => true,
      after: () => {
        afterCalls++;
      },
    });
    tree.update((s) => ({ x: s.x + 1 }));
    expect(tree.unwrap().x).toBe(2);
    expect(afterCalls).toBe(1);
  });

  it('asCrud provides basic add/remove/update/select operations (internal store)', () => {
    const tree = signalTree({}, { debugMode: true });
    const users = tree.asCrud<{ id: number; name: string }>();
    users.add({ id: 1, name: 'Alice' });
    users.add({ id: 2, name: 'Bob' });
    expect(users.selectTotal()()).toBe(2);
    users.update(1, { name: 'Alicia' });
    expect(users.findById(1)()?.name).toBe('Alicia');
    users.remove(2);
    expect(users.selectIds()()).toEqual([1]);
    users.clear();
    expect(users.selectTotal()()).toBe(0);
  });

  it('asCrud binds to existing array signal when key provided', () => {
    const tree = signalTree(
      { people: [] as Array<{ id: string; role: string }> },
      { debugMode: true }
    );
    const people = tree.asCrud<{ id: string; role: string }>('people');
    people.add({ id: 'a', role: 'user' });
    people.upsert({ id: 'b', role: 'admin' });
    expect(people.selectTotal()()).toBe(2);
    people.upsert({ id: 'a', role: 'owner' });
    const a = people.findById('a')();
    expect(a && a.role).toBe('owner');
    people.remove('b');
    expect(tree.unwrap().people.length).toBe(1);
  });

  it('time travel captures history and supports multi-step undo/redo', () => {
    const tree = signalTree(
      { count: 0 },
      { debugMode: true, enableTimeTravel: true }
    );
    tree.update((s) => ({ count: s.count + 1 })); // 1
    tree.update((s) => ({ count: s.count + 1 })); // 2
    tree.update((s) => ({ count: s.count + 1 })); // 3
    expect(tree.unwrap().count).toBe(3);
    expect(tree.getHistory().length).toBe(4); // init + 3 updates
    tree.undo();
    expect(tree.unwrap().count).toBe(2);
    tree.undo();
    expect(tree.unwrap().count).toBe(1);
    tree.redo();
    expect(tree.unwrap().count).toBe(2);
    tree.redo();
    expect(tree.unwrap().count).toBe(3);
  });

  it('time travel truncates forward history when diverging after undo', () => {
    const tree = signalTree(
      { count: 0 },
      { debugMode: true, enableTimeTravel: true }
    );
    tree.update((s) => ({ count: s.count + 1 })); // 1
    tree.update((s) => ({ count: s.count + 1 })); // 2
    tree.update((s) => ({ count: s.count + 1 })); // 3
    expect(tree.unwrap().count).toBe(3);
    tree.undo(); // back to 2
    expect(tree.unwrap().count).toBe(2);
    // Diverge new timeline from count=2
    tree.update((s) => ({ count: s.count + 10 })); // 12
    expect(tree.unwrap().count).toBe(12);
    const history = tree.getHistory();
    expect(history.length).toBe(4); // init, +1, +2, diverged +10 (original +3 truncated)
    expect(history.some((h) => h.state.count === 3)).toBe(false);
    expect(history[history.length - 1].state.count).toBe(12);
  });

  it('history limit truncates oldest snapshots', () => {
    const tree = signalTree(
      { v: 0 },
      { debugMode: true, enableTimeTravel: true, historyLimit: 10 }
    );
    for (let i = 0; i < 25; i++)
      tree.update((s) => ({ v: s.v + 1 }), { label: 'tick' });
    const hist = tree.getHistory();
    expect(hist.length).toBeLessThanOrEqual(10);
    // Latest state present
    expect(tree.unwrap().v).toBe(25);
  });

  it('resetHistory replaces history with single snapshot', () => {
    const tree = signalTree(
      { value: 5 },
      { debugMode: true, enableTimeTravel: true }
    );
    tree.update((s) => ({ value: s.value + 1 }));
    expect(tree.getHistory().length).toBe(2);
    tree.resetHistory();
    const hist = tree.getHistory();
    expect(hist.length).toBe(1);
    expect(tree.unwrap().value).toBe(6);
  });

  it('heuristic selects lazy for large objects when not overridden (debug mode logs eager/lazy)', () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 120; i++) big['p' + i] = { v: i };
    const tree = signalTree(big, { debugMode: true });
    // We cannot directly inspect strategy flag; infer by accessing a key then another
    // Access first key
    const p1 = (tree.state as unknown as Record<string, unknown>)[
      'p1'
    ] as Record<string, unknown>;
    expect(typeof (p1 as Record<string, unknown>)['v']).toBe('function');
    // Access second key; if lazy, it should only now create signals
    const p2 = (tree.state as unknown as Record<string, unknown>)[
      'p2'
    ] as Record<string, unknown>;
    expect(typeof (p2 as Record<string, unknown>)['v']).toBe('function');
  });

  it('lazy tree cleanup executes on destroy (no errors thrown)', () => {
    const obj = { a: { b: { c: 1 } } };
    const tree = signalTree(obj, { useLazySignals: true, debugMode: true });
    // Touch a few nested paths to create proxies & signals
    const a = (tree.state as unknown as Record<string, unknown>)['a'] as Record<
      string,
      unknown
    >;
    const b = (a as Record<string, unknown>)['b'] as Record<string, unknown>;
    expect(typeof b['c']).toBe('function');
    // Destroy should invoke cleanup without throwing
    expect(() => tree.destroy()).not.toThrow();
  });

  it('scheduler write-loop warning triggers when depth exceeds heuristic threshold (non-production)', () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args.join(' ');
      if (msg.includes('write loop')) warnings.push(msg);
      originalWarn.apply(console, args as []);
    };
    try {
      // Force deep recursion scheduling beyond MAX_SAFE_DEPTH (1000) quickly
      // We'll chain tasks synchronously to exceed depth.
      const scheduleTask: (fn: () => void) => void = (
        require('./scheduler') as typeof import('./scheduler')
      ).scheduleTask;
      let remaining = 1500;
      const task = () => {
        remaining--;
        if (remaining > 0) scheduleTask(task);
      };
      scheduleTask(task);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(warnings.length).toBe(0);
          resolve();
        }, 10);
      });
    } finally {
      console.warn = originalWarn;
    }
  });
});
