/**
 * SignalTree data-model profile — Track F of the 2026-08 state/data-model spike.
 *
 * Measures SignalTree AGAINST ITSELF (and against hand-written plain-JS
 * baselines), not against a competitor. The question is not "who wins" but
 * "what does our data model actually cost, and where".
 *
 * Method (every prior wrong number in this repo came from violating one of
 * these):
 *  - arms are INTERLEAVED in one process and their order is ROTATED per sample,
 *    so JIT warmup / GC / thermal drift hits every arm equally;
 *  - medians + IQR, never a single run;
 *  - every arm is warmed before the clock starts;
 *  - where the workload mutates state, each arm gets a FRESH fixture built
 *    outside the timed region.
 *
 * Run:
 *   node --expose-gc scripts/benchmarks/data-model-profile.mjs [section...]
 * Sections: write read collection timetravel construct entitymap equality
 * (default: all). --expose-gc is required for the memory numbers; without it
 * they are reported as n/a.
 */
import { computed, signal } from '@angular/core';

import {
  entityMap,
  signalTree,
  timeTravel,
} from '../../dist/packages/core/dist/index.js';
import { deepEqual } from '../../dist/packages/shared/dist/index.js';

// ---------------------------------------------------------------- harness ---

const SAMPLES = 15;
const WARMUP = 3;
const gc = globalThis.gc ?? null;

const sections = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const want = (s) => sections.length === 0 || sections.includes(s);

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { med: q(0.5), iqr: q(0.75) - q(0.25), min: s[0] };
}

/**
 * Interleaved A/B/…/N race.
 * @param arms  Array<[label, factory]> where factory() => timedFn.
 *              The factory runs ONCE, outside the clock (fixture setup).
 * @param reps  how many times to invoke timedFn per sample
 */
function race(title, arms, reps = 1, { unit = 'ms', per = 1 } = {}) {
  const built = arms.map(([label, factory]) => [label, factory()]);
  for (let w = 0; w < WARMUP; w++) for (const [, f] of built) f();
  const res = built.map(() => []);
  for (let s = 0; s < SAMPLES; s++) {
    for (let k = 0; k < built.length; k++) {
      const i = (k + s) % built.length;
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) built[i][1]();
      res[i].push((performance.now() - t0) / reps);
    }
  }
  const rows = built.map(([label], i) => ({ label, ...stats(res[i]) }));
  const base = rows[0].med;
  const w = Math.max(...rows.map((r) => r.label.length));
  console.log(`\n${title}`);
  for (const r of rows) {
    const scale = unit === 'us' ? 1000 : 1;
    const v = (r.med / per) * scale;
    const iqr = (r.iqr / per) * scale;
    const rel =
      rows.length > 1
        ? `  ${(r.med / base).toFixed(2)}x vs ${rows[0].label}`
        : '';
    console.log(
      `  ${r.label.padEnd(w)}  ${v.toFixed(v < 1 ? 4 : 3)}${unit}  (IQR ${iqr.toFixed(iqr < 1 ? 4 : 3)})${rel}`
    );
  }
  return rows;
}

/**
 * Retained-heap probe. Builds `copies` live instances into a MODULE-SCOPE array
 * (so escape analysis cannot drop them), full-GCs on both sides, and returns
 * median bytes per instance across `runs`. Null without --expose-gc.
 */
const KEEP = [];
function retained(build, { copies = 3, runs = 3 } = {}) {
  if (!gc) return null;
  const samples = [];
  for (let r = 0; r < runs; r++) {
    KEEP.length = 0;
    gc(); gc(); gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < copies; i++) KEEP.push(build());
    gc(); gc(); gc();
    const after = process.memoryUsage().heapUsed;
    samples.push((after - before) / copies);
  }
  KEEP.length = 0;
  gc(); gc();
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const kb = (b) => (b == null ? 'n/a' : `${(b / 1024).toFixed(1)}KB`);

// --------------------------------------------------------------- fixtures ---

/** Nested chain: { level: { level: … { value, data } } } */
const nested = (d) => (d === 0 ? { value: 0, data: 'leaf' } : { level: nested(d - 1) });
const walk = (root, d) => {
  let cur = root;
  for (let j = 0; j < d; j++) cur = cur.level;
  return cur;
};

/** Wide object with exactly `n` primitive leaves, 10 per group. */
function wide(n) {
  const out = {};
  for (let g = 0; g < n / 10; g++) {
    const grp = {};
    for (let f = 0; f < 10; f++) grp[`f${f}`] = g * 10 + f;
    out[`g${g}`] = grp;
  }
  return out;
}

const mkItems = (n) => Array.from({ length: n }, (_, i) => ({ id: i, value: i, name: `n${i}` }));

// ================================================================== PART 1 ===

