import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';
import { stampDerived, unwrap } from './utils';

/**
 * `unwrap()`'s SYMBOL-KEY walk — previously the largest untested block in
 * utils.ts, and the one carrying the most load-bearing claim in the file:
 *
 *   > The `SignalTree:` prefix is load-bearing: `unwrap`'s symbol loop skips
 *   > that prefix by identity. Name it anything else and it lands in every
 *   > persisted payload.
 *
 * That matters more than it sounds. A node accessor owns
 * `Symbol(SignalTree:NodeStore)`, **and its value IS the backing store** — so
 * copying it would drag a full walk of the entire subtree into the payload
 * under a symbol key. Descriptors cannot defend this:
 * `Object.getOwnPropertySymbols` returns non-enumerable symbols too, so marking
 * the brand `enumerable: false` does nothing. It has to be skipped by identity.
 *
 * ⚠️ **The prefix skip is DEFENCE-IN-DEPTH, not the primary protection**, and an
 * earlier draft of this file got that wrong. On the normal path `unwrap`
 * resolves an accessor to its backing STORE and walks that — and a store owns
 * no symbols, so the branch never fires. The first three tests below pass for
 * that reason, not because of the prefix check; mutating the prefix to
 * `'ZZZNOPE:'` left all of them green. Only `skipped by identity, on a plain
 * object` actually reaches it. Worth keeping the distinction visible: a test
 * that passes for the wrong reason is how the four bugs behind this release
 * survived.
 */
describe('SignalTree-branded symbols never reach a snapshot', () => {
  it('an accessor carries brands, and unwrap drops every one', () => {
    const tree = signalTree({ a: 1, b: { c: 2 } });
    void tree.$;

    // The brands really are there to be dropped.
    expect(
      Object.getOwnPropertySymbols(tree.$.b).map(String)
    ).toEqual(
      expect.arrayContaining([
        'Symbol(SignalTree:NodeAccessor)',
        'Symbol(SignalTree:NodeStore)',
      ])
    );

    const out = unwrap(tree.$.b) as object;
    expect(out).toEqual({ c: 2 });
    expect(Object.getOwnPropertySymbols(out)).toEqual([]);
  });

  it('a whole-tree snapshot carries no symbols at all', () => {
    const tree = signalTree({ a: 1, b: { c: 2 } });
    void tree.$;
    expect(Object.getOwnPropertySymbols(tree() as object)).toEqual([]);
  });

  it('a branded symbol is skipped BY IDENTITY, on a plain object', () => {
    // The only test here that actually reaches the prefix check: `unwrap`
    // resolves an accessor to its store on the normal path, and a store owns no
    // symbols. Reproduce the hazard directly — a branded key whose value is a
    // whole subtree, exactly the shape of `SignalTree:NodeStore`.
    const BRAND = Symbol.for('SignalTree:NodeStore');
    const store: Record<string | symbol, unknown> = { a: signal(1) };
    store[BRAND] = { the: 'entire backing store', nested: { deep: true } };

    const out = unwrap(store) as Record<string | symbol, unknown>;

    expect(out['a']).toBe(1);
    expect(Object.getOwnPropertySymbols(out)).toEqual([]);
    expect(out[BRAND]).toBeUndefined();
  });

  it('NodeStore is not walked — the payload stays the size of the state', () => {
    // If the brand skip regressed, the store (and everything under it) would
    // appear under a symbol key, so the snapshot would carry the subtree twice.
    const tree = signalTree({ b: { c: 2, d: { e: 3 } } });
    void tree.$;

    const out = unwrap(tree.$.b) as Record<string, unknown>;
    expect(JSON.stringify(out)).toBe(JSON.stringify({ c: 2, d: { e: 3 } }));
  });
});

describe('non-branded symbol keys are ordinary state', () => {
  it('a symbol holding a signal is captured', () => {
    const KEY = Symbol('user-key');
    const store: Record<string | symbol, unknown> = { a: signal(1) };
    store[KEY] = signal(99);

    const out = unwrap(store) as Record<string | symbol, unknown>;
    expect(out['a']).toBe(1);
    expect(out[KEY]).toBe(99);
  });

  it('a symbol holding a marker gets the marker SNAPSHOT, not its API', () => {
    const KEY = Symbol('rows');
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({ selectId: (x) => x.id }),
    });
    tree.$.r.setAll([{ id: 1 }, { id: 2 }]);

    const store: Record<string | symbol, unknown> = {};
    store[KEY] = tree.$.r;

    const out = unwrap(store) as Record<symbol, unknown>;
    expect(out[KEY]).toEqual({ all: [{ id: 1 }, { id: 2 }] });
  });

  it('a symbol holding a DERIVED signal is skipped — same rule as string keys', () => {
    const KEY = Symbol('derived');
    const store: Record<string | symbol, unknown> = { a: signal(1) };
    store[KEY] = stampDerived(computed(() => 5));

    const out = unwrap(store) as Record<string | symbol, unknown>;
    expect(out['a']).toBe(1);
    expect(Object.getOwnPropertySymbols(out)).toEqual([]);
  });

  it('a symbol holding a plain function is skipped AND reported (ST2008)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const KEY = Symbol('callback');
    const store: Record<string | symbol, unknown> = { a: signal(1) };
    store[KEY] = () => 'nope';

    const out = unwrap(store) as Record<string | symbol, unknown>;
    expect(Object.getOwnPropertySymbols(out)).toEqual([]);
    // Skipping silently is the defect class this whole area exists to close.
    expect(
      err.mock.calls.filter((c) => String(c[0]).includes('ST2008'))
    ).toHaveLength(1);
    err.mockRestore();
  });
});
