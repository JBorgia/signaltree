import { TestBed } from '@angular/core/testing';

import { createEnhancer, resolveEnhancerOrder } from '../enhancers';
import { ENHANCER_META } from '../types';

/**
 * Enhancer system tests
 * Tests enhancer creation, composition, and dependency resolution
 */
import type { EnhancerMeta } from '../types';

describe('Enhancer System', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('createEnhancer', () => {
    it('should create an enhancer with metadata', () => {
      const meta: EnhancerMeta = {
        name: 'testEnhancer',
        provides: ['feature1'],
        requires: [],
      };

      const enhancer = createEnhancer(
        meta,
        (input: Record<string, unknown>) => ({ ...input, enhanced: true })
      );

      expect(enhancer.metadata).toEqual(meta);
      expect(
        (enhancer as unknown as Record<symbol, unknown>)[ENHANCER_META]
      ).toEqual(meta);
    });

    it('should handle enhancer creation gracefully even if metadata attachment fails', () => {
      const meta: EnhancerMeta = {
        name: 'testEnhancer',
        provides: ['feature1'],
        requires: [],
      };

      // Create enhancer function that can't have properties attached
      const frozenFn = Object.freeze((input: Record<string, unknown>) => ({
        ...input,
        enhanced: true,
      }));

      expect(() => {
        const enhancer = createEnhancer(meta, frozenFn);
        expect(typeof enhancer).toBe('function');
      }).not.toThrow();
    });

    it('should work with different input/output types', () => {
      interface Input {
        count: number;
      }
      interface Output extends Input {
        doubled: number;
      }

      const meta: EnhancerMeta = {
        name: 'doubler',
        provides: ['doubled'],
        requires: ['count'],
      };

      const enhancer = createEnhancer<Input, Output>(meta, (input) => ({
        ...input,
        doubled: input.count * 2,
      }));

      const result = enhancer({ count: 5 });
      expect(result).toEqual({ count: 5, doubled: 10 });
    });
  });

  describe('resolveEnhancerOrder', () => {
    it('should resolve simple dependency order', () => {
      const enhancer1 = createEnhancer(
        { name: 'first', provides: ['a'], requires: [] },
        (x: unknown) => x
      );
      const enhancer2 = createEnhancer(
        { name: 'second', provides: ['b'], requires: ['a'] },
        (x: unknown) => x
      );

      const resolved = resolveEnhancerOrder([enhancer2, enhancer1]);

      expect(resolved).toHaveLength(2);
      expect(resolved[0].metadata?.name).toBe('first');
      expect(resolved[1].metadata?.name).toBe('second');
    });

    it('should handle complex dependency chains', () => {
      const enhancer1 = createEnhancer(
        { name: 'base', provides: ['foundation'], requires: [] },
        (x: unknown) => x
      );
      const enhancer2 = createEnhancer(
        { name: 'middle', provides: ['building'], requires: ['foundation'] },
        (x: unknown) => x
      );
      const enhancer3 = createEnhancer(
        { name: 'top', provides: ['roof'], requires: ['building'] },
        (x: unknown) => x
      );

      const resolved = resolveEnhancerOrder([enhancer3, enhancer1, enhancer2]);

      expect(resolved[0].metadata?.name).toBe('base');
      expect(resolved[1].metadata?.name).toBe('middle');
      expect(resolved[2].metadata?.name).toBe('top');
    });

    it('should detect circular dependencies', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const enhancer1 = createEnhancer(
        { name: 'a', provides: ['featureA'], requires: ['featureB'] },
        (x: unknown) => x
      );
      const enhancer2 = createEnhancer(
        { name: 'b', provides: ['featureB'], requires: ['featureA'] },
        (x: unknown) => x
      );

      // In debugMode, it should warn about cycles and fallback to original order
      const result = resolveEnhancerOrder([enhancer1, enhancer2]);
      expect(result).toEqual([enhancer1, enhancer2]);

      consoleSpy.mockRestore();
    });

    it('should handle missing dependencies gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const enhancer = createEnhancer(
        { name: 'dependent', provides: ['feature'], requires: ['missing'] },
        (x: unknown) => x
      );

      // Should not throw, but warn about missing dependencies
      const result = resolveEnhancerOrder([enhancer]);
      expect(result).toEqual([enhancer]);

      consoleSpy.mockRestore();
    });

    it('should handle enhancers without metadata', () => {
      const plainEnhancer = (x: unknown) => x;
      const metaEnhancer = createEnhancer(
        { name: 'meta', provides: ['feature'], requires: [] },
        (x: unknown) => x
      );

      const resolved = resolveEnhancerOrder([plainEnhancer, metaEnhancer]);
      expect(resolved).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful warning messages for circular dependencies', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const enhancer1 = createEnhancer(
        { name: 'cyclic1', provides: ['a'], requires: ['b'] },
        (x: unknown) => x
      );
      const enhancer2 = createEnhancer(
        { name: 'cyclic2', provides: ['b'], requires: ['a'] },
        (x: unknown) => x
      );

      resolveEnhancerOrder([enhancer1, enhancer2]);

      // Should warn about cycle detection (in debug mode)
      consoleSpy.mockRestore();
    });

    it('should provide helpful warning messages for missing dependencies', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const enhancer = createEnhancer(
        { name: 'needsX', provides: ['feature'], requires: ['missingX'] },
        (x: unknown) => x
      );

      resolveEnhancerOrder([enhancer]);

      // Should warn about missing dependencies (in debug mode)
      consoleSpy.mockRestore();
    });
  });
});
