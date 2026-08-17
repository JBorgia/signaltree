import { describe, expect, it } from 'vitest';

import { transactions } from '../../enhancers/transactions/transactions';
import { signalTree } from '../signal-tree';
import { stored } from './stored';

/**
 * `stored()` consequence ordering — the marker-level pin for
 * "Persistence is post-commit" (RELEASE-1.0.md Release Invariants).
 *
 * This file was committed at 83e241ef as a CHARACTERIZATION of the opposite
 * behavior: at that commit `stored()` wrote through from `afterSet`, so a
 * pending transaction was already durable, two keys tore, and an aborted
 * transaction persisted a doomed value and then repaired it. Those assertions
 * are inverted here, which is exactly the signal the original docblock
 * promised. The mechanism now enforcing the ordering lives in
 * `internals/commit-consequence.ts`; its own falsifiers — explicit
 * attribution, cross-identity isolation, idempotent settle — are in
 * `internals/commit-consequence.spec.ts`. What remains here is the guarantee
 * as a CONSUMER of `stored()` observes it.
 *
 * One limit is recorded rather than fixed, in the last test: `Storage` has no
 * multi-key atomic write, so N stored keys in one transaction remain N
 * `setItem` calls. They are now all post-commit — every value an observer can
 * see is a committed value — but the SEQUENCE is still observable. A tree that
 * needs cross-key atomicity in storage wants `persistence()`, which serializes
 * the whole tree under a single key.
 */

interface Recorder {
  readonly adapter: Storage;
  readonly log: Array<{ op: 'set' | 'remove'; key: string }>;
  readonly snapshots: Array<Record<string, string>>;
}

function recordingStorage(seed: Record<string, unknown> = {}): Recorder {
  const map = new Map<string, string>();
  const log: Recorder['log'] = [];
  const snapshots: Recorder['snapshots'] = [];

  for (const [key, value] of Object.entries(seed)) {
    map.set(key, JSON.stringify({ __v: 1, data: value }));
  }

  const snapshot = (): void => {
    snapshots.push(Object.fromEntries(map));
  };

  const adapter: Storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
      log.push({ op: 'set', key });
      snapshot();
    },
    removeItem: (key) => {
      map.delete(key);
      log.push({ op: 'remove', key });
      snapshot();
    },
    clear: () => map.clear(),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };

  return { adapter, log, snapshots };
}

function dataIn(snapshot: Record<string, string>, key: string): unknown {
  const raw = snapshot[key];
  return raw === undefined ? undefined : JSON.parse(raw).data;
}

