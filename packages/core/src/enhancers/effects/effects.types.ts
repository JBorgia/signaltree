/**
 * Type-level tests for effects enhancer.
 */

import type { withEffects } from './effects';
import type { SignalTreeBase, EffectsMethods } from '../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Assert<T extends true> = T;

// Expected signature (config is optional and has no required fields)
type ExpectedSignature = (config?: {
  enabled?: boolean;
}) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EffectsMethods<S>;

type ActualSignature = typeof withEffects;

// Contract check
type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: SignalTreeBase<{ count: number }>;
const enhanced = withEffects()(tree);

// Effect method should be available
const cleanup = enhanced.effect((state) => {
  const _count: number = state.count;
});

// Cleanup should be callable
cleanup();

export {};
