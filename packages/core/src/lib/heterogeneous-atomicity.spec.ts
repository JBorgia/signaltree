import { describe, expect, it } from 'vitest';

import { entityMap } from './markers/entity-map';
import { getPhysicalCommitClock } from './internals/physical-commit-clock';
import { signalTree } from './signal-tree';
import { stored } from './markers/stored';
import { transactions } from '../enhancers/transactions/transactions';
import { createStorageAdapter } from '../enhancers/serialization/storage-adapters';

/**
 * Heterogeneous atomicity — RELEASE-1.0.md Phase 1.
 *
 * The contract, per RELEASE-1.0.md Release Invariants:
 *
 *   - atomicity is externally observable coherence, NOT a count of internal
 *     revision increments;
 *   - physical revisions are monotonic implementation stamps, never
 *     transaction identities, and never rewind;
 *   - a semantic transaction may span more than one private substrate commit;
 *   - no observer, publication adapter, or persistence consequence may see an
 *     intermediate heterogeneous state;
 *   - failure before commit leaves the SEMANTIC state neutral.
 *
 * TODO.md §1 originally asked for "success advances ONE physical revision".
 * That was superseded: it conflated a semantic transaction with a private
 * physical commit. Measured here, a heterogeneous transaction advances two —
 * and no consumer can tell, which is the property that actually matters.
 *
 * `causal-runtime/tree-realization-adapter.spec.ts` already proves the RESTORE
 * path: a mixed add + scalar effect set realized together through the port.
 * This file proves the FORWARD authoring path — an ordinary consumer writing a
 * scalar and mutating a collection inside one `transaction()` — which is the
 * direction a user actually drives and which nothing measured end to end.
 */

type Row = { id: string; name: string };

interface Harness {
  readonly tree: {
    (): { count: number; theme: string; rows: { all: Row[] } };
    $: {
      count: { (): number; set(v: number): void };
      theme: { (): string; set(v: string): void };
      rows: {
        addOne(row: Row): void;
        removeOne(id: string): void;
        ids(): string[];
      };
    };
    transaction: (fn: () => void) => { confirm(): void; rollback(): void };
  };
  readonly writes: string[];
  revision(): number | undefined;
}

function harness(key: string): Harness {
  const map = new Map<string, string>();
  const writes: string[] = [];
  const adapter = createStorageAdapter(
    (k) => map.get(k) ?? null,
    (k, v) => {
      map.set(k, v);
      writes.push(String(JSON.parse(v).data));
    },
    (k) => void map.delete(k)
  );

  const tree = signalTree({
    count: 0,
    theme: stored(key, 'light', { storage: adapter, debounceMs: 0 }),
    rows: entityMap<Row, string>({ selectId: (r) => r.id }),
  }).with(transactions()) as unknown as Harness['tree'];

  return {
    tree,
    writes,
    revision: () =>
      (
        getPhysicalCommitClock(tree) ??
        getPhysicalCommitClock((tree as unknown as { $: object }).$)
      )?.revision(),
  };
}

describe('heterogeneous atomicity: scalar + structural in one transaction', () => {
  it('spans two private substrate commits, which is permitted and not a transaction identity', async () => {
    const { resetPathNotifier, getPathNotifier } = await import(
      './path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const h = harness('het-count');
    const before = h.revision();

    const pending = h.tree.transaction(() => {
      h.tree.$.count.set(1); // scalar
      h.tree.$.rows.addOne({ id: 'r1', name: 'Ada' }); // structural
    });
    pending.confirm();

    const after = h.revision();

    // Both changes landed.
    expect(h.tree.$.count()).toBe(1);
    expect(h.tree.$.rows.ids()).toEqual(['r1']);
    expect(before).toBeTypeOf('number');
    expect(after).toBeTypeOf('number');

    // Two private substrate commits: one scalar, one structural. This is the
    // contract, not a defect — a semantic transaction is allowed to span more
    // than one private physical commit, because atomicity is defined by what
    // an observer can see, which the next test pins. Asserted exactly so that
    // collapsing or splitting the substrates becomes a deliberate, visible
    // change rather than a silent one.
    expect((after as number) - (before as number)).toBe(2);
  });

  it('the two frames are not separately observable by a tree subscriber', async () => {
    const { resetPathNotifier, getPathNotifier } = await import(
      './path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const h = harness('het-observe');

    // Capture the full tree on every notification. If the two physical frames
    // are independently visible, some capture holds one change without the
    // other — a state that was never a committed tree state.
    const seen: Array<{ count: number; rows: string[] }> = [];
    const unsubscribe = getPathNotifier().subscribe('**', () => {
      seen.push({
        count: h.tree.$.count(),
        rows: [...h.tree.$.rows.ids()],
      });
    });

    const pending = h.tree.transaction(() => {
      h.tree.$.count.set(1);
      h.tree.$.rows.addOne({ id: 'r1', name: 'Ada' });
    });
    pending.confirm();
    unsubscribe();

    const torn = seen.filter(
      (s) =>
        (s.count === 1 && s.rows.length === 0) ||
        (s.count === 0 && s.rows.length === 1)
    );

    // Guard against a vacuous pass: if the subscriber never fired, `torn` is
    // trivially empty and this test would prove nothing at all.
    expect(seen.length).toBeGreaterThan(0);

    // This is the assertion that actually encodes the guarantee consumers
    // care about: no observer sees half of a heterogeneous transaction.
    expect(torn).toEqual([]);
  });

  it('leaves everything neutral when the transaction throws', async () => {
    const { resetPathNotifier, getPathNotifier } = await import(
      './path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const h = harness('het-throw');
    const before = h.revision();

    expect(() =>
      h.tree.transaction(() => {
        h.tree.$.count.set(99);
        h.tree.$.theme.set('doomed');
        h.tree.$.rows.addOne({ id: 'ghost', name: 'Nobody' });
        throw new Error('boom');
      })
    ).toThrow('boom');

    await Promise.resolve();

    // Semantic state is neutral: no scalar, no row, no durable write.
    expect(h.tree.$.count()).toBe(0);
    expect(h.tree.$.rows.ids()).toEqual([]);
    expect(h.tree.$.theme()).toBe('light');
    expect(h.writes).not.toContain('doomed');

    // The physical commit clock is a MONOTONIC version stamp, not state. It
    // advances for the compensating commit too, and must not rewind: an
    // observer caching by revision would otherwise be handed a stale value
    // under a revision it had already seen. "Neutral" means the semantic
    // state is neutral, which every assertion above proves. Measured: the
    // clock advanced while the tree returned to baseline.
    expect(h.revision()).toBeGreaterThanOrEqual(before as number);
  });

  it('leaves everything neutral when the transaction is rolled back', async () => {
    const { resetPathNotifier, getPathNotifier } = await import(
      './path-notifier'
    );
    resetPathNotifier();
    getPathNotifier().setBatchingEnabled(false);

    const h = harness('het-rollback');
    const before = h.revision();

    const pending = h.tree.transaction(() => {
      h.tree.$.count.set(42);
      h.tree.$.theme.set('doomed');
      h.tree.$.rows.addOne({ id: 'ghost', name: 'Nobody' });
    });
    pending.rollback();

    expect(h.tree.$.count()).toBe(0);
    expect(h.tree.$.rows.ids()).toEqual([]);
    expect(h.tree.$.theme()).toBe('light');
    expect(h.writes).not.toContain('doomed');
    expect(h.revision()).toBeGreaterThanOrEqual(before as number);
  });
});
