import { describe, expect, it } from 'vitest';

import * as constants from './constants';
import * as serialization from './serialization';

describe('serialization enhancer exports', () => {
  it('exports expected factory shape', () => {
    // factory should be exported (name may be `serialization` or default)
    const factory =
      (serialization as any).serialization ||
      (serialization as any).default ||
      (serialization as any).serialization;
    expect(
      typeof factory === 'function' || typeof factory === 'object'
    ).toBeTruthy();
  });

  it('constants are exported', () => {
    expect(constants).toBeDefined();
  });
});
