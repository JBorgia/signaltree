/**
 * Granular-reactivity fan-out proof.
 *
 * SignalTree's headline claim is "fine-grained reactivity": updating one piece
 * of state should only re-run the computations that actually depend on it.
 * This spec MEASURES that claim instead of asserting it in marketing copy, and
 * it records where the claim holds and where it does NOT.
 *
 * Metric: BODY-level recompute fan-out — how many of N sibling computed()
 * BODIES execute when exactly ONE underlying value changes. The counter lives
 * inside the computed that directly establishes the dependency, so this is the
 * "wasted computation" cost, not the (weaker) downstream-propagation isolation
 * that any value-equal computed gives you for free. Lower is better; 1 is ideal.
 *
 *   - Nested object leaves → SignalTree builds one signal per leaf, so a leaf
 *     write dirties only that leaf's computed. Fan-out = 1. REAL advantage,
 *     and the thing raw `signal(bigObject)` cannot do without hand-rolling one
 *     signal per field yourself.
 *   - Raw signal(bigObject) → the hand-rolled baseline: one signal holding the
 *     whole object. Any change dirties every reader. Fan-out = N.
 *   - entityMap collection → per-entity reads all hit the single `mapSignal`,
 *     replaced on every write, so every body re-runs. Fan-out = N. entityMap
 *     isolates downstream *propagation* (unchanged values stop at computed
 *     equality) but NOT body recompute — documented honestly here.
 */
import { computed, signal } from '@angular/core';
import { entityMap, signalTree } from '@signaltree/core';

const N = 100;
const TARGET = 42; // the single index we mutate

/**
 * Build N computeds, each with a recompute counter in the body that directly
 * reads its source. Returns the counters and a fn that reads all computeds.
 */
function instrument(read: (i: number) => unknown): {
  counters: number[];
  readAll: () => void;
} {
  const counters = new Array(N).fill(0);
  const computeds = Array.from({ length: N }, (_, i) =>
    computed(() => {
      counters[i]++;
      return read(i);
    })
  );
  return { counters, readAll: () => computeds.forEach((c) => c()) };
}

describe('granular-reactivity fan-out', () => {
  it('SignalTree nested leaves isolate a single-leaf update (fan-out = 1)', () => {
    const initial: Record<string, { v: number }> = {};
    for (let i = 0; i < N; i++) initial[`n${i}`] = { v: 0 };
    const tree = signalTree({ nodes: initial });
    const nodes = tree.$.nodes as Record<
      string,
      { v: { (): number; set: (n: number) => void } }
    >;

    const { counters, readAll } = instrument((i) => nodes[`n${i}`].v());

    readAll(); // prime
    expect(counters.every((c) => c === 1)).toBe(true);

    nodes[`n${TARGET}`].v.set(999); // touch exactly one leaf
    readAll();

    expect(counters[TARGET]).toBe(2); // touched leaf recomputed
    expect(counters.filter((c) => c > 1).length).toBe(1); // nothing else did
  });

  it('raw signal(bigObject) invalidates everything (fan-out = N) — the hand-rolled baseline SignalTree replaces', () => {
    const initial: Record<string, { v: number }> = {};
    for (let i = 0; i < N; i++) initial[`n${i}`] = { v: 0 };
    const root = signal(initial);

    const { counters, readAll } = instrument((i) => root()[`n${i}`].v);

    readAll();
    expect(counters.every((c) => c === 1)).toBe(true);

    const cur = root();
    root.set({ ...cur, [`n${TARGET}`]: { v: 999 } });
    readAll();

    expect(counters.filter((c) => c > 1).length).toBe(N); // no isolation
  });

  it('entityMap via byId() IS body-granular (fan-out = 1) — the per-entity signal layer', () => {
    interface Row {
      id: number;
      v: number;
    }
    const tree = signalTree({ rows: entityMap<Row, number>() });
    const rows = tree.$.rows as unknown as {
      addMany: (r: Row[]) => void;
      updateOne: (id: number, patch: Partial<Row>) => void;
      byId: (id: number) => { v: () => number } | undefined;
    };
    rows.addMany(Array.from({ length: N }, (_, i) => ({ id: i, v: 0 })));

    // Idiomatic per-entity read: byId(i).v() depends only on entity i's signal.
    const { counters, readAll } = instrument((i) => rows.byId(i)?.v() ?? -1);

    readAll();
    expect(counters.every((c) => c === 1)).toBe(true);

    rows.updateOne(TARGET, { v: 999 });
    readAll();

    // REGRESSION GUARD: updating one entity must dirty only that entity's
    // readers. Before the per-entity signal layer this was N (all per-entity
    // computeds read the single mapSignal). Keep this at 1.
    expect(counters[TARGET]).toBe(2);
    expect(counters.filter((c) => c > 1).length).toBe(1);
  });

  it('entityMap via map() (collection signal) still fans out to N — correct for collection queries', () => {
    interface Row {
      id: number;
      v: number;
    }
    const tree = signalTree({ rows: entityMap<Row, number>() });
    const rows = tree.$.rows as unknown as {
      addMany: (r: Row[]) => void;
      updateOne: (id: number, patch: Partial<Row>) => void;
      map: () => ReadonlyMap<number, Row>;
    };
    rows.addMany(Array.from({ length: N }, (_, i) => ({ id: i, v: 0 })));

    // Reading through the whole-collection signal SHOULD fan out — anything
    // derived from the entire map legitimately depends on every change.
    const { counters, readAll } = instrument((i) => rows.map().get(i)?.v ?? -1);

    readAll();
    rows.updateOne(TARGET, { v: 999 });
    readAll();

    expect(counters.filter((c) => c > 1).length).toBe(N);
  });
});
