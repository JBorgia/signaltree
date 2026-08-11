// Run BOTH baselining methods so the 19.98/0.896 vs 19.519/0.451 discrepancy is
// explained rather than arbitrated. One arm per process invocation.
//   argv: <arm: none|scalar|collection> <width> <baseline: before|after>
import {
  signalTree,
  entityMap,
  timeTravel,
} from '/Users/jonathanborgia/code/signaltree/dist/packages/core/dist/index.js';

const [arm, widthArg, baselineWhen] = process.argv.slice(2);
const width = Number(widthArg);
const STEPS = 50;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 3; i++) {
    global.gc();
    await tick();
  }
};
const heapMB = () => process.memoryUsage().heapUsed / 1024 / 1024;

let base;
if (baselineWhen === 'before') {
  await settle();
  base = heapMB();
}

const tree = signalTree({
  rows: entityMap({ selectId: (r) => r.id }),
  n: 0,
}).with(timeTravel({ maxHistorySize: 5000 }));
tree.$.rows.addMany(
  Array.from({ length: width }, (_, i) => ({
    id: String(i),
    v: i,
    label: 'row-' + i,
  }))
);
await tick();

if (baselineWhen === 'after') {
  await settle();
  base = heapMB();
}

if (arm !== 'none') {
  for (let i = 1; i <= STEPS; i++) {
    if (arm === 'scalar') tree.$.n.set(i);
    else tree.$.rows.updateOne('1', { v: 1000 + i });
    await tick();
  }
}
await settle();
const retained = heapMB() - base;
const landed = arm === 'scalar' ? tree.$.n() : tree.$.rows.all()[1]?.v;
if (arm !== 'none' && !landed)
  throw new Error('writes did not land — dead code');
console.log(
  JSON.stringify({
    arm,
    width,
    baselineWhen,
    retainedMB: +retained.toFixed(3),
    entries: tree.getHistory().length,
    reachable: tree.canUndo(),
  })
);
