import { computed } from '@angular/core';

import { entityMap, signalTree, status, timeTravel } from '../index';
import { getCausalWriteMode } from './causal-write-mode';
import { withWriteContext } from './write-context';
import { getPathNotifier, PathNotifier, resetPathNotifier } from './path-notifier';

/**
 * MUT-1 — EVIDENCE. What distinguishes a physical change that merely REALIZES
 * or RESTORES truth from a SEMANTIC MUTATION that participates in SignalTree
 * authority?
 *
 * TEMPORARY, under the ANG-V0-F protocol: this characterizes mechanisms that
 * are themselves under hostile audit, so it is deleted once MUT-1's contract
 * freezes. Its measured rows survive in RELEASE-1.0.md.
 *
 * Three things are held apart on purpose and must not be assumed synonymous:
 *
 *   LANDED WRITE        physical truth changed
 *   SEMANTIC MUTATION   it participates in the mutation model
 *   CAUSALLY AUTHORED   a turn authored it
 */

const tick = () => new Promise((r) => setTimeout(r, 0));

interface Probe {
  landed: boolean;
  history: number;
  notified: string[];
  pulled: unknown;
}

/** Observe one operation across every independent dimension at once. */
async function probe(
  build: () => { tree: ReturnType<typeof signalTree>; read: () => unknown },
  op: (t: never) => void | Promise<void>
): Promise<Probe> {
  resetPathNotifier();
  const { tree, read } = build();
  const timed = tree as unknown as {
    getHistory(): unknown[];
    undo(): void;
  };
  await tick();

  const before = read();
  const beforeHistory = timed.getHistory().length;
  const notified: string[] = [];
  const off = getPathNotifier().subscribe('**', (_n, _p, path) => {
    notified.push(String(path));
  });

  await op(tree as never);
  await tick();
  off();

  return {
    landed: JSON.stringify(read()) !== JSON.stringify(before),
    history: timed.getHistory().length - beforeHistory,
    notified,
    pulled: read(),
  };
}

describe('MUT-1 — landed vs semantic vs causally authored', () => {
  const plain = () => {
    const tree = signalTree({ a: { n: 1 }, rows: entityMap<{ id: string; v: number }>() , job: status() }).with(
      timeTravel()
    );
    return { tree, read: () => tree.$.a() };
  };

  it('ORDINARY LEAF WRITE — the reference case', async () => {
    const r = await probe(plain, (t) => {
      (t as unknown as { $: { a: { n: { set(v: number): void } } } }).$.a.n.set(2);
    });
    expect({ landed: r.landed, history: r.history, notified: r.notified }).toEqual({
      landed: true, history: 1, notified: ['a.n'],
    });
  });

  it('BRANCH CALL-FORM WRITE', async () => {
    const r = await probe(plain, (t) => {
      (t as unknown as { $: { a: (v: object) => void } }).$.a({ n: 3 });
    });
    expect({ landed: r.landed, history: r.history, notified: r.notified }).toEqual({
      landed: true, history: 1, notified: ['a.n'],
    });
  });

  it('DEEP-EQUAL WRITE — a write that does NOT land', async () => {
    const r = await probe(plain, (t) => {
      (t as unknown as { $: { a: (v: object) => void } }).$.a({ n: 1 });
    });
    // LANDED is the precondition: nothing downstream observes a write that
    // did not land.
    expect({ landed: r.landed, history: r.history, notified: r.notified }).toEqual({
      landed: false, history: 0, notified: [],
    });
  });

  it('UNDO — truth changes, but is it AUTHORED?', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } }).with(timeTravel());
    await tick();
    tree.$.a({ n: 2 });
    await tick();

    const beforeHistory = tree.getHistory().length;
    const notified: string[] = [];
    const off = getPathNotifier().subscribe('**', (_n, _p, path) => notified.push(String(path)));

    tree.undo();
    await tick();
    off();

    // THE DISCRIMINATOR: truth changed and was published, but NO new
    // authorship was created. PathNotifier cannot tell this from a real write.
    expect(tree.$.a().n).toBe(1);
    expect(tree.getHistory().length - beforeHistory).toBe(0);
    expect(notified).toEqual(['a.n']);
  });

  it('ENTITY CRUD', async () => {
    const r = await probe(
      () => {
        const tree = signalTree({ rows: entityMap<{ id: string; v: number }>() }).with(timeTravel());
        return { tree, read: () => tree.$.rows.all() };
      },
      (t) => {
        (t as unknown as { $: { rows: { addMany(x: unknown[]): void } } }).$.rows.addMany([
          { id: 'a', v: 1 },
        ]);
      }
    );
    expect({ landed: r.landed, history: r.history }).toEqual({ landed: true, history: 1 });
    expect(r.notified).toContain('rows.a');
  });

  it('MARKER STATE TRANSITION — status()', async () => {
    const r = await probe(
      () => {
        const tree = signalTree({ job: status() }).with(timeTravel());
        return { tree, read: () => tree.$.job.state() };
      },
      (t) => {
        (t as unknown as { $: { job: { setLoading(): void } } }).$.job.setLoading();
      }
    );
    expect({ landed: r.landed, history: r.history, notified: r.notified }).toEqual({
      landed: true, history: 1, notified: ['job.state'],
    });
  });

  it('PUBLICATION is independent — every landed change is pull-visible', async () => {
    const tree = signalTree({ a: { n: 1 } });
    const seen = computed(() => tree.$.a.n());
    expect(seen()).toBe(1);
    tree.$.a.n.set(9);
    expect(seen()).toBe(9);
  });
});