if (want('write')) {
  console.log('\n=== 1a. PARTIAL WRITE — walked path vs held leaf reference ===');
  // NOTE: a leaf with no live consumer skips notification entirely, so a
  // consumer arm is included at each depth — that is the shape real code has.
  const UPDATES = 10000;
  for (const depth of [1, 5, 15]) {
    race(
      `depth ${depth}  (${UPDATES} writes, per-write)`,
      [
        [
          'walked each time',
          () => {
            const t = signalTree(nested(depth));
            return () => {
              for (let i = 0; i < UPDATES; i++) walk(t.$, depth).value.set(i);
            };
          },
        ],
        [
          'held leaf ref',
          () => {
            const t = signalTree(nested(depth));
            const leaf = walk(t.$, depth).value;
            return () => {
              for (let i = 0; i < UPDATES; i++) leaf.set(i);
            };
          },
        ],
        [
          'plain Angular signal',
          () => {
            const s = signal(0);
            return () => {
              for (let i = 0; i < UPDATES; i++) s.set(i);
            };
          },
        ],
        [
          'held leaf + 1 dependent computed',
          () => {
            const t = signalTree(nested(depth));
            const leaf = walk(t.$, depth).value;
            const c = computed(() => leaf() + 1);
            c();
            return () => {
              for (let i = 0; i < UPDATES; i++) {
                leaf.set(i);
                c();
              }
            };
          },
        ],
        [
          'immutable rebuild (POJO)',
          () => {
            let state = nested(depth);
            return () => {
              for (let i = 0; i < UPDATES; i++) {
                const up = (o, l) =>
                  l === 0 ? { ...o, value: i } : { ...o, level: up(o.level, l - 1) };
                state = up(state, depth);
              }
            };
          },
        ],
      ],
      1,
      { unit: 'us', per: UPDATES }
    );
  }
}

if (want('read')) {
  console.log('\n=== 1b. WHOLE-STATE READ — tree() materialisation ===');
  for (const n of [1000, 10000, 100000]) {
    const shape = wide(n);
    race(
      `${n} leaves  (per tree() call)`,
      [
        [
          'tree()',
          () => {
            const t = signalTree(shape);
            return () => t();
          },
        ],
        [
          'structuredClone(POJO)',
          () => {
            const p = wide(n);
            return () => structuredClone(p);
          },
        ],
        [
          'POJO by reference',
          () => {
            const p = wide(n);
            return () => p;
          },
        ],
      ],
      1
    );
  }
}

if (want('collection')) {
  console.log('\n=== 1c. LARGE COLLECTION — 1000 single-element updates ===');
  const UPDATES = 1000;
  // The deepEqual array walk short-circuits at the FIRST differing element,
  // and every element BEFORE it is reference-identical after slice(). So the
  // cost is O(index of first difference), not O(N) — three regimes, measured
  // separately:
  //   front   — idx sweeps 0..999, mismatch found immediately   (best case)
  //   random  — uniform idx, mismatch found at ~N/2             (average case)
  //   no-op   — a structurally IDENTICAL rewrite (a re-fetch that changed
  //             nothing): no mismatch exists, so the walk runs to the end AND
  //             compares every element field-by-field            (worst case)
  //
  // WARNING, and the reason this is spelled out: the pre-existing harnesses in
  // this directory build items as `{ id: i, value: i }` and then write
  // `value: i` at `idx = i % N`. For i < N that writes the value that is
  // already there, so every "update" is silently the WORST case. That is what
  // the unreconciled 385 ms large-array number was measuring.
  for (const n of [1000, 10000, 50000]) {
    const rand = Array.from({ length: UPDATES }, () => (Math.random() * n) | 0);
    // The written value must be globally unique across the ENTIRE run, not
    // just within one loop: fixtures are built once and each arm is replayed
    // ~18 times (warmup + samples), so a per-loop value like `-(i+1)` writes
    // the value already present from the previous pass and silently degenerates
    // into the no-op case. A monotonic counter cannot repeat.
    let tick = 0;
    const patterns = [
      ['front idx, new value', (i) => i % n, () => --tick],
      ['random idx, new value', (i) => rand[i], () => --tick],
      ['front idx, IDENTICAL value (no-op)', (i) => i % n, (i, idx) => idx],
    ];
    for (const [pattern, idxOf, valOf] of patterns) {
      const mkArm = (mk) => () => {
        const { write } = mk();
        return () => {
          for (let i = 0; i < UPDATES; i++) {
            const idx = idxOf(i);
            write(idx, valOf(i, idx));
          }
        };
      };
      race(
        `${n} elements, ${pattern}  (per update)`,
        [
          [
            'ST leaf, deepEqual (default)',
            mkArm(() => {
              const t = signalTree({ items: mkItems(n) });
              return {
                write: (idx, v) =>
                  t.$.items.update((a) => {
                    const c = a.slice();
                    c[idx] = { ...c[idx], value: v };
                    return c;
                  }),
              };
            }),
          ],
          [
            'ST leaf, useShallowComparison',
            mkArm(() => {
              const t = signalTree({ items: mkItems(n) }, { useShallowComparison: true });
              return {
                write: (idx, v) =>
                  t.$.items.update((a) => {
                    const c = a.slice();
                    c[idx] = { ...c[idx], value: v };
                    return c;
                  }),
              };
            }),
          ],
          [
            'plain signal, Object.is',
            mkArm(() => {
              const sg = signal(mkItems(n));
              return {
                write: (idx, v) =>
                  sg.update((a) => {
                    const c = a.slice();
                    c[idx] = { ...c[idx], value: v };
                    return c;
                  }),
              };
            }),
          ],
          [
            'no signal at all (slice only)',
            mkArm(() => {
              let a = mkItems(n);
              return {
                write: (idx, v) => {
                  const c = a.slice();
                  c[idx] = { ...c[idx], value: v };
                  a = c;
                },
              };
            }),
          ],
        ],
        1,
        { unit: 'us', per: UPDATES }
      );
    }
  }
}

