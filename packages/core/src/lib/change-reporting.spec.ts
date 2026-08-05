import { computed, effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { signalTree } from '../index';

/**
 * Change reporting: `updateAndReport()` and `onPathChange()`.
 *
 * Both answer the same question — "what did that write actually change?" —
 * and the whole value of the answer is that it is TRUE. A path reported for a
 * write that never landed sends audit logs, change feeds and targeted
 * persistence off to do work for nothing, and it is invisible: the state is
 * correct, so nothing looks broken.
 *
 * The deep-equal cases below all FAIL against pre-13.5.0 core, which pushed a
 * path for every `set()` it attempted rather than every `set()` that landed.
 */
describe('updateAndReport — reports only what landed', () => {
  it('reports nothing for a deep-equal array leaf (new reference)', () => {
    const tree = signalTree({ users: [{ id: 1, name: 'Ada' }] });
    const before = tree.$.users();

    // A re-fetched payload: structurally identical, freshly allocated.
    const changed = tree.updateAndReport({ users: [{ id: 1, name: 'Ada' }] });

    expect(changed).toEqual([]);
    // And the report matches reality — the leaf still holds the old reference,
    // so no consumer of this signal was notified either.
    expect(tree.$.users()).toBe(before);
  });

  it('reports nothing for a deep-equal object leaf', () => {
    const tree = signalTree({ meta: { tags: ['a', 'b'] } });
    const before = tree.$.meta.tags();

    const changed = tree.updateAndReport({ meta: { tags: ['a', 'b'] } });

    expect(changed).toEqual([]);
    expect(tree.$.meta.tags()).toBe(before);
  });

  it('still reports a genuinely changed array leaf', () => {
    const tree = signalTree({ users: [{ id: 1, name: 'Ada' }] });

    const changed = tree.updateAndReport({
      users: [{ id: 1, name: 'Grace' }],
    });

    expect(changed).toEqual(['users']);
    expect(tree.$.users()).toEqual([{ id: 1, name: 'Grace' }]);
  });

  it('separates landed from no-op keys within one payload', () => {
    const tree = signalTree({
      user: { name: 'Ada', tags: ['x'] },
      count: 1,
    });

    const changed = tree.updateAndReport({
      user: { name: 'Ada', tags: ['x'] }, // both deep-equal no-ops
      count: 2, // real
    });

    expect(changed).toEqual(['count']);
  });

  it('reports primitives honestly', () => {
    const tree = signalTree({ n: 1, s: 'a', flag: false });

    expect(tree.updateAndReport({ n: 1, s: 'a', flag: false })).toEqual([]);
    expect(tree.updateAndReport({ n: 2, s: 'a' })).toEqual(['n']);
  });

  it('reports a NaN leaf honestly', () => {
    const tree = signalTree({ n: Number.NaN });

    // NaN !== NaN, so the ref-equality short-circuit does not fire and a
    // `set()` is attempted. It must not be reported as a change.
    expect(tree.updateAndReport({ n: Number.NaN })).toEqual([]);
    expect(tree.updateAndReport({ n: 1 })).toEqual(['n']);
  });

  // The test above CANNOT fail if deepEqual(NaN, NaN) regresses to false: the
  // set() lands, the leaf holds a fresh NaN, and the Object.is readback still
  // says "unchanged". It looked like coverage and was not — an audit reverted
  // the deepEqual fix and the whole repo stayed green. The user-visible symptom
  // is REACTIVITY, so that is what these measure.
  it('a NaN rewrite notifies nobody', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ n: Number.NaN });
      let runs = 0;
      effect(() => {
        tree.$.n();
        runs++;
      });
      TestBed.flushEffects();
      const base = runs;

      tree.updateAndReport({ n: Number.NaN });
      TestBed.flushEffects();

      expect(runs).toBe(base);
    });
  });

  it('an Invalid Date rewrite notifies nobody', () => {
    // Same class as NaN and reached the same way — `new Date(blankField)`.
    // getTime() is NaN, so `===` called two Invalid Dates different.
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ d: new Date(Number.NaN) });
      let runs = 0;
      effect(() => {
        tree.$.d();
        runs++;
      });
      TestBed.flushEffects();
      const base = runs;

      const changed = tree.updateAndReport({ d: new Date(Number.NaN) });
      TestBed.flushEffects();

      expect(changed).toEqual([]);
      expect(runs).toBe(base);
    });
  });

  it('a real Date change is still reported and notified', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ d: new Date(0) });
      let runs = 0;
      effect(() => {
        tree.$.d();
        runs++;
      });
      TestBed.flushEffects();
      const base = runs;

      expect(tree.updateAndReport({ d: new Date(5) })).toEqual(['d']);
      TestBed.flushEffects();
      expect(runs).toBe(base + 1);
    });
  });

  it('reports nested paths with dots', () => {
    const tree = signalTree({ a: { b: { c: 1 } } });

    expect(tree.updateAndReport({ a: { b: { c: 2 } } })).toEqual(['a.b.c']);
  });

  it('agrees with the reactive system: every reported path notified', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ users: [{ id: 1 }], count: 0 });
      let usersRuns = 0;
      let countRuns = 0;
      effect(() => {
        tree.$.users();
        usersRuns++;
      });
      effect(() => {
        tree.$.count();
        countRuns++;
      });
      TestBed.flushEffects();
      const baseUsers = usersRuns;
      const baseCount = countRuns;

      const changed = tree.updateAndReport({
        users: [{ id: 1 }], // deep-equal, must not notify
        count: 5, // real
      });
      TestBed.flushEffects();

      expect(changed).toEqual(['count']);
      expect(usersRuns).toBe(baseUsers); // not reported, not notified
      expect(countRuns).toBe(baseCount + 1); // reported, notified
    });
  });
});

