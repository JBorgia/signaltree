import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';

import { serialization } from '../enhancers/serialization/serialization';
import { entityMap, loader, signalTree } from '../index';

/**
 * M4 — CLOSING THE OWNERSHIP HALF.
 *
 * M4 established that `hydrate`'s surviving content is not representational: a
 * position may DECLINE reconstruction when another authority owns its content,
 * and the decision depends on the MODE. That survives a uniform-rule null of the
 * shape "set the position to the payload".
 *
 * But the two implementers' predicates are, in full:
 *
 *   asyncSource   mode === 'rehydrate'
 *   entityMap     mode === 'rehydrate' && typeof node.load === 'function'
 *
 * Both are the SAME RULE over ONE DECLARED PROPERTY — "this position owns a live
 * source" — which `asyncSource` satisfies by construction and `entityMap`
 * satisfies per instance. Neither reads the payload, and neither expresses
 * anything specific to its declaration kind.
 *
 * If that is right, the decline is a UNIFORM RULE and needs no per-kind hook —
 * the same result M3 reached for the publish side, arrived at from the other
 * direction.
 */
type Row = { id: string; n: number };

// `serialize()` emits `{ data, metadata }`. A bare state object is silently
// ignored — measured: it applies nothing and reports nothing.
const payload = (data: unknown) =>
  JSON.stringify({ data, metadata: { version: '2.0.0' } });

describe('M4 — is the decline a uniform rule?', () => {
  it('THE PROPERTY DECIDES, NOT THE KIND — a loaderless collection ACCEPTS rehydrate', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    }).with(serialization());
    tree.$.rows.addOne({ id: 'live', n: 1 });

    // Same declaration kind, same mode, no live source -> the payload applies.
    tree.deserialize(payload({ rows: { all: [{ id: 'stored', n: 2 }] } }));

    expect(tree.$.rows.ids()).toEqual(['stored']);
  });

  it('THE SAME KIND DECLINES once it owns a live source', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        load: loader(() => of([{ id: 'fromLoader', n: 9 }]), { lazy: true }),
      }),
    }).with(serialization());
    tree.$.rows.addOne({ id: 'live', n: 1 });

    tree.deserialize(payload({ rows: { all: [{ id: 'stored', n: 2 }] } }));

    // Declined — the loader owns the source, so the aged payload loses.
    expect(tree.$.rows.ids()).toEqual(['live']);
  });

  it('MODE, NOT PAYLOAD — the identical payload APPLIES under transfer', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        load: loader(() => of([{ id: 'fromLoader', n: 9 }]), { lazy: true }),
      }),
    }).with(serialization());
    tree.$.rows.addOne({ id: 'live', n: 1 });

    // Same position, same live source, same bytes — opposite answer, decided
    // entirely by where the payload came from. RFC 0014's 54.3KB regression is
    // the cost of collapsing these two modes into one.
    tree.deserialize(payload({ rows: { all: [{ id: 'ssr', n: 3 }] } }), {
      transfer: true,
    });

    expect(tree.$.rows.ids()).toEqual(['ssr']);
  });

  it('THE RULE READS NOTHING FROM THE PAYLOAD', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({
        selectId: (r) => r.id,
        load: loader(() => of([{ id: 'fromLoader', n: 9 }]), { lazy: true }),
      }),
    }).with(serialization());
    tree.$.rows.addOne({ id: 'live', n: 1 });

    // An empty collection, a full one, a malformed one — all declined
    // identically, because the predicate never inspects `value`.
    for (const body of [
      { rows: { all: [] } },
      { rows: { all: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] } },
      { rows: {} },
    ]) {
      tree.deserialize(payload(body));
      expect(tree.$.rows.ids()).toEqual(['live']);
    }
  });
});
