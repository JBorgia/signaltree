import { SignalTreeBase } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { DevToolsConfig, DevToolsMethods } from '../types';
import { withDevTools } from './devtools';

type ExpectedSignature = (
  config?: DevToolsConfig
) => <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & DevToolsMethods;

type ActualSignature = typeof withDevTools;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: SignalTreeBase<{ count: number }>;
const enhanced = withDevTools({ name: 'Test' })(tree);

enhanced.connectDevTools();
enhanced.disconnectDevTools();

// State should still be accessible
const _count: number = enhanced().count;

export {};