describe('onPathChange', () => {
  it('fires with the paths that landed, via the call form', () => {
    const tree = signalTree({ user: { name: 'Ada' }, count: 0 });
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree({ user: { name: 'Grace' } });

    expect(seen).toEqual([['user.name']]);
  });

  it('fires for batchUpdate and updateAndReport', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree.batchUpdate({ count: 1 });
    tree.updateAndReport({ count: 2 });

    expect(seen).toEqual([['count'], ['count']]);
  });

  it('fires for an updater function', () => {
    const tree = signalTree({ count: 0, other: 'x' });
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree((current) => ({ ...current, count: current.count + 1 }));

    expect(seen).toEqual([['count']]);
  });

  it('does not fire when nothing landed', () => {
    const tree = signalTree({ users: [{ id: 1 }] });
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree({ users: [{ id: 1 }] }); // deep-equal no-op

    expect(seen).toEqual([]);
  });

  it('does not fire on a read', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree();
    tree.$.count();

    expect(seen).toEqual([]);
  });

  it('stops firing after unsubscribe', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[][] = [];
    const off = tree.onPathChange((paths) => seen.push([...paths]));

    tree({ count: 1 });
    off();
    tree({ count: 2 });

    expect(seen).toEqual([['count']]);
    expect(tree.$.count()).toBe(2); // the write still happened
  });

  it('supports multiple independent listeners', () => {
    const tree = signalTree({ count: 0 });
    const a: string[][] = [];
    const b: string[][] = [];
    const offA = tree.onPathChange((p) => a.push([...p]));
    tree.onPathChange((p) => b.push([...p]));

    tree({ count: 1 });
    offA();
    tree({ count: 2 });

    expect(a).toEqual([['count']]);
    expect(b).toEqual([['count'], ['count']]);
  });

  it('a throwing listener neither breaks the write nor the other listeners', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ count: 0 });
      const seen: string[][] = [];
      tree.onPathChange(() => {
        throw new Error('listener blew up');
      });
      tree.onPathChange((p) => seen.push([...p]));

      expect(() => tree({ count: 1 })).not.toThrow();
      expect(tree.$.count()).toBe(1);
      expect(seen).toEqual([['count']]);
    } finally {
      spy.mockRestore();
    }
  });

  it('unsubscribing during dispatch does not skip the next listener', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[] = [];
    const offSelf = tree.onPathChange(() => {
      seen.push('first');
      offSelf();
    });
    tree.onPathChange(() => seen.push('second'));

    tree({ count: 1 });

    expect(seen).toEqual(['first', 'second']);
  });

  // NOTE: the test above passes with or without the Array.from() snapshot — JS
  // Set iteration already tolerates deleting the CURRENT element, so it never
  // gated anything. This is the case the snapshot actually exists for.
  it('a listener subscribed during dispatch is not called for that event', () => {
    const tree = signalTree({ count: 0 });
    const late: string[][] = [];
    tree.onPathChange(() => {
      tree.onPathChange((p) => late.push([...p]));
    });

    tree({ count: 1 });
    expect(late).toEqual([]); // not called for the in-flight event

    tree({ count: 2 });
    expect(late.length).toBeGreaterThan(0); // but live from the next one
  });

  it('is documented as root-only: a direct leaf write does not notify', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree.$.user.name.set('Grace');

    // Not an oversight — see the onPathChange docs. Pinned so a future change
    // to this boundary is a deliberate, visible decision.
    expect(seen).toEqual([]);
    expect(tree.$.user.name()).toBe('Grace');
  });

  it('survives an enhancer builder (forwarded from the base tree)', () => {
    const tree = signalTree({ count: 0 }).with((t) => t);
    const seen: string[][] = [];
    tree.onPathChange((paths) => seen.push([...paths]));

    tree.updateAndReport({ count: 1 });

    expect(seen).toEqual([['count']]);
  });

  it('ignores a non-function listener instead of corrupting the set', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[][] = [];
    (tree.onPathChange as unknown as (l: unknown) => () => void)(null);
    tree.onPathChange((paths) => seen.push([...paths]));

    expect(() => tree({ count: 1 })).not.toThrow();
    expect(seen).toEqual([['count']]);
  });
});