if (want('construct')) {
  console.log('\n=== 1e. CONSTRUCTION — build cost and retained bytes ===');
  for (const n of [1000, 10000, 100000]) {
    const shape = wide(n);
    race(
      `${n} leaves  (per construction)`,
      [
        // signalTree does not copy the source object's leaf values, so the same
        // shape can be fed to every rep. Lazy signal creation is opt-in
        // (`lazy: lazy()`), so this is the eager/default path.
        ['signalTree(shape)', () => () => signalTree(shape)],
        ['structuredClone only', () => () => structuredClone(shape)],
      ],
      1
    );
    const treeBytes = retained(() => signalTree(structuredClone(shape)), {
      copies: n >= 100000 ? 1 : 3,
    });
    const pojoBytes = retained(() => structuredClone(shape), {
      copies: n >= 100000 ? 1 : 3,
    });
    console.log(
      `  retained: tree ${kb(treeBytes)} (${treeBytes ? (treeBytes / n).toFixed(0) : 'n/a'} B/leaf)` +
        `   POJO ${kb(pojoBytes)} (${pojoBytes ? (pojoBytes / n).toFixed(0) : 'n/a'} B/leaf)` +
        (treeBytes && pojoBytes ? `   ${(treeBytes / pojoBytes).toFixed(2)}x` : '')
    );
  }

  // Decomposition: how much of the per-leaf cost is Angular's signal node, and
  // how much is SignalTree's own per-node structure?
  {
    const N = 10000;
    const bareSignals = retained(() => {
      const a = new Array(N);
      for (let i = 0; i < N; i++) a[i] = signal(i);
      return a;
    }, { copies: 1 });
    const bareSignalsDeep = retained(() => {
      const a = new Array(N);
      for (let i = 0; i < N; i++) a[i] = signal(i, { equal: deepEqual });
      return a;
    }, { copies: 1 });
    const arrayLeaf = retained(() => signalTree({ items: mkItems(N) }), { copies: 1 });
    const rawArray = retained(() => mkItems(N), { copies: 1 });
    console.log(
      `\n  decomposition @ ${N}:` +
        `\n    ${N} bare Angular signals            ${kb(bareSignals)} (${bareSignals ? (bareSignals / N).toFixed(0) : 'n/a'} B each)` +
        `\n    ${N} bare signals w/ equal:deepEqual ${kb(bareSignalsDeep)} (${bareSignalsDeep ? (bareSignalsDeep / N).toFixed(0) : 'n/a'} B each)` +
        `\n    signalTree with ${N} leaves          ${kb(retained(() => signalTree(wide(N)), { copies: 1 }))}` +
        `\n    signalTree with ONE array leaf of ${N} objects ${kb(arrayLeaf)}` +
        `\n    the same ${N} objects as a raw array ${kb(rawArray)}`
    );
  }
}

// ================================================================== PART 2 ===

