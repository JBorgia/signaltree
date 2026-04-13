/**
 * @signaltree/core/presets
 *
 * Preset configurations for common SignalTree setups.
 * Import from '@signaltree/core/presets' to avoid bloating the main bundle.
 */
export {
  TREE_PRESETS,
  createPresetConfig,
  validatePreset,
  getAvailablePresets,
  combinePresets,
  createDevTree,
  createProdTree,
  createMinimalTree,
} from './enhancers/presets/lib/presets';

export type { TreePreset } from './lib/types';
