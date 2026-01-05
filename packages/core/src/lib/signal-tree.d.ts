import type { TreeConfig, NodeAccessor, ISignalTree } from './types';
export declare function isNodeAccessor(value: unknown): value is NodeAccessor<unknown>;
export declare function signalTree<T extends object>(initialState: T, config?: TreeConfig): ISignalTree<T>;