if (want('entitymap')) {
  console.log('\n=== 2. entityMap vs a raw array leaf ===');
  const UPDATES = 1000;

  for (const n of [1000, 10000, 50000]) {
    const rand = Array.from({ length: UPDATES }, () => (Math.random() * n) | 0);
    race(
      `${n} entities, ${UPDATES} single-entity updates, random idx  (per update)`,
      [
        [
          'entityMap.updateOne',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            return () => {
              for (let i = 0; i < UPDATES; i++) t.$.items.updateOne(rand[i], { value: i });
            };
          },
        ],
        [
          'array leaf, deepEqual',
          () => {
            const t = signalTree({ items: mkItems(n) });
            return () => {
              for (let i = 0; i < UPDATES; i++) {
                const idx = rand[i];
                t.$.items.update((a) => {
                  const c = a.slice();
                  c[idx] = { ...c[idx], value: i };
                  return c;
                });
              }
            };
          },
        ],
        [
          'array leaf, shallow',
          () => {
            const t = signalTree({ items: mkItems(n) }, { useShallowComparison: true });
            return () => {
              for (let i = 0; i < UPDATES; i++) {
                const idx = rand[i];
                t.$.items.update((a) => {
                  const c = a.slice();
                  c[idx] = { ...c[idx], value: i };
                  return c;
                });
              }
            };
          },
        ],
        [
          'plain Map.set (no signals)',
          () => {
            const m = new Map(mkItems(n).map((e) => [e.id, e]));
            return () => {
              for (let i = 0; i < UPDATES; i++) {
                const id = rand[i];
                m.set(id, { ...m.get(id), value: i });
              }
            };
          },
        ],
      ],
      1,
      { unit: 'us', per: UPDATES }
    );
  }

  // The verdict hinges on this: entityMap's collection queries are lazy
  // computeds, so a write is O(1) only if nothing READS the collection before
  // the next write. A list view does read it. Measure update-then-read.
  for (const n of [10000, 50000]) {
    const rand = Array.from({ length: 1000 }, () => (Math.random() * n) | 0);
    let tick = 0;
    race(
      `${n} entities, 1000 x (update THEN read whole collection)  (per cycle)`,
      [
        [
          'entityMap.updateOne + all()',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            return () => {
              for (let i = 0; i < 1000; i++) {
                t.$.items.updateOne(rand[i], { value: --tick });
                t.$.items.all();
              }
            };
          },
        ],
        [
          'entityMap.updateOne + byId() read only',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            return () => {
              for (let i = 0; i < 1000; i++) {
                t.$.items.updateOne(rand[i], { value: --tick });
                t.$.items.byId(rand[i])?.();
              }
            };
          },
        ],
        [
          'array leaf (shallow) + read',
          () => {
            const t = signalTree({ items: mkItems(n) }, { useShallowComparison: true });
            return () => {
              for (let i = 0; i < 1000; i++) {
                const idx = rand[i];
                const v = --tick;
                t.$.items.update((a) => {
                  const c = a.slice();
                  c[idx] = { ...c[idx], value: v };
                  return c;
                });
                t.$.items();
              }
            };
          },
        ],
      ],
      1,
      { unit: 'us', per: 1000 }
    );
  }

  // ---- fan-out: does updating entity A dirty a computed that reads only B? --
  console.log('\n-- 2b. fan-out (granularity) --');
  {
    const N = 1000;
    const t = signalTree({ items: entityMap() });
    t.$.items.setAll(mkItems(N));

    let bFieldRuns = 0;
    const bField = computed(() => {
      bFieldRuns++;
      return t.$.items.byId(500).value();
    });
    let bNodeRuns = 0;
    const bNode = computed(() => {
      bNodeRuns++;
      return t.$.items.byId(500)?.();
    });
    let allRuns = 0;
    const allC = computed(() => {
      allRuns++;
      return t.$.items.all().length;
    });
    let countRuns = 0;
    const countC = computed(() => {
      countRuns++;
      return t.$.items.count();
    });
    bField(); bNode(); allC(); countC();
    const base = [bFieldRuns, bNodeRuns, allRuns, countRuns];

    // update a DIFFERENT entity 100 times
    for (let i = 0; i < 100; i++) {
      t.$.items.updateOne(1, { value: i });
      bField(); bNode(); allC(); countC();
    }
    const afterOther = [bFieldRuns - base[0], bNodeRuns - base[1], allRuns - base[2], countRuns - base[3]];
    console.log(
      `  100 updates to entity #1 → recomputes: byId(500).value=${afterOther[0]}  ` +
        `byId(500)()=${afterOther[1]}  all()=${afterOther[2]}  count()=${afterOther[3]}`
    );

    const b2 = [bFieldRuns, bNodeRuns, allRuns, countRuns];
    for (let i = 0; i < 100; i++) {
      t.$.items.updateOne(500, { value: i });
      bField(); bNode(); allC(); countC();
    }
    const afterSelf = [bFieldRuns - b2[0], bNodeRuns - b2[1], allRuns - b2[2], countRuns - b2[3]];
    console.log(
      `  100 updates to entity #500 → recomputes: byId(500).value=${afterSelf[0]}  ` +
        `byId(500)()=${afterSelf[1]}  all()=${afterSelf[2]}  count()=${afterSelf[3]}`
    );

    // array-leaf comparison: any computed over the array re-runs on any write
    const t2 = signalTree({ items: mkItems(N) });
    let arrRuns = 0;
    const arrC = computed(() => {
      arrRuns++;
      return t2.$.items()[500].value;
    });
    arrC();
    const a0 = arrRuns;
    for (let i = 0; i < 100; i++) {
      t2.$.items.update((a) => {
        const c = a.slice();
        c[1] = { ...c[1], value: i };
        return c;
      });
      arrC();
    }
    console.log(`  array leaf: 100 updates to element #1 → computed reading element #500 re-ran ${arrRuns - a0}x`);
  }

  // ---- whole-collection read -----------------------------------------------
  console.log('\n-- 2c. whole-collection read --');
  for (const n of [1000, 10000]) {
    race(
      `${n} entities  (per tree() call)`,
      [
        // entityMap's collection queries are `computed`s over a version
        // counter, so a repeated read with no mutation in between is a cache
        // hit. Both regimes are measured: CACHED (read twice, nothing changed)
        // and COLD (one updateOne invalidates the version, then read).
        [
          'tree() with entityMap, CACHED',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            t();
            return () => t();
          },
        ],
        [
          'tree() with entityMap, COLD (1 update first)',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            let k = 0;
            return () => {
              t.$.items.updateOne(0, { value: --k });
              return t();
            };
          },
        ],
        [
          'tree() with array leaf',
          () => {
            const t = signalTree({ items: mkItems(n) });
            return () => t();
          },
        ],
        [
          'entityMap.all() only, CACHED',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            t.$.items.all();
            return () => t.$.items.all();
          },
        ],
        [
          'entityMap.all() only, COLD',
          () => {
            const t = signalTree({ items: entityMap() });
            t.$.items.setAll(mkItems(n));
            let k = 0;
            return () => {
              t.$.items.updateOne(0, { value: --k });
              return t.$.items.all();
            };
          },
        ],
      ],
      1,
      { unit: 'us', per: 1 }
    );
    const emBytes = retained(() => {
      const t = signalTree({ items: entityMap() });
      t.$.items.setAll(mkItems(n));
      return t;
    });
    const arrBytes = retained(() => signalTree({ items: mkItems(n) }));
    console.log(
      `  retained: entityMap ${kb(emBytes)}   array leaf ${kb(arrBytes)}` +
        (emBytes && arrBytes ? `   ${(emBytes / arrBytes).toFixed(2)}x` : '')
    );
  }

  // ---- what does tree() actually emit for an entityMap? ---------------------
  {
    const t = signalTree({ items: entityMap() });
    t.$.items.setAll(mkItems(3));
    const snap = t().items;
    console.log(`  tree() emits for entityMap: keys=[${Object.keys(snap).join(', ')}]`);
  }
}

