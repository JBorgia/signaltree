import { composeEnhancers } from '../../../lib/utils';

import type { TreeConfig } from '../../../lib/types';
export type TreePreset = 'basic' | 'performance' | 'development' | 'production';

/**
 * Pre-configured SignalTree configurations for common use cases.
 *
 * - **basic**: Minimal configuration with no advanced features
 * - **performance**: Optimized for speed with batching and memoization
 * - **development**: Full debugging features including time-travel and devtools
 * - **production**: Optimized for production with performance features only
 */
export const TREE_PRESETS: Record<TreePreset, Partial<TreeConfig>> = {
  basic: {
    batchUpdates: false,
    useMemoization: false,
    trackPerformance: false,
    enableTimeTravel: false,
    enableDevTools: false,
    debugMode: false,
  },
  performance: {
    batchUpdates: true,
    useMemoization: true,
    trackPerformance: false,
    enableTimeTravel: false,
    enableDevTools: false,
    debugMode: false,
    useShallowComparison: true,
    maxCacheSize: 200,
  },
  development: {
    batchUpdates: true,
    useMemoization: true,
    trackPerformance: true,
    enableTimeTravel: true,
    enableDevTools: true,
    debugMode: true,
    maxCacheSize: 100,
  },
  production: {
    batchUpdates: true,
    useMemoization: true,
    trackPerformance: false,
    enableTimeTravel: false,
    enableDevTools: false,
    debugMode: false,
    useShallowComparison: true,
    maxCacheSize: 200,
  },
};

/**
 * Helper function to create a tree configuration from a preset.
 * Can be used to start with a preset and then customize specific options.
 *
 * @param preset - The preset name to use as a base
 * @param overrides - Optional overrides to apply on top of the preset
 * @returns Complete tree configuration
 *
 * @example
 * ```typescript
 * // Use development preset with custom tree name
 * const config = createPresetConfig('development', { treeName: 'MyApp' });
 *
 * // Use performance preset but enable debug mode
 * const debugPerf = createPresetConfig('performance', { debugMode: true });
 * ```
 */
export function createPresetConfig(
  preset: TreePreset,
  overrides: Partial<TreeConfig> = {}
): TreeConfig {
  const baseConfig = TREE_PRESETS[preset];
  return {
    ...baseConfig,
    ...overrides,
  } as TreeConfig;
}

/**
 * Validates that a preset configuration is valid.
 * Useful for development-time checks.
 *
 * @param preset - The preset to validate
 * @returns True if valid, throws error if invalid
 */
export function validatePreset(preset: TreePreset): boolean {
  if (!TREE_PRESETS[preset]) {
    throw new Error(
      `Invalid preset: ${preset}. Valid presets are: ${Object.keys(
        TREE_PRESETS
      ).join(', ')}`
    );
  }
  return true;
}

/**
 * Gets the list of available preset names.
 *
 * @returns Array of preset names
 */
export function getAvailablePresets(): TreePreset[] {
  return Object.keys(TREE_PRESETS) as TreePreset[];
}

/**
 * Creates a custom preset by combining multiple existing presets.
 * Later presets in the array take precedence over earlier ones.
 *
 * @param presets - Array of presets to combine
 * @param overrides - Optional final overrides
 * @returns Combined configuration
 *
 * @example
 * ```typescript
 * // Combine basic preset with some performance features
 * const config = combinePresets(['basic', 'performance'], { enableDevTools: true });
 * ```
 */
export function combinePresets(
  presets: TreePreset[],
  overrides: Partial<TreeConfig> = {}
): TreeConfig {
  let combined: Partial<TreeConfig> = {};

  for (const preset of presets) {
    validatePreset(preset);
    combined = { ...combined, ...TREE_PRESETS[preset] };
  }

  return { ...combined, ...overrides } as TreeConfig;
}

/**
 * Convenience helper for creating a development-ready SignalTree.
 * Composes dev-only enhancers (devtools, time-travel, async) into a single
 * enhancer function that can be applied to a tree. This keeps packages
 * independent while offering a one-line dev onboarding.
 */
export function createDevTree(overrides: Partial<TreeConfig> = {}) {
  const config = createPresetConfig('development', overrides);

  // Compose enhancers in a predictable left-to-right order. We import the
  // enhancers lazily so consumers who don't install dev packages won't fail at
  // module-eval time.
  const enhancers: Array<(tree: unknown) => unknown> = [];

  // Helper to access CommonJS-style require at runtime without forcing Node types
  function tryRequire(id: string): unknown | undefined {
    const maybeReq = (
      globalThis as unknown as { require?: (id: string) => unknown }
    ).require;
    if (typeof maybeReq !== 'function') return undefined;
    try {
      return maybeReq(id);
    } catch {
      return undefined;
    }
  }

  try {
    const mod = tryRequire('@signaltree/devtools') as
      | { withDevtools?: unknown; withDevTools?: unknown; default?: unknown }
      | undefined;
    const withDevtools =
      mod && (mod.withDevtools ?? mod.withDevTools ?? mod.default ?? mod);
    if (typeof withDevtools === 'function')
      enhancers.push(withDevtools as (t: unknown) => unknown);
  } catch (e) {
    void e;
  }

  try {
    const mod = tryRequire('@signaltree/time-travel') as
      | { withTimeTravel?: unknown; default?: unknown }
      | undefined;
    const withTimeTravel = mod && (mod.withTimeTravel ?? mod.default ?? mod);
    if (typeof withTimeTravel === 'function')
      enhancers.push(withTimeTravel as (t: unknown) => unknown);
  } catch (e) {
    void e;
  }

  const composed = composeEnhancers(
    ...(enhancers as Array<(t: unknown) => unknown>)
  );

  return {
    config,
    enhancer: composed,
  } as const;
}
