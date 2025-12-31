import { describe, expect, it } from 'vitest';

import { TYPE_MARKERS } from './constants';

describe('serialization constants', () => {
  it('exports expected type markers', () => {
    expect(TYPE_MARKERS.DATE).toBe('§d');
    expect(TYPE_MARKERS.NAN).toBe('§n');
    expect(TYPE_MARKERS.UNDEFINED).toBe('§u');
  });
});