describe('state keys that collide with Function own-properties', () => {
  // Nodes ARE functions and carry state keys as their own properties, so every
  // own property a function already has is a name state could not use. Only
  // `prototype` was ever a problem (non-configurable); it used to crash tree
  // construction with "TypeError: Cannot redefine property: prototype".
  it.each(['prototype', 'length', 'name', 'caller', 'arguments', 'call'])(
    'accepts a nested state key named %s',
    (key) => {
      const tree = signalTree({ cfg: { [key]: 'V', other: 1 } });

      expect((tree.$.cfg as Record<string, () => unknown>)[key]()).toBe('V');
      expect(tree()).toEqual({ cfg: { [key]: 'V', other: 1 } });
    }
  );

  it('accepts state keys named set and update', () => {
    // The reason nodes are callable rather than carrying named methods: a
    // node with a `.set()` method would make `state.set` unusable as data.
    const tree = signalTree({ perms: { set: 'admin', update: 'editor' } });

    expect(tree.$.perms.set()).toBe('admin');
    expect(tree.$.perms.update()).toBe('editor');

    tree({ perms: { set: 'viewer' } });
    expect(tree.$.perms.set()).toBe('viewer');
  });

  it('round-trips a colliding key through unwrap and structuredClone', () => {
    const tree = signalTree({ cfg: { prototype: 1, set: 2, length: 3 } });

    expect(structuredClone(tree())).toEqual({
      cfg: { prototype: 1, set: 2, length: 3 },
    });
  });
});

