import { describe, expect, it } from 'vitest';

import { cleanupMemoizationCache } from './memoization';

describe('memoization API', () => {
  it('cleanupMemoizationCache is callable and idempotent', () => {
    expect(() => cleanupMemoizationCache()).not.toThrow();
    // Calling again should be a no-op
    expect(() => cleanupMemoizationCache()).not.toThrow();
  });
});