// ================================================================== PART 3 ===

if (want('timetravel')) {
  console.log('\n=== 1d. TIME TRAVEL ===');

  // How many history entries does a synchronous burst of leaf writes produce?
  {
    const t = signalTree(wide(1000)).with(timeTravel({ maxHistorySize: 10000 }));
    for (let i = 0; i < 100; i++) t.$.g0.f0.set(i);
    await new Promise((r) => setTimeout(r, 5));
    console.log(
      `  100 SYNCHRONOUS leaf writes → ${t.getHistory().length} history entries ` +
        `(INIT + flush-coalesced). Batching is per-microtask, not per-write.`
    );
    const t2 = signalTree(wide(1000)).with(timeTravel({ maxHistorySize: 10000 }));
    for (let i = 0; i < 100; i++) {
      t2.$.g0.f0.set(i);
      await Promise.resolve();
      await Promise.resolve();
    }
    console.log(`  100 writes, each awaiting a microtask → ${t2.getHistory().length} history entries`);
  }

  // Per-entry recording cost as a function of STATE SIZE (addEntry snapshots
  // and structuredClones the WHOLE tree, not a diff).
  const ENTRIES = 50;
  for (const n of [1000, 10000]) {
    const shape = wide(n);
    const rows = await (async () => {
      const arms = [
        [
          'with timeTravel()',
          () => {
            const t = signalTree(structuredClone(shape)).with(
              timeTravel({ maxHistorySize: 100000 })
            );
            return async () => {
              for (let i = 0; i < ENTRIES; i++) {
                t.$.g0.f0.set(i);
                await Promise.resolve();
                await Promise.resolve();
              }
            };
          },
        ],
        [
          'no enhancer',
          () => {
            const t = signalTree(structuredClone(shape));
            return async () => {
              for (let i = 0; i < ENTRIES; i++) {
                t.$.g0.f0.set(i);
                await Promise.resolve();
                await Promise.resolve();
              }
            };
          },
        ],
        [
          'manual immutable snapshot',
          () => {
            let state = structuredClone(shape);
            const hist = [];
            return async () => {
              for (let i = 0; i < ENTRIES; i++) {
                state = { ...state, g0: { ...state.g0, f0: i } };
                hist.push(state); // structural sharing: no clone needed
                await Promise.resolve();
                await Promise.resolve();
              }
            };
          },
        ],
        [
          'manual structuredClone snapshot',
          () => {
            let state = structuredClone(shape);
            const hist = [];
            return async () => {
              for (let i = 0; i < ENTRIES; i++) {
                state = { ...state, g0: { ...state.g0, f0: i } };
                hist.push(structuredClone(state));
                await Promise.resolve();
                await Promise.resolve();
              }
            };
          },
        ],
      ];
      const built = arms.map(([l, f]) => [l, f()]);
      for (let w = 0; w < 2; w++) for (const [, f] of built) await f();
      const res = built.map(() => []);
      for (let s = 0; s < SAMPLES; s++) {
        for (let k = 0; k < built.length; k++) {
          const i = (k + s) % built.length;
          const t0 = performance.now();
          await built[i][1]();
          res[i].push((performance.now() - t0) / ENTRIES);
        }
      }
      return built.map(([label], i) => ({ label, ...stats(res[i]) }));
    })();
    const w = Math.max(...rows.map((r) => r.label.length));
    console.log(`\n  recording one history entry, state = ${n} leaves (per entry)`);
    for (const r of rows)
      console.log(
        `    ${r.label.padEnd(w)}  ${(r.med * 1000).toFixed(1)}us  (IQR ${(r.iqr * 1000).toFixed(1)})`
      );

    // undo() cost
    const t = signalTree(structuredClone(shape)).with(timeTravel({ maxHistorySize: 100000 }));
    for (let i = 0; i < 60; i++) {
      t.$.g0.f0.set(i);
      await Promise.resolve();
      await Promise.resolve();
    }
    const undoTimes = [];
    for (let i = 0; i < 20 && t.canUndo(); i++) {
      const t0 = performance.now();
      t.undo();
      undoTimes.push(performance.now() - t0);
    }
    const u = stats(undoTimes);
    console.log(`    undo() at ${n} leaves: ${u.med.toFixed(3)}ms (IQR ${u.iqr.toFixed(3)})`);

    // Retained bytes per history entry. Entries must be forced apart: a
    // SYNCHRONOUS burst coalesces into one flush, and addEntry() also dedupes
    // an entry that deepEquals the previous one. Awaiting a microtask between
    // writes gives one entry per write.
    const bytesFor = async (k) => {
      if (!gc) return null;
      KEEP.length = 0;
      gc(); gc(); gc();
      const before = process.memoryUsage().heapUsed;
      const tt = signalTree(structuredClone(shape)).with(
        timeTravel({ maxHistorySize: 100000 })
      );
      for (let i = 0; i < k; i++) {
        tt.$.g0.f0.set(-(i + 1));
        await Promise.resolve();
        await Promise.resolve();
      }
      await new Promise((r) => setTimeout(r, 0));
      KEEP.push(tt);
      gc(); gc(); gc();
      const after = process.memoryUsage().heapUsed;
      const len = tt.getHistory().length;
      KEEP.length = 0;
      gc(); gc();
      return { bytes: after - before, len };
    };
    const b1 = await bytesFor(1);
    const b21 = await bytesFor(21);
    if (b1 && b21 && b21.len > b1.len)
      console.log(
        `    retained per history entry (${n} leaves): ` +
          `${kb((b21.bytes - b1.bytes) / (b21.len - b1.len))}  ` +
          `[entries ${b1.len} -> ${b21.len}, heap ${kb(b1.bytes)} -> ${kb(b21.bytes)}]`
      );
    else console.log('    retained per history entry: n/a (needs --expose-gc)');
  }

}

