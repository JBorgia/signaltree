import { describe, expect, it, vi } from 'vitest';
import { ENHANCER_META } from '../lib/types';
import { batching } from './batching/batching';
import { timeTravel } from './time-travel/time-travel';
import { devTools } from './devtools/devtools';
import { serialization } from './serialization/serialization';

/**
 * Phase 6: Enhancer safety tests
 * - Duplicate enhancer detection
 * - Dependency validation
 * - Metadata attachment
 */

function createMockTree() {
  const state = { count: 0, name: '' } as Record<string, any>;
  const cleanupFns: Array<() => void> = [];
  const appliedEnhancers = new Set<string>();

  const tree = function (...args: any[]) {
    if (args.length === 0) return state;
    const arg = args[0];
    if (typeof arg === 'function') {
      const res = arg(state);
      if (res && typeof res === 'object') Object.assign(state, res);
      return;
    }
    if (typeof arg === 'object') {
      Object.assign(state, arg);
      return;
    }
  } as any;

  tree.state = {
    count: {
      set: (v: number) => { state.count = v; },
      update: (fn: (v: number) => number) => { state.count = fn(state.count); },
    },
    name: {
      set: (v: string) => { state.name = v; },
      update: (fn: (v: string) => string) => { state.name = fn(state.name); },
    },
  };
  tree.$ = tree.state;
  tree.bind = (_: unknown) => (...a: unknown[]) => tree(...(a as any));
  tree.registerCleanup = (fn: () => void) => { cleanupFns.push(fn); };
  tree.destroyed = () => false;
  tree.destroy = () => {
    for (const fn of cleanupFns) {
      try { fn(); } catch { /* ignore */ }
    }
    cleanupFns.length = 0;
  };

  // Implement .with() with duplicate/dependency checking
  tree.with = function <R>(enhancer: (t: any) => R): R {
    if (typeof enhancer !== 'function') {
      throw new Error('Enhancer must be a function');
    }

    const meta =
      (enhancer as unknown as Record<symbol, any>)[ENHANCER_META] ??
      (enhancer as unknown as { metadata?: any }).metadata;

    if (meta?.name) {
      if (appliedEnhancers.has(meta.name)) {
        throw new Error(
          `Enhancer "${meta.name}" has already been applied to this tree. ` +
          `Each enhancer can only be applied once.`
        );
      }
      if (meta.requires) {
        for (const dep of meta.requires) {
          if (!appliedEnhancers.has(dep)) {
            throw new Error(
              `Enhancer "${meta.name}" requires "${dep}" to be applied first.`
            );
          }
        }
      }
      appliedEnhancers.add(meta.name);
    }

    return enhancer(tree) as R;
  };

  return tree;
}

describe('enhancer metadata', () => {
  it.each([
    ['batching', batching],
    ['timeTravel', timeTravel],
    ['devTools', devTools],
    ['serialization', serialization],
  ])('%s attaches metadata with name', (expectedName, factory) => {
    const enhancerFn = (factory as any)();
    const meta =
      (enhancerFn as any)[ENHANCER_META] ?? (enhancerFn as any).metadata;

    expect(meta).toBeDefined();
    expect(meta.name).toBe(expectedName);
    expect(meta.provides).toContain(expectedName);
  });
});

describe('duplicate enhancer detection', () => {
  it('throws when the same enhancer is applied twice', () => {
    const tree = createMockTree();

    tree.with(batching());

    expect(() => tree.with(batching())).toThrowError(
      /Enhancer "batching" has already been applied/
    );
  });

  it('throws for duplicate memoization', () => {
    // Removed in 9.0.1: memoization enhancer deleted.
    expect(true).toBe(true);
  });

  it('throws for duplicate devTools', () => {
    const tree = createMockTree();
    tree.with(devTools({ enabled: false }));
    expect(() => tree.with(devTools({ enabled: false }))).toThrowError(/devTools/);
  });

  it('allows different enhancers', () => {
    const tree = createMockTree();
    expect(() => {
      tree.with(batching());
      tree.with(serialization());
    }).not.toThrow();
  });
});

describe('dependency validation', () => {
  it('allows enhancers with no dependencies', () => {
    const tree = createMockTree();
    expect(() => tree.with(batching())).not.toThrow();
  });

  it('throws when a required dependency is missing', () => {
    const tree = createMockTree();

    // Create a custom enhancer that requires 'batching'
    const customEnhancer = (t: any) => t;
    (customEnhancer as any).metadata = {
      name: 'custom',
      provides: ['custom'],
      requires: ['batching'],
    };
    (customEnhancer as any)[ENHANCER_META] = (customEnhancer as any).metadata;

    expect(() => tree.with(customEnhancer)).toThrowError(
      /requires "batching" to be applied first/
    );
  });

  it('succeeds when required dependency is present', () => {
    const tree = createMockTree();
    tree.with(batching());

    const customEnhancer = (t: any) => t;
    (customEnhancer as any).metadata = {
      name: 'custom',
      provides: ['custom'],
      requires: ['batching'],
    };
    (customEnhancer as any)[ENHANCER_META] = (customEnhancer as any).metadata;

    expect(() => tree.with(customEnhancer)).not.toThrow();
  });
});
