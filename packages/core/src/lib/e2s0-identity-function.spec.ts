import { computed, signal, type Signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from '../index';

/**
 * ⚠️ ANGULAR REALIZATION EVIDENCE — NOT KERNEL SEMANTICS.
 *
 * This file was written as a kernel derivation and it CROSSED THE LAYER
 * BOUNDARY: it builds candidate semantics out of `signal` and `computed`, so
 * Angular behaviour ended up inside architectural evidence. Two of its findings
 * are about Angular construction lifetimes and say nothing about what a member
 * lookup MEANS.
 *
 * The semantic derivation lives in `e2s00-member-access.kernel.spec.ts`, which
 * imports no framework at all. This file is retained for what it legitimately
 * shows: that ONE Angular consumer pattern can reacquire without handle revival,
 * and that a generation-bound handle is realizable in Angular. Both are
 * REALIZATION / DX evidence.
 *
 * Its conclusions were downgraded — see RFC 0016. In particular "identity beyond
 * values is REQUIRED" is CONDITIONAL on an antecedent that is unproven, and
 * "per-key generation is the MINIMUM" is sufficient-in-model, not minimal.
 */
type Row = { id: string; n: number };

// ---------------------------------------------------------------------------
// B' — the identity-free contract. Cache a computed per key.
// ---------------------------------------------------------------------------
function collectionBPrime(leaf: { (): Row[] }) {
  const cache = new Map<string, Signal<Row | undefined>>();
  return {
    byId(id: string): Signal<Row | undefined> {
      let s = cache.get(id);
      if (!s) {
        s = computed(() => leaf().find((r) => r.id === id));
        cache.set(id, s);
      }
      return s;
    },
  };
}

// ---------------------------------------------------------------------------
// B — keyed observation WITH invalidation, built from ordinary code: a per-key
// generation counter. No SubjectId, no reclamation coordinator, no effect log.
// ---------------------------------------------------------------------------
function collectionB(leaf: { (): Row[]; set(v: Row[]): void }) {
  const generation = new Map<string, number>();
  // Generations must be REACTIVE. A first draft kept them in a bare Map and
  // short-circuited the read when the generation mismatched — so the computed
  // returned `undefined` WITHOUT reading the rows signal, registered no
  // dependency, and never re-evaluated after a restore. Measured: a derived
  // projection stayed `undefined` while a freshly acquired handle read the row
  // correctly. The generation check must not gate the dependency.
  const revision = signal(0);
  const bump = (k: string) => {
    generation.set(k, (generation.get(k) ?? 0) + 1);
    revision.update((v) => v + 1);
  };

  return {
    add(row: Row): void {
      bump(row.id);
      leaf.set([...leaf(), row]);
    },
    remove(id: string): void {
      bump(id); // a removed key's next occupant is a NEW generation
      leaf.set(leaf().filter((r) => r.id !== id));
    },
    /** Restore a whole membership snapshot, advancing generations for arrivals. */
    restore(rows: Row[]): void {
      const present = new Set(leaf().map((r) => r.id));
      for (const r of rows) if (!present.has(r.id)) bump(r.id);
      leaf.set(rows);
    },
    /**
     * A handle is bound to (key, generation) at acquisition time.
     *
     * `read` is a PLAIN FUNCTION, not a `computed`.
     *
     * ANGULAR REALIZATION NOTE, deliberately not generalized: the particular
     * construction used in a second draft — creating a fresh `computed` inside
     * an outer computed's evaluation, per pass — did not propagate invalidation
     * in this test. That is a fact about THAT ephemeral construction and its
     * lifetime, NOT a claim that Angular disallows a computed depending on a
     * computed, which it plainly permits. It is test-infrastructure evidence and
     * carries no architectural weight.
     */
    byId(id: string) {
      const boundGeneration = generation.get(id);
      return {
        key: id,
        read: (): Row | undefined => {
          const rows = leaf(); // track UNCONDITIONALLY
          revision(); // and track generation changes
          return generation.get(id) === boundGeneration
            ? rows.find((r) => r.id === id)
            : undefined;
        },
      };
    },
  };
}

// ============================================================================
// Q1 — is B' harmful?
// ============================================================================
describe('E2-S0 / Q1 — is the identity-free contract harmful?', () => {
  it('B′ SILENTLY MISREADS: a handle to one member reports a different one', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const c = collectionBPrime(tree.$.rows);

    tree.$.rows.set([{ id: 'tmp-1', n: 111 }]);
    const held = c.byId('tmp-1');
    expect(held()?.n).toBe(111);

    // The optimistic-creation cycle this library documents: a temp id is retired
    // and later reused by a different member.
    tree.$.rows.set([]);
    tree.$.rows.set([{ id: 'tmp-1', n: 999 }]);

    // WRONG-ROW READ. Not stale — WRONG. The handle reports another member's data
    // with no error and no signal that anything happened.
    expect(held()?.n).toBe(999);

    // Key reuse is not hypothetical here: 80f41e94's own docblock worries about
    // "a future addOne of the retired id", and temp-id creation produces exactly
    // this cycle. So B' is harmful, and SOME identity is required.
  });
});

