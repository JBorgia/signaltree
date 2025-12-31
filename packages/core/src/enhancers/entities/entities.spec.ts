import { describe, expect, it } from 'vitest';

import { enableEntities, entities } from './entities';

describe('entities enhancer', () => {
  it('exports factory and aliases', () => {
    expect(typeof entities).toBe('function');
    expect(typeof enableEntities).toBe('function');
    expect(typeof entities).toBe('function');

    const f = entities();
    expect(typeof f).toBe('function');
  });
});
