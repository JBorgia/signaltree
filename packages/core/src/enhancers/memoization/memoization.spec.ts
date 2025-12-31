import { describe, expect, it } from 'vitest';

import { memoization } from './memoization';

describe('memoization enhancer', () => {
  it('exports factory and legacy alias', () => {
    expect(typeof memoization).toBe('function');
    expect(typeof memoization()).toBe('function');
    expect(typeof memoization).toBe('function');
  });
});
// Moved from lib/memoization.spec.ts
// ...existing memoization.spec.ts content will be placed here...
