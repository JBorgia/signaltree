import { describe, expect, it, beforeEach } from 'vitest';

import { signalTree, stored } from '../index';

/**
 * CORRECTED — `stored` OUTBOUND. The previous null was INVALID.
 *
 * `stored-null.spec.ts` compared `stored` against an `effect()` that wrote to
 * storage. That null needed `TestBed.tick()` to flush, so it never established
 * "durable immediately after `set()`" — it established "durable after a tick",
 * which is a WEAKER contract than the one the incumbent was being judged
 * against. Comparing a debounced mechanism to an async null and concluding the
 * null was "strictly better" was not a fair measurement.
 *
 * THE CORRECTED NULL: a genuinely SYNCHRONOUS external consequence. The write
 * path that changes the value also writes the store, in the same stack, with no
 * scheduler involved at all.
 *
 * THE CONTRACT UNDER TEST, stated precisely:
 *
 *   After the call that changes the value RETURNS, the external store already
 *   holds the new value — so a process death on the next line loses nothing.
 */
class MemStore implements Storage {
  private m = new Map<string, string>();
  writes = 0;
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.m.set(k, v);
  }
}

let store: MemStore;
beforeEach(() => {
  store = new MemStore();
});

const decode = (raw: string | null): unknown =>
  raw === null ? null : (JSON.parse(raw) as { data?: unknown }).data ?? JSON.parse(raw);

describe('OUTBOUND — the synchronous-consequence contract', () => {
  it('THE CORRECTED NULL satisfies it: durable when the call returns', () => {
    const tree = signalTree({ theme: 'light' });

    // No effect(), no scheduler. The write path IS the persistence point.
    const setTheme = (v: string): void => {
      tree.$.theme.set(v);
      store.setItem('theme', JSON.stringify(v));
    };

    setTheme('dark');
    // Same stack. Nothing has been ticked, awaited or flushed.
    expect(store.getItem('theme')).toBe('"dark"');
    expect(tree.$.theme()).toBe('dark');
  });

  it('THE INCUMBENT, DEFAULT CONFIG, does NOT satisfy it', () => {
    const tree = signalTree({
      theme: stored('theme', 'light', { storage: store }),
    });

    tree.$.theme.set('dark');

    // Default debounce. The signal has the value, the store does not.
    expect(tree.$.theme()).toBe('dark');
    expect(store.getItem('theme')).toBeNull();
  });

  it('THE INCUMBENT WITH `debounceMs: 0` DOES satisfy it', () => {
    const tree = signalTree({
      theme: stored('theme', 'light', { storage: store, debounceMs: 0 }),
    });

    tree.$.theme.set('dark');

    expect(decode(store.getItem('theme'))).toBe('dark');
  });

  it('SO THE FUNCTION IS REACHABLE BOTH WAYS — the difference is COALESCING', () => {
    // Null: every set writes.
    const tree = signalTree({ n: 0 });
    const setN = (v: number): void => {
      tree.$.n.set(v);
      store.setItem('n', JSON.stringify(v));
    };
    for (let i = 1; i <= 20; i++) setN(i);

    expect(store.writes).toBe(20);
    expect(decode(store.getItem('n'))).toBe(20);
    expect(tree.$.n()).toBe(20);

    // The incumbent's `debounceMs: 0` behaves the same way — synchronous, one
    // write per set. Coalescing is what the DEBOUNCE buys, and the debounce is
    // what breaks the synchronous contract. They are the same trade, and the
    // incumbent lets you pick an end of it; so does the null, by batching at the
    // call site.
  });

  it('THE HONEST COMPARISON — the incumbent adds a THIRD option the null lacks', () => {
    // Neither pure-synchronous nor pure-debounced: coalesce, but bound the
    // window, and drain on demand. `flush()` makes the pending write durable
    // without abandoning coalescing.
    const tree = signalTree({
      n: stored('n', 0, { storage: store, debounceMs: 100 }),
    });

    for (let i = 1; i <= 20; i++) tree.$.n.set(i);
    expect(store.getItem('n')).toBeNull(); // coalesced, nothing written yet

    tree.$.n.flush();

    expect(decode(store.getItem('n'))).toBe(20);
    expect(store.writes).toBe(1); // 20 sets, ONE write, and durable on demand

    // THIS is the incumbent's actual contribution, and the earlier derivation
    // missed it by comparing against an async null: coalescing WITH an explicit
    // durability point. The synchronous null gets durability by writing every
    // time (20 writes); a debounce-only null gets coalescing with no durability
    // point at all. Reaching both requires the pending-write machinery.
    //
    // Whether "coalesced writes with an explicit drain" is a FUNCTION or a
    // performance affordance is the remaining question — but it is no longer
    // true that the null is strictly better.
  });
});
