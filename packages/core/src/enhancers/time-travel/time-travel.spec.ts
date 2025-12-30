import { describe, expect, it } from 'vitest';
import { enableTimeTravel, timeTravel, withTimeTravel } from './time-travel';

describe('time-travel enhancer', () => {
  it('exports factory and aliases', () => {
    expect(typeof timeTravel).toBe('function');
    expect(typeof timeTravel()).toBe('function');
    expect(typeof withTimeTravel).toBe('function');
    expect(typeof enableTimeTravel).toBe('function');
  });
});
