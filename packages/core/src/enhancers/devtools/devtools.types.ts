import { DevToolsConfig, DevToolsMethods, ISignalTree } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { devTools } from './devtools';

type ExpectedSignature = (
  config?: DevToolsConfig
) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods;

type ActualSignature = typeof devTools;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// .with() preserves accumulated types via `this & TAdded` pattern.

export {};
