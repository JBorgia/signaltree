import { computed } from '@angular/core';

import { entityMap, signalTree, status, timeTravel } from '../index';
import { getPathNotifier, resetPathNotifier } from './path-notifier';

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
