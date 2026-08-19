import { lazy } from '../lazy';
import { signalTree } from './signal-tree';

describe('F2: markers in a lazy tree fail loudly', () => {
  // WITHDRAWN WITH STATUS-DEL — "throws in dev rather than silently dropping the
  // value". `status()` was the ONLY marker specimen here, and the property under
  // test (a marker in a lazy tree fails loudly, ST2011) belongs to generic marker
  // machinery whose survival is UNPROVEN. Not migrated to another marker: that
  // would manufacture ownership. The generic-marker derivation decides whether
  // replacement coverage is warranted. Production machinery is unchanged.

  it('leaves marker-free lazy trees alone', () => {
    const big: Record<string, unknown> = { ns: { q: 7 } };
    for (let i = 0; i < 300; i++) big[`f${i}`] = { a: i };

    const tree = signalTree(big, { lazy: lazy(), useLazySignals: true });
    expect(() => JSON.stringify(tree())).not.toThrow();
    expect((tree() as { ns: { q: number } }).ns.q).toBe(7);
  });
});
