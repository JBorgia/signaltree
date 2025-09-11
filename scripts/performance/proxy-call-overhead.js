#!/usr/bin/env node
/*
  Measures callable Proxy overhead vs direct .set/.update for Angular signals.
*/
const { performance } = require('perf_hooks');

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

  // Warm-up
  for (let i = 0; i < 1000; i++) {
    tree.$.n(i);
    tree.$.n((v) => v + 1);
  }

  const setTimes = [];
  for (let i = 0; i < nIters; i++) {
    const s = performance.now();
    tree.$.n(i);
    setTimes.push(performance.now() - s);
  }

  const updateTimes = [];
  for (let i = 0; i < nIters; i++) {
    const s = performance.now();
    tree.$.n((v) => v + 1);
    updateTimes.push(performance.now() - s);
  }

  // Direct API comparisons
  const directSetTimes = [];
  for (let i = 0; i < nIters; i++) {
    const s = performance.now();
    tree.$.n.set(i);
    directSetTimes.push(performance.now() - s);
  }

  const directUpdateTimes = [];
  for (let i = 0; i < nIters; i++) {
    const s = performance.now();
    tree.$.n.update((v) => v + 1);
    directUpdateTimes.push(performance.now() - s);
  }

  console.log('\nCallable Proxy Overhead (ns/op approx):');
  const st = stats(setTimes);
  const ut = stats(updateTimes);
  const dst = stats(directSetTimes);
  const dut = stats(directUpdateTimes);
  console.log(
    ` set() via call  : mean=${pad(st.mean * 1e6)} ns min=${pad(
      st.min * 1e6
    )} max=${pad(st.max * 1e6)}`
  );
  console.log(
    ` update() via call: mean=${pad(ut.mean * 1e6)} ns min=${pad(
      ut.min * 1e6
    )} max=${pad(ut.max * 1e6)}`
  );
  console.log(
    ` set() direct     : mean=${pad(dst.mean * 1e6)} ns min=${pad(
      dst.min * 1e6
    )} max=${pad(dst.max * 1e6)}`
  );
  console.log(
    ` update() direct  : mean=${pad(dut.mean * 1e6)} ns min=${pad(
      dut.min * 1e6
    )} max=${pad(dut.max * 1e6)}`
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
