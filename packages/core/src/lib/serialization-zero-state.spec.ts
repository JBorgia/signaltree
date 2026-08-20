import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entityMap, signalTree, stored } from '../index';

/**
 * DERIVATION — SERIALIZATION, FROM ZERO.
 *
 * Rule 0o: the functions are stated before the incumbent is opened, and the
 * 1352-line serializer gets the LAST look. It must not be allowed to
 * re-legitimise the M3/M4 hooks merely because it currently calls them.
 *
 * THE FUNCTIONS, named without reference to any existing mechanism:
 *
 *   F1 EXTERNALIZE   produce a value carrying the tree's canonical truth that
 *                    survives leaving this process — i.e. can cross a boundary
 *                    that passes only inert data.
 *   F2 INTERNALIZE   take such a value and make a tree hold that truth again.
 *   F3 IDENTIFY      the external value must say enough about itself that
 *                    internalizing it is correct (what shape, what version).
 *   F4 BOUNDARY      whether to BELIEVE the payload depends on where it came
 *                    from. ALREADY RESOLVED by M4: mode is a property of the
 *                    call site, and the decline is a uniform rule over
 *                    (mode, owns-a-live-source).
 *   F5 TRANSPORT     the external form must not assume one transport.
 *   F6 REFUSAL       only if independently required.
 *
 * THE NULLS are ordinary, and they exist because of what M3 established:
 *
 *   F1 -> `tree()` is already callable and returns a plain snapshot.
 *   F2 -> `tree(payload)` is already the write path.
 *   F3 -> the application wraps it: `{ v: 1, data: tree() }`.
 *   F5 -> a plain JS value is transport-neutral by construction.
 *
 * THE REAL TEST. M3 concluded "a realized value's state is what the accessor
 * returns." Serialization is where that rule meets JSON, versioning,
 * reconstruction and non-JSON values. If it survives here it stops being a local
 * theorem about a walk and becomes a system theorem.
 */
type Row = { id: string; n: number };

const roundTripJson = (v: unknown): unknown =>
  JSON.parse(JSON.stringify(v)) as unknown;

// ============================================================================
// S-1 — does the NULL round-trip ordinary canonical state?
// ============================================================================
describe('S-1 — the null on ordinary state', () => {
  it('externalize + internalize restores every leaf', () => {
    const tree = signalTree({
      count: 1,
      user: { name: 'Ada', age: 36 },
      tags: ['a', 'b'],
      flag: true,
      nothing: null as string | null,
    });

    const wire = roundTripJson(tree()); // F1 + F5, via JSON

    const fresh = signalTree({
      count: 0,
      user: { name: '', age: 0 },
      tags: [] as string[],
      flag: false,
      nothing: null as string | null,
    });
    fresh(wire as never); // F2

    expect(fresh()).toEqual({
      count: 1,
      user: { name: 'Ada', age: 36 },
      tags: ['a', 'b'],
      flag: true,
      nothing: null,
    });
  });

  it('F1 IS NOT SATISFIED BY `tree()` ALONE — the read-only guarantee is CONTRACT', () => {
    const tree = signalTree({ user: { name: 'Ada', pets: ['cat'] } });
    const snap = tree() as { user: { name: string; pets: string[] } };

    // The node object IS frozen (dev only), so the common mistake throws.
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.user)).toBe(true);
    expect(() => {
      snap.user.name = 'MUTATED';
    }).toThrow(/read only|readonly|frozen/i);

    // But the freeze is PER NODE and does not reach leaf VALUES. An array leaf
    // is handed out by reference, unfrozen, and mutating it reaches live state.
    // This is documented at utils.ts:462-486 and pinned by
    // snapshot-aliasing.spec.ts (5 rows) — deliberately not fixed, on
    // measurement: copying leaf values costs +54us against 1.0us on a 50k array,
    // and Object.freeze stops Array.push while Date.setFullYear, Map.set and
    // Set.add ignore it entirely, so enforcement would be half a guarantee
    // reading as a whole one.
    expect(Object.isFrozen(snap.user.pets)).toBe(false);
    expect(snap.user.pets).toBe(tree.$.user.pets());

    // THE DERIVATION POINT, which is why this row is here and not a bug report:
    // `tree()` is a read-only view BY CONTRACT, aliasing live state. So F1
    // ("produce a value that survives leaving the process") is NOT satisfied by
    // `tree()` on its own — an external representation that aliases internal
    // truth has not actually left.
    //
    // The null already handles it: a codec COPIES. That copy is the boundary,
    // and it is work the transport was going to do anyway.
    const detached = roundTripJson(tree()) as {
      user: { pets: string[] };
    };
    detached.user.pets.push('dog');
    expect(tree.$.user.pets()).toEqual(['cat']); // untouched
  });
});