describe('change reporting — defects found by adversarial audit', () => {
  it('does not report a branch write that is discarded', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ user: { name: 'Ada' } });

      // A server payload sending null for a whole object. The write has
      // nowhere to go — a branch cannot be replaced by a non-object — and was
      // always discarded, but the path was reported as changed anyway.
      expect(tree.updateAndReport({ user: null } as never)).toEqual([]);
      expect(tree.updateAndReport({ user: 5 } as never)).toEqual([]);
      expect(tree()).toEqual({ user: { name: 'Ada' } });
      // And it says so, rather than failing silently.
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not notify onPathChange for a discarded branch write', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ user: { name: 'Ada' } });
      const seen: string[][] = [];
      tree.onPathChange((p) => seen.push([...p]));

      tree({ user: null } as never);

      expect(seen).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('reports LEAF paths for a per-branch updater, not the branch', () => {
    const tree = signalTree({ user: { name: 'Ada', age: 1 } });

    const changed = tree.updateAndReport({
      user: (u: { name: string; age: number }) => {
        // Asserting the ARGUMENT matters: passing `undefined` here left the
        // whole suite green while breaking every real caller, which would
        // TypeError on `u.age + 1`.
        expect(u).toEqual({ name: 'Ada', age: 1 });
        return { ...u, name: 'Grace' };
      },
    } as never);

    expect(changed).toEqual(['user.name']);
    expect(tree.$.user.name()).toBe('Grace');
  });

  it('reports nothing for a per-branch updater that changes nothing', () => {
    const tree = signalTree({ user: { name: 'Ada', age: 1 } });

    const changed = tree.updateAndReport({
      user: (u: { name: string; age: number }) => ({ ...u }),
    } as never);

    expect(changed).toEqual([]);
  });

  it('destroy() drops onPathChange listeners', () => {
    const tree = signalTree({ count: 0 });
    let calls = 0;
    for (let i = 0; i < 10; i++) tree.onPathChange(() => calls++);

    tree.destroy();
    tree({ count: 1 });

    // Previously every listener still fired, and each closure (usually a
    // component) stayed reachable from the tree for the tree's whole life.
    expect(calls).toBe(0);
  });

  it('subscribing to a destroyed tree does not leak the listener', () => {
    const tree = signalTree({ count: 0 });
    tree.destroy();
    let calls = 0;

    const off = tree.onPathChange(() => calls++);
    tree({ count: 1 });

    expect(calls).toBe(0);
    expect(() => off()).not.toThrow();
  });

  it('a listener cannot mutate the array updateAndReport returns', () => {
    const tree = signalTree({ count: 0 });
    const seenBySecond: string[][] = [];
    tree.onPathChange((p) => {
      // Listeners receive a frozen copy; a rogue push must not reach the
      // caller's result or the next listener's view.
      try {
        (p as string[]).push('INJECTED');
      } catch {
        /* frozen — throwing is the correct outcome in strict mode */
      }
    });
    tree.onPathChange((p) => seenBySecond.push([...p]));

    const returned = tree.updateAndReport({ count: 1 });

    expect(returned).toEqual(['count']);
    expect(seenBySecond).toEqual([['count']]);
    // The caller owns their array. Freezing `out` itself (rather than a copy)
    // would satisfy every assertion above while handing callers a frozen result.
    expect(() => returned.push('x')).not.toThrow();
  });

  it('delivers events in write order when a listener writes', () => {
    const tree = signalTree({ a: 0, b: 0 });
    const seen: string[][] = [];
    tree.onPathChange((p) => {
      if (p.includes('a')) tree({ b: 1 });
    });
    tree.onPathChange((p) => seen.push([...p]));

    tree({ a: 1 });

    // The writes happened a then b. Dispatching the nested write inline
    // delivered b BEFORE a to this listener — a reversed audit trail, which is
    // the advertised use case.
    expect(seen).toEqual([['a'], ['b']]);
  });

  it('a listener that writes on every notification does not hang forever', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ count: 0 });
      tree.onPathChange(() => {
        tree({ count: (tree.$.count() as number) + 1 });
      });

      // Bounded by the drain guard rather than growing the queue forever.
      expect(() => tree({ count: 1 })).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('change reporting — second-round audit findings', () => {
  // A leaf NEVER invokes a function value. Updaters are a branch/root form;
  // `tree.$.count.update(fn)` is the leaf form, mirroring Angular's signal API.
  //
  // A revision of this suite once asserted the opposite — that a function at a
  // leaf is resolved as an updater — guarded on "the current value is not a
  // function". That predicate is unknowable at runtime, and the tests below are
  // the states it got wrong. All of them are ordinary callback fields.
  it('stores a handler assigned to a callback leaf sitting at null', () => {
    let ran = 0;
    const handler = () => {
      ran++;
    };
    const tree = signalTree({ onConfirm: null as null | (() => void) });

    // No cast: Partial<T>['onConfirm'] already includes the function type.
    tree({ onConfirm: handler });

    expect(tree.$.onConfirm()).toBe(handler);
    expect(ran).toBe(0); // assigning a handler must never RUN it
  });

  it('survives the clear-then-reassign cycle', () => {
    const first = () => 'a';
    const second = () => 'b';
    const tree = signalTree({ cb: first as (() => string) | null });

    tree({ cb: null });
    tree({ cb: second });

    expect(tree.$.cb()).toBe(second);
  });

  it('stores a class constructor without invoking it', () => {
    class Thing {}
    const tree = signalTree({
      a: 0,
      ctor: null as (typeof Thing) | null,
      b: 0,
    });

    // A class is `typeof 'function'`; invoking one throws, which used to escape
    // mid-loop leaving `a` written, `b` unwritten and nothing reported.
    expect(() =>
      tree.updateAndReport({ a: 1, ctor: Thing, b: 2 })
    ).not.toThrow();
    expect(tree.$.ctor()).toBe(Thing);
    expect(tree.$.a()).toBe(1);
    expect(tree.$.b()).toBe(2);
  });

  it('still lets a leaf that HOLDS a function be replaced', () => {
    const first = () => 'a';
    const second = () => 'b';
    const tree = signalTree({ cb: first as () => string });

    tree.updateAndReport({ cb: second } as never);

    expect(tree.$.cb()).toBe(second);
  });

  it('diagnoses a discarded branch write that arrives via an updater', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ user: { name: 'Ada' } });

      expect(tree.updateAndReport({ user: () => null } as never)).toEqual([]);
      expect(spy).toHaveBeenCalled();
      spy.mockClear();

      // The forgotten-await case: an async updater returns a Promise, which IS
      // an object, so Object.entries() is empty and the write vanished in
      // silence — the worst shape of this bug.
      expect(
        tree.updateAndReport({ user: async (u: unknown) => u } as never)
      ).toEqual([]);
      // Previously this half asserted nothing after mockClear() — it documented
      // a diagnostic that did not exist, over a write that vanished silently.
      expect(spy).toHaveBeenCalled();
      expect(tree()).toEqual({ user: { name: 'Ada' } });
      spy.mockClear();

      // An updater returning undefined is a discard too, unlike a LITERAL
      // undefined in the payload (an absent optional key, which is legal).
      expect(tree.updateAndReport({ user: () => undefined } as never)).toEqual(
        []
      );
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not warn for `undefined` at a branch — that is legal Partial<T>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ user: { name: 'Ada' }, count: 0 });

      // Exactly what `{ ...defaults, ...patch }` produces for an absent
      // optional key. Needs no cast, so a console.error here is crying wolf on
      // correct, type-checked code.
      const changed = tree.updateAndReport({ count: 1, user: undefined });

      expect(changed).toEqual(['count']);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('onPathChange does not create a reactive dependency on destroyed', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ count: 0 });
      let runs = 0;
      const c = computed(() => {
        runs++;
        tree.onPathChange(() => undefined);
        return runs;
      });
      c();
      const base = runs;

      tree.destroy();
      c();

      // Registering a listener inside a component effect() is the ordinary
      // place to do it; destroying the tree must not re-run that effect body.
      expect(runs).toBe(base);
    });
  });

  it('unsubscribing ANOTHER listener during dispatch takes effect immediately', () => {
    const tree = signalTree({ a: 0 });
    const seen: string[] = [];
    tree.onPathChange(() => {
      seen.push('L1');
      off2();
    });
    const off2 = tree.onPathChange(() => seen.push('L2'));
    tree.onPathChange(() => seen.push('L3'));

    tree({ a: 1 });

    // L2 running after being torn down is use-after-teardown: a listener that
    // disposes a child still sees the child's handler fire against dead state.
    expect(seen).toEqual(['L1', 'L3']);
  });

  it('does not treat a Date as equal to a keyless object', () => {
    const tree = signalTree({ at: new Date(0) });

    // A malformed payload sending {} for a date field was silently swallowed
    // AND honestly reported as "no change" — correct reporting of a lost write.
    const changed = tree.updateAndReport({ at: {} } as never);

    expect(changed).toEqual(['at']);
    expect(tree.$.at()).toEqual({});
  });
});

