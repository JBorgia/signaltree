import { isSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';
import { stored } from './markers/stored';
import { entityMap } from './types';
import { isNodeAccessor } from './utils';

/**
 * M3 NULL — "no declaration-specific snapshot hook is required".
 *
 * `stored` already demonstrates the null: it conforms to the ordinary signal
 * protocol and the uniform walk represents it correctly with no hook. This spec
 * asks the same of the one remaining admissible implementer.
 *
 * The uniform walk decides by three guards — DERIVED_STAMP, `isSignal`,
 * `isNodeAccessor` — so the question is whether an entityMap accessor's STATE is
 * reachable through them.
 */
const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};

describe('M3 — is state reachable by the uniform rules?', () => {
  it('stored CONFORMS: it is a signal, so the walk needs no kind knowledge', () => {
    const tree = signalTree({
      theme: stored('m3u-theme', 'light', { storage: mem() }),
    });
    const node = tree.$.theme as unknown;

    expect(isSignal(node)).toBe(true);
    // A signal's state IS its read. No hook, no convention, no synthetic key.
    expect(tree()).toEqual({ theme: 'light' });
  });

  it('entityMap does NOT conform: neither guard reaches its state', () => {
    const tree = signalTree({
      rows: entityMap<{ id: number; n: string }, number>({
        selectId: (e) => e.id,
      }),
    });
    tree.$.rows.addOne({ id: 1, n: 'a' });
    const node = tree.$.rows as unknown;

    // MEASURED: the accessor satisfies NEITHER uniform guard.
    expect(isSignal(node)).toBe(false);
    expect(isNodeAccessor(node)).toBe(false);
  });

  it('and its enumerable surface is BEHAVIOUR, not state', () => {
    const tree = signalTree({
      rows: entityMap<{ id: number; n: string }, number>({
        selectId: (e) => e.id,
      }),
    });
    tree.$.rows.addOne({ id: 1, n: 'a' });

    const keys = Object.keys(tree.$.rows as unknown as object);
    const fns = keys.filter(
      (k) => typeof (tree.$.rows as unknown as Record<string, unknown>)[k] === 'function'
    );

    // Whatever a uniform key-walk would produce here is mostly methods. This is
    // WHY the hook exists — not because a collection has special representation
    // semantics, but because its realized shape hides its state from the guards
    // the walk uses.
    expect(keys.length).toBeGreaterThan(0);
    expect(fns.length).toBeGreaterThan(0);
  });
});
