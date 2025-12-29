import { createDevTree, createMinimalTree, createProdTree } from '../../../lib/presets';

import type { TreeConfig, TreePreset } from '../../../lib/types';
// Minimal compatibility shim exposing the legacy preset API expected by consumers/tests.
export const TREE_PRESETS: Record<TreePreset, Partial<TreeConfig>> = {} as any;

export function createPresetConfig(
  preset: TreePreset,
  overrides: Partial<TreeConfig> = {}
) {
  // Simple adapter: return combined overrides; real implementation may compose presets
  return { ...overrides } as TreeConfig;
}

export function validatePreset(preset: TreePreset) {
  return typeof preset === 'string';
}

export function getAvailablePresets(): TreePreset[] {
  return Object.keys(TREE_PRESETS) as TreePreset[];
}

export function combinePresets(
  presets: TreePreset[],
  overrides: Partial<TreeConfig> = {}
) {
  let combined: Partial<TreeConfig> = {};
  for (const p of presets) {
    combined = { ...combined, ...(TREE_PRESETS as any)[p] };
  }
  return { ...combined, ...overrides } as TreeConfig;
}

export { createDevTree, createProdTree, createMinimalTree };