// ============================================================================
// Q2 — is B constructible from VALUES alone?
// ============================================================================
describe('E2-S0 / Q2 — can invalidation be derived from values?', () => {
  it('NO — after a remove and an identical re-add the values are indistinguishable', () => {
    const tree = signalTree({ rows: [] as Row[] });

    const before = tree.$.rows();
    tree.$.rows.set([{ id: 'a', n: 1 }]);
    const afterFirstAdd = tree.$.rows();
    tree.$.rows.set([]);
    tree.$.rows.set([{ id: 'a', n: 1 }]); // SAME key, SAME value
    const afterReAdd = tree.$.rows();

    // Value-wise the two occupancies are identical, so no value-only rule can
    // decide that a handle acquired during the first must not read the second.
    expect(JSON.stringify(afterFirstAdd)).toBe(JSON.stringify(afterReAdd));
    expect(before).toEqual([]);

    // CONSEQUENCE: contract B is NOT identity-free either. Invalidation requires
    // distinguishing a handle made before the removal from one made after, and
    // that fact is not in the values. So Q1 + Q2 together establish:
    //
    //   SOME identity beyond key+value IS REQUIRED.
    //
    // This is the first thing in this derivation earned as a FUNCTION rather than
    // observed as behaviour.
  });

  it('YES with a per-key GENERATION COUNTER — ordinary code, no subject machinery', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const c = collectionB(tree.$.rows);

    c.add({ id: 'tmp-1', n: 111 });
    const held = c.byId('tmp-1');
    expect(held.read()?.n).toBe(111);

    c.remove('tmp-1');
    expect(held.read()).toBeUndefined(); // invalidated

    c.add({ id: 'tmp-1', n: 999 }); // a different member reuses the key
    expect(held.read()).toBeUndefined(); // STILL invalidated — no aliasing
    expect(c.byId('tmp-1').read()?.n).toBe(999); // a fresh handle sees the new one

    // A Map and a counter. No SubjectId, no reclamation coordinator, no effect
    // log. So the MINIMUM identity property is a per-key GENERATION, not a
    // subject lifetime.
  });
});

// ============================================================================
// Q3 — what does A give over B? This decides lifetime vs generation.
// ============================================================================
describe('E2-S0 / Q3 — does anything require REVIVAL (A) over reacquisition (B)?', () => {
  it('under B, ordinary Angular reacquisition works after a restore', () => {
    const tree = signalTree({
      rows: [] as Row[],
      selectedId: 'a' as string | null,
    });
    const c = collectionB(tree.$.rows);
    c.add({ id: 'a', n: 1 });
    c.add({ id: 'b', n: 2 });

    // THE ORDINARY ANGULAR SHAPE: a parent derives the handle from a key it
    // holds. Children receive the VALUE, not a captured handle.
    const selected = computed(() => {
      const id = tree.$.selectedId();
      return id === null ? undefined : c.byId(id).read();
    });
    expect(selected()?.n).toBe(1);

    const snapshot = tree.$.rows();
    c.remove('a');
    expect(selected()).toBeUndefined(); // correctly gone

    // "undo" — restore the membership snapshot. (Modelled as a write: this row
    // tests the HANDLE contract, not the undo mechanism, and a plain array leaf
    // cannot be undone on this branch anyway.)
    c.restore([...snapshot]);

    // The derived projection REACQUIRES automatically, because it re-derives from
    // the key on every read. No handle revival was needed.
    expect(selected()?.n).toBe(1);
  });

  it('the CAPTURED-HANDLE case is the only one revival serves — and it is recoverable', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const c = collectionB(tree.$.rows);
    c.add({ id: 'a', n: 1 });

    const captured = c.byId('a'); // a consumer that captured rather than derived
    const snapshot = tree.$.rows();
    c.remove('a');
    c.restore([...snapshot]);

    // Under B the captured handle stays dead — by design.
    expect(captured.read()).toBeUndefined();

    // But it carries its own key, so the holder can always reacquire. Contract B
    // costs a reacquisition; it does not cost a capability.
    expect(c.byId(captured.key).read()?.n).toBe(1);

    // ⚠️ E2-S0 RESULT.
    //
    //   B' (no identity)          HARMFUL — silent wrong-row reads
    //   identity beyond values    REQUIRED — earned as a FUNCTION
    //   MINIMUM property          a per-key GENERATION, buildable in ordinary code
    //   A over B (revival)        NO capability found. Every consumer either
    //                             re-derives from a key it holds, or holds a
    //                             handle that carries its key and can reacquire.
    //
    // So subject-LIFETIME identity, reclamation coordination and revival-on-undo
    // are NOT earned by this derivation. A per-key generation is. That is a much
    // smaller requirement than the incumbent, and it does not imply SubjectId as
    // the carrier.
    //
    // NOT established: that revival is worthless. It may be better DX, and a
    // consumer that CANNOT know its key would need it — no such consumer has been
    // demonstrated.
  });
});
