/**
 * Type-level tests for batching enhancer.
 *
 * This file ensures the enhancer follows the v6 contract.
 * If this file compiles, the types are correct.
 */
import { withBatching } from './batching';

import type {
  SignalTreeBase,
  BatchingMethods,
  BatchingConfig,
} from '../../lib/types';
// ============================================================================
// Type Equality Helpers
// ============================================================================

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Assert<T extends true> = T;

// ============================================================================
// Contract Verification
// ============================================================================

// The expected signature
type ExpectedSignature = (
  config?: BatchingConfig
) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & BatchingMethods;

// The actual signature
type ActualSignature = typeof withBatching;

// This line will fail to compile if signatures don't match
type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// ============================================================================
// Usage Verification
// ============================================================================

// Verify the enhancer works with different state types
declare const tree1: SignalTreeBase<{ count: number }>;
declare const tree2: SignalTreeBase<{ users: string[]; active: boolean }>;

// These should all compile
const enhanced1 = withBatching()(tree1);
const enhanced2 = withBatching({ debounceMs: 16 })(tree2);

// Verify methods are available
enhanced1.batch(() => void 0);
enhanced2.batch(() => void 0);

// Verify state type is preserved
const _count: number = enhanced1().count;
const _users: string[] = enhanced2().users;

// Export to make this a module
export {};
