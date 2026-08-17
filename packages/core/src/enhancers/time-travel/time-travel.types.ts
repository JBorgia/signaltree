import { Assert, Equals } from '../test-helpers/types-equals';
import { timeTravel, TimeTravelConfig } from './time-travel';

import type { Enhancer, TimeTravelMethods } from '../../lib/types';

/**
 * `timeTravel()` returns the NEUTRAL enhancer contract.
 *
 * This asserted the realization-facing shape,
 * `(config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods`.
 * That was the implementation vocabulary, and migrating to `Enhancer<TAdded>`
 * is exactly what changed it — so the row went red and was updated
 * deliberately, not worked around.
 *
 * This file does NOT stand in for the consumer contract. Asserting
 * `timeTravel`'s own declared shape says nothing about whether a call site
 * still gets `TimeTravelEntry<AppState>[]` out of `getHistory()` — which is the
 * one property this migration could plausibly have broken, since the state is
 * recovered from polymorphic `this` and `EnhancerHost` is not a `NodeAccessor`.
 * That is `time-travel-contract.typing.spec.ts`, proven green BEFORE this
 * signature changed and re-run unchanged afterwards.
 */
type ExpectedSignature = (config?: TimeTravelConfig) => Enhancer<TimeTravelMethods>;

type ActualSignature = typeof timeTravel;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// .with() preserves accumulated types via `this & TAdded` pattern.

export {};
