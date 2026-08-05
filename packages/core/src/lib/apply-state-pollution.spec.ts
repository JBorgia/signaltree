import { signalTree } from '../index';
import { applyState } from './utils';

/**
 * `applyState()` prototype-pollution coverage.
 *
 * Found by audit AFTER two rounds of fixing the equivalent sink in
 * `@signaltree/enterprise` — this one is in CORE, needs no enterprise package
 * and no lazy tree, and is worse: it is reachable from a single message.
 *
 * The devtools bridge parses a `window.postMessage` payload with a bare
 * `JSON.parse` (DISPATCH / JUMP_TO_STATE / ROLLBACK / IMPORT_STATE) and hands
 * the result to `applyState`. `JSON.parse` creates a real OWN `__proto__` key,
 * so `Object.keys(snapshot)` yielded it, `stateNode['__proto__']` returned
 * `Object.prototype`, and the recursion assigned onto it. Any script in the
 * page — a compromised third-party include, an XSS payload — or a malicious
 * browser extension could send that message.
 *
 * `devTools()` is a prod no-op only when `ngDevMode` is DEFINED as false; in a
 * plain Vite/webpack/Node build that never defines it, the real implementation
 * ships.
 */
const PROBES = ['zzPwn', 'isAdmin', 'polluted'] as const;

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

describe('applyState — prototype pollution', () => {
  beforeEach(scrub);
  afterEach(scrub);

  it('does not pollute from a top-level __proto__ key', () => {
    const tree = signalTree({ a: 1, b: { c: 2 } });

    applyState(
      tree.$ as never,
      JSON.parse('{"__proto__":{"zzPwn":"pwned"}}') as never
    );

    expect(pollutionHits()).toEqual([]);
    expect(({} as Record<string, unknown>)['zzPwn']).toBeUndefined();
  });

  it('does not pollute from a nested __proto__ key', () => {
    const tree = signalTree({ a: 1, b: { c: 2 } });

    applyState(
      tree.$ as never,
      JSON.parse('{"b":{"__proto__":{"isAdmin":true}}}') as never
    );

    expect(pollutionHits()).toEqual([]);
  });

  it('does not walk into keys the tree does not own', () => {
    // The own-property guard is load-bearing independently of the name check:
    // without it applyState recursed into ANYTHING on the prototype chain.
    const tree = signalTree({ a: 1 });

    applyState(
      tree.$ as never,
      JSON.parse(
        '{"constructor":{"prototype":{"zzPwn":1}},"toString":1,"valueOf":2}'
      ) as never
    );

    expect(pollutionHits()).toEqual([]);
    expect(Object.prototype.toString).toBeInstanceOf(Function);
  });

  it('does not mint an own __proto__ on the tree', () => {
    const tree = signalTree({ a: 1 });

    applyState(tree.$ as never, JSON.parse('{"__proto__":0}') as never);
    applyState(
      tree.$ as never,
      JSON.parse('{"__proto__":{"zzPwn":"pwned"}}') as never
    );

    // The two-call mint-then-walk shape that defeated the enterprise fix.
    expect(
      Object.prototype.hasOwnProperty.call(tree.$, '__proto__')
    ).toBe(false);
    expect(pollutionHits()).toEqual([]);
  });

  it('still applies a legitimate snapshot', () => {
    const tree = signalTree({ a: 1, b: { c: 2 } });

    applyState(tree.$ as never, { a: 9, b: { c: 8 } } as never);

    expect(tree()).toEqual({ a: 9, b: { c: 8 } });
  });

  it('still applies state under keys named constructor or prototype', () => {
    // The guard must not eat legitimate data — the name check covers only
    // `__proto__`, and own-ness does the rest.
    const tree = signalTree({ constructor: 'a', prototype: 'b', ok: 1 });

    applyState(
      tree.$ as never,
      { constructor: 'z', prototype: 'y', ok: 2 } as never
    );

    expect(tree()).toEqual({ constructor: 'z', prototype: 'y', ok: 2 });
  });
});

describe('applyState — each guard pinned separately', () => {
  // Audit finding: the six tests above pass with EITHER guard deleted, because
  // the two are mutually redundant against a global-pollution probe. Redundancy
  // in the code is fine; redundancy that leaves a spec unable to detect the
  // removal of a guard is not — that is how three earlier rounds shipped.
  beforeEach(scrub);
  afterEach(scrub);

  it('refuses __proto__ even once an own key of that name exists', () => {
    const tree = signalTree({ a: 1 });
    Object.defineProperty(tree.$, '__proto__', {
      value: {},
      enumerable: true,
      writable: true,
      configurable: true,
    });

    applyState(
      tree.$ as never,
      JSON.parse('{"__proto__":{"zzPwn":"pwned"}}') as never
    );

    expect(pollutionHits()).toEqual([]);
  });

  // HONESTY NOTE, verified by mutation: deleting the `__proto__` NAME check
  // from applyState leaves this whole file green, and that is CORRECT rather
  // than a coverage hole. The two guards are not independently reachable here:
  // own-ness only passes once an own `__proto__` exists, and once it does,
  // reading it yields that own value rather than the prototype — so there is no
  // state in which the name check is the only thing standing in the way. It is
  // kept as defence in depth against a future refactor of the own-ness check,
  // not because a test can distinguish it. An earlier version of this file
  // claimed otherwise; the claim was false, and a test asserting a guard it
  // cannot detect is exactly the false-green pattern this suite exists to end.
  //
  // The own-ness check IS independently detectable — see the test below.

  it('the OWN-NESS check refuses a key the tree does not have', () => {
    const tree = signalTree({ a: 1 });
    const before = Object.prototype.toString;

    // `toString` is on the chain, not own. Without the own-ness guard,
    // applyState walks to it and the terminal branch assigns over it.
    applyState(tree.$ as never, { toString: 'clobbered' } as never);

    expect(Object.prototype.toString).toBe(before);
    expect(
      Object.prototype.hasOwnProperty.call(tree.$, 'toString')
    ).toBe(false);
    expect(tree()).toEqual({ a: 1 });
  });
});
