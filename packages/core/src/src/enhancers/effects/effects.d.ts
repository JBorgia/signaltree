import type { ISignalTree, EffectsMethods } from '../../lib/types';
export interface EffectsConfig {
    enabled?: boolean;
}
export declare function effects(config?: EffectsConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T>;
export declare function enableEffects(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T>;
export declare const withEffects: ((config?: EffectsConfig) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T>) & {
    enable: typeof enableEffects;
};