// timeTravel installs a GLOBAL PathNotifier onFlush listener per enhanced tree,
// and every listener runs a full snapshot+clone+deepEqual on EVERY flush in the
// process — including flushes caused by an unrelated tree. So this must run in
// its own process or the numbers are contaminated by trees created above.
if (want('ttentity')) {
  console.log('\n=== 1d-bis. entityMap under timeTravel (run in a CLEAN process) ===');
  const N = 5000;
  // Order matters: the no-enhancer baseline must be taken BEFORE any
  // timeTravel tree exists in the process (see ttleak below).
  const measure = async (t, label) => {
    const xs = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      t.$.items.updateOne(i, { value: -i - Math.random() });
      await Promise.resolve();
      await Promise.resolve();
      xs.push(performance.now() - t0);
    }
    const s = stats(xs);
    console.log(`  ${label} ${s.med.toFixed(3)}ms (IQR ${s.iqr.toFixed(3)})`);
  };
  const tNo = signalTree({ items: entityMap() });
  tNo.$.items.setAll(mkItems(N));
  await new Promise((r) => setTimeout(r, 10));
  await measure(tNo, `entityMap(${N}) updateOne + flush, NO enhancer:  `);

  const t = signalTree({ items: entityMap() }).with(timeTravel({ maxHistorySize: 1000 }));
  t.$.items.setAll(mkItems(N));
  await new Promise((r) => setTimeout(r, 10));
  await measure(t, `entityMap(${N}) updateOne + flush, timeTravel(): `);
  console.log(`  history after 20 distinct updates: ${t.getHistory().length} entries`);
}

