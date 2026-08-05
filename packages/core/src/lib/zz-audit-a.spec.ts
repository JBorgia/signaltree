import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { signalTree } from '../index';

// Silence the intentional dev diagnostics these probes trigger.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('A: node-accessor else-branch pushes unconditionally', () => {
  it('A1 null onto an object node', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const before = tree();
    const changed = tree.updateAndReport({ user: null } as never);
    expect({ changed, after: tree(), before }).toEqual({
      changed: [],
      after: { user: { name: 'Ada' } },
      before: { user: { name: 'Ada' } },
    });
  });

  it('A2 primitive onto an object node', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const changed = tree.updateAndReport({ user: 5 } as never);
    expect({ changed, after: tree() }).toEqual({
      changed: [],
      after: { user: { name: 'Ada' } },
    });
  });

  it('A3 array onto an object node', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const changed = tree.updateAndReport({ user: [1, 2] } as never);
    expect({ changed, after: tree() }).toEqual({
      changed: [],
      after: { user: { name: 'Ada' } },
    });
  });

  it('A4 onPathChange fires for the discarded write', () => {
    const tree = signalTree({ user: { name: 'Ada' } });
    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));
    tree({ user: null } as never);
    expect(seen).toEqual([]);
  });

  it('A5 no effect ran, proving nothing landed', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ user: { name: 'Ada' } });
      let runs = 0;
      effect(() => {
        tree.$.user.name();
        runs++;
      });
      TestBed.flushEffects();
      const base = runs;
      const changed = tree.updateAndReport({ user: null } as never);
      TestBed.flushEffects();
      expect({ changed, extraRuns: runs - base }).toEqual({
        changed: [],
        extraRuns: 0,
      });
    });
  });
});

describe('B: destroy() and listener lifetime', () => {
  it('B1 listeners still fire after destroy()', () => {
    const tree = signalTree({ count: 0 });
    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));
    tree.destroy();
    tree({ count: 1 });
    expect(seen).toEqual([]);
  });
});

describe('C: the out array handed to listeners', () => {
  it('C1 updateAndReport returns the SAME array the listener received', () => {
    const tree = signalTree({ count: 0 });
    let captured: readonly string[] | undefined;
    tree.onPathChange((p) => {
      captured = p;
    });
    const returned = tree.updateAndReport({ count: 1 });
    expect(captured === returned).toBe(false);
  });

  it('C2 a listener mutating paths corrupts the next listener + return value', () => {
    const tree = signalTree({ count: 0 });
    const seenSecond: string[][] = [];
    tree.onPathChange((p) => {
      (p as string[]).push('INJECTED');
    });
    tree.onPathChange((p) => seenSecond.push([...p]));
    const returned = tree.updateAndReport({ count: 1 });
    expect({ seenSecond, returned }).toEqual({
      seenSecond: [['count']],
      returned: ['count'],
    });
  });
});

describe('D: re-entrancy / ordering', () => {
  it('D1 a listener that writes reorders events for later listeners', () => {
    const tree = signalTree({ a: 0, b: 0 });
    const seen: string[][] = [];
    tree.onPathChange((p) => {
      if (p.includes('a')) tree({ b: 1 });
    });
    tree.onPathChange((p) => seen.push([...p]));
    tree({ a: 1 });
    // Writes happened a-then-b; a well-behaved feed should deliver a then b.
    expect(seen).toEqual([['a'], ['b']]);
  });
});

describe('E: top-level state keys that collide with Function own-properties', () => {
  it.each(['prototype', 'length', 'name', 'caller', 'arguments', 'set'])(
    'E %s at the ROOT of the state',
    (key) => {
      const tree = signalTree({ [key]: 'V', other: 1 });
      expect(tree()).toEqual({ [key]: 'V', other: 1 });
      expect(
        (tree.$ as unknown as Record<string, () => unknown>)[key]()
      ).toBe('V');
    }
  );
});

describe('F: deepEqual NaN policy completeness', () => {
  it('F1 Invalid Date leaf re-reports on every rewrite', () => {
    const tree = signalTree({ d: new Date(Number.NaN) });
    expect(tree.updateAndReport({ d: new Date(Number.NaN) })).toEqual([]);
  });

  it('F2 Invalid Date leaf re-notifies effects', () => {
    TestBed.runInInjectionContext(() => {
      const tree = signalTree({ d: new Date(Number.NaN) });
      let runs = 0;
      effect(() => {
        tree.$.d();
        runs++;
      });
      TestBed.flushEffects();
      const base = runs;
      tree({ d: new Date(Number.NaN) });
      TestBed.flushEffects();
      expect(runs - base).toBe(0);
    });
  });
});
