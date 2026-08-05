import { computed, effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { signalTree } from '../index';
import { entityMap } from './markers/entity-map';
import { status } from './markers/status';
import { stored } from './markers/stored';
import { form } from './markers/form';
import { deepEqual } from '@signaltree/shared';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

// Dump helper: fail with a JSON payload so we can read runtime values.
function dump(label: string, value: unknown): never {
  throw new Error(
    `${label}: ` +
      JSON.stringify(
        value,
        (_k, v) => (typeof v === 'function' ? `[fn ${v.name}]` : v),
        1
      )
  );
}

describe('G: unwrap() with markers after the set/update skip removal', () => {
  it('G1 entityMap snapshot keys', () => {
    const tree = signalTree({
      users: entityMap<{ id: number; name: string }>([{ id: 1, name: 'Ada' }]),
    });
    tree.$; // materialize
    dump('G1', { snapshot: tree(), keys: Object.keys(tree() as object) });
  });

  it('G2 status snapshot', () => {
    const tree = signalTree({ load: status() });
    tree.$;
    dump('G2', tree());
  });

  it('G3 form snapshot', () => {
    const tree = signalTree({ f: form({ name: 'Ada' }) });
    tree.$;
    dump('G3', tree());
  });

  it('G4 stored snapshot', () => {
    const tree = signalTree({ s: stored('zz-audit-key', 1) });
    tree.$;
    dump('G4', tree());
  });
});

describe('H: makeNodeAccessor is now a concise method', () => {
  it('H1 accessor shape', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const acc = tree.$.user as unknown as (...a: unknown[]) => unknown;
    dump('H1', {
      name: acc.name,
      length: acc.length,
      hasPrototype: 'prototype' in acc,
      ownNames: Object.getOwnPropertyNames(acc),
      typeofAcc: typeof acc,
      isFn: acc instanceof Function,
      canBind: typeof acc.bind === 'function',
      newThrows: (() => {
        try {
          new (acc as unknown as new () => unknown)();
          return false;
        } catch (e) {
          return (e as Error).message;
        }
      })(),
      toStr: acc.toString().slice(0, 24),
    });
  });

  it('H2 call/apply/bind on a nested accessor still write', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const acc = tree.$.user as unknown as (a: unknown) => void;
    acc.call(null, { name: 'Grace' });
    expect(tree.$.user.name()).toBe('Grace');
    acc.apply(null, [{ name: 'Hopper' }]);
    expect(tree.$.user.name()).toBe('Hopper');
    const bound = acc.bind(null);
    bound({ name: 'Lovelace' });
    expect(tree.$.user.name()).toBe('Lovelace');
  });

  it('H3 a BOUND accessor still reads (arguments.length via bind)', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const acc = tree.$.user as unknown as () => unknown;
    const bound = acc.bind(null);
    expect(bound()).toEqual({ name: 'Ada' });
  });
});

describe('I: deepEqual primitive semantics', () => {
  it('I1 table', () => {
    const s = Symbol('x');
    dump('I1', {
      nanNan: deepEqual(Number.NaN, Number.NaN),
      zeroNegZero: deepEqual(0, -0),
      symSame: deepEqual(s, s),
      symDiff: deepEqual(Symbol('a'), Symbol('a')),
      bigintDiff: deepEqual(1n, 2n),
      bigintSame: deepEqual(1n, 1n),
      fnDiff: deepEqual(
        () => 1,
        () => 1
      ),
      arrNaN: deepEqual([Number.NaN], [Number.NaN]),
      mapNaNVal: deepEqual(
        new Map([['k', Number.NaN]]),
        new Map([['k', Number.NaN]])
      ),
      setNaN: deepEqual(new Set([Number.NaN]), new Set([Number.NaN])),
      objNaN: deepEqual({ a: Number.NaN }, { a: Number.NaN }),
      dateNaN: deepEqual(new Date(Number.NaN), new Date(Number.NaN)),
      strNum: deepEqual('1' as unknown as number, 1),
    });
  });

  it('I2 0 vs -0 through a leaf: the leaf silently keeps +0', () => {
    const tree = signalTree({ n: 0 });
    const changed = tree.updateAndReport({ n: -0 });
    expect({ changed, isNeg: Object.is(tree.$.n(), -0) }).toEqual({
      changed: [],
      isNeg: false,
    });
  });
});

describe('J: builder / enhancer forwarding', () => {
  it('J1 onPathChange before derived(), then derived still allowed', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));
    const t2 = tree.derived(($) => ({ dbl: computed(() => $.count() * 2) }));
    t2({ count: 2 });
    expect(seen).toEqual([['count']]);
  });

  it('J2 listener registered on the builder BEFORE .with() still fires after', () => {
    const base = signalTree({ count: 0 });
    const seen: string[][] = [];
    base.onPathChange((p) => seen.push([...p]));
    const enhanced = base.with((t) => t);
    enhanced({ count: 1 });
    expect(seen).toEqual([['count']]);
  });

  it('J3 nested accessor call form does not notify (documented) — but batchScope?', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ a: { x: 1, y: 2 } });
      let runs = 0;
      effect(() => {
        tree.$.a.x();
        tree.$.a.y();
        runs++;
      });
      TestBed.flushEffects();
      const base = runs;
      // Root call form is NOT wrapped in batchScope (nested accessor is).
      tree({ a: { x: 10, y: 20 } });
      TestBed.flushEffects();
      expect(runs - base).toBe(1);
    });
  });
});
