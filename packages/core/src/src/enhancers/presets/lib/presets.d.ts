import { createDevTree, createMinimalTree, createProdTree } from '../../../lib/presets';
import type { TreeConfig, TreePreset } from '../../../lib/types';
export declare const TREE_PRESETS: Record<TreePreset, Partial<TreeConfig>>;
export declare function createPresetConfig(preset: TreePreset, overrides?: Partial<TreeConfig>): TreeConfig;
export declare function validatePreset(preset: TreePreset): boolean;
export declare function getAvailablePresets(): TreePreset[];
export declare function combinePresets(presets: TreePreset[], overrides?: Partial<TreeConfig>): TreeConfig;
export { createDevTree, createProdTree, createMinimalTree };