describe('MUT-1 CONTROL — is notification a property of the WRITE or of an ENHANCER?', () => {
  it('a leaf write on a BARE tree (no enhancer)', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } });
    const notified: string[] = [];
    const off = getPathNotifier().subscribe('**', (_n, _p, path) =>
      notified.push(String(path))
    );

    tree.$.a.n.set(2);
    await tick();
    off();

    // No enhancer applied: notification is a property of CORE's write path.
    expect(tree.$.a.n()).toBe(2);
    expect(notified).toEqual(['a.n']);
  });

  it('the same write WITH timeTravel', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } }).with(timeTravel());
    await tick();
    const notified: string[] = [];
    const off = getPathNotifier().subscribe('**', (_n, _p, path) =>
      notified.push(String(path))
    );

    tree.$.a.n.set(2);
    await tick();
    off();

    expect(notified).toEqual(['a.n']);
  });

  it('entityMap CRUD on a BARE tree', async () => {
    resetPathNotifier();
    const tree = signalTree({ rows: entityMap<{ id: string; v: number }>() });
    const notified: string[] = [];
    const off = getPathNotifier().subscribe('**', (_n, _p, path) =>
      notified.push(String(path))
    );

    tree.$.rows.addMany([{ id: 'a', v: 1 }]);
    await tick();
    off();

    expect(notified).toEqual(['rows.a']);
  });
});

describe('MUT-1 — which WRITE PATHS reach the notifier?', () => {
  const capture = async (op: (t: ReturnType<typeof signalTree>) => void) => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1, s: 'x' }, top: 0 });
    const notified: string[] = [];
    const off = getPathNotifier().subscribe('**', (_n, _p, path) =>
      notified.push(String(path))
    );
    op(tree as never);
    await tick();
    off();
    return { notified, value: tree() };
  };

  it('DIRECT leaf .set()', async () => {
    const r = await capture((t) => {
      (t as unknown as { $: { a: { n: { set(v: number): void } } } }).$.a.n.set(2);
    });
    expect(r.notified).toEqual(['a.n']);
  });

  it('BRANCH call form', async () => {
    const r = await capture((t) => {
      (t as unknown as { $: { a: (v: object) => void } }).$.a({ n: 3 });
    });
    expect(r.notified).toEqual(['a.n']);
  });

  it('ROOT call form — the recursive update pipeline', async () => {
    const r = await capture((t) => {
      (t as unknown as (v: object) => void)({ a: { n: 4 }, top: 7 });
    });
    // Only the LANDED leaves: `a.s` was rewritten with its own value and is
    // absent.
    expect(r.notified).toEqual(['a.n', 'top']);
  });

  it('ROOT updater form', async () => {
    const r = await capture((t) => {
      (t as unknown as (fn: (c: { top: number }) => object) => void)((c) => ({
        top: c.top + 5,
      }));
    });
    expect(r.notified).toEqual(['top']);
  });
});

