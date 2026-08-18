import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';

import { entityMap } from './types';
import { form } from './markers/form';
import { registerMarkerProcessor } from './internals/materialize-markers';
import { signalTree } from './signal-tree';
import { status } from './markers/status';
import { stored } from './markers/stored';

/**
 * ST2023 — a marker that can be snapshotted but never restored.
 *
 * [ST2022] asks a marker author "what of you is state?", and a `snapshot` hook
 * answers it. So a processor with `snapshot` and no `hydrate` registers
 * cleanly, serializes perfectly, and silently discards every write — the exact
 * marker-drop class this whole area exists to close, sitting in ST2022's blind
 * spot.
 *
 * The predicate mirrors `recursiveUpdate`'s fall-through
 * (`isSignal(node) && 'set' in node`) so it cannot fire on a marker the write
 * path can already handle. That is the failure mode of the retired core ST2005,
 * which sat where ordinary writes reached it.
 */
const capture = () => {
  const calls: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    calls.push(String(a[0]));
  });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    calls.push(String(a[0]));
  });
  return calls;
};

describe('ST2023 — snapshot without hydrate', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('reports an object-shaped marker that can never be written back', () => {
    const KEY = Symbol('st2023-object');
    type Mk = { [KEY]: true; init: number };
    registerMarkerProcessor<Mk, { get(): number; _v: number }>(
      (v): v is Mk => !!v && typeof v === 'object' && KEY in (v as object),
      (m) => {
        const node = { _v: m.init, get: () => node._v };
        return node;
      },
      { snapshot: (n) => n._v }
    );

    const calls = capture();
    const tree = signalTree({ p: { [KEY]: true, init: 1 } as Mk });
    void tree.$.p;

    expect(calls.filter((c) => c.includes('ST2023'))).toHaveLength(1);
  });

  it('the reported marker really does lose the write — the bug is real', () => {
    const KEY = Symbol('st2023-real');
    type Mk = { [KEY]: true; init: number };
    registerMarkerProcessor<Mk, { get(): number; _v: number }>(
      (v): v is Mk => !!v && typeof v === 'object' && KEY in (v as object),
      (m) => {
        const node = { _v: m.init, get: () => node._v };
        return node;
      },
      { snapshot: (n) => n._v }
    );

    capture();
    const tree = signalTree({ p: { [KEY]: true, init: 1 } as Mk });

    // It snapshots — so it reaches persistence, devtools and undo/redo...
    expect((tree() as { p: unknown }).p).toBe(1);
    // ...and the write back is discarded, which is why the warning must exist.
    tree({ p: 99 } as never);
    expect((tree.$.p as unknown as { get(): number }).get()).toBe(1);
  });

  it('stays SILENT for a signal-shaped marker — the write path handles it', () => {
    const KEY = Symbol('st2023-signal');
    type Mk = { [KEY]: true; init: number };
    registerMarkerProcessor<Mk, unknown>(
      (v): v is Mk => !!v && typeof v === 'object' && KEY in (v as object),
      (m) => {
        // A real writable signal: `recursiveUpdate` writes it with no hook, so
        // `snapshot` without `hydrate` is CORRECT here and must not be flagged.
        return signal(m.init);
      },
      { snapshot: (n) => (n as () => number)() }
    );

    const calls = capture();
    const tree = signalTree({ p: { [KEY]: true, init: 1 } as Mk });
    void tree.$.p;

    expect(calls.filter((c) => c.includes('ST2023'))).toHaveLength(0);
  });

  it('warns once per processor, not once per node', () => {
    const KEY = Symbol('st2023-once');
    type Mk = { [KEY]: true; init: number };
    registerMarkerProcessor<Mk, { _v: number }>(
      (v): v is Mk => !!v && typeof v === 'object' && KEY in (v as object),
      (m) => ({ _v: m.init }),
      { snapshot: (n) => n._v }
    );

    const calls = capture();
    const tree = signalTree({
      a: { [KEY]: true, init: 1 } as Mk,
      b: { [KEY]: true, init: 2 } as Mk,
      c: { [KEY]: true, init: 3 } as Mk,
    });
    void tree.$.a;
    void tree.$.b;
    void tree.$.c;

    expect(calls.filter((c) => c.includes('ST2023'))).toHaveLength(1);
  });
});
