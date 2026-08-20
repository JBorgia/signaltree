import { describe, expect, it } from 'vitest';

/**
 * E2-S00 (KERNEL) — WHAT IS MEMBER ACCESS? Framework-neutral.
 *
 * NO Angular. No `signal`, no `computed`, no dependency graph. The question is
 * SEMANTIC — what does a member lookup MEAN — and semantics must be derived
 * without a framework realization, or framework behaviour leaks into the
 * architectural evidence. It already did once: E2-S0's null was built out of
 * Angular primitives and produced two findings about `computed` lifetimes that
 * have no bearing on kernel semantics.
 *
 * THE PRIOR ERROR THIS ROW EXISTS TO FIX. E2-S0 concluded "identity beyond values
 * is REQUIRED" from a row it called a WRONG-ROW READ. That is only wrong if
 * `lookup(k)` means *"the member that occupied k when I acquired this"*. Under a
 * keyed-address reading it is exactly correct: address k now holds a different
 * member.
 *
 *   ADDRESS      lookup(k) resolves the CURRENT OCCUPANT of k.
 *                Reuse retargets. NO identity required.
 *   REFERENCE    an acquired handle stays bound to ONE incarnation.
 *                Reuse must not retarget it. Identity required.
 *   EPHEMERAL    resolve now; no retained-reference contract at all.
 *
 * THE ONLY QUESTION: what becomes IMPOSSIBLE under ADDRESS or EPHEMERAL?
 * Incumbent behaviour is not an answer.
 */
type Row = { id: string; n: number; saved?: boolean };

/**
 * The kernel-level collection: a plain holder. Membership and addressing only —
 * no incarnation, no generation, no token, no reactivity.
 */
function addressCollection(initial: Row[] = []) {
  let rows: Row[] = [...initial];
  return {
    snapshot: (): readonly Row[] => rows,
    ids: (): string[] => rows.map((r) => r.id),
    /** ADDRESS semantics: current occupant of `k`, resolved per call. */
    at: (k: string): Row | undefined => rows.find((r) => r.id === k),
    add(row: Row): void {
      rows = [...rows, row];
    },
    remove(k: string): void {
      rows = rows.filter((r) => r.id !== k);
    },
    patch(k: string, changes: Partial<Row>): void {
      rows = rows.map((r) => (r.id === k ? { ...r, ...changes } : r));
    },
  };
}

