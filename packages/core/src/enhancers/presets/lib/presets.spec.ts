import {
  TREE_PRESETS,
  createPresetConfig,
  validatePreset,
  getAvailablePresets,
  combinePresets,
  type TreePreset,
} from './presets';

describe('Presets', () => {
  describe('TREE_PRESETS', () => {
    it('should have all required presets', () => {
      expect(TREE_PRESETS.basic).toBeDefined();
      expect(TREE_PRESETS.performance).toBeDefined();
      expect(TREE_PRESETS.development).toBeDefined();
      expect(TREE_PRESETS.production).toBeDefined();
    });

    it('should have basic preset with minimal features', () => {
      const basic = TREE_PRESETS.basic;
      expect(basic.batchUpdates).toBe(false);
      expect(basic.useMemoization).toBe(false);
      expect(basic.trackPerformance).toBe(false);
      expect(basic.enableTimeTravel).toBe(false);
      expect(basic.enableDevTools).toBe(false);
      expect(basic.debugMode).toBe(false);
    });

    it('should have performance preset optimized for speed', () => {
      const performance = TREE_PRESETS.performance;
      expect(performance.batchUpdates).toBe(true);
      expect(performance.useMemoization).toBe(true);
      expect(performance.trackPerformance).toBe(false);
      expect(performance.enableTimeTravel).toBe(false);
      expect(performance.enableDevTools).toBe(false);
      expect(performance.debugMode).toBe(false);
      expect(performance.useShallowComparison).toBe(true);
      expect(performance.maxCacheSize).toBe(200);
    });

    it('should have development preset with all debugging features', () => {
      const development = TREE_PRESETS.development;
      expect(development.batchUpdates).toBe(true);
      expect(development.useMemoization).toBe(true);
      expect(development.trackPerformance).toBe(true);
      expect(development.enableTimeTravel).toBe(true);
      expect(development.enableDevTools).toBe(true);
      expect(development.debugMode).toBe(true);
      expect(development.maxCacheSize).toBe(100);
    });

    it('should have production preset optimized for production', () => {
      const production = TREE_PRESETS.production;
      expect(production.batchUpdates).toBe(true);
      expect(production.useMemoization).toBe(true);
      expect(production.trackPerformance).toBe(false);
      expect(production.enableTimeTravel).toBe(false);
      expect(production.enableDevTools).toBe(false);
      expect(production.debugMode).toBe(false);
      expect(production.useShallowComparison).toBe(true);
      expect(production.maxCacheSize).toBe(200);
    });
  });

  describe('createPresetConfig', () => {
    it('should create config from preset', () => {
      const config = createPresetConfig('basic');
      expect(config.batchUpdates).toBe(false);
      expect(config.useMemoization).toBe(false);
    });

    it('should apply overrides on top of preset', () => {
      const config = createPresetConfig('basic', {
        treeName: 'MyApp',
        debugMode: true,
      });

      expect(config.batchUpdates).toBe(false); // From preset
      expect(config.treeName).toBe('MyApp'); // From override
      expect(config.debugMode).toBe(true); // Override wins
    });

    it('should override preset values with provided overrides', () => {
      const config = createPresetConfig('performance', {
        enableDevTools: true,
        maxCacheSize: 500,
      });

      expect(config.batchUpdates).toBe(true); // From preset
      expect(config.enableDevTools).toBe(true); // Override
      expect(config.maxCacheSize).toBe(500); // Override
    });
  });

  describe('validatePreset', () => {
    it('should return true for valid presets', () => {
      expect(validatePreset('basic')).toBe(true);
      expect(validatePreset('performance')).toBe(true);
      expect(validatePreset('development')).toBe(true);
      expect(validatePreset('production')).toBe(true);
    });

    it('should throw error for invalid preset', () => {
      expect(() => validatePreset('invalid' as TreePreset)).toThrow(
        'Invalid preset: invalid. Valid presets are: basic, performance, development, production'
      );
    });
  });

  describe('getAvailablePresets', () => {
    it('should return all available preset names', () => {
      const presets = getAvailablePresets();
      expect(presets).toEqual([
        'basic',
        'performance',
        'development',
        'production',
      ]);
    });
  });

  describe('combinePresets', () => {
    it('should combine multiple presets', () => {
      const config = combinePresets(['basic', 'performance']);

      // Should have performance features (later preset wins)
      expect(config.batchUpdates).toBe(true);
      expect(config.useMemoization).toBe(true);
      expect(config.useShallowComparison).toBe(true);

      // Should not have dev features
      expect(config.enableDevTools).toBe(false);
      expect(config.enableTimeTravel).toBe(false);
    });

    it('should apply overrides after combining presets', () => {
      const config = combinePresets(['performance'], {
        enableDevTools: true,
        treeName: 'CombinedApp',
      });

      expect(config.batchUpdates).toBe(true); // From performance
      expect(config.enableDevTools).toBe(true); // From override
      expect(config.treeName).toBe('CombinedApp'); // From override
    });

    it('should handle multiple presets with later ones taking precedence', () => {
      const config = combinePresets(['basic', 'development']);

      // Development should win over basic
      expect(config.batchUpdates).toBe(true);
      expect(config.enableTimeTravel).toBe(true);
      expect(config.debugMode).toBe(true);
    });

    it('should validate all presets before combining', () => {
      expect(() =>
        combinePresets(['basic', 'invalid' as TreePreset])
      ).toThrow();
    });
  });
});