describe('stored() consequence ordering', () => {
  it('does not persist a pending transaction until it is confirmed', async () => {
    const { resetPathNotifier } = await import('../path-notifier');
    resetPathNotifier();

    const rec = recordingStorage({ 'sco-pending': 'light' });

    const store = signalTree({
      theme: stored('sco-pending', 'light', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { theme: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.theme.set('dark');
    });

    // Live tree advanced; durable state has not.
    expect(store.$.theme()).toBe('dark');
    expect(rec.log).toEqual([]);
    expect(dataIn({ 'sco-pending': rec.adapter.getItem('sco-pending') as string }, 'sco-pending')).toBe('light');

    pending.confirm();

    expect(rec.log).toEqual([{ op: 'set', key: 'sco-pending' }]);
    expect(dataIn(rec.snapshots[0], 'sco-pending')).toBe('dark');
  });

  it('never makes a doomed value durable when the transaction throws', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-throw': 'keep' });

    const store = signalTree({
      v: stored('sco-throw', 'keep', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { v: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    expect(() =>
      store.transaction(() => {
        store.$.v.set('doomed');
        throw new Error('boom');
      })
    ).toThrow('boom');

    await Promise.resolve();

    // Correctness is "never wrote", not "wrote and compensated": no snapshot
    // storage ever held may contain the rejected value.
    for (const snapshot of rec.snapshots) {
      expect(dataIn(snapshot, 'sco-throw')).not.toBe('doomed');
    }
    expect(store.$.v()).toBe('keep');
    expect(rec.adapter.getItem('sco-throw')).toContain('keep');
  });

  it('collapses repeated writes to one key into a single committed write', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-collapse': 'v0' });

    const store = signalTree({
      v: stored('sco-collapse', 'v0', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { v: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.v.set('v1');
      store.$.v.set('v2');
      store.$.v.set('v3');
    });
    pending.confirm();

    // Three sets, one durable write, final value only. No intermediate value
    // was ever observable in storage.
    expect(rec.log).toHaveLength(1);
    expect(dataIn(rec.snapshots[0], 'sco-collapse')).toBe('v3');
  });

  it('RECORDED LIMIT: multi-key writes are all post-commit but not one atomic store write', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-a': 'a0', 'sco-b': 'b0' });

    const store = signalTree({
      a: stored('sco-a', 'a0', { storage: rec.adapter, debounceMs: 0 }),
      b: stored('sco-b', 'b0', { storage: rec.adapter, debounceMs: 0 }),
    }).with(transactions()) as {
      $: {
        a: { (): string; set(value: string): void };
        b: { (): string; set(value: string): void };
      };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.a.set('a1');
      store.$.b.set('b1');
    });

    // Nothing durable before commit — this is the part that IS guaranteed.
    expect(rec.log).toEqual([]);

    pending.confirm();

    // Both writes happen after the commit, in order. The intermediate snapshot
    // still shows a1/b0, because `Storage` exposes no way to write two keys
    // atomically. Every value visible there is a COMMITTED value — the
    // speculative one never appears — but a crash between the two setItem
    // calls can still leave a mixed pair. Use `persistence()` (single key,
    // whole tree) when cross-key atomicity is required.
    expect(rec.log.map((e) => e.key)).toEqual(['sco-a', 'sco-b']);
    expect(dataIn(rec.snapshots[0], 'sco-a')).toBe('a1');
    expect(dataIn(rec.snapshots[0], 'sco-b')).toBe('b0');
    for (const snapshot of rec.snapshots) {
      expect(['a0', 'a1']).toContain(dataIn(snapshot, 'sco-a'));
      expect(['b0', 'b1']).toContain(dataIn(snapshot, 'sco-b'));
    }
  });
});

/**
 * Blockers found by the fresh-HEAD antagonistic audit against 59bed701.
 * Both are gaps in the post-commit boundary introduced with 51a98699.
 */
describe('stored() post-commit boundary — audit blockers', () => {
  it('clear() inside a transaction is not durable until commit', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-clear': 'light' });

    const store = signalTree({
      theme: stored('sco-clear', 'light', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { theme: { (): string; set(v: string): void; clear(): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.theme.clear();
    });

    // clear() removes the key. That is a durable consequence and must wait for
    // the commit exactly as a set() does.
    expect(rec.log).toEqual([]);

    pending.rollback();

    // Rollback restores the signal; storage must never have lost the key.
    expect(store.$.theme()).toBe('light');
    expect(rec.adapter.getItem('sco-clear')).toContain('light');
  });

  it('out-of-order confirm of overlapping transactions cannot resurrect a superseded value', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-overlap': 'v0' });

    const store = signalTree({
      v: stored('sco-overlap', 'v0', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { v: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    // Two pendings open at once on one tree. Only NESTED transactions are
    // refused; overlapping ones are a designed-for case.
    const p1 = store.transaction(() => store.$.v.set('a'));
    const p2 = store.transaction(() => store.$.v.set('b'));

    // Confirmed out of authoring order, which the API permits.
    p2.confirm();
    p1.confirm();

    // 'a' was never committed truth by the time p1 settled: the tree already
    // read 'b'. A consequence must persist committed truth at SETTLE time, not
    // the value captured when the write was authored.
    expect(store.$.v()).toBe('b');
    expect(rec.adapter.getItem('sco-overlap')).toContain('b');
  });

  it('does not absorb a write into a FOREIGN tree transaction scope', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-foreign': 'light' });

    // treeA has no transactions enhancer at all — nothing about its writes is
    // speculative under treeB's transaction.
    const treeA = signalTree({
      theme: stored('sco-foreign', 'light', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }) as unknown as {
      $: { theme: { (): string; set(v: string): void } };
    };

    const treeB = signalTree({ n: 0 }).with(transactions()) as {
      $: { n: { (): number; set(v: number): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = treeB.transaction(() => {
      treeB.$.n.set(1);
      treeA.$.theme.set('dark'); // committed truth for treeA, not speculative
    });

    pending.rollback();

    // treeB's rollback does not and cannot compensate treeA, so treeA's write
    // must have been durable. Absorbing it into treeB's scope drops it, and the
    // tree then disagrees with storage forever.
    expect(treeA.$.theme()).toBe('dark');
    expect(rec.adapter.getItem('sco-foreign')).toContain('dark');
  });
});

/**
 * Second-pass audit blocker: a deferred consequence must reflect COMMITTED
 * truth at settle time, not the value captured when it was queued.
 *
 * The queued closure captured `value`, so a bare committed write made after
 * the callback returned — the ordinary optimistic-UI shape, a request in
 * flight while the user edits the same field again — was overwritten by the
 * stale speculative value when the transaction confirmed. Storage ended up
 * holding a value the tree never had, permanently.
 */
describe('stored() deferred consequences resolve at settle time', () => {
  it('does not replay a stale speculative value over a later committed write', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-stale': 'v0' });

    const store = signalTree({
      v: stored('sco-stale', 'v0', { storage: rec.adapter, debounceMs: 0 }),
    }).with(transactions()) as {
      $: { v: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.v.set('optimistic');
    });

    // A bare, non-transactional write: committed truth the moment it returns.
    store.$.v.set('user-typed-later');
    expect(rec.adapter.getItem('sco-stale')).toContain('user-typed-later');

    pending.confirm();

    // Storage must agree with the tree. The transaction's own value is stale.
    expect(store.$.v()).toBe('user-typed-later');
    expect(rec.adapter.getItem('sco-stale')).toContain('user-typed-later');
  });

  it('does not let a deferred clear() delete a later committed write', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-stale-clear': 'v0' });

    const store = signalTree({
      v: stored('sco-stale-clear', 'v0', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { v: { (): string; set(value: string): void; clear(): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.v.clear();
    });

    store.$.v.set('written-after-clear');
    pending.confirm();

    // The clear is stale: the node holds a committed value, so storage must
    // hold it too rather than having the key removed.
    expect(store.$.v()).toBe('written-after-clear');
    expect(rec.adapter.getItem('sco-stale-clear')).toContain(
      'written-after-clear'
    );
  });
});

/**
 * RECORDED DEFECT — not fixed. Found by the third audit of this boundary
 * (HEAD 49a8ab34). Characterized here so it is measured rather than argued
 * about, and deliberately NOT patched: it is the sixth defect of the same
 * class on this surface, and the release ledger records a design
 * reassessment instead of a fourth local repair.
 *
 * A rollback compensation write is applied through the realization port with
 * NO transaction on the stack. `deferDurableConsequence` can only defer when
 * the ambient write context carries transactionOwner + transactionId, so the
 * compensating write falls through to an immediate durable write. When two
 * pendings overlap, the value it restores is the OTHER pending transaction's
 * speculative value — which is then durable while that transaction is still
 * unconfirmed.
 */
describe('stored() commit attribution — RECORDED DEFECT', () => {
  it('writes a still-pending speculative value during an overlapping rollback', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'sco-attr': 'v0' });

    const store = signalTree({
      v: stored('sco-attr', 'v0', { storage: rec.adapter, debounceMs: 0 }),
    }).with(transactions()) as {
      $: { v: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const p1 = store.transaction(() => store.$.v.set('a'));
    const p2 = store.transaction(() => store.$.v.set('b'));

    // Correct so far: both speculative, nothing durable.
    expect(rec.log).toEqual([]);

    p2.rollback();

    // THE DEFECT: compensation restored 'a' — p1's speculative value, still
    // unconfirmed — and wrote it straight through the boundary.
    expect(rec.log).toEqual([{ op: 'set', key: 'sco-attr' }]);
    expect(dataIn(rec.snapshots[0], 'sco-attr')).toBe('a');
    expect(store.$.v()).toBe('a');
  });
});
