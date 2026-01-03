import { ISignalTree } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { TimeTravelMethods } from '../types';
import { timeTravel, TimeTravelConfig } from './time-travel';

type ExpectedSignature = (
  config?: TimeTravelConfig
) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;

type ActualSignature = typeof timeTravel;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: ISignalTree<{ count: number }>;
const enhanced = timeTravel({ maxHistorySize: 50 })(tree);

// All time travel methods should be available
enhanced.undo();
enhanced.redo();
const _canUndo: boolean = enhanced.canUndo();
const _canRedo: boolean = enhanced.canRedo();
const _history: unknown[] = enhanced.getHistory();
enhanced.resetHistory();
enhanced.jumpTo(0);
const _index: number = enhanced.getCurrentIndex();

// State should still be accessible
const _count: number = enhanced().count;

export {};