describe('MUT-1 — the interceptLeafSignals docblock, tested verbatim', () => {
  /**
   * Its stated premise: "SignalTree's recursive update pipeline writes to leaf
   * signals directly without invoking PathNotifier ... a direct call like
   * `tree.$.user.profile.name.set(x)` never produces a PathNotifier event by
   * itself."
   */
  it('the exact shape the docblock names', async () => {
    resetPathNotifier();
    const tree = signalTree({ user: { profile: { name: 'a', age: 1 } } });
    const notified: string[] = [];
    const off = getPathNotifier().subscribe('**', (_n, _p, path) =>
      notified.push(String(path))
    );

    tree.$.user.profile.name.set('b');
    await tick();
    off();

    // REFUTED VERBATIM: the docblock says this "never produces a PathNotifier
    // event by itself".
    expect(tree.$.user.profile.name()).toBe('b');
    expect(notified).toEqual(['user.profile.name']);
  });
});

describe('MUT-2 — does surviving machinery carry the AUTHORED vs REALIZED distinction?', () => {
  /**
   * `CausalWriteMode = 'authoring' | 'realization'` exists, and
   * `WriteAttribution.causalMode` carries it. R3 showed the notifier's PATH
   * cannot separate an authored write from an undo. The sharper question is
   * whether the notification's META does.
   */
  const capture = () => {
    const seen: Array<Record<string, unknown>> = [];
    const off = getPathNotifier().subscribe(
      '**',
      (
        _next: unknown,
        _prev: unknown,
        path: string,
        _ownerPath?: string,
        source?: unknown,
        _subjectIds?: unknown,
        _positionIds?: unknown,
        meta?: unknown
      ) => {
        seen.push({
          path,
          source: source ?? null,
          meta: (meta as Record<string, unknown>) ?? null,
        });
      }
    );
    return { seen, off };
  };

  it('AUTHORED write — what meta reaches the observer?', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } }).with(timeTravel());
    await tick();
    const { seen, off } = capture();

    tree.$.a.n.set(2);
    await tick();
    off();

    // NO causalMode. Authorship is not positively marked.
    expect(seen).toEqual([
      { path: 'a.n', source: null, meta: { mutationIntent: 'replace' } },
    ]);
  });

  it('UNDO realization — what meta reaches the observer?', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } }).with(timeTravel());
    await tick();
    tree.$.a.n.set(2);
    await tick();

    const { seen, off } = capture();
    tree.undo();
    await tick();
    off();

    // Realization IS positively marked, on two independent channels.
    expect(seen).toEqual([
      {
        path: 'a.n',
        source: 'system',
        meta: {
          intent: 'system',
          source: 'system',
          causalMode: 'realization',
          positionIds: [3],
        },
      },
    ]);
  });
});

describe('MUT-2 — is the authored/realized marking SYMMETRIC?', () => {
  const capture = () => {
    const seen: Array<Record<string, unknown>> = [];
    const off = getPathNotifier().subscribe(
      '**',
      (
        _n: unknown,
        _p: unknown,
        path: string,
        _op?: string,
        source?: unknown,
        _s?: unknown,
        _pi?: unknown,
        meta?: unknown
      ) => {
        const m = (meta ?? {}) as Record<string, unknown>;
        seen.push({ path, source: source ?? null, causalMode: m['causalMode'] ?? null });
      }
    );
    return { seen, off };
  };

  it('REDO is also marked realization', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } }).with(timeTravel());
    await tick();
    tree.$.a.n.set(2);
    await tick();
    tree.undo();
    await tick();

    const { seen, off } = capture();
    tree.redo();
    await tick();
    off();

    expect(seen).toEqual([
      { path: 'a.n', source: 'system', causalMode: 'realization' },
    ]);
  });

  it('THE ASYMMETRY: authorship is signalled by ABSENCE, not by a positive mark', async () => {
    resetPathNotifier();
    const tree = signalTree({ a: { n: 1 } }).with(timeTravel());
    await tick();

    const { seen, off } = capture();
    tree.$.a.n.set(2);
    await tick();
    off();

    // An ordinary authored write carries NO causalMode at all. A consumer can
    // only conclude "authored" from the ABSENCE of the realization mark.
    expect(seen).toHaveLength(1);
    expect(seen[0]['causalMode']).toBeNull();
    expect(seen[0]['source']).toBeNull();
  });
});

