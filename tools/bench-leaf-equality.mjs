#!/usr/bin/env node
/**
 * Per-leaf equality (`compared()` / `byKeys()`) and the materialisation memo.
 *
 * These figures are quoted on `llms.txt`, `llms-full.txt` and
 * `packages/core/README.md` — roughly 50 numbers across the three — and until
 * this file existed NOTHING produced them. They were the same class of claim as
 * the "Performance targets (Sept 2025)" table, which turned out to be wrong by
 * 10x-1000x once someone finally measured it.
 *
 * A number on a surface an AI agent quotes verbatim needs a generator more than
 * most, not less: it gets repeated into other people's code review.
 *
 *   node tools/bench-leaf-equality.mjs
 *   node tools/bench-leaf-equality.mjs --json
 */
import {
  signalTree,
  compared,
  byKeys,
  deepEqual,
} from '../dist/packages/core/dist/index.js';

/**
 * The baseline is `compared(value, deepEqual)`, NOT a bare object.
 *
 * A bare object becomes a BRANCH — `tree.$.user.set` does not exist on one,
 * which is the whole reason `compared()` also makes its position a leaf. Using
 * a `null`-initialised leaf as the baseline would compare two different node
 * shapes and attribute the difference to the comparator. This way both arms are
 * the same leaf; only the equality function differs.
 */

const WRITES = 200_000;
const ROUNDS = 7;

let sink = 0;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** ns per write, median of ROUNDS, one warm-up round discarded. */
function perWrite(makeTree, nextValue) {
  const times = [];
  for (let r = 0; r <= ROUNDS; r++) {
    const tree = makeTree();
    const leaf = tree.$.user;
    const t = process.hrtime.bigint();
    for (let i = 0; i < WRITES; i++) leaf.set(nextValue(i));
    const ns = Number(process.hrtime.bigint() - t) / WRITES;
    sink += leaf() ? 1 : 0;
    if (r > 0) times.push(ns);
  }
  return median(times);
}

const base = { id: 1, name: 'Ada', email: 'ada@example.com', version: 1 };

// ── 1. An object leaf, written with a value that genuinely changes ───────────
const changing = (i) => ({ ...base, version: i });

const deepEqualChanging = perWrite(
  () => signalTree({ user: compared(base, deepEqual) }),
  changing
);
const comparedChanging = perWrite(
  () => signalTree({ user: compared(base, byKeys('id', 'version')) }),
  changing
);
const objectIsChanging = perWrite(
  () => signalTree({ user: compared(base, Object.is) }),
  changing
);

// ── 2. The re-fetch shape: an EQUIVALENT value with a NEW identity ───────────
// deepEqual must walk the whole object to conclude nothing changed; byKeys
// looks at two fields. This is the case the feature exists for.
const refetch = () => ({ ...base });

const deepEqualRefetch = perWrite(
  () => signalTree({ user: compared(base, deepEqual) }),
  refetch
);
const comparedRefetch = perWrite(
  () => signalTree({ user: compared(base, byKeys('id', 'version')) }),
  refetch
);

// ── 3. A primitive leaf — where specialising is a MISTAKE ────────────────────
function perWritePrimitive(makeTree) {
  const times = [];
  for (let r = 0; r <= ROUNDS; r++) {
    const tree = makeTree();
    const leaf = tree.$.n;
    const t = process.hrtime.bigint();
    for (let i = 0; i < WRITES; i++) leaf.set(i);
    const ns = Number(process.hrtime.bigint() - t) / WRITES;
    sink += leaf();
    if (r > 0) times.push(ns);
  }
  return median(times);
}
// Bare leaf, NOT compared(0, deepEqual): on a primitive the real choice is
// "leave it alone" vs "reach for compared()", so the baseline has to be the
// default path with no wrapper.
const primDeepEqual = perWritePrimitive(() => signalTree({ n: 0 }));
const primObjectIs = perWritePrimitive(() =>
  signalTree({ n: compared(0, Object.is) })
);

