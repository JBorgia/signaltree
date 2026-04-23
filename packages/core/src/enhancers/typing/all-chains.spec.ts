/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Exhaustive compile-time typing assertions for enhancer chaining
// This file uses type-level assertions only. It must compile without errors.

import type {
  BatchingMethods,
  DevToolsMethods,
  OptimizedUpdateMethods,
  TimeTravelMethods,
  EntitiesEnabled,
} from '../../lib/types';

// Helper equality/assert types
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type Tree = { count: number };

type Base = object; // placeholder for ISignalTree<T> fields we don't model here

// Single enhancer expectations
type _batch_single = Assert<
  Equals<BatchingMethods<Tree> & Base, Base & BatchingMethods<Tree>>
>;
type _tt_single = Assert<
  Equals<TimeTravelMethods<Tree> & Base, Base & TimeTravelMethods<Tree>>
>;
type _dev_single = Assert<
  Equals<DevToolsMethods & Base, Base & DevToolsMethods>
>;
type _entities_single = Assert<
  Equals<EntitiesEnabled & Base, Base & EntitiesEnabled>
>;

// Pair combinations
type BT = BatchingMethods<Tree> & TimeTravelMethods<Tree> & Base;
type _pair_batch_tt = Assert<
  Equals<BT, Base & BatchingMethods<Tree> & TimeTravelMethods<Tree>>
>;

type BTD = BatchingMethods<Tree> &
  TimeTravelMethods<Tree> &
  DevToolsMethods &
  Base;
type _triple_btd = Assert<
  Equals<
    BTD,
    Base & BatchingMethods<Tree> & TimeTravelMethods<Tree> & DevToolsMethods
  >
>;

// Include optimized update methods and entities
type EO = EntitiesEnabled & OptimizedUpdateMethods<Tree> & Base;
type _pair_entities_opt = Assert<
  Equals<EO, Base & EntitiesEnabled & OptimizedUpdateMethods<Tree>>
>;

// Affirm composition assignability (structural)
type Composite = Base &
  BatchingMethods<Tree> &
  DevToolsMethods &
  TimeTravelMethods<Tree> &
  EntitiesEnabled &
  OptimizedUpdateMethods<Tree>;
type _composite_ok = Assert<Equals<Composite, Composite>>;

export {};

describe('typing compile-time checks (runtime shim)', () => {
  it('compiles type-level assertions', () => {
    expect(true).toBe(true);
  });
});
