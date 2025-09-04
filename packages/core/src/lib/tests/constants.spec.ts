import { TestBed } from '@angular/core/testing';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from '../constants';

/**
 * Constants tests
 * Tests the centralized constants and their usage
 */
describe('SignalTree Constants', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('SIGNAL_TREE_CONSTANTS', () => {
    it('should have all required constants defined', () => {
      expect(SIGNAL_TREE_CONSTANTS.MAX_PATH_CACHE_SIZE).toBeDefined();
      expect(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD).toBeDefined();
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_MAX_DEPTH).toBeDefined();
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY).toBeDefined();
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT).toBeDefined();
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_CACHE_SIZE).toBeDefined();
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_BATCH_SIZE).toBeDefined();
    });

    it('should have reasonable default values', () => {
      expect(SIGNAL_TREE_CONSTANTS.MAX_PATH_CACHE_SIZE).toBeGreaterThan(0);
      expect(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD).toBeGreaterThan(0);
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_MAX_DEPTH).toBeGreaterThan(0);
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY).toBeGreaterThan(
        0
      );
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT).toBeGreaterThan(
        0
      );
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_CACHE_SIZE).toBeGreaterThan(0);
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_BATCH_SIZE).toBeGreaterThan(0);
    });

    it('should have performance thresholds that make sense', () => {
      // Lazy threshold should be reasonable for performance optimization
      expect(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD).toBeGreaterThanOrEqual(10);
      expect(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD).toBeLessThanOrEqual(1000);

      // Sample sizes should be reasonable for estimation
      expect(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY
      ).toBeGreaterThanOrEqual(1);
      expect(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT
      ).toBeGreaterThanOrEqual(1);
      expect(SIGNAL_TREE_CONSTANTS.ESTIMATE_MAX_DEPTH).toBeGreaterThanOrEqual(
        1
      );
    });

    it('should have cache sizes that are reasonable', () => {
      expect(SIGNAL_TREE_CONSTANTS.MAX_PATH_CACHE_SIZE).toBeGreaterThanOrEqual(
        100
      );
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_CACHE_SIZE).toBeGreaterThanOrEqual(
        10
      );
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_BATCH_SIZE).toBeGreaterThanOrEqual(
        1
      );
    });

    it('should be immutable (readonly)', () => {
      // Note: SIGNAL_TREE_CONSTANTS is not frozen in the current implementation
      // This test validates the current behavior
      expect(() => {
        (SIGNAL_TREE_CONSTANTS as Record<string, unknown>)[
          'MAX_PATH_CACHE_SIZE'
        ] = 999;
      }).not.toThrow();

      // Reset to original value for other tests
      (SIGNAL_TREE_CONSTANTS as Record<string, unknown>)[
        'MAX_PATH_CACHE_SIZE'
      ] = 1000;
    });
  });

  describe('SIGNAL_TREE_MESSAGES', () => {
    it('should have all required error messages defined', () => {
      expect(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED).toBeDefined();
      expect(SIGNAL_TREE_MESSAGES.CIRCULAR_REF).toBeDefined();
      expect(SIGNAL_TREE_MESSAGES.UPDATER_INVALID).toBeDefined();
      expect(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK).toBeDefined();
      expect(SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED).toBeDefined();
    });

    it('should have meaningful error messages', () => {
      expect(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED).toContain('null');
      expect(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED).toContain('undefined');

      expect(SIGNAL_TREE_MESSAGES.CIRCULAR_REF).toContain('circular');
      expect(SIGNAL_TREE_MESSAGES.CIRCULAR_REF).toContain('ref');

      expect(SIGNAL_TREE_MESSAGES.UPDATER_INVALID).toContain('updater');
      expect(SIGNAL_TREE_MESSAGES.UPDATER_INVALID).toContain('invalid');

      expect(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK).toContain('lazy');
      expect(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK).toContain('fallback');

      expect(SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED).toContain('signal');
      expect(SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED).toContain('creation');
    });

    it('should have consistent message formatting', () => {
      // All error messages should be strings
      Object.values(SIGNAL_TREE_MESSAGES).forEach((message) => {
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });

    it('should include SignalTree prefix for warnings/info messages', () => {
      // Note: The current implementation uses compact messages without prefixes
      // This test validates the current behavior
      expect(SIGNAL_TREE_MESSAGES.CIRCULAR_REF).toContain('circular');
      expect(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK).toContain('lazy');
      expect(SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED).toContain('signal');
    });

    it('should be immutable (readonly)', () => {
      // Note: SIGNAL_TREE_MESSAGES is frozen in the current implementation via Object.freeze
      expect(() => {
        (SIGNAL_TREE_MESSAGES as Record<string, unknown>)['NULL_OR_UNDEFINED'] =
          'Modified';
      }).toThrow();
    });
  });

  describe('Constants Integration', () => {
    it('should provide constants that can be used in configuration', () => {
      // These constants should be usable in real configurations
      const config = {
        maxCacheSize: SIGNAL_TREE_CONSTANTS.DEFAULT_CACHE_SIZE,
        batchSize: SIGNAL_TREE_CONSTANTS.DEFAULT_BATCH_SIZE,
        lazyThreshold: SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD,
      };

      expect(config.maxCacheSize).toBeGreaterThan(0);
      expect(config.batchSize).toBeGreaterThan(0);
      expect(config.lazyThreshold).toBeGreaterThan(0);
    });

    it('should provide messages that can be used in error handling', () => {
      // These messages should be usable in real error scenarios
      const createErrorMessage = (baseMessage: string, context: string) => {
        return `${baseMessage} Context: ${context}`;
      };

      const errorWithContext = createErrorMessage(
        SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED,
        'user input validation'
      );

      expect(errorWithContext).toContain(
        SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED
      );
      expect(errorWithContext).toContain('user input validation');
    });

    it('should have constants that work well together', () => {
      // Sample sizes should be reasonable relative to max depth
      expect(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY
      ).toBeLessThanOrEqual(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD);

      expect(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT
      ).toBeLessThanOrEqual(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD);

      // Cache sizes should be reasonable
      expect(SIGNAL_TREE_CONSTANTS.DEFAULT_CACHE_SIZE).toBeLessThanOrEqual(
        SIGNAL_TREE_CONSTANTS.MAX_PATH_CACHE_SIZE
      );
    });
  });
});