// ── 4. The materialisation memo ──────────────────────────────────────────────
function buildWide(leaves) {
  const state = {};
  for (let i = 0; i < leaves / 10; i++) {
    const branch = {};
    for (let j = 0; j < 10; j++) branch[`f${j}`] = `${i}_${j}`;
    state[`b${i}`] = branch;
  }
  return state;
}

function readWholeState() {
  const tree = signalTree(buildWide(10_000));
  const leaf = tree.$.b0.f0;
  for (let i = 0; i < 50; i++) {
    leaf.set(`w${i}`);
    sink += Object.keys(tree()).length;
  }

  const afterWrite = [];
  const unchanged = [];
  for (let r = 0; r < ROUNDS; r++) {
    // Time `tree()` ALONE. An earlier version timed `Object.keys(tree())`,
    // which walks 1,000 branches and swamped the thing being measured — the
    // unchanged read came out at 15.8µs when the actual call is ~nanoseconds.
    leaf.set(`x${r}`);
    let t = process.hrtime.bigint();
    const a = tree();
    afterWrite.push(Number(process.hrtime.bigint() - t) / 1000);
    sink += a ? 1 : 0;

    t = process.hrtime.bigint();
    const b = tree(); // nothing changed since the line above
    unchanged.push(Number(process.hrtime.bigint() - t) / 1000);
    sink += b === a ? 1 : 0; // identical object, by reference
  }
  return { afterWrite: median(afterWrite), unchanged: median(unchanged) };
}
const memo = readWholeState();

const results = {
  objectLeafChanging: {
    deepEqual: deepEqualChanging,
    byKeys: comparedChanging,
    objectIs: objectIsChanging,
  },
  objectLeafRefetch: {
    deepEqual: deepEqualRefetch,
    byKeys: comparedRefetch,
  },
  primitiveLeaf: { deepEqual: primDeepEqual, objectIs: primObjectIs },
  materialisation: memo,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const ns = (v) => `${v.toFixed(1)}ns`;
  const x = (a, b) => `${(a / b).toFixed(1)}x`;
  console.log(
    `\nPer-leaf equality — ${WRITES.toLocaleString()} writes to one leaf, ` +
      `median of ${ROUNDS} rounds\n`
  );
  console.log(`  OBJECT leaf, value genuinely changes each write`);
  console.log(`    deepEqual (default)      ${ns(deepEqualChanging)}`);
  console.log(
    `    byKeys('id','version')   ${ns(comparedChanging)}   ` +
      `${x(deepEqualChanging, comparedChanging)} faster`
  );
  console.log(`    Object.is (the floor)    ${ns(objectIsChanging)}`);
  console.log(`\n  OBJECT leaf, re-fetched: equivalent value, NEW identity`);
  console.log(`    deepEqual (default)      ${ns(deepEqualRefetch)}`);
  console.log(
    `    byKeys('id','version')   ${ns(comparedRefetch)}   ` +
      `${x(deepEqualRefetch, comparedRefetch)} faster`
  );
  console.log(`\n  PRIMITIVE leaf — specialising here is a mistake`);
  console.log(`    deepEqual (default)      ${ns(primDeepEqual)}`);
  console.log(
    `    Object.is                ${ns(primObjectIs)}   ` +
      `${
        primObjectIs > primDeepEqual
          ? 'SLOWER — deepEqual short-circuits on `a === b`'
          : 'faster'
      }`
  );
  console.log(`\n  MATERIALISATION MEMO — read whole state, 10,000 leaves`);
  console.log(`    after a one-leaf write   ${memo.afterWrite.toFixed(1)}µs`);
  console.log(
    `    with NOTHING changed     ${memo.unchanged.toFixed(3)}µs   ` +
      `(the identical object is returned)`
  );
  console.log(
    `\n  Absolute values are hardware-specific; the RATIOS are the claim.\n`
  );
}

if (sink === -1) console.log(sink);