// ============================================================================
// S-2 — DERIVED values. Externalizing a computed is a CATEGORY ERROR: it is not
// canonical truth, and restoring it would install a stale value that should
// have been recomputed.
// ============================================================================
describe('S-2 — derived must not be externalized', () => {
  it('MEASURE — does the snapshot include derived?', () => {
    const tree = signalTree({ a: 2, b: 3 }).derived(($) => ({
      sum: computed(() => $.a() + $.b()),
    }));

    expect(tree.$.sum()).toBe(5);

    const snap = tree() as Record<string, unknown>;
    // The finding either way: if `sum` is present, the external form carries a
    // value that must never be believed on the way back in.
    expect(Object.keys(snap).sort()).toEqual(['a', 'b']);
    expect('sum' in snap).toBe(false);
  });
});

// ============================================================================
// S-3 — NON-JSON VALUES. Where the null breaks, and WHOSE problem that is.
// ============================================================================
describe('S-3 — values JSON cannot carry', () => {
  it('MEASURE what survives a JSON round trip', () => {
    const tree = signalTree({
      when: new Date('2020-01-01T00:00:00.000Z'),
      seen: new Set<string>(['x']),
      lookup: new Map<string, number>([['k', 1]]),
      missing: undefined as string | undefined,
      big: 1,
    });

    const wire = roundTripJson(tree()) as Record<string, unknown>;

    // JSON's limits, not SignalTree's: a Date becomes a string, a Set and a Map
    // become {}, and an undefined key disappears entirely.
    expect(typeof wire['when']).toBe('string');
    expect(wire['seen']).toEqual({});
    expect(wire['lookup']).toEqual({});
    expect('missing' in wire).toBe(false);
    expect(wire['big']).toBe(1);
  });

  it('structuredClone carries them, so the LIMIT IS THE TRANSPORT not the tree', () => {
    const tree = signalTree({
      when: new Date('2020-01-01T00:00:00.000Z'),
      seen: new Set<string>(['x']),
      lookup: new Map<string, number>([['k', 1]]),
    });

    const cloned = structuredClone(tree()) as {
      when: Date;
      seen: Set<string>;
      lookup: Map<string, number>;
    };

    expect(cloned.when instanceof Date).toBe(true);
    expect(cloned.seen instanceof Set).toBe(true);
    expect(cloned.lookup.get('k')).toBe(1);

    // F5, stated precisely. NOT "the snapshot is a plain JS value so transport
    // neutrality is free" — it demonstrably is not free, since `tree()` can
    // carry Date, Map, Set, cycles and shared mutable references, and the row
    // above shows JSON silently destroys four of those.
    //
    // What is actually established: the canonical READ REPRESENTATION is
    // CODEC-AGNOSTIC. It commits to no encoding, so transport-specific encoding
    // need not be SignalTree-owned.
  });
});

// ============================================================================
// S-4 — THE M3 GENERALIZATION TEST. Does "state is what the accessor returns"
// hold at a process boundary, for a marker-bearing tree?
// ============================================================================
describe('S-4 — M3 tested against a boundary', () => {
  it('a stored() position externalizes as its plain value and restores', () => {
    const tree = signalTree({ theme: stored('s4-theme', 'light') });

    // stored conforms (isSignal), so M3 predicts: no envelope, just the value.
    expect(tree()).toEqual({ theme: 'light' });

    const wire = roundTripJson(tree());
    const fresh = signalTree({ theme: stored('s4-theme-b', 'dark') });
    fresh(wire as never);
    expect(fresh.$.theme()).toBe('light');
  });

  it('the COLLECTION is where the rule is under strain — it publishes an envelope', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      n: 1,
    });
    tree.$.rows.addMany([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);

    const snap = tree() as Record<string, unknown>;
    expect(snap['n']).toBe(1); // plain position: the value
    expect(snap['rows']).toEqual({ all: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] });

    // Round-trips through JSON and back into a fresh tree.
    const fresh = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      n: 0,
    });
    fresh(roundTripJson(snap) as never);
    expect(fresh.$.rows.ids()).toEqual(['a', 'b']);
    expect(fresh.$.n()).toBe(1);
  });

  it('a BARE ARRAY restores identically — but see the CONTAMINATION note below', () => {
    const fresh = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      n: 0,
    });

    // The shape M3 predicts a conforming accessor would publish.
    fresh({ rows: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }], n: 1 } as never);

    expect(fresh.$.rows.ids()).toEqual(['a', 'b']);
    expect(fresh.$.rows.byId('b')?.n()).toBe(2);
    expect(fresh.$.n()).toBe(1);

    // ⚠️ CONTAMINATION — WHAT THIS ROW DOES AND DOES NOT PROVE.
    //
    // The bare array is accepted by `entityMap`'s OWN hydrate hook:
    //
    //     const all = Array.isArray(value) ? value : (value as {all?}).all;
    //     (entity-map.ts:386-388)
    //
    // That hook is the mechanism M4 proposes to DELETE. So this row proves:
    //
    //   ✓  the `{all:[...]}` envelope carries no information the CURRENT
    //      entityMap hydrate implementation needs
    //
    // and NOT:
    //
    //   ✗  a collection with NO snapshot/hydrate specialization can publish and
    //      reconstruct through the uniform accessor rule
    //
    // Those are different theorems, and the second is the one the deletion
    // requires. The mechanism under sentence cannot serve as its own equivalence
    // proof — the same error as measuring `changeId` on the branch that had
    // silently reversed it.
    //
    // The theorem this row CANNOT reach is carried by the conforming-collection
    // prototype, which must not be built on entityMap underneath.
  });
});

