// Provenance for the ST2029 retention figures.
//
// Two questions this answers, both of which the pre-14.1.0 published table got wrong:
//   1. Is ~19.4 MB at 50k/50 a "worst case", or what ANY touch of the collection costs?
//      -> a FLOOR: sameRow and diffRows are identical. The ceiling is `allRows`.
//   2. What is the per-retained-pointer constant?
//      -> ~8.1-8.3 bytes at 10k-50k rows (a 64-bit pointer), NOT the published ~10.
//         At 1k rows it reads ~10.5 because fixed per-entry overhead is a large
//         fraction of a 0.5 MB total -- the linear model does not hold that low.
//
// Baseline is taken AFTER seeding, so the seeded collection is excluded and the
// figure is history retention alone. Baselining before seeding instead folds the
// collection into the number (7.62 MB for the scalar arm) -- that difference is
// why the spike's 0.896 MB never reproduced.
//
// argv: <shape> <width> <steps> [norec]
//   shape: scalar | sameRow | diffRows | allRows | n<K>   (n400 = 400 rows per write)
//   norec: pass literally to set `entityMap({ recordHistory: false })`
import { signalTree, entityMap, timeTravel } from '/Users/jonathanborgia/code/signaltree/dist/packages/core/dist/index.js';
const [shape, wArg, sArg, recArg] = process.argv.slice(2);
const width = Number(wArg), steps = Number(sArg);
const recordHistory = recArg !== 'norec';
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 3; i++) { global.gc(); await tick(); } };
const heap = () => process.memoryUsage().heapUsed / 1024 / 1024;

const tree = signalTree({
  rows: entityMap({ selectId: (r) => r.id, ...(recordHistory ? {} : { recordHistory: false }) }),
  n: 0,
}).with(timeTravel({ maxHistorySize: 10000 }));
tree.$.rows.addMany(Array.from({ length: width }, (_, i) => ({ id: String(i), v: i })));
await tick();
await settle();
const base = heap();

for (let s = 1; s <= steps; s++) {
  if (shape === 'scalar')        tree.$.n.set(s);
  else if (shape === 'sameRow')  tree.$.rows.updateOne('1', { v: 1000 + s });
  else if (shape === 'diffRows') tree.$.rows.updateOne(String(s % width), { v: 1000 + s });
  else if (shape === 'allRows')  tree.$.rows.updateWhere(() => true, { v: 1000 + s });
  else if (shape === 'mixed') {
    // Keeps history ACTIVE (one entry per step from the scalar) while also writing
    // the collection. This is the only fair `recordHistory: false` comparison: with
    // `diffRows` alone the excluded collection records nothing, so the arm measures
    // "no history at all" rather than "history without this collection".
    tree.$.n.set(s);
    tree.$.rows.updateOne(String(s % width), { v: 1000 + s });
  }
  else if (shape.startsWith('n')) {
    const k = Number(shape.slice(1));
    tree.$.rows.updateMany(Array.from({ length: k }, (_, i) => String(i)), { v: 1000 + s });
  }
  await tick();
}
await settle();
const retained = heap() - base;
if (tree.$.rows.count() !== width) throw new Error('collection changed size');
void tree.$.rows.all()[1].v;  // read back
const entries = tree.getHistory().length;
console.log(JSON.stringify({
  shape, width, steps, recordHistory,
  retainedMB: +retained.toFixed(3),
  entries,
  bytesPerPointer: shape === 'scalar' ? null : +(retained * 1048576 / (steps * width)).toFixed(2),
}));
