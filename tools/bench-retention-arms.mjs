// Is 19.5 MB a "worst case", or is it what ANY touch of the collection costs?
// argv: <shape> <width> <steps>
//   shape: none | scalar | sameRow | diffRows | allRows
import { signalTree, entityMap, timeTravel } from '/Users/jonathanborgia/code/signaltree/dist/packages/core/dist/index.js';
const [shape, wArg, sArg] = process.argv.slice(2);
const width = Number(wArg), steps = Number(sArg);
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 3; i++) { global.gc(); await tick(); } };
const heap = () => process.memoryUsage().heapUsed / 1024 / 1024;

const tree = signalTree({ rows: entityMap({ selectId: (r) => r.id }), n: 0 })
  .with(timeTravel({ maxHistorySize: 10000 }));
tree.$.rows.addMany(Array.from({ length: width }, (_, i) => ({ id: String(i), v: i })));
await tick();
await settle();
const base = heap();

for (let s = 1; s <= steps; s++) {
  if (shape === 'scalar')        tree.$.n.set(s);
  else if (shape === 'sameRow')  tree.$.rows.updateOne('1', { v: 1000 + s });
  else if (shape === 'diffRows') tree.$.rows.updateOne(String(s % width), { v: 1000 + s });
  else if (shape === 'allRows')  tree.$.rows.updateWhere(() => true, { v: 1000 + s });
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
console.log(JSON.stringify({ shape, width, steps, retainedMB: +retained.toFixed(3), entries: tree.getHistory().length }));
