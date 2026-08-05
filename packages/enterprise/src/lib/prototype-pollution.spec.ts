import { signalTree } from '@signaltree/core';
import { lazy } from '@signaltree/core/lazy';

import { enterprise } from './enterprise-enhancer';

/**
 * Prototype-pollution coverage for `updateOptimized()`.
 *
 * TWO false greens preceded this file, and the shape of both is the lesson:
 *
 *   1. A test named "does not let a __proto__ segment reach the prototype
 *      chain" only exercised `__proto__` INSIDE an array element, where the
 *      code path made it inert. Green over an untouched sink.
 *   2. The replacement probed ONLY `Object.prototype` via `({} as any)[key]`.
 *      Three of its five tests were green while the pre-fix code was actively
 *      polluting `Function.prototype`, which is invisible on `{}`.
 *
 * So: `assertClean()` own-property-checks Object, Array AND Function
 * prototypes, and every test here was run against the pre-fix tree and
 * observed to FAIL before being kept. A test that passes pre-fix proves
 * nothing and is not coverage.
 */
const PROBES = ['polluted', 'isAdmin', 'toStringTag', 'zzPwn'] as const;

function scrub(): void {
  for (const proto of [Object.prototype, Array.prototype, Function.prototype]) {
    for (const key of PROBES) {
      delete (proto as unknown as Record<string, unknown>)[key];
    }
  }
}

function pollutionHits(): string[] {
  const hits: string[] = [];
  const targets: Array<[string, object]> = [
    ['Object.prototype', Object.prototype],
    ['Array.prototype', Array.prototype],
    ['Function.prototype', Function.prototype],
  ];
  for (const [label, proto] of targets) {
    for (const key of PROBES) {
      if (Object.prototype.hasOwnProperty.call(proto, key)) {
        hits.push(`${label}.${key}`);
      }
    }
  }
  return hits;
}

