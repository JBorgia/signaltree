import { lazy } from '../lazy';
import { signalTree } from './signal-tree';
import { status } from './markers/status';

describe('F2: markers in a lazy tree fail loudly', () => {
  it('throws in dev rather than silently dropping the value', () => {
    const big: Record<string, unknown> = { ns: { load: status(), q: 7 } };
    for (let i = 0; i < 300; i++) big[`f${i}`] = { a: i };

    const tree = signalTree(big, { lazy: lazy(), useLazySignals: true });

    // Before this guard, the marker stayed a placeholder: it read as an opaque
    // getter and vanished from every snapshot without a word.
    expect(() => JSON.stringify(tree())).toThrow(/ST2012/);
  });

  it('leaves marker-free lazy trees alone', () => {
    const big: Record<string, unknown> = { ns: { q: 7 } };
    for (let i = 0; i < 300; i++) big[`f${i}`] = { a: i };

    const tree = signalTree(big, { lazy: lazy(), useLazySignals: true });
    expect(() => JSON.stringify(tree())).not.toThrow();
    expect((tree() as { ns: { q: number } }).ns.q).toBe(7);
  });
});
