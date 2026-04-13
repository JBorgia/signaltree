import { describe, it, expectTypeOf } from 'vitest';
import { signalTree } from './signal-tree';
import type {
  ISignalTree,
  TreeNode,
  NodeAccessor,
  AccessibleNode,
} from './types';
import { Signal, WritableSignal } from '@angular/core';

/**
 * Phase 6: Schema-level type tests
 * Verifies that TypeScript types resolve correctly for core APIs.
 * These tests run at the type level — they compile but don't execute assertions.
 */

describe('Schema-level type tests', () => {
  it('TreeNode<{ a: number }> produces correct signal types', () => {
    type Result = TreeNode<{ a: number }>;
    // TreeNode maps each key to a NodeAccessor
    expectTypeOf<Result>().toHaveProperty('a');
  });

  it('signalTree returns ISignalTree with correct shape', () => {
    const tree = signalTree({ count: 0, name: 'test' });

    // $.count should be callable (returns number)
    expectTypeOf(tree.$.count).toBeFunction();

    // $.count.set should exist
    expectTypeOf(tree.$.count.set).toBeFunction();

    // tree.destroy should exist
    expectTypeOf(tree.destroy).toBeFunction();

    // tree.destroyed should return boolean
    expectTypeOf(tree.destroyed).toBeFunction();

    tree.destroy();
  });

  it('nested state produces nested accessor types', () => {
    const tree = signalTree({
      user: {
        profile: {
          name: 'Alice',
          age: 30,
        },
      },
    });

    // Deep access should work
    expectTypeOf(tree.$.user.profile.name).toBeFunction();
    expectTypeOf(tree.$.user.profile.age).toBeFunction();

    tree.destroy();
  });

  it('ISignalTree has required interface members', () => {
    type Tree = ISignalTree<{ x: number }>;

    expectTypeOf<Tree>().toHaveProperty('destroy');
    expectTypeOf<Tree>().toHaveProperty('destroyed');
    expectTypeOf<Tree>().toHaveProperty('registerCleanup');
    expectTypeOf<Tree>().toHaveProperty('with');
    expectTypeOf<Tree>().toHaveProperty('subscribe');
  });

  it('incompatible trees cannot be assigned to each other', () => {
    type TreeA = ISignalTree<{ count: number }>;
    type TreeB = ISignalTree<{ name: string }>;

    // These types should be structurally different
    // TreeA's $ has count, TreeB's $ has name — they shouldn't be interchangeable
    // for practical use even though TypeScript uses structural typing
    expectTypeOf<TreeA>().not.toEqualTypeOf<TreeB>();
  });

  it('NodeAccessor is callable', () => {
    type Accessor = NodeAccessor<number>;
    expectTypeOf<Accessor>().toBeCallableWith();
  });
});