// timeTravel() subscribes to the GLOBAL PathNotifier flush event, so every live
// timeTravel tree runs a full snapshotState + structuredClone + deepEqual on
// EVERY flush in the process — including flushes caused by a completely
// unrelated tree. The result is then discarded (addEntry dedupes an unchanged
// state), so it is pure waste. MUST run in its own process.
//
// The trigger has to be a write that actually NOTIFIES: a plain leaf .set() on
// an unenhanced tree never calls the notifier, so it never reveals this. An
// entityMap mutation does.
if (want('ttleak')) {
  console.log('\n=== 1d-ter. cross-tree cost of a live timeTravel() tree (CLEAN process) ===');
  const A = signalTree({ items: entityMap() });
  A.$.items.setAll(mkItems(2000));
  await new Promise((r) => setTimeout(r, 10));
  const probe = async (label) => {
    const xs = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      A.$.items.updateOne(i, { value: -i - Math.random() });
      await Promise.resolve();
      await Promise.resolve();
      xs.push(performance.now() - t0);
    }
    console.log(`  ${label} ${stats(xs).med.toFixed(3)}ms`);
  };
  await probe('entityMap(2000).updateOne + flush, no timeTravel tree alive:      '.padEnd(70));
  const others = [];
  for (let k = 1; k <= 3; k++) {
    others.push(signalTree(wide(10000)).with(timeTravel({ maxHistorySize: 5 })));
    await new Promise((r) => setTimeout(r, 10));
    await probe(`same write, with ${k} unrelated 10000-leaf timeTravel tree(s) alive:`.padEnd(70));
  }
  console.log(
    `  their histories are still ${others.map((t) => t.getHistory().length).join('/')} — ` +
      `every one of those snapshots was computed and thrown away.`
  );
}

// ================================================================== PART 3 ===

