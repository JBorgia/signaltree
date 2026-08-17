import { Assert, Equals } from '../test-helpers/types-equals';
import { devTools } from './devtools';

import type { DevToolsConfig, DevToolsMethods, Enhancer } from '../../lib/types';

/**
 * `devTools()` returns the NEUTRAL enhancer contract.
 *
 * This asserted the realization-facing shape,
 * `(config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods`.
 * That was implementation vocabulary; migrating to `Enhancer<TAdded>` changed
 * it, so the row went red and was updated deliberately rather than the
 * migration being bent around it.
 *
 * `devTools` fronts TWO implementations — a mutating production noop and an
 * identity-replacing dev enhancer, selected at module load — so one signature
 * has to fit both. Neither that, nor whether a call site still infers
 * `connectDevTools` without a cast, is visible from this row. See
 * `devtools-contract.typing.spec.ts` (proven green BEFORE the signature changed)
 * and the runtime accumulation-survival test in `devtools.spec.ts`.
 */
type ExpectedSignature = (config?: DevToolsConfig) => Enhancer<DevToolsMethods>;

type ActualSignature = typeof devTools;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

export {};
