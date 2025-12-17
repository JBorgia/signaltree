import type { SignalTree, TreeConfig, TreePreset, EnhancerWithMeta, NodeAccessor } from './types';
export declare function isNodeAccessor(value: unknown): value is NodeAccessor<unknown>;
export declare function signalTree<T>(obj: T): SignalTree<T>;
export declare function signalTree<T>(obj: T, preset: TreePreset): SignalTree<T>;
export declare function signalTree<T>(obj: T, config: TreeConfig): SignalTree<T>;
export declare function signalTree<T extends Record<string, unknown>>(obj: Required<T>, configOrPreset?: TreeConfig | TreePreset): SignalTree<Required<T>>;
export declare function signalTree<T>(obj: T, configOrPreset?: TreeConfig | TreePreset): SignalTree<T>;
export declare function applyEnhancer<T, O>(tree: SignalTree<T>, enhancer: EnhancerWithMeta<SignalTree<T>, O>): O;
