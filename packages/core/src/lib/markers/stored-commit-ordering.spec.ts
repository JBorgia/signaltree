import { describe, expect, it } from 'vitest';

import { transactions } from '../../enhancers/transactions/transactions';
import { signalTree } from '../signal-tree';
import { stored } from './stored';

/**
 * CHARACTERIZATION — `stored()` consequence ordering vs. the commit boundary.
 *
 * These tests assert what HEAD ACTUALLY DOES, not what it should do. They exist
 * to make the gap concrete and reviewable, because two documents disagree:
 *
 *   RELEASE-1.0.md  "Persistence is post-commit."
 *                   "All expected fallible semantic work precedes private commit."
 *   TODO.md §1      "failed PREPARE -> zero persistence writes"
 *                   "atomic multi-field/frame commit -> persistence sees only
 *                    final coherent state"
 *
 *   stored.ts:833   "Immediate mode: write synchronously in the caller's stack,
 *                    so the value is durable the moment set() returns."
 *
 * The marker writes through `saveToStorage` from `afterSet`/`afterUpdate`
 * (stored.ts:892-897), which runs inside the mutation's own stack — before the
 * transaction that contains it has been confirmed or even sealed. The tests
 * below measure the three consequences of that.
 *
 * If the ordering is changed so persistence is genuinely post-commit, every
 * assertion in this file inverts. That is the intended signal, not a
 * regression: this file is the falsifier for the "stored() consequence
 * ordering" item in RELEASE-1.0.md Phase 1.
 */

interface Recorder {
  readonly adapter: Storage;
  /** One entry per setItem/removeItem, in order. */
  readonly log: Array<{ op: 'set' | 'remove'; key: string }>;
  /** Full snapshot of the store taken after each write. */
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

/** Read the payload a `stored()` marker wrote, from a raw snapshot. */
function dataIn(snapshot: Record<string, string>, key: string): unknown {
  const raw = snapshot[key];
  return raw === undefined ? undefined : JSON.parse(raw).data;
}

describe('stored() consequence ordering (characterization of HEAD)', () => {
  it('persists a pending transaction BEFORE it is confirmed', async () => {
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

    // The transaction has NOT been confirmed, yet storage is already mutated.
    // Under "persistence is post-commit" this write must not have happened yet.
    expect(rec.log).toEqual([{ op: 'set', key: 'sco-pending' }]);
    expect(dataIn(rec.snapshots[0], 'sco-pending')).toBe('dark');

    pending.rollback();

    // Rollback repairs the value by writing again, rather than by never having
    // written. Durable state was wrong in between; a crash here loses the repair.
    expect(rec.log).toHaveLength(2);
    expect(dataIn(rec.snapshots[1], 'sco-pending')).toBe('light');
  });

  it('exposes a torn intermediate state across two stored keys in one transaction', async () => {
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
    pending.confirm();

    // Two separate writes, not one atomic frame.
    expect(rec.log.map((e) => e.key)).toEqual(['sco-a', 'sco-b']);

    // Snapshot 0 is the torn state: `a` advanced, `b` still at its old value.
    // A reload, a `storage` event in another tab, or a crash at this instant
    // observes a combination that never existed as a committed tree state.
    expect(dataIn(rec.snapshots[0], 'sco-a')).toBe('a1');
    expect(dataIn(rec.snapshots[0], 'sco-b')).toBe('b0');

    // Only the final snapshot is coherent.
    expect(dataIn(rec.snapshots[1], 'sco-a')).toBe('a1');
    expect(dataIn(rec.snapshots[1], 'sco-b')).toBe('b1');
  });

  it('writes to storage during a transaction that then throws', async () => {
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

    // "failed PREPARE -> zero persistence writes" would require log.length === 0.
    // HEAD writes the doomed value, then writes the baseline back.
    expect(rec.log.length).toBeGreaterThan(0);
    expect(dataIn(rec.snapshots[0], 'sco-throw')).toBe('doomed');

    // The in-memory tree is repaired...
    expect(store.$.v()).toBe('keep');
    // ...and storage converges too, but only via a compensating write.
    expect(dataIn(rec.snapshots[rec.snapshots.length - 1], 'sco-throw')).toBe(
      'keep'
    );
  });
});