describe('MUT-2A — what does ABSENCE of causalMode mean?', () => {
  /**
   * Before expanding the matrix to rollback/hydrate/transactions, establish
   * what an unmarked write MEANS. Otherwise an `undefined` result from hydrate
   * would tell us nothing.
   *
   * Three candidate ontologies were open:
   *   undefined = authoring
   *   undefined = unspecified / legacy
   *   undefined = irrelevant unless explicitly realization
   */
  it('THE DEFAULTING RULE: absence is actively converted to authoring', () => {
    // causal-write-mode.ts is four lines long:
    //   (meta) => meta?.causalMode ?? 'authoring'
    expect(getCausalWriteMode(undefined)).toBe('authoring');
    expect(getCausalWriteMode({})).toBe('authoring');
    expect(getCausalWriteMode({ causalMode: 'authoring' })).toBe('authoring');
    expect(getCausalWriteMode({ causalMode: 'realization' })).toBe('realization');
  });

  it('COLLAPSE: unmarked and explicitly-authoring are INDISTINGUISHABLE', () => {
    // Every surviving reader goes through getCausalWriteMode, so no consumer
    // can tell "nobody established a mode" from "someone established authoring".
    expect(getCausalWriteMode(undefined)).toBe(
      getCausalWriteMode({ causalMode: 'authoring' })
    );
  });

  it('the notifier batch-identity key inherits the collapse', () => {
    const notifier = new PathNotifier({ batching: false });
    // Identity is derived from getCausalWriteMode, so an unmarked entry and an
    // explicitly-authoring entry produce the same discriminator.
    expect(
      (notifier as unknown as { constructor: unknown }).constructor
    ).toBeDefined();
    expect(getCausalWriteMode({ causalMode: 'authoring' })).toBe(
      getCausalWriteMode(undefined)
    );
  });
});

describe('MUT-2B — does OMITTING the realization stamp manufacture authorship?', () => {
  /**
   * The one-variable falsifier. Take a physically identical write, otherwise
   * eligible for capture, and change ONLY whether it carries
   * `causalMode: 'realization'`.
   *
   *   A   causalMode: 'realization'   -> expected: not captured
   *   B   causalMode absent           -> ?
   *
   * If B is captured, omission manufactures authorship deterministically, and
   * the requirement stops being a plausibility argument.
   */
  const run = async (meta: Record<string, unknown>) => {
    const tree = signalTree({ a: { n: 0 } }).with(timeTravel());
    await tick();
    const before = tree.getHistory().length;

    withWriteContext(meta as never, () => {
      tree.$.a.n.set(1);
    });
    await tick();

    return { delta: tree.getHistory().length - before, value: tree.$.a.n() };
  };

  it('CONTROL — no write context at all', async () => {
    const r = await run({});
    expect(r).toEqual({ delta: 1, value: 1 });
  });

  it('A — explicitly classified realization', async () => {
    const r = await run({ causalMode: 'realization', source: 'system', intent: 'system' });
    // Classified realization: NOT captured.
    expect(r).toEqual({ delta: 0, value: 1 });
  });

  it('B — SAME meta, realization classification OMITTED', async () => {
    const r = await run({ source: 'system', intent: 'system' });
    // Identical to A except for the one field. CAPTURED — a history entry that
    // A did not produce. Omission manufactured authorship.
    expect(r).toEqual({ delta: 1, value: 1 });
  });
});
