import { ISignalTree } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { DevToolsConfig, DevToolsMethods } from '../types';
import { devTools } from './devtools';

type ExpectedSignature = (
  config?: DevToolsConfig
) => <Tree extends ISignalTree<any>>(tree: Tree) => Tree & DevToolsMethods;

type ActualSignature = typeof devTools;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: ISignalTree<{ count: number }>;
const enhanced = devTools({ name: 'Test' })(tree);

enhanced.connectDevTools();
enhanced.disconnectDevTools();

// State should still be accessible
const _count: number = enhanced().count;

export {};
