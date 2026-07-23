import { signalTree } from '@signaltree/core';

import { enterprise } from './enterprise-enhancer';
import { PathIndex } from './path-index';

/**
 * Regression coverage for the accessor-walk bug family: SignalTree
 * NodeAccessors are callable (typeof 'function'), and both
 * PathIndex.buildFromTree and applyPatch's fallback navigation used to gate
 * on `typeof === 'object'`, silently skipping every nested namespace.
 * Existing specs only exercised flat state or hand-built plain-object
 * fixtures, so the enterprise diff/patch pipeline was inert for nested
 * state without any test noticing.
 */
describe('enterprise with real nested SignalTree state', () => {
  interface State {
    counter: number;
    profile: { name: string; contact: { email: string } };
    entities: { id: number }[];
  }

  function buildTree() {
    return signalTree<State>({
      counter: 0,
      profile: { name: 'Ada', contact: { email: 'ada@analytical.engine' } },
      entities: [],
    }).with(enterprise());
  }

  it('PathIndex.buildFromTree indexes leaves under nested namespaces', () => {
    const tree = buildTree();
    const index = new PathIndex();
    index.buildFromTree(tree.$);

    expect(index.get(['counter'])).toBeDefined();
    expect(index.get(['profile', 'name'])).toBeDefined();
    expect(index.get(['profile', 'contact', 'email'])).toBeDefined();
  });

  it('updateOptimized applies changes to nested paths', () => {
    const tree = buildTree();

    const result = tree.updateOptimized({
      profile: {
        name: 'Grace',
        contact: { email: 'grace@navy.mil' },
      },
    } as Partial<State>);

    expect(result.changed).toBe(true);
    expect(tree.$.profile.name()).toBe('Grace');
    expect(tree.$.profile.contact.email()).toBe('grace@navy.mil');
  });

  it('reports granular changed paths, not whole-subtree replaces', () => {
    const tree = buildTree();
    const result = tree.updateOptimized({
      profile: {
        name: 'Grace',
        contact: { email: 'ada@analytical.engine' }, // unchanged
      },
    } as Partial<State>);

    expect(result.changedPaths).toEqual(['profile.name']);
    expect(tree.$.profile.contact.email()).toBe('ada@analytical.engine');
  });

  it('updateOptimized still handles flat paths', () => {
    const tree = buildTree();
    const result = tree.updateOptimized({ counter: 42 } as Partial<State>);
    expect(result.changed).toBe(true);
    expect(tree.$.counter()).toBe(42);
  });
});

/**
 * Walker-conformance extension (RFC 0004 §4 step 1): the fixture-family
 * variant — five branch levels deep, with a built-in (Date) leaf sitting on
 * the walk path. The depth-3 cases above caught the 11.5.2/11.5.3 bug class;
 * these pin the harder shapes: deep recursion through callable accessors and
 * built-ins treated as atomic leaves (never recursed into, replaced whole).
 */
describe('enterprise walker conformance — deep tree with built-in leaves', () => {
  interface DeepState {
    org: {
      meta: { founded: Date };
      teams: {
        alpha: {
          lead: { profile: { display: string; score: number } };
        };
      };
    };
  }

  function buildDeepTree() {
    return signalTree<DeepState>({
      org: {
        meta: { founded: new Date('2020-01-02T00:00:00Z') },
        teams: {
          alpha: {
            lead: { profile: { display: 'Ada', score: 1 } },
          },
        },
      },
    }).with(enterprise());
  }

  it('PathIndex indexes a leaf five branches deep and stops at the Date', () => {
    const tree = buildDeepTree();
    const index = new PathIndex();
    index.buildFromTree(tree.$);

    expect(
      index.get(['org', 'teams', 'alpha', 'lead', 'profile', 'score'])
    ).toBeDefined();
    // The Date is an atomic leaf — indexed itself, never descended into
    // (no getTime/toISOString "children").
    expect(index.get(['org', 'meta', 'founded'])).toBeDefined();
    expect(index.get(['org', 'meta', 'founded', 'getTime'])).toBeNull();
  });

  it('updateOptimized writes a depth-5 leaf and reports the granular path', () => {
    const tree = buildDeepTree();

    const result = tree.updateOptimized({
      org: {
        teams: { alpha: { lead: { profile: { display: 'Ada', score: 99 } } } },
      },
    } as Partial<DeepState>);

    expect(result.changed).toBe(true);
    expect(result.changedPaths).toEqual([
      'org.teams.alpha.lead.profile.score',
    ]);
    expect(tree.$.org.teams.alpha.lead.profile.score()).toBe(99);
    // Untouched siblings survive, including the built-in leaf.
    expect(tree.$.org.teams.alpha.lead.profile.display()).toBe('Ada');
    expect(tree.$.org.meta.founded().toISOString()).toBe(
      '2020-01-02T00:00:00.000Z'
    );
  });

  it('updateOptimized replaces a Date leaf atomically', () => {
    const tree = buildDeepTree();
    const next = new Date('2024-06-07T00:00:00Z');

    const result = tree.updateOptimized({
      org: { meta: { founded: next } },
    } as Partial<DeepState>);

    expect(result.changed).toBe(true);
    expect(result.changedPaths).toEqual(['org.meta.founded']);
    expect(tree.$.org.meta.founded().toISOString()).toBe(next.toISOString());
    // Deep leaves elsewhere untouched.
    expect(tree.$.org.teams.alpha.lead.profile.score()).toBe(1);
  });

  it('updateOptimized replaces Map and Set leaves atomically (regression: isEqual JSON.stringify fallback saw every Map/Set as "{}", so diff reported changed:true while applyPatch dropped the write)', () => {
    const tree = signalTree({
      cache: {
        lookup: new Map([['a', 1]]),
        tags: new Set(['x']),
      },
    }).with(enterprise());

    const nextMap = new Map([['b', 2]]);
    const nextSet = new Set(['y', 'z']);
    const result = tree.updateOptimized({
      cache: { lookup: nextMap, tags: nextSet },
    });

    expect(result.changed).toBe(true);
    expect(result.changedPaths.sort()).toEqual(['cache.lookup', 'cache.tags']);
    expect(Array.from(tree.$.cache.lookup().entries())).toEqual([['b', 2]]);
    expect(Array.from(tree.$.cache.tags().values()).sort()).toEqual([
      'y',
      'z',
    ]);
  });
});
