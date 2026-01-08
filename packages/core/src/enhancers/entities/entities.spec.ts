import { describe, expect, it } from 'vitest';

import { enableEntities, entities, highPerformanceEntities } from './entities';

describe('entities enhancer', () => {
  it('exports symbol and aliases but calling it throws', () => {
    expect(typeof entities).toBe('function');
    expect(typeof enableEntities).toBe('function');
    expect(typeof highPerformanceEntities).toBe('function');

    expect(() => entities()).toThrow(/entities\(\) has been removed/i);
  });
});
