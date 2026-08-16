import { describe, expect, it } from 'vitest';

import { persistence } from './serialization';
import { signalTree } from '../../lib/signal-tree';
import { transactions } from '../transactions/transactions';
import { createStorageAdapter } from './storage-adapters';

/**
 * `persistence()` autoSave vs. the commit boundary.
 *
 * The same defect `stored()` had, reached through a different API. autoSave
 * serializes the WHOLE tree on a timer, so a snapshot taken while an explicit
 * transaction is open persists speculative state — state the transaction may
 * still roll back.
 *
 * The mechanism differs from `stored()` and that difference is the point.
 * `stored()` writes in the mutation's own stack, so it reads the transaction
 * off the write context. autoSave fires from a timer, by which time the
 * transaction callback has returned while the transaction itself may still be
 * pending; there is no write context left to read. It asks
 * `hasOpenCommitScope(tree)` instead and re-arms on settlement.
 *
 * That is a weaker signal than per-mutation attribution — scope presence, not
 * ownership — so it is keyed by explicit tree identity and tested here
 * separately rather than assumed to follow from the `stored()` tests.
 */

interface Recorder {
  readonly adapter: ReturnType<typeof createStorageAdapter>;
  /** Every payload ever written, in order. */
  readonly writes: Array<Record<string, unknown>>;
  readonly map: Map<string, string>;
}

function recordingStorage(): Recorder {
  const map = new Map<string, string>();
  const writes: Array<Record<string, unknown>> = [];
  const adapter = createStorageAdapter(
    (k) => map.get(k) ?? null,
    (k, v) => {
      map.set(k, v);
      try {
        writes.push(JSON.parse(v).data as Record<string, unknown>);
      } catch {
        writes.push({ __unparsed: v });
      }
    },
    (k) => void map.delete(k)
  );
  return { adapter, writes, map };
}

/** Long enough for the 100ms polling fallback plus the autoSave debounce. */
const settleTimers = () => new Promise((r) => setTimeout(r, 260));

function makeTree(recorder: Recorder, key: string) {
  return signalTree({ a: 'a0', b: 'b0' })
    .with(transactions())
    .with(
      persistence({
        key,
        storage: recorder.adapter,
        autoSave: true,
        autoLoad: false,
        debounceMs: 10,
      })
    ) as unknown as {
    $: {
      a: { (): string; set(v: string): void };
      b: { (): string; set(v: string): void };
    };
    transaction: (fn: () => void) => { confirm(): void; rollback(): void };
  };
}

describe('persistence() autoSave respects the commit boundary', () => {
  it('does not persist while a transaction is open, even after the timer fires', async () => {
    const rec = recordingStorage();
    const tree = makeTree(rec, 'pco-open');

    const pending = tree.transaction(() => {
      tree.$.a.set('a1');
      tree.$.b.set('b1');
    });

    await settleTimers();

    // The timer has certainly fired by now. Nothing may be durable: the
    // transaction is still speculative.
    expect(rec.writes).toEqual([]);
    expect(rec.map.has('pco-open')).toBe(false);

    pending.confirm();
  });

  it('persists one coherent snapshot after successful settlement', async () => {
    const rec = recordingStorage();
    const tree = makeTree(rec, 'pco-confirm');

    const pending = tree.transaction(() => {
      tree.$.a.set('a1');
      tree.$.b.set('b1');
    });
    await settleTimers();
    expect(rec.writes).toEqual([]);

    pending.confirm();
    await settleTimers();

    // Whole-tree serialization means this IS atomic across keys, unlike
    // stored(): every payload written is internally coherent.
    expect(rec.writes.length).toBeGreaterThan(0);
    for (const payload of rec.writes) {
      expect(payload).toMatchObject({ a: 'a1', b: 'b1' });
    }
  });

  it('never persists a speculative snapshot when the transaction is rolled back', async () => {
    const rec = recordingStorage();
    const tree = makeTree(rec, 'pco-rollback');

    const pending = tree.transaction(() => {
      tree.$.a.set('doomed');
    });
    await settleTimers();

    pending.rollback();
    await settleTimers();

    // Correctness is "never wrote", not "wrote and compensated": no payload
    // storage ever held may contain the rejected value.
    for (const payload of rec.writes) {
      expect(payload['a']).not.toBe('doomed');
    }
    expect(tree.$.a()).toBe('a0');
  });

  it('releases the deferred save when the transaction throws', async () => {
    const rec = recordingStorage();
    const tree = makeTree(rec, 'pco-throw');

    expect(() =>
      tree.transaction(() => {
        tree.$.a.set('doomed');
        throw new Error('boom');
      })
    ).toThrow('boom');

    await settleTimers();

    // A thrown transaction settles as discarded, so autoSave must be released
    // rather than held forever — and what it then writes is the restored
    // baseline, never the doomed value.
    for (const payload of rec.writes) {
      expect(payload['a']).not.toBe('doomed');
    }
    expect(tree.$.a()).toBe('a0');
  });

  it('one tree open transaction does not block another tree autoSave', async () => {
    const recBlocked = recordingStorage();
    const recFree = recordingStorage();

    const blocked = makeTree(recBlocked, 'pco-blocked');
    const free = makeTree(recFree, 'pco-free');

    const pending = blocked.transaction(() => {
      blocked.$.a.set('a1');
    });

    // A perfectly ordinary write on an unrelated tree.
    free.$.a.set('free1');

    await settleTimers();

    // Scope presence is keyed by tree identity, so the second tree is
    // unaffected by the first tree's pending transaction.
    expect(recBlocked.writes).toEqual([]);
    expect(recFree.writes.length).toBeGreaterThan(0);
    expect(recFree.writes[recFree.writes.length - 1]).toMatchObject({
      a: 'free1',
    });

    pending.confirm();
  });
});
