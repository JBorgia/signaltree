import { describe, expect, it } from 'vitest';

import { createEntitySignal } from './entity-signal';

// Minimal PathNotifier stub
const pathNotifier = {
  notify: () => {
    /* empty */
  },
} as any;

describe('EntitySignal predicate caching', () => {
  it('returns the same signal for identical predicate references', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const isActive = (u: any) => u.active === true;

    const s1 = api.where(isActive);
    const s2 = api.where(isActive);

    expect(s1).toBe(s2);
  });

  it('does not conflate distinct predicate references', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const s1 = api.where((u: any) => u.active === true);
    const s2 = api.where((u: any) => u.active === true);

    expect(s1).not.toBe(s2);
  });

  it('cached computed reflects mutations', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const isActive = (u: any) => u.active === true;
    const s = api.where(isActive);

    expect(s()).toEqual([]);

    api.addOne({ id: 1, active: false } as any);
    expect(s()).toEqual([]);

    api.updateOne(1 as any, { active: true } as any);
    expect(s()).toEqual([{ id: 1, active: true }]);
  });
});
