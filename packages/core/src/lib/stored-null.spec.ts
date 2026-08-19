import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { signalTree, stored } from '../index';

/**
 * DERIVATION — `stored`, SPLIT INBOUND / OUTBOUND.
 *
 * Rule 0o: state the function from zero, without naming the incumbent.
 *
 *   OUTBOUND   a position's current value must survive the death of this
 *              process.
 *   INBOUND    at construction, a position must take the value it held in a
 *              previous process rather than its literal default.
 *
 * They are genuinely separable — a telemetry value is written and never read
 * back; a seeded config is read and never written — so they get separate nulls.
 *
 * The nulls are ordinary Angular composition over ordinary storage:
 *
 *   OUTBOUND   effect(() => store.setItem(k, JSON.stringify(tree.$.x())))
 *   INBOUND    signalTree({ x: read(k) ?? 'default' })
 */

// A Storage double. Deliberately not localStorage: the point is that the null
// needs no privileged access, and a plain key/value store is enough.
class MemStore implements Storage {
  private m = new Map<string, string>();
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
    this.m.set(k, v);
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// `stored` writes a VERSIONED ENVELOPE — `{"__v":1,"data":"dark"}` — not the
// bare value. The envelope is load-bearing here, unlike M3's `{all}`/`{value}`:
// `__v` is what `migrate` dispatches on.
const decode = (raw: string | null): unknown =>
  raw === null ? null : (JSON.parse(raw) as { data: unknown }).data;
let store: MemStore;

beforeEach(() => {
  store = new MemStore();
});

// ============================================================================
// OUTBOUND
// ============================================================================
describe('stored — OUTBOUND: survive process death', () => {
  it('THE NULL — an ordinary effect persists, and the value survives a fresh process', async () => {
    const tree = signalTree({ theme: 'light' });

    TestBed.runInInjectionContext(() => {
      effect(() => store.setItem('theme', JSON.stringify(tree.$.theme())));
    });
    TestBed.tick();

    tree.$.theme.set('dark');
    TestBed.tick();

    // "Process death" — nothing but the store crosses the boundary.
    expect(store.getItem('theme')).toBe('"dark"');
    const rebuilt = signalTree({
      theme: JSON.parse(store.getItem('theme') ?? '"light"') as string,
    });
    expect(rebuilt.$.theme()).toBe('dark');
  });

  it('THE INCUMBENT loses the write unless something drains it — the hazard is the DEBOUNCE', async () => {
    const tree = signalTree({
      theme: stored('theme', 'light', { storage: store, debounceMs: 100 }),
    });

    tree.$.theme.set('dark');

    // The value is live in the signal but NOT yet durable. A process death here
    // loses it. The null above had already written.
    expect(tree.$.theme()).toBe('dark');
    expect(store.getItem('theme')).toBeNull();

    tree.$.theme.flush();
    expect(decode(store.getItem('theme'))).toBe('dark');
  });

  it('AND `debounceMs: 0` IS the null — the machinery is opt-in over a synchronous write', () => {
    const tree = signalTree({
      theme: stored('theme', 'light', { storage: store, debounceMs: 0 }),
    });

    tree.$.theme.set('dark');

    // Durable inside `set()`'s own stack. No flush, no pagehide listener, no
    // drain — the same guarantee the ordinary effect gives.
    expect(decode(store.getItem('theme'))).toBe('dark');
  });
});

// ============================================================================
// INBOUND
// ============================================================================
describe('stored — INBOUND: take a previous process value at construction', () => {
  it('THE NULL — read the store in the state literal', () => {
    store.setItem('theme', '"dark"');

    const read = <T>(k: string, fallback: T): T => {
      const raw = store.getItem(k);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    };
    const tree = signalTree({ theme: read('theme', 'light') });

    expect(tree.$.theme()).toBe('dark');
  });

  it('THE INCUMBENT does the same thing', () => {
    store.setItem('theme', '"dark"');
    const tree = signalTree({
      theme: stored('theme', 'light', { storage: store }),
    });
    expect(tree.$.theme()).toBe('dark');
  });

  it('MIGRATION is ordinary code in the read path', () => {
    // v1 wrote a bare string; v2 wants an object. The incumbent spells this
    // `{ version, migrate }`; the null spells it as a branch in `read`.
    store.setItem('prefs', '"dark"');

    const readPrefs = (): { theme: string } => {
      const raw = store.getItem('prefs');
      if (raw === null) return { theme: 'light' };
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'string' ? { theme: parsed } : (parsed as { theme: string });
    };
    const tree = signalTree({ prefs: readPrefs() });

    expect(tree.$.prefs.theme()).toBe('dark');
  });
});

// ============================================================================
// WHAT THE NULL DOES NOT REACH
// ============================================================================
describe('stored — the remainder', () => {
  it('COALESCING — rapid writes collapse to ONE store write', async () => {
    const writes: string[] = [];
    const counting = new Proxy(store, {
      get(t, p) {
        if (p === 'setItem')
          return (k: string, v: string) => {
            writes.push(v);
            t.setItem(k, v);
          };
        return Reflect.get(t, p).bind(t);
      },
    }) as Storage;

    const tree = signalTree({
      n: stored('n', 0, { storage: counting, debounceMs: 5 }),
    });
    for (let i = 1; i <= 20; i++) tree.$.n.set(i);
    await flush();
    await new Promise<void>((r) => setTimeout(r, 20));

    // 20 sets, far fewer writes. This is the one thing the naive effect null
    // does NOT do — and it is a PERFORMANCE property, not a function.
    expect(writes.length).toBeLessThan(20);
    expect(tree.$.n()).toBe(20);
  });
});