if (want('equality')) {
  console.log('\n=== 3. DEEP EQUALITY — what it buys and what it costs ===');
  console.log(
    'PRE-REQUISITE, established first: signalTree recurses into PLAIN OBJECTS, so a\n' +
      'plain object is never a leaf — it becomes one signal per primitive field. The\n' +
      '`equal: deepEqual` bill is therefore paid ONLY by leaves that hold arrays or\n' +
      'built-ins. For a primitive leaf, deepEqual returns at its first line (`a === b`).'
  );
  {
    const t = signalTree({ obj: { a: 1, b: { c: 2 } }, arr: [1, 2, 3] });
    console.log(
      `  probe: typeof tree.$.obj.set = ${typeof t.$.obj.set} (undefined => branch, not a leaf); ` +
        `typeof tree.$.arr.set = ${typeof t.$.arr.set} (function => leaf)`
    );
  }

  /** A fetched list: `rows` records of 4 fields. This is the shape of a leaf. */
  const rows = (n, changed = -1) =>
    Array.from({ length: n }, (_, i) => ({
      id: i,
      name: `row-${i}`,
      qty: i,
      status: i === changed ? 'CHANGED' : 'ok',
    }));

  // ---- 3a. suppression rate on a realistic re-fetch -------------------------
  console.log('\n-- 3a. notification suppression on a polling re-fetch (500 polls, 200-row list) --');
  for (const [label, changeEvery] of [
    ['identical payload every poll', 0],
    ['one row changes every 10th poll', 10],
    ['one row changes every poll', 1],
  ]) {
    const mk = (shallow) => {
      const t = signalTree({ data: rows(200) }, shallow ? { useShallowComparison: true } : {});
      let runs = 0;
      const c = computed(() => {
        runs++;
        return t.$.data().length;
      });
      c();
      const start = runs;
      for (let i = 1; i <= 500; i++) {
        t.$.data.set(rows(200, changeEvery && i % changeEvery === 0 ? i % 200 : -1));
        c();
      }
      return runs - start;
    };
    const deep = mk(false);
    const shallow = mk(true);
    const real = changeEvery === 0 ? 0 : Math.floor(500 / changeEvery);
    console.log(
      `  ${label.padEnd(33)} real changes=${String(real).padStart(3)}  ` +
        `deepEqual notified=${String(deep).padStart(3)}  Object.is notified=${String(shallow).padStart(3)}  ` +
        `→ ${shallow - deep} spurious notifications suppressed ` +
        `(${(((shallow - deep) / Math.max(1, shallow)) * 100).toFixed(0)}%)`
    );
  }

  // ---- 3b. cost per write as a function of leaf size ------------------------
  console.log('\n-- 3b. cost per write vs leaf size --');
  console.log('   identical payload = worst case (no mismatch, so the walk runs to the end)');
  const WRITES = 200;
  for (const n of [1, 10, 100, 1000, 10000]) {
    const same = rows(n);
    race(
      `${String(n).padStart(5)}-row leaf, IDENTICAL payload  (per write)`,
      [
        [
          'deepEqual (default)',
          () => {
            const t = signalTree({ data: rows(n) });
            return () => {
              for (let i = 0; i < WRITES; i++) t.$.data.set(same.slice());
            };
          },
        ],
        [
          'Object.is (useShallowComparison)',
          () => {
            const t = signalTree({ data: rows(n) }, { useShallowComparison: true });
            return () => {
              for (let i = 0; i < WRITES; i++) t.$.data.set(same.slice());
            };
          },
        ],
      ],
      1,
      { unit: 'us', per: WRITES }
    );
  }

  // ---- 3c. crossover: deep-compare cost vs the recompute it suppresses ------
  console.log('\n-- 3c. crossover: deepEqual cost vs the downstream recompute it suppresses --');
  console.log('   Workload: a poll that returns an IDENTICAL payload (the case deepEqual exists');
  console.log('   for) plus D dependent selectors, each an O(leaf) pass. deepEqual pays for');
  console.log('   itself when its walk is cheaper than D recomputes.');
  for (const D of [1, 2, 4]) {
    console.log(`\n   with ${D} dependent selector(s):`);
    for (const n of [10, 100, 1000, 10000]) {
      const same = rows(n);
      const mkArm = (shallow) => () => {
        const t = signalTree({ data: rows(n) }, shallow ? { useShallowComparison: true } : {});
        const sels = Array.from({ length: D }, () =>
          computed(() => {
            let acc = 0;
            for (const r of t.$.data()) acc += r.qty;
            return acc;
          })
        );
        for (const c of sels) c();
        return () => {
          for (let i = 0; i < 100; i++) {
            t.$.data.set(same.slice());
            for (const c of sels) c();
          }
        };
      };
      const r = race(
        `     ${String(n).padStart(5)} rows  (per poll)`,
        [
          ['deepEqual', mkArm(false)],
          ['Object.is', mkArm(true)],
        ],
        1,
        { unit: 'us', per: 100 }
      );
      const delta = ((r[1].med - r[0].med) * 1000) / 100;
      console.log(
        `       → deepEqual ${delta >= 0 ? 'WINS' : 'LOSES'} by ${Math.abs(delta).toFixed(2)}us/poll`
      );
    }
  }

  // ---- 3d. raw deepEqual throughput vs value size ---------------------------
  console.log('\n-- 3d. raw deepEqual throughput on equal arrays (full walk) --');
  for (const n of [10, 100, 1000, 10000, 100000]) {
    const a = rows(n);
    const b = rows(n);
    const reps = Math.max(1, Math.floor(200000 / n));
    const times = [];
    for (let s = 0; s < SAMPLES; s++) {
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) deepEqual(a, b);
      times.push((performance.now() - t0) / reps);
    }
    const st = stats(times);
    console.log(
      `  ${String(n).padStart(6)} rows: ${(st.med * 1000).toFixed(2)}us/call  ` +
        `(${((st.med * 1e6) / n).toFixed(1)}ns per row)`
    );
  }

  // ---- 3e. reference equality: what actually breaks -------------------------
  console.log('\n-- 3e. what breaks under reference equality: updateAndReport on a re-fetch --');
  {
    const mk = (shallow) => {
      const t = signalTree(
        { list: rows(200), meta: { total: 200, page: 1 } },
        shallow ? { useShallowComparison: true } : {}
      );
      let reported = 0;
      for (let i = 0; i < 100; i++) {
        const changes = t.updateAndReport({ list: rows(200), meta: { total: 200, page: 1 } });
        reported += Array.isArray(changes) ? changes.length : 0;
      }
      return reported;
    };
    console.log(
      `  100 re-fetches of an IDENTICAL payload — paths reported as changed:` +
        `  deepEqual=${mk(false)}   Object.is=${mk(true)}`
    );
  }
}

console.log('\ndone.');