describe('updateOptimized — prototype pollution', () => {
  beforeEach(scrub);
  afterEach(scrub);

  describe('eager trees', () => {
    it('rejects a __proto__ key in a JSON payload, at every depth', () => {
      const tree = signalTree({ config: { theme: 'dark' }, a: 1 }).with(
        enterprise()
      );

      tree.updateOptimized(JSON.parse('{"__proto__":{"polluted":"yes"}}'));
      tree.updateOptimized(
        JSON.parse('{"config":{"__proto__":{"isAdmin":true}}}')
      );

      expect(pollutionHits()).toEqual([]);
    });

    it('rejects the two-call mint-then-walk bypass', () => {
      // The bypass that defeated the own-property-only guard: call one writes
      // a scalar at `__proto__`, which `defineProperty` turns into a REAL own
      // key; every later own-ness check then passes, and call two walks
      // through it into the prototype.
      const tree = signalTree({ user: { name: 'a' } }).with(enterprise());

      tree.updateOptimized(JSON.parse('{"__proto__":0}'));
      tree.updateOptimized(JSON.parse('{"__proto__":{"isAdmin":true}}'));

      expect(pollutionHits()).toEqual([]);
    });

    it('rejects constructor.prototype', () => {
      const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

      tree.updateOptimized(
        JSON.parse('{"config":{"constructor":{"prototype":{"zzPwn":1}}}}')
      );

      expect(pollutionHits()).toEqual([]);
    });

    it('rejects an own __proto__ built without JSON.parse', () => {
      const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());
      const inner: Record<string, unknown> = {};
      Object.defineProperty(inner, '__proto__', {
        value: { toStringTag: 'owned' },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      tree.updateOptimized({ config: inner } as never);

      expect(pollutionHits()).toEqual([]);
    });

    it('still applies the legitimate keys alongside a hostile one', () => {
      const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

      tree.updateOptimized(
        JSON.parse('{"config":{"theme":"light","__proto__":{"polluted":"y"}}}')
      );

      // Rejecting the hostile segment must not become a reason to drop data.
      expect(tree.$.config.theme()).toBe('light');
      expect(pollutionHits()).toEqual([]);
    });

    it('does not corrupt a node with phantom name/length children', () => {
      // A node IS a function, so `name`/`length` are read-only own props.
      // Plain assignment threw and skipped; `Object.defineProperty` succeeded,
      // silently adding enumerable own props that every Object.keys() walker
      // then reports as children — while the write itself was still lost.
      const tree = signalTree({ config: { theme: 'dark' } }).with(enterprise());

      tree.updateOptimized(
        JSON.parse('{"config":{"name":"HACKED","length":99}}')
      );

      expect(Object.keys(tree.$.config as object).sort()).toEqual(['theme']);
      expect(tree()).toEqual({ config: { theme: 'dark' } });
    });
  });

  describe('lazy trees', () => {
    // The configuration the package was actually sold for, and where the
    // own-property-only guard was fully bypassable.
    const lazyOpts = { lazy: lazy(), useLazySignals: true } as const;

    it('rejects the two-call bypass on an explicitly lazy tree', () => {
      const tree = signalTree({ user: { name: 'a' } }, lazyOpts).with(
        enterprise()
      );

      tree.updateOptimized(JSON.parse('{"__proto__":0}'));
      tree.updateOptimized(JSON.parse('{"__proto__":{"isAdmin":true}}'));

      expect(pollutionHits()).toEqual([]);
    });

    it('rejects the bypass at a nested lazy node', () => {
      const tree = signalTree({ a: { b: 1 } }, lazyOpts).with(enterprise());

      tree.updateOptimized(JSON.parse('{"a":{"__proto__":0}}'));
      tree.updateOptimized(JSON.parse('{"a":{"__proto__":{"zzPwn":"pwn"}}}'));

      expect(pollutionHits()).toEqual([]);
    });

    it('rejects the bypass through restore()', () => {
      const tree = signalTree({ user: { name: 'a' } }, lazyOpts).with(
        enterprise()
      );

      tree.restore(JSON.parse('{"__proto__":0}'));
      tree.restore(JSON.parse('{"__proto__":{"isAdmin":true}}'));

      expect(pollutionHits()).toEqual([]);
    });

    it('rejects the bypass on an AUTO-lazy tree (no explicit flag)', () => {
      // LAZY_THRESHOLD is 50 keys — a large state goes lazy without the
      // consumer opting in, so the vulnerable path was reachable by default.
      const big: Record<string, number> = {};
      for (let i = 0; i < 80; i++) big[`k${i}`] = i;
      const tree = signalTree(big, { lazy: lazy() }).with(enterprise());

      tree.updateOptimized(JSON.parse('{"__proto__":0}'));
      tree.updateOptimized(JSON.parse('{"__proto__":{"zzPwn":"pwn"}}'));

      expect(pollutionHits()).toEqual([]);
    });

    it('still applies legitimate nested writes on a lazy tree', () => {
      const tree = signalTree({ a: { b: 1 } }, lazyOpts).with(enterprise());

      tree.updateOptimized({ a: { b: 2 } });

      expect(tree.$.a.b()).toBe(2);
    });
  });
});

describe('lazy tree — prototype access without enterprise', () => {
  // Independent of the enterprise package: the lazy Proxy resolved
  // `key in target`, which walks the prototype chain, and wrapped the result
  // in a nested writable Proxy. Anyone holding the tree had a live handle on
  // Object.prototype.
  beforeEach(scrub);
  afterEach(scrub);

  it('does not hand out a proxy over Object.prototype', () => {
    const tree = signalTree(
      { user: { name: 'a' } },
      { lazy: lazy(), useLazySignals: true }
    );
    const $ = tree.$ as unknown as Record<string, unknown>;

    expect($['__proto__']).toBeUndefined();
    expect($['constructor']).toBeUndefined();
    expect('__proto__' in ($ as object)).toBe(false);
  });

  it('refuses writes and defineProperty through the unsafe keys', () => {
    const tree = signalTree(
      { user: { name: 'a' } },
      { lazy: lazy(), useLazySignals: true }
    );
    const $ = tree.$ as unknown as Record<string, unknown>;

    // Strict mode turns a rejected proxy `set` into a TypeError; either the
    // write throws or it is refused, but it must never land.
    try {
      ($ as Record<string, unknown>)['__proto__'] = { zzPwn: 'pwn' };
    } catch {
      /* refused loudly — also acceptable */
    }
    try {
      Object.defineProperty($, '__proto__', {
        value: { isAdmin: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } catch {
      /* refused loudly — also acceptable */
    }

    expect(pollutionHits()).toEqual([]);
  });

  it('still reads ordinary lazy state', () => {
    const tree = signalTree(
      { user: { name: 'Ada' }, n: 1 },
      { lazy: lazy(), useLazySignals: true }
    );

    expect((tree.$.user as unknown as { name: () => string }).name()).toBe(
      'Ada'
    );
    expect(tree.$.n()).toBe(1);
  });
});
