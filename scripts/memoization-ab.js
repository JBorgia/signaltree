// Simple A/B microbenchmark for memoization strategies
// Compares: no-cache, shallow-equality cache, reference-equality cache

function nowMs() {
  const [s, ns] = process.hrtime();
  return s * 1000 + ns / 1e6;
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function memoizeShallow(fn) {
  let cached = null;
  return function (arg) {
    if (cached && shallowEqual(cached.deps, arg)) return cached.value;
    const v = fn(arg);
    cached = { value: v, deps: arg };
    return v;
  };
}

function memoizeReference(fn) {
  let cached = null;
  return function (arg) {
    if (cached && cached.deps === arg) return cached.value;
    const v = fn(arg);
    cached = { value: v, deps: arg };
    return v;
  };
}

function baselineSelector(data) {
  // expensive work: count items with value > 0.5 and sum some math
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i].value > 0.5) {
      count++;
    }
  }
  return count;
}

function makeData(n) {
  const arr = new Array(n);
  for (let i = 0; i < n; i++) arr[i] = { id: i, value: Math.random() };
  return arr;
}

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function run() {
  const size = 2000; // items
  const iterations = 10000; // calls
  const updateEvery = 50; // mutate every N calls

  // Prepare data and funcs
  let data = makeData(size);
  const refMemo = memoizeReference(baselineSelector);
  const shallowMemo = memoizeShallow(baselineSelector);

  const results = {
    none: [],
    ref: [],
    shallow: [],
  };

  // Warmup
  for (let i = 0; i < 200; i++) {
    baselineSelector(data);
    refMemo(data);
    shallowMemo(data);
  }

  // Run pattern: many repeated calls with occasional mutation
  for (let mode of ['none', 'ref', 'shallow']) {
    const arr = results[mode];
    for (let i = 0; i < iterations; i++) {
      if (i % updateEvery === 0) {
        // mutate: either mutate in-place (keeps same reference) or create new array
        if (i % (updateEvery * 2) === 0) {
          // structural change: create new array (invalidates reference memo)
          const newData = data.slice();
          const idx = i % newData.length;
          newData[idx] = { ...newData[idx], value: Math.random() };
          data = newData;
        } else {
          // mutate in-place (keeps reference)
          const idx = i % data.length;
          data[idx].value = Math.random();
        }
      }

      const t0 = nowMs();
      if (mode === 'none') baselineSelector(data);
      else if (mode === 'ref') refMemo(data);
      else shallowMemo(data);
      const t1 = nowMs();
      arr.push(t1 - t0);
    }
  }

  console.log('median none (ms):', median(results.none));
  console.log('median ref (ms):', median(results.ref));
  console.log('median shallow (ms):', median(results.shallow));
  console.log(
    'p95 none (ms):',
    results.none.sort((a, b) => a - b)[Math.floor(results.none.length * 0.95)]
  );
  console.log(
    'p95 ref (ms):',
    results.ref.sort((a, b) => a - b)[Math.floor(results.ref.length * 0.95)]
  );
  console.log(
    'p95 shallow (ms):',
    results.shallow.sort((a, b) => a - b)[
      Math.floor(results.shallow.length * 0.95)
    ]
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
