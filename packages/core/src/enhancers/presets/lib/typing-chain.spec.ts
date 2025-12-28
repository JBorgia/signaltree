/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for presets/composition and chaining inference
import type { composeEnhancers } from '../../../lib/utils';
import type { withBatching } from '../../batching/lib/batching';
import type { withMemoization } from '../../memoization/lib/memoization';
import type { Enhancer } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type Compose = typeof composeEnhancers;
// composeEnhancers returns a function (tree) => tree; typed as Enhancer
type _compose_signature = Assert<
  Equals<ReturnType<Compose>, Enhancer | ((t: any) => any)>
>;

// Basic composition: ensure composed type is assignable to Enhancer
type C1 = ReturnType<typeof composeEnhancers>;
type _compose_is_enhancer = Assert<
  Equals<C1 extends Enhancer ? C1 : never, C1>
>;

export {};