// ============================================================================
// S-5 — F3 IDENTIFY. Is version/type information a SignalTree function?
// ============================================================================
describe('S-5 — identification', () => {
  it('the null carries a version as ordinary application data', () => {
    const tree = signalTree({ user: { name: 'Ada' } });

    const envelope = { v: 2, data: tree() };
    const wire = roundTripJson(envelope) as { v: number; data: unknown };

    // Internalizing is a branch the application already owns, exactly as the
    // `stored` derivation found for `{ version, migrate }`.
    const fresh = signalTree({ user: { name: '' } });
    if (wire.v === 2) fresh(wire.data as never);

    expect(fresh.$.user.name()).toBe('Ada');
  });

  it('SHAPE MISMATCH — what does the write path do with an unknown key?', () => {
    const tree = signalTree({ known: 1 });
    // A payload from an older/newer schema. Measured, not assumed: this is the
    // case F3 exists to make safe.
    tree({ known: 2, gone: 'stale' } as never);
    expect(tree.$.known()).toBe(2);
    expect((tree() as Record<string, unknown>)['gone']).toBeUndefined();
  });
});

// ============================================================================
// S-6 — THE INCUMBENT'S LAST LOOK (Rule 0o). 1352 lines, 11 methods, 7 config
// options. Only the parts that could be a FUNCTION the null lacks are measured.
// ============================================================================
describe('S-6 — what the serializer adds', () => {
  it('nodeMap is REDUNDANT — the target tree already knows its own shape', () => {
    // metadata.nodeMap records "where the target tree contains branch nodes
    // (objects with set/update) or root-as-signal markers", and deserialize
    // consumes it to apply the payload. But the tree being hydrated was built
    // from its own literal, so it already knows which paths are branches.
    const fresh = signalTree({
      user: { name: '', age: 0 },
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      n: 0,
    });

    // No metadata at all, no nodeMap: the ordinary write path reconstructs
    // branches, leaves and a collection alike.
    fresh({
      user: { name: 'Ada', age: 36 },
      rows: [{ id: 'a', n: 1 }],
      n: 7,
    } as never);

    expect(fresh.$.user.name()).toBe('Ada');
    expect(fresh.$.user.age()).toBe(36);
    expect(fresh.$.rows.ids()).toEqual(['a']);
    expect(fresh.$.n()).toBe(7);
  });

  it('CIRCULARITY — can canonical tree state even be circular?', () => {
    // `handleCircular` + `metadata.circularRefs` exist, so the question is
    // whether the thing they protect is reachable. A tree is built from a state
    // literal; a self-referencing literal cannot be written in one expression,
    // and assigning one afterwards is a mutation of a frozen snapshot.
    type Node = { label: string; self?: unknown };

    // A plain object in the literal becomes a BRANCH (no `.set`), so the way to
    // hold an arbitrary object value is an array leaf — which is also the shape
    // utils.ts names as handed out by reference.
    const tree = signalTree({ items: [] as Node[] });

    const cyclic: Node = { label: 'b' };
    cyclic.self = cyclic;
    tree.$.items.set([cyclic]);

    // Reachable — but scoped carefully. This establishes only that CURRENT
    // canonical admission permits a cyclic object inside an array leaf. Value
    // admission is itself unresolved in the matrix (cf. the preserved-Angular-
    // signal admission question), so greenfield may yet require canonical values
    // to satisfy an inert/serializable constraint.
    //
    //   IF cyclic leaf values remain admissible -> a JSON-oriented codec needs a
    //   cycle policy, owned at the external-representation boundary.
    //
    // Current permissiveness must not manufacture a permanent codec requirement.
    expect(() => JSON.stringify(tree())).toThrow(/circular|cyclic/i);
    expect(tree.$.items()[0].label).toBe('b');
  });
});
