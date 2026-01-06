import { describe, expect, it } from 'vitest';

import { batchScope, getBatchDepth, isInBatchScope } from './batch-scope';

describe('batchScope', () => {
  it('should execute function synchronously', () => {
    let executed = false;
    batchScope(() => {
      executed = true;
    });
    expect(executed).toBe(true);
  });

  it('should track batch depth', () => {
    expect(getBatchDepth()).toBe(0);

    batchScope(() => {
      expect(getBatchDepth()).toBe(1);
      expect(isInBatchScope()).toBe(true);

      batchScope(() => {
        expect(getBatchDepth()).toBe(2);
        expect(isInBatchScope()).toBe(true);
      });

      expect(getBatchDepth()).toBe(1);
    });

    expect(getBatchDepth()).toBe(0);
    expect(isInBatchScope()).toBe(false);
  });

  it('should reset depth on error', () => {
    expect(getBatchDepth()).toBe(0);

    try {
      batchScope(() => {
        expect(getBatchDepth()).toBe(1);
        throw new Error('test error');
      });
    } catch {
      // Expected
    }

    expect(getBatchDepth()).toBe(0);
    expect(isInBatchScope()).toBe(false);
  });

  it('should handle nested errors', () => {
    expect(getBatchDepth()).toBe(0);

    try {
      batchScope(() => {
        batchScope(() => {
          throw new Error('nested error');
        });
      });
    } catch {
      // Expected
    }

    expect(getBatchDepth()).toBe(0);
  });
});
