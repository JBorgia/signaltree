import { batching } from './batching';

import type { BatchingMethods, Enhancer } from '../../lib/types';

/**
 * `batching()` returns the NEUTRAL enhancer contract.
 *
 * This used to assert the realization-facing shape,
 * `<T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods`. That was the
 * implementation vocabulary, and the 15.0 migration to `Enhancer<TAdded>` is
 * exactly what changed it — so the old row went red and was updated
 * deliberately rather than the migration being bent to keep it green.
 *
 * Note what this file does NOT do: it does not stand in for the consumer
 * contract. A row about `batching`'s own declared shape says nothing about
 * whether a call site still infers `batch`/`coalesce` without casts. That is
 * `batching-contract.typing.spec.ts`, which was written and proven green BEFORE
 * this signature changed and re-run unchanged afterwards.
 */
type BatchingEnhancer = ReturnType<typeof batching>;

type _IsNeutral = BatchingEnhancer extends Enhancer<BatchingMethods>
  ? true
  : false;
const _neutralTest: _IsNeutral = true;

export {};
