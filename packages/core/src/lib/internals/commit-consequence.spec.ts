import { describe, expect, it } from 'vitest';

import { transactions } from '../../enhancers/transactions/transactions';
import { stored } from '../markers/stored';
import { signalTree } from '../signal-tree';
import {
  deferCommitConsequence,
  hasOpenCommitScope,
  openCommitScope,
  settleCommitScope,
} from './commit-consequence';

/**
 * The commit-consequence boundary must earn its existence before more than one
 * consumer depends on it. These are the falsifiers for the abstraction itself,
 * not for `stored()`.
 *
 * The property under test throughout is EXPLICIT ATTRIBUTION: a consequence
 * belongs to one (transactionOwner, transactionId) pair carried in mutation
 * metadata. Nothing here may work by asking "is some transaction currently
 * running?" — SignalTree already paid for ambient async attribution once
 * during causal realization and does not do it again.
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

describe('commit-consequence registry — explicit attribution', () => {
  it('refuses to buffer without a scope opened for that exact owner and id', () => {
    const owner = {};
    let ran = false;

    // No scope open at all.
    expect(deferCommitConsequence(owner, 1, 'k', () => (ran = true))).toBe(
      false
    );

    openCommitScope(owner, 1);

    // Right owner, WRONG id — must not be absorbed by the open scope.
    expect(deferCommitConsequence(owner, 2, 'k', () => (ran = true))).toBe(
      false
    );
    // WRONG owner, right id — likewise.
    expect(deferCommitConsequence({}, 1, 'k', () => (ran = true))).toBe(false);
    // Exact match.
    expect(deferCommitConsequence(owner, 1, 'k', () => (ran = true))).toBe(true);

    expect(ran).toBe(false);
    settleCommitScope(owner, 1, 'commit');
    expect(ran).toBe(true);
  });

  it('keeps two concurrent transaction identities from consuming each other', () => {
    const ownerA = {};
    const ownerB = {};
    const order: string[] = [];

    openCommitScope(ownerA, 1);
    openCommitScope(ownerB, 1); // same id, different owner
    openCommitScope(ownerA, 2); // same owner, different id

    deferCommitConsequence(ownerA, 1, 'k', () => order.push('A1'));
    deferCommitConsequence(ownerB, 1, 'k', () => order.push('B1'));
    deferCommitConsequence(ownerA, 2, 'k', () => order.push('A2'));

    settleCommitScope(ownerA, 1, 'commit');
    expect(order).toEqual(['A1']);

    settleCommitScope(ownerB, 1, 'discard');
    expect(order).toEqual(['A1']);

    settleCommitScope(ownerA, 2, 'commit');
    expect(order).toEqual(['A1', 'A2']);
  });

  it('collapses repeated writes to one key, preserving the last value only', () => {
    const owner = {};
    const seen: string[] = [];
    openCommitScope(owner, 1);

    deferCommitConsequence(owner, 1, 'same', () => seen.push('first'));
    deferCommitConsequence(owner, 1, 'same', () => seen.push('second'));
    deferCommitConsequence(owner, 1, 'other', () => seen.push('other'));

    settleCommitScope(owner, 1, 'commit');
    expect(seen).toEqual(['second', 'other']);
  });

  it('is idempotent — confirm after rollback cannot resurrect dropped work', () => {
    const owner = {};
    let ran = 0;
    openCommitScope(owner, 1);
    deferCommitConsequence(owner, 1, 'k', () => ran++);

    settleCommitScope(owner, 1, 'discard');
    settleCommitScope(owner, 1, 'commit');

    expect(ran).toBe(0);
  });

  it('runs every consequence even when one throws, then rethrows the first error', () => {
    const owner = {};
    const ran: string[] = [];
    openCommitScope(owner, 1);
    deferCommitConsequence(owner, 1, 'a', () => {
      ran.push('a');
      throw new Error('backend down');
    });
    deferCommitConsequence(owner, 1, 'b', () => ran.push('b'));

    expect(() => settleCommitScope(owner, 1, 'commit')).toThrow('backend down');
    expect(ran).toEqual(['a', 'b']);
  });

  it('reports open scopes per tree and clears them on settle', () => {
    const owner = {};
    const tree = {};
    expect(hasOpenCommitScope(tree)).toBe(false);

    openCommitScope(owner, 1, tree);
    openCommitScope(owner, 2, tree);
    expect(hasOpenCommitScope(tree)).toBe(true);

    settleCommitScope(owner, 1, 'commit');
    expect(hasOpenCommitScope(tree)).toBe(true); // scope 2 still open

    settleCommitScope(owner, 2, 'discard');
    expect(hasOpenCommitScope(tree)).toBe(false);
  });
});

describe('commit-consequence boundary — observed through stored()', () => {
  it('1. a bare set persists immediately, its mutation having committed', async () => {
    const { resetPathNotifier } = await import('../path-notifier');
    resetPathNotifier();

    const rec = recordingStorage({ 'cc-bare': 'light' });
    const store = signalTree({
      theme: stored('cc-bare', 'light', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(transactions()) as {
      $: { theme: { (): string; set(value: string): void } };
    };

    store.$.theme.set('dark');

    // No transaction, nothing to wait for: durable the moment set() returns.
    expect(rec.log).toEqual([{ op: 'set', key: 'cc-bare' }]);
    expect(dataIn(rec.snapshots[0], 'cc-bare')).toBe('dark');
  });

  it('2. two writes in one successful transaction persist once, coherently, after confirm', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'cc-a': 'a0', 'cc-b': 'b0' });
    const store = signalTree({
      a: stored('cc-a', 'a0', { storage: rec.adapter, debounceMs: 0 }),
      b: stored('cc-b', 'b0', { storage: rec.adapter, debounceMs: 0 }),
    }).with(transactions()) as {
      $: {
        a: { (): string; set(value: string): void };
        b: { (): string; set(value: string): void };
      };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.a.set('a1');
      store.$.a.set('a2'); // superseded — must never be durable
      store.$.b.set('b1');
    });

    // Zero durable writes while the transaction is unconfirmed.
    expect(rec.log).toEqual([]);
    expect(store.$.a()).toBe('a2'); // live tree state is unaffected

    pending.confirm();

    // One write per key, final values only, and no torn snapshot in between:
    // the first snapshot after confirm already carries a's committed value.
    expect(rec.log.map((e) => e.key)).toEqual(['cc-a', 'cc-b']);
    expect(dataIn(rec.snapshots[0], 'cc-a')).toBe('a2');
    const last = rec.snapshots[rec.snapshots.length - 1];
    expect(dataIn(last, 'cc-a')).toBe('a2');
    expect(dataIn(last, 'cc-b')).toBe('b1');
  });

  it('3. a thrown transaction makes zero speculative writes — not write-then-compensate', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'cc-throw': 'keep' });
    const store = signalTree({
      v: stored('cc-throw', 'keep', { storage: rec.adapter, debounceMs: 0 }),
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

    // The doomed value must never appear in ANY snapshot storage ever held.
    for (const snapshot of rec.snapshots) {
      expect(dataIn(snapshot, 'cc-throw')).not.toBe('doomed');
    }
    expect(store.$.v()).toBe('keep');
    expect(rec.adapter.getItem('cc-throw')).toContain('keep');
  });

  it('3b. an explicit rollback likewise leaves no speculative value durable', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'cc-rb': 'light' });
    const store = signalTree({
      theme: stored('cc-rb', 'light', { storage: rec.adapter, debounceMs: 0 }),
    }).with(transactions()) as {
      $: { theme: { (): string; set(value: string): void } };
      transaction: (fn: () => void) => { confirm(): void; rollback(): void };
    };

    const pending = store.transaction(() => {
      store.$.theme.set('dark');
    });
    expect(rec.log).toEqual([]);

    pending.rollback();

    for (const snapshot of rec.snapshots) {
      expect(dataIn(snapshot, 'cc-rb')).not.toBe('dark');
    }
    expect(store.$.theme()).toBe('light');
  });

  it('4. one tree confirming does not flush another tree pending transaction', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const rec = recordingStorage({ 'cc-t1': 'x0', 'cc-t2': 'y0' });

    const makeTree = (key: string, seed: string) =>
      signalTree({
        v: stored(key, seed, { storage: rec.adapter, debounceMs: 0 }),
      }).with(transactions()) as {
        $: { v: { (): string; set(value: string): void } };
        transaction: (fn: () => void) => { confirm(): void; rollback(): void };
      };

    const one = makeTree('cc-t1', 'x0');
    const two = makeTree('cc-t2', 'y0');

    const pendingOne = one.transaction(() => one.$.v.set('x1'));
    const pendingTwo = two.transaction(() => two.$.v.set('y1'));

    expect(rec.log).toEqual([]);

    pendingOne.confirm();

    // Only tree one's consequence ran. Tree two is a separate owner token and
    // must still be holding its write.
    expect(rec.log.map((e) => e.key)).toEqual(['cc-t1']);

    pendingTwo.confirm();
    expect(rec.log.map((e) => e.key)).toEqual(['cc-t1', 'cc-t2']);
  });

  it('5. undo is non-authoring but still persists its committed result', async () => {
    const { getPathNotifier, resetPathNotifier } = await import(
      '../path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const { timeTravel } = await import('../../enhancers/time-travel/time-travel');

    const rec = recordingStorage({ 'cc-undo': 'light' });
    const store = signalTree({
      theme: stored('cc-undo', 'light', {
        storage: rec.adapter,
        debounceMs: 0,
      }),
    }).with(timeTravel()) as unknown as {
      $: { theme: { (): string; set(value: string): void } };
      undo(): void;
    };

    store.$.theme.set('dark');
    expect(rec.adapter.getItem('cc-undo')).toContain('dark');

    // The turn has to be recorded before it can be undone.
    await Promise.resolve();
    await Promise.resolve();

    store.undo();

    // Undo is realization, not authoring — but its result IS committed
    // physical truth, so it must persist rather than be suppressed as
    // "non-authoring".
    expect(store.$.theme()).toBe('light');
    expect(rec.adapter.getItem('cc-undo')).toContain('light');
  });
});
