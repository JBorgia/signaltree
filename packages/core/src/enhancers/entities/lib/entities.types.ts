/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for entities enhancer (assert intended public contract)
import type { withEntities } from './entities';
import type { SignalTreeBase } from '../../../lib/types';
import type { EntityAwareTreeNode } from '../../../lib/types';

type Equals<A, B> = A extends B ? (B extends A ? true : false) : false;
type Assert<T extends true> = T;

type WEN = typeof withEntities;
type Expected = (config?: { enabled?: boolean }) => <T>(
  tree: SignalTreeBase<T>
) => Omit<SignalTreeBase<T>, 'state' | '$'> & {
  state: EntityAwareTreeNode<T>;
  $: EntityAwareTreeNode<T>;
};

type _debug_actual = WEN;
type _debug_expected = Expected;
type _debug_match = Equals<WEN, Expected>;

type _entities_signature = Assert<_debug_match>;

export {};
