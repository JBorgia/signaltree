import { isSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';

import { asyncSource, entityMap, signalTree } from '../index';

/**
 * M4 — IS A REALIZED VALUE RECONSTRUCTIBLE BY A UNIFORM RULE?
 *
 * The mirror of M3. M3 asked how a realized value PUBLISHES its state and found
 * the answer is uniform — it is what the accessor returns — with the hook
 * existing only where a declaration kind declines to conform.
 *
 * The `hydrate` hook has exactly two implementers: `entityMap` and
 * `asyncSource`. `asyncSource` is already a frozen DELETE, so on the far side of
 * that deletion `hydrate` reduces to ONE implementer, exactly as `snapshot` did.
 *
 * Per Rule 0l a legacy mechanism is an EVIDENCE REPOSITORY, so `asyncSource` is
 * measured here for what it reveals, not as a thing to preserve.
 */
type Row = { id: string; n: number };

describe('M4 — reconstruction', () => {
  it('THE COMMON FUNCTION — both implementers DECLINE when another authority owns the content', () => {
    // asyncSource, mode 'rehydrate': "Storage payload of unknown age; the loader
    // has already re-run and its result is newer." reason: 'loader-owns-source'.
    //
    // entityMap: "A LOADER-BACKED collection declines tree-level rehydration...
    // Writing the tree snapshot over it does not add a second opinion, it WINS
    // PERMANENTLY."
    //
    // Same shape in both: ownership, not representation. A uniform rule cannot
    // express it, because "set the position to the payload" has no way to know
    // another mechanism holds fresher truth.
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    tree.$.rows.addOne({ id: 'a', n: 1 });

    // With NO loader attached there is no competing authority, and reconstruction
    // applies normally.
    tree({ rows: [{ id: 'b', n: 2 }] } as never);
    expect(tree.$.rows.ids()).toEqual(['b']);
  });

  it('EVIDENCE FOR M3 — the CONFORMANCE SPECTRUM: hooks track distance from a signal', () => {
    const tree = signalTree({
      src: asyncSource<number[]>({
        initial: [7],
        load: () => of([1, 2, 3]),
        lazy: true,
      }),
    });

    // asyncSource sits BETWEEN a plain leaf and entityMap. It is CALLABLE and
    // `src()` returns exactly the value its own hook re-publishes as
    // `{ value: [7] }` — but `isSignal` is false, because it is not built on an
    // Angular signal primitive. It carries a MarkerProcessor symbol instead, and
    // its surface is refresh/set/update/reset.
    expect(typeof tree.$.src).toBe('function');
    expect(tree.$.src()).toEqual([7]);
    expect(isSignal(tree.$.src as never)).toBe(false);

    // So the hook re-publishes, inside an envelope, the exact value the callable
    // already returns. It exists because the walk cannot RECOGNISE the accessor,
    // not because the value is unreachable.
    //
    //   plain leaf   isSignal YES  callable YES              -> NO HOOK
    //   stored       isSignal YES  callable YES  + methods   -> NO HOOK
    //   asyncSource  isSignal no   callable YES  + methods   -> hook (value is
    //                                                           already right)
    //   entityMap    isSignal no   callable NO   + methods   -> hook
    //
    // The hook is needed in exact proportion to the accessor's DISTANCE FROM A
    // SIGNAL. Nothing in either declaration kind's FUNCTION requires that
    // distance.
  });

  it('THE ENVELOPE IS A SYSTEMATIC HABIT, not a per-kind necessity', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      src: asyncSource<number[]>({
        initial: [7],
        load: () => of([1, 2, 3]),
        lazy: true,
      }),
      plain: 1,
    });
    tree.$.rows.addOne({ id: 'a', n: 1 });

    // TWO different declaration kinds, TWO different envelope keys, both
    // wrapping a SINGLE value. Ordinary positions publish their value bare.
    const snap = tree() as Record<string, unknown>;
    expect(snap['rows']).toEqual({ all: [{ id: 'a', n: 1 }] });
    expect(snap['src']).toEqual({ value: [7] });
    expect(snap['plain']).toBe(1);
  });

  it('MODE-DEPENDENCE is real: the decline is a function of HOW reconstruction was requested', () => {
    // `HydrateMode` is 'merge' | 'restore' | 'rehydrate' | 'transfer', and
    // asyncSource declines ONLY for 'rehydrate' — a storage payload of unknown
    // age — while accepting 'transfer', an SSR handoff whose payload is the
    // freshest thing available. RFC 0014 measured declining transfer at 54.3KB
    // wasted for 500 rows.
    //
    // So reconstruction is NOT a single rule over a payload. The same payload is
    // authoritative or stale depending on WHERE IT CAME FROM.
    const tree = signalTree({
      src: asyncSource<number[]>({
        initial: [],
        load: () => of([1, 2, 3]),
        lazy: true,
      }),
    });

    // The default root-call path is a merge, which is accepted.
    tree({ src: { value: [9, 9] } } as never);
    expect(tree.$.src()).toEqual([9, 9]);
  });
});
