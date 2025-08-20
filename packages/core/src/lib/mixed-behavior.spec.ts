import { signalTree } from './signal-tree';

describe('SignalTree mixed behaviors', () => {
  it('interleaves update() and set() across nested branches', () => {
    const initial = { a: { b: { c: 1, d: 2 }, x: 100 }, meta: { flag: true } };
    const tree = signalTree(initial);
    tree.$.update((s) => ({ a: { x: s.a.x + 1 }, meta: { flag: !s.meta.flag } }));
    tree.$.a.b.c.set(10);
    tree.$.a.update((a) => ({ b: { d: a.b.d + 3 } }));
    tree.$.a.b.update((b) => ({ c: b.c + 10 }));
    expect(tree.$()).toEqual({ a: { b: { c: 20, d: 5 }, x: 101 }, meta: { flag: false } });
  });

  it('applies overlapping async updates (simulated concurrency)', async () => {
    const tree = signalTree({ value: 0, log: [] as number[] });
    const first = (async () => { await new Promise(r => setTimeout(r, 25)); tree.$.update(s => ({ value: s.value + 1, log: [...s.log, 1] })); })();
    const second = (async () => { await new Promise(r => setTimeout(r, 5)); tree.$.update(s => ({ value: s.value + 2, log: [...s.log, 2] })); })();
    await Promise.all([first, second]);
    expect(tree.$.value()).toBe(3);
    expect(tree.$.log()).toEqual([2,1]);
  });
});