// ============================================================================
// Shapes expressible under ADDRESS, stated as pure semantics
// ============================================================================
describe('E2-S00 kernel — shapes under ADDRESS semantics', () => {
  it('KEYED OBSERVATION — resolving by key tracks the current occupant', () => {
    const c = addressCollection([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);

    expect(c.at('a')?.n).toBe(1);
    c.patch('a', { n: 10 });
    expect(c.at('a')?.n).toBe(10);
    c.remove('a');
    expect(c.at('a')).toBeUndefined();
    c.add({ id: 'a', n: 77 });
    expect(c.at('a')?.n).toBe(77); // retargets — CORRECT under ADDRESS
  });

  it('SELECTION — a selected key is ordinary state; dangling is for the app', () => {
    const c = addressCollection([{ id: 'a', n: 1 }]);
    let selectedId: string | null = 'a';

    expect(selectedId === null ? undefined : c.at(selectedId)?.n).toBe(1);
    c.remove('a');
    expect(selectedId === null ? undefined : c.at(selectedId)).toBeUndefined();
    selectedId = null; // exactly as any foreign key is resolved
    expect(selectedId).toBeNull();
  });

  it('CALLBACK BY KEY — a handler resolves at invocation time', () => {
    const c = addressCollection([{ id: 'a', n: 1 }]);
    const bump = (k: string) => c.patch(k, { n: (c.at(k)?.n ?? 0) + 1 });
    bump('a');
    expect(c.at('a')?.n).toBe(2);
  });
});

// ============================================================================
// THE HARD SHAPE — a deferred completion that must land on the member it began
// with. The only shape where retargeting is observable.
// ============================================================================
describe('E2-S00 kernel — the deferred completion', () => {
  it('UNDER ADDRESS a completion writes to whatever now occupies the key', async () => {
    const c = addressCollection([{ id: 'tmp-1', n: 111 }]);

    const save = async (k: string) => {
      await Promise.resolve();
      c.patch(k, { saved: true });
    };
    const inFlight = save('tmp-1');

    c.remove('tmp-1');
    c.add({ id: 'tmp-1', n: 999 }); // a DIFFERENT member takes the retired key

    await inFlight;

    // Not a contract violation — ADDRESS says `tmp-1` means "current occupant".
    // It is, however, the wrong DOMAIN outcome.
    expect(c.at('tmp-1')).toEqual({ id: 'tmp-1', n: 999, saved: true });
  });

  it('AND STALENESS IS DETECTABLE with no identity mechanism at all', async () => {
    const c = addressCollection([{ id: 'tmp-1', n: 111 }]);

    // The consumer captures what it is operating on. Canonical members are
    // immutable, so a re-added member is a DIFFERENT object and a reference
    // compare distinguishes them.
    const captured = c.at('tmp-1');
    const save = async (k: string, expected: Row | undefined) => {
      await Promise.resolve();
      if (c.at(k) !== expected) return 'STALE';
      c.patch(k, { saved: true });
      return 'APPLIED';
    };
    const inFlight = save('tmp-1', captured);

    c.remove('tmp-1');
    c.add({ id: 'tmp-1', n: 999 });

    expect(await inFlight).toBe('STALE');
    expect(c.at('tmp-1')?.saved).toBeUndefined(); // new occupant untouched
  });

  it('CONTROL — the same compare APPLIES when nothing intervened', async () => {
    const c = addressCollection([{ id: 'tmp-1', n: 111 }]);
    const captured = c.at('tmp-1');
    const save = async (k: string, expected: Row | undefined) => {
      await Promise.resolve();
      if (c.at(k) !== expected) return 'STALE';
      c.patch(k, { saved: true });
      return 'APPLIED';
    };
    expect(await save('tmp-1', captured)).toBe('APPLIED');
    expect(c.at('tmp-1')?.saved).toBe(true);
  });
});

// ============================================================================
// The generation model, ALSO framework-neutral — semantics only
// ============================================================================
describe('E2-S00 kernel — the generation model, if the antecedent ever holds', () => {
  it('a (key, generation) handle invalidates instead of retargeting', () => {
    // Stated as pure semantics: no reactivity, no framework.
    const generation = new Map<string, number>();
    let rows: Row[] = [];
    const bump = (k: string) => generation.set(k, (generation.get(k) ?? 0) + 1);
    const add = (r: Row) => {
      bump(r.id);
      rows = [...rows, r];
    };
    const remove = (k: string) => {
      bump(k);
      rows = rows.filter((r) => r.id !== k);
    };
    const acquire = (k: string) => ({ key: k, generation: generation.get(k) });
    const read = (h: { key: string; generation: number | undefined }) =>
      generation.get(h.key) === h.generation
        ? rows.find((r) => r.id === h.key)
        : undefined;

    add({ id: 'k', n: 111 });
    const h1 = acquire('k');
    expect(read(h1)?.n).toBe(111);

    remove('k');
    expect(read(h1)).toBeUndefined();

    add({ id: 'k', n: 999 });
    expect(read(h1)).toBeUndefined(); // invalidated, not retargeted
    expect(read(acquire('k'))?.n).toBe(999);

    // SUFFICIENT, not MINIMAL. A global monotonic incarnation token is a rival
    // and may be smaller — it avoids retaining an entry for every key ever seen,
    // which this per-key map does, and which is itself lifetime pressure. So
    // "reclamation is not earned" was also premature.
  });
});

// ============================================================================
// RESULT
// ============================================================================
describe('E2-S00 kernel — result', () => {
  it('no exercised shape becomes IMPOSSIBLE under ADDRESS semantics', () => {
    // keyed observation      expressible
    // selection              expressible
    // callback by key        expressible
    // deferred completion    expressible, and staleness DETECTABLE by an
    //                        ordinary reference compare — no library identity
    //
    // NOT EXERCISED, therefore NOT CLEARED:
    //   transaction / undo interaction
    //   persistence
    //   a consumer holding a reference it CANNOT re-resolve because it never had
    //   the key
    //
    // Those remain where a REFERENCE contract could still earn itself.
    //
    // SO: E2-S0's antecedent is UNPROVEN, and with it "identity beyond values is
    // required". What survives is CONDITIONAL:
    //
    //   IF a captured handle must stay bound to the incarnation it came from,
    //   THEN key+value are insufficient after key reuse, and a
    //        generation/incarnation token is ONE sufficient answer.
    //
    // ARCHITECTURAL NOTE. If a stable membership reference ever earns itself, it
    // need not be the lookup. Address-based observation and identity-bearing
    // reference are separable APIs, and keeping them separate stops a lookup from
    // carrying a subject-lifetime ontology it never needed.
    expect(true).toBe(true);
  });
});