describe('change reporting — fourth-round audit findings', () => {
  it('warns when a branch updater returns a function', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ user: { name: 'Ada' } });

      // Previously uncovered: mutating this branch to `&& false` left the whole
      // suite green.
      expect(
        tree.updateAndReport({ user: () => () => 1 } as never)
      ).toEqual([]);
      expect(spy).toHaveBeenCalled();
      expect(tree()).toEqual({ user: { name: 'Ada' } });
    } finally {
      spy.mockRestore();
    }
  });

  it('warns when a branch updater returns a built-in or array', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree({ user: { name: 'Ada' } });

      for (const bad of [() => new Date(), () => [1, 2], () => new Map()]) {
        spy.mockClear();
        expect(tree.updateAndReport({ user: bad } as never)).toEqual([]);
        expect(spy).toHaveBeenCalled();
      }
      expect(tree()).toEqual({ user: { name: 'Ada' } });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('signalTree construction — prototype pollution', () => {
  const scrub = () => {
    for (const k of ['zzCtor', 'isAdmin']) {
      delete (Object.prototype as unknown as Record<string, unknown>)[k];
    }
  };
  beforeEach(scrub);
  afterEach(scrub);

  it('drops a __proto__ key from JSON-parsed initial state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // Rehydrating from localStorage / SSR transfer state / a fetch body is
      // the ordinary way this input arrives. Every `store[key] = …` is a plain
      // assignment, so `__proto__` invoked the prototype SETTER on the store —
      // and the ROOT store IS `tree.$`.
      const tree = signalTree(
        JSON.parse('{"__proto__":{"isAdmin":true},"a":1}')
      );
      const $ = tree.$ as unknown as Record<string, unknown>;

      // Null-prototype: stricter than Object.prototype, and the point of I2 —
      // there is no inherited accessor left for a payload to reach.
      expect(Object.getPrototypeOf($)).toBeNull();
      expect($['isAdmin']).toBeUndefined();
      expect(tree()).toEqual({ a: 1 });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not let a hidden node be written through afterwards', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const tree = signalTree(
        JSON.parse('{"__proto__":{"zzCtor":"x"},"a":1}')
      );

      // The hidden node used to accept writes, bypassing the ST2010
      // not-in-initial-shape discard while staying invisible to tree().
      tree({ zzCtor: 'written-through' } as never);

      expect(tree()).toEqual({ a: 1 });
      expect(({} as Record<string, unknown>)['zzCtor']).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('still accepts nested state and ordinary keys', () => {
    const tree = signalTree(JSON.parse('{"a":1,"b":{"c":2}}'));

    expect(tree()).toEqual({ a: 1, b: { c: 2 } });
  });
});
