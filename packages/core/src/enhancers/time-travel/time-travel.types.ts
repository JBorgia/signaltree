import { ISignalTree, TimeTravelMethods } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { timeTravel, TimeTravelConfig } from './time-travel';

type ExpectedSignature = (
  config?: TimeTravelConfig
) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;

type ActualSignature = typeof timeTravel;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// .with() preserves accumulated types via `this & TAdded` pattern.

export {};
