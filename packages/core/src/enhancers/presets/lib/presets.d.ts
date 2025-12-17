import type { TreeConfig } from '../../../lib/types';
export type TreePreset = 'basic' | 'performance' | 'development' | 'production';
export declare const TREE_PRESETS: Record<TreePreset, Partial<TreeConfig>>;
export declare function createPresetConfig(preset: TreePreset, overrides?: Partial<TreeConfig>): TreeConfig;
export declare function validatePreset(preset: TreePreset): boolean;
export declare function getAvailablePresets(): TreePreset[];
export declare function combinePresets(presets: TreePreset[], overrides?: Partial<TreeConfig>): TreeConfig;
export declare function createDevTree(overrides?: Partial<TreeConfig>): {
    readonly config: TreeConfig;
    readonly enhancer: (tree: import("../../memoization/lib/memoization").MemoizedSignalTree<unknown>) => import("../../memoization/lib/memoization").MemoizedSignalTree<unknown>;
};
