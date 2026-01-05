import type { ISignalTree, TreeConfig, BatchingConfig, MemoizationConfig, TimeTravelConfig, DevToolsConfig, BatchingMethods, MemoizationMethods, TimeTravelMethods, DevToolsMethods, EffectsMethods, EntitiesEnabled } from './types';
export interface DevTreeConfig extends TreeConfig {
    effects?: Record<string, never>;
    batching?: BatchingConfig;
    memoization?: MemoizationConfig;
    timeTravel?: TimeTravelConfig;
    devTools?: DevToolsConfig;
    entities?: Record<string, never>;
}
export interface ProdTreeConfig extends TreeConfig {
    effects?: Record<string, never>;
    batching?: BatchingConfig;
    memoization?: MemoizationConfig;
    entities?: Record<string, never>;
}
export interface MinimalTreeConfig extends TreeConfig {
    effects?: Record<string, never>;
}
export type FullSignalTree<T> = ISignalTree<T> & EffectsMethods<T> & BatchingMethods & MemoizationMethods<T> & EntitiesEnabled & TimeTravelMethods & DevToolsMethods;
export type ProdSignalTree<T> = ISignalTree<T> & EffectsMethods<T> & BatchingMethods & MemoizationMethods<T> & EntitiesEnabled;
export type MinimalSignalTree<T> = ISignalTree<T> & EffectsMethods<T>;
export declare function createDevTree<T extends object>(initialState: T, config?: DevTreeConfig): FullSignalTree<T>;
export declare function createDevTree(): {
    enhancer: <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T> & BatchingMethods<T> & MemoizationMethods<T> & EntitiesEnabled & TimeTravelMethods<T> & DevToolsMethods;
};
export declare function createProdTree<T extends object>(initialState: T, config?: ProdTreeConfig): ProdSignalTree<T>;
export declare function createMinimalTree<T extends object>(initialState: T, config?: MinimalTreeConfig): MinimalSignalTree<T>;
export declare const devTree: typeof createDevTree;
export declare const prodTree: typeof createProdTree;
export declare const minimalTree: typeof createMinimalTree;
export declare function buildTree<T extends object>(initialState: T, config?: TreeConfig): {
    add<R>(enhancer: (t: ISignalTree<T>) => R): any;
    done(): ISignalTree<T>;
};
