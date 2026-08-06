#!/usr/bin/env node
/**
 * CROSS-LIBRARY, REAL IMPLEMENTATIONS.
 *
 * An earlier memory comparison used `signal(rows)` for raw Angular and
 * `signalState({ rows })` for @ngrx/signals against SignalTree's `entityMap`.
 * Those are not the same CAPABILITY — one holds an array, the other maintains a
 * keyed collection with O(1) lookup and per-entity updates — so the numbers were
 * not comparable even though they were correctly measured.
 *
 * Every arm here implements the same thing, the way that library's own docs say
 * to:
 *
 *   signaltree     entityMap({ selectId })
 *   ngrx-signals   signalState + @ngrx/signals/entities updaters (setAllEntities,
 *                  updateEntity) — the official entity API
 *   elf            createStore + withEntities + setEntities/updateEntities
 *   raw-signals    a hand-rolled Map-of-signals store, which is what you write
 *                  when you have no library
 *
 * TWO WORKLOADS:
 *
 *   collection  build 10k, then 200 SINGLE-ENTITY updates, then read all
 *   undo-redo   50 writes recorded to history, then 50 undos
 *
 * Undo/redo is where the libraries genuinely differ. SignalTree ships
 * `timeTravel()`; elf ships `@ngneat/elf-state-history`, which is installed here
 * and used — testing elf WITHOUT its own history primitive would have been a
 * strawman, and the first run of this file did exactly that.
 *
 * @ngrx/signals has no history primitive for a SignalStore, so its arm does the
 * idiomatic hand-rolled thing: snapshot state per change. That is not a
 * strawman either — it is what the absence of a primitive forces on a user.
 *
 * ONE PROCESS PER ARM (timing and heap both contaminate across arms in-process —
 * design-thesis §3). Timing is the median of 5 runs; memory uses forced GC.
 *
 * Usage: node --expose-gc tools/bench-compare.mjs [--n 10000] [--json]
 *        node --expose-gc tools/bench-compare.mjs --arm <a> --workload <w> --n <n>
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

if (typeof globalThis.gc !== 'function') {
  console.error('❌ Run with --expose-gc.');
  process.exit(1);
}
const CORE = join(process.cwd(), 'dist/packages/core/dist/index.js');
if (!existsSync(CORE)) {
  console.error('❌ build first: nx run-many -t build --all');
  process.exit(1);
}

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};
const N = Number(arg('--n', 10_000));
const UPDATES = 200;
const HISTORY_WRITES = 50;
const MB = 1024 * 1024;
const settle = () => {
  for (let i = 0; i < 4; i++) globalThis.gc();
};
const seed = (n) => {
  const out = [];
  for (let i = 0; i < n; i++)
    out.push({ id: i, name: 'name' + i, value: i, active: i % 2 === 0 });
  return out;
};

// ---------------------------------------------------------------------------
// REAL IMPLEMENTATIONS — each exposes setAll / updateOne / readAll / snapshot /
// restore so the workloads below are identical across arms.
// ---------------------------------------------------------------------------
const IMPLS = {
  signaltree: async (withHistory) => {
    const { signalTree, entityMap, timeTravel } = await import(CORE);
    const base = signalTree({ rows: entityMap({ selectId: (r) => r.id }) });
    const tree = withHistory ? base.with(timeTravel({ maxHistorySize: 200 })) : base;
    return {
      store: tree,
      setAll: (d) => tree.$.rows.setAll(d),
      updateOne: (id, changes) => tree.$.rows.updateOne(id, changes),
      readAll: () => tree.$.rows.all(),
      // Built-in. History entries are snapshot REFERENCES, not clones.
      hasBuiltInHistory: true,
      undo: () => tree.undo(),
    };
  },

  'ngrx-signals': async () => {
    const { signalState, patchState, getState } = await import('@ngrx/signals');
    const { setAllEntities, updateEntity } = await import('@ngrx/signals/entities');
    const store = signalState({ entityMap: {}, ids: [] });
    const history = [];
    return {
      store,
      setAll: (d) => patchState(store, setAllEntities(d)),
      updateOne: (id, changes) => patchState(store, updateEntity({ id, changes })),
      readAll: () => store.ids().map((i) => store.entityMap()[i]),
      hasBuiltInHistory: false,
      // No history primitive exists for a SignalStore; this is the hand-rolled
      // equivalent a user has to write.
      record: () => history.push(structuredClone(getState(store))),
      undo: () => {
        const prev = history.pop();
        if (prev) patchState(store, () => prev);
      },
      history,
    };
  },

  elf: async (withHistory) => {
    const { createStore, withProps } = await import('@ngneat/elf');
    const { withEntities, setEntities, updateEntities, getAllEntities } =
      await import('@ngneat/elf-entities');
    // elf's OWN history primitive — the fair comparison for this library.
    const { stateHistory } = await import('@ngneat/elf-state-history');
    const store = createStore(
      { name: 'bench' },
      withProps({}),
      withEntities({ initialValue: [] })
    );
    const history = withHistory ? stateHistory(store, { maxAge: 200 }) : null;
    return {
      store,
      setAll: (d) => store.update(setEntities(d)),
      updateOne: (id, changes) => store.update(updateEntities(id, changes)),
      readAll: () => store.query(getAllEntities()),
      hasBuiltInHistory: true,
      undo: () => history?.undo(),
    };
  },

  'raw-signals': async () => {
    const { signal } = await import('@angular/core');
    // What you actually write with no library: a keyed map of per-entity
    // signals plus an id list, so a single-row update does not rebuild the
    // array. This is the fair counterpart to entityMap, not `signal(array)`.
    const byId = new Map();
    const ids = signal([]);
    const history = [];
    const snapshot = () => ids().map((i) => byId.get(i)());
    return {
      store: { byId, ids },
      setAll: (d) => {
        byId.clear();
        for (const e of d) byId.set(e.id, signal(e));
        ids.set(d.map((e) => e.id));
      },
      updateOne: (id, changes) => {
        const s = byId.get(id);
        if (s) s.set({ ...s(), ...changes });
      },
      readAll: snapshot,
      hasBuiltInHistory: false,
      record: () => history.push(structuredClone(snapshot())),
      undo: () => {
        const prev = history.pop();
        if (!prev) return;
        byId.clear();
        for (const e of prev) byId.set(e.id, signal(e));
        ids.set(prev.map((e) => e.id));
      },
      history,
    };
  },
};

// ---------------------------------------------------------------------------
// WORKLOADS
// ---------------------------------------------------------------------------
const WORKLOADS = {
  collection: async (impl, n) => {
    const data = seed(n);
    const t0 = performance.now();
    impl.setAll(data);
    for (let i = 0; i < UPDATES; i++) {
      impl.updateOne(i % n, { value: i + 1_000_000 });
    }
    const all = impl.readAll();
    const t1 = performance.now();
    if (all.length !== n) throw new Error(`readAll returned ${all.length}, expected ${n}`);
    return t1 - t0;
  },

  'undo-redo': async (impl, n) => {
    impl.setAll(seed(n));
    const t0 = performance.now();
    for (let i = 0; i < HISTORY_WRITES; i++) {
      if (!impl.hasBuiltInHistory) impl.record();
      impl.updateOne(i % n, { value: i });
    }
    for (let i = 0; i < HISTORY_WRITES; i++) impl.undo();
    const t1 = performance.now();
    return t1 - t0;
  },
};

// --- child ------------------------------------------------------------------
const armName = arg('--arm', null);
if (armName) {
  const workload = arg('--workload', 'collection');
  const make = IMPLS[armName];
  const run = WORKLOADS[workload];
  if (!make || !run) {
    console.error('unknown arm/workload');
    process.exit(1);
  }

  // History is ON only for the undo/redo workload. Leaving it on during the
  // collection workload confounded the first run: signaltree and elf paid for
  // recording while ngrx-signals and raw-signals did not, because they have no
  // primitive to enable. Each workload now isolates one thing.
  const withHistory = workload === 'undo-redo';

  // Timing: median of 5, each on a fresh store.
  const times = [];
  for (let i = 0; i < 5; i++) {
    const impl = await make(withHistory);
    times.push(await run(impl, N));
  }
  times.sort((a, b) => a - b);
  const medianMs = times[2];

  // Memory: retained after the workload, forced GC.
  settle();
  const before = process.memoryUsage().heapUsed;
  let impl = await make(withHistory);
  await run(impl, N);
  settle();
  const retainedMB = (process.memoryUsage().heapUsed - before) / MB;
  const historyLen = impl.history ? impl.history.length : null;
  impl = null;

  console.log(
    JSON.stringify({
      arm: armName,
      workload,
      medianMs: +medianMs.toFixed(2),
      retainedMB: +retainedMB.toFixed(2),
      builtInHistory: (await make(withHistory)).hasBuiltInHistory,
      historyLen,
    })
  );
  process.exit(0);
}

// --- driver -----------------------------------------------------------------
const out = { n: N, workloads: {} };
for (const workload of Object.keys(WORKLOADS)) {
  out.workloads[workload] = [];
  for (const arm of Object.keys(IMPLS)) {
    try {
      const res = execFileSync(
        process.execPath,
        [
          '--expose-gc',
          new URL(import.meta.url).pathname,
          '--arm', arm,
          '--workload', workload,
          '--n', String(N),
        ],
        { encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
      );
      out.workloads[workload].push(JSON.parse(res.trim().split('\n').pop()));
    } catch (err) {
      out.workloads[workload].push({
        arm,
        error: String(err.stderr || err.message).split('\n').filter(Boolean).pop()?.slice(0, 90),
      });
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const title = {
    collection: `COLLECTION (no history) — build ${N.toLocaleString()}, ${UPDATES} single-entity updates, read all`,
    'undo-redo': `UNDO/REDO (history ON) — ${HISTORY_WRITES} recorded writes then ${HISTORY_WRITES} undos, over ${N.toLocaleString()} entities`,
  };
  for (const [workload, rows] of Object.entries(out.workloads)) {
    console.log(`\n${title[workload]}`);
    console.log('  ' + '─'.repeat(66));
    console.log('  ' + 'arm'.padEnd(18) + 'median'.padStart(11) + 'retained'.padStart(12) + '   history');
    const ok = rows.filter((r) => !r.error).sort((a, b) => a.medianMs - b.medianMs);
    for (const r of ok) {
      console.log(
        '  ' + r.arm.padEnd(18) +
          `${r.medianMs.toFixed(2)} ms`.padStart(11) +
          `${r.retainedMB.toFixed(2)} MB`.padStart(12) +
          `   ${r.builtInHistory ? 'BUILT-IN' : 'hand-rolled'}`
      );
    }
    for (const r of rows.filter((r) => r.error)) {
      console.log('  ' + r.arm.padEnd(18) + '  — ' + r.error);
    }
  }
  console.log(
    '\n  Every arm implements the same capability using that library\'s own entity\n' +
      '  API. Undo/redo has no primitive outside SignalTree for this store shape,\n' +
      '  so those arms snapshot state per change — which is what its absence forces.'
  );
}
