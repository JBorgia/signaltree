/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Exhaustive compile-time typing assertions for enhancer chaining
// This file uses type-level assertions only. It must compile without errors.

import type { BatchingMethods } from '../batching/lib/batching';
import type { MemoizationMethods } from '../memoization/lib/memoization';
import type { TimeTravelMethods } from '../time-travel/lib/time-travel';
import type { DevToolsMethods } from '../devtools/lib/devtools';
import type { EntitiesMethods } from '../entities/lib/entities';
import type { OptimizedUpdateMethods } from '../../lib/types';

// Helper equality/assert types
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type Assert<T extends true> = T;

type Tree = { count: number };

type Base = {}; // placeholder for SignalTreeBase<T> fields we don't model here

// Single enhancer expectations
type _batch_single = Assert<Equals<BatchingMethods<Tree> & Base, Base & BatchingMethods<Tree>>>;
type _memo_single = Assert<Equals<MemoizationMethods<Tree> & Base, Base & MemoizationMethods<Tree>>>;
type _tt_single = Assert<Equals<TimeTravelMethods<Tree> & Base, Base & TimeTravelMethods<Tree>>>;
type _dev_single = Assert<Equals<DevToolsMethods & Base, Base & DevToolsMethods>>;
type _entities_single = Assert<Equals<EntitiesMethods<Tree> & Base, Base & EntitiesMethods<Tree>>>;

// Pair combinations — expected intersection of methods
type BM = BatchingMethods<Tree> & MemoizationMethods<Tree> & Base;
type _pair_batch_memo = Assert<Equals<BM, Base & BatchingMethods<Tree> & MemoizationMethods<Tree>>>;

type MT = MemoizationMethods<Tree> & TimeTravelMethods<Tree> & Base;
type _pair_memo_tt = Assert<Equals<MT, Base & MemoizationMethods<Tree> & TimeTravelMethods<Tree>>>;

type BMT = BatchingMethods<Tree> & MemoizationMethods<Tree> & TimeTravelMethods<Tree> & Base;
type _triple_bmt = Assert<Equals<BMT, Base & BatchingMethods<Tree> & MemoizationMethods<Tree> & TimeTravelMethods<Tree>>>;

// Include optimized update methods and entities
type EO = EntitiesMethods<Tree> & OptimizedUpdateMethods<Tree> & Base;
type _pair_entities_opt = Assert<Equals<EO, Base & EntitiesMethods<Tree> & OptimizedUpdateMethods<Tree>>>;

// Affirm composition assignability (structural)
type Composite = Base & BatchingMethods<Tree> & MemoizationMethods<Tree> & DevToolsMethods & TimeTravelMethods<Tree> & EntitiesMethods<Tree> & OptimizedUpdateMethods<Tree>;
type _composite_ok = Assert<Equals<Composite, Composite>>;

export {};
