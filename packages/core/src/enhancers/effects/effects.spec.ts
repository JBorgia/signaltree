import { describe, expect, it } from 'vitest';

import { effects, enableEffects } from './effects';

describe('effects enhancer', () => {
  it('exports a factory that returns an enhancer', () => {
    expect(typeof effects).toBe('function');
    const f = effects();
    expect(typeof f).toBe('function');
  });

  it('aliases exist for legacy/utility exports', () => {
    expect(typeof enableEffects).toBe('function');
    expect(typeof effects).toBe('function');
  });
});
