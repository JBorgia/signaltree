#!/usr/bin/env node
/*
  Measures callable Proxy overhead vs direct .set/.update for Angular signals.
*/
// perf_hooks.performance not used after switching to hrtime; keep require for compatibility if needed later

function stats(times) {
  const n = times.length;
  const mean = times.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { n, mean, min, max };
}

function pad(n, w = 8) {
  return String(n.toFixed(6)).padStart(w);
}

async function main() {
  const core = await import(
    '../../dist/packages/core/fesm2022/signaltree-core.mjs'
  );
  const { signalTree } = core;

  const tree = signalTree({ n: 0, arr: [0] });
  const nIters = Number(process.env.ITER || 20000);
  const BATCH = Number(process.env.BATCH || 100);

  // Warm-up
  for (let i = 0; i < 1000; i++) {
    tree.$.n(i);
    tree.$.n((v) => v + 1);
  }

  function hrNowNs() {
    return Number(process.hrtime.bigint()); // nanoseconds
  }

  // Helper to sample per-op ns by batching multiple ops per sample
  function samplePerOp(fn) {
    const times = [];
    for (let i = 0; i < nIters; i++) {
      const s = hrNowNs();
      for (let j = 0; j < BATCH; j++) fn(i);
      const dt = hrNowNs() - s;
      times.push(dt / BATCH);
    }
    return times; // ns per-op
  }

  const setTimes = samplePerOp(() => tree.$.n(0));
  const updateTimes = samplePerOp(() => tree.$.n((v) => v + 1));

  // Direct API comparisons
  const directSetTimes = samplePerOp(() => tree.$.n.set(0));
  const directUpdateTimes = samplePerOp(() => tree.$.n.update((v) => v + 1));

  console.log('\nCallable Proxy Overhead (ns/op approx):');
  const st = stats(setTimes);
  const ut = stats(updateTimes);
  const dst = stats(directSetTimes);
  const dut = stats(directUpdateTimes);
  console.log(
    ` set() via call  : mean=${pad(st.mean)} ns min=${pad(st.min)} max=${pad(
      st.max
    )}`
  );
  console.log(
    ` update() via call: mean=${pad(ut.mean)} ns min=${pad(ut.min)} max=${pad(
      ut.max
    )}`
  );
  console.log(
    ` set() direct     : mean=${pad(dst.mean)} ns min=${pad(dst.min)} max=${pad(
      dst.max
    )}`
  );
  console.log(
    ` update() direct  : mean=${pad(dut.mean)} ns min=${pad(dut.min)} max=${pad(
      dut.max
    )}`
  );
  const setOver = st.mean && dst.mean ? (st.mean / dst.mean - 1) * 100 : null;
  const updOver = ut.mean && dut.mean ? (ut.mean / dut.mean - 1) * 100 : null;
  if (setOver != null && updOver != null) {
    console.log(
      ` overhead ratio (call vs direct): set=${pad(setOver, 6)}% update=${pad(
        updOver,
        6
      )}%`
    );
  }
}

main().catch((e) => {
  console.error('proxy-call-overhead failed:', e);
  process.exit(1);
});
