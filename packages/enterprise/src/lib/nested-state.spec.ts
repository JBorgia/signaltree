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
