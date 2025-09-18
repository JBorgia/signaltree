#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const artifactsDir = path.resolve(__dirname, '..', 'artifacts');
const offPath = path.join(artifactsDir, 'SignalTree-off-results.json');
const lightPath = path.join(artifactsDir, 'SignalTree-light-results.json');
const outJson = path.join(artifactsDir, 'mode-comparison-signaltree.json');
const outMd = path.join(artifactsDir, 'mode-comparison-signaltree.md');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function mean(arr) {
  if (!arr.length) return NaN;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function median(arr) {
  if (!arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor((s.length - 1) / 2);
  if (s.length % 2) return s[m];
  return (s[m] + s[m + 1]) / 2;
}

// Normal CDF
function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function erf(x) {
  // numerical approximation
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function mannWhitneyU(a, b) {
  // compute ranks with ties
  const combined = a
    .map((v) => ({ v, who: 0 }))
    .concat(b.map((v) => ({ v, who: 1 })))
    .map((e, i) => ({ ...e, idx: i }));
  combined.sort((x, y) => x.v - y.v);
  // assign ranks, averaging ties
  const ranks = new Array(combined.length);
  for (let i = 0; i < combined.length; ) {
    let j = i + 1;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avg = (i + 1 + j) / 2; // ranks are 1-based
    for (let k = i; k < j; k++) ranks[combined[k].idx] = avg;
    i = j;
  }
  // sum ranks for a
  let ra = 0,
    rb = 0;
  let ai = 0,
    bi = 0;
  for (let i = 0; i < combined.length; i++) {
    if (combined[i].who === 0) {
      ra += ranks[combined[i].idx];
      ai++;
    } else {
      rb += ranks[combined[i].idx];
      bi++;
    }
  }
  const n1 = a.length,
    n2 = b.length;
  const r1 = ra; // sum ranks of a
  const U1 = r1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const meanU = (n1 * n2) / 2;
  const sdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  // continuity correction
  const z = (U1 - meanU - 0.5) / sdU; // using U1 so sign preserved
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { U1, U2, U, z, p };
}

function cliffsDelta(a, b) {
  let gt = 0,
    lt = 0,
    eq = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i] > b[j]) gt++;
      else if (a[i] < b[j]) lt++;
      else eq++;
    }
  }
  const n = a.length * b.length;
  const delta = (gt - lt) / n;
  const ad = Math.abs(delta);
  let magnitude = 'negligible';
  if (ad < 0.147) magnitude = 'negligible';
  else if (ad < 0.33) magnitude = 'small';
  else if (ad < 0.474) magnitude = 'medium';
  else magnitude = 'large';
  return { delta, magnitude, gt, lt, eq };
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function summarizeScenario(offSamples, lightSamples) {
  const off = offSamples.slice();
  const light = lightSamples.slice();
  const mOff = median(off);
  const mLight = median(light);
  const meanOff = mean(off);
  const meanLight = mean(light);
  const pctChangeMedian = ((mLight - mOff) / (mOff || mLight || 1)) * 100;
  const pctChangeMean =
    ((meanLight - meanOff) / (meanOff || meanLight || 1)) * 100;
  const mw = mannWhitneyU(off, light);
  const cliff = cliffsDelta(off, light);
  return {
    off: { n: off.length, median: mOff, mean: meanOff },
    light: { n: light.length, median: mLight, mean: meanLight },
    medianDeltaMs: mLight - mOff,
    medianPctChange: pctChangeMedian,
    meanDeltaMs: meanLight - meanOff,
    meanPctChange: pctChangeMean,
    mannWhitney: mw,
    cliffsDelta: cliff,
  };
}

function main() {
  if (!fs.existsSync(offPath) || !fs.existsSync(lightPath)) {
    console.error(
      'Missing one or both artifact files. Expected at:',
      offPath,
      lightPath
    );
    process.exit(1);
  }
  const off = readJSON(offPath);
  const light = readJSON(lightPath);
  const offResults = off.results.filter((r) => r.libraryId === 'signaltree');
  const lightResults = light.results.filter(
    (r) => r.libraryId === 'signaltree'
  );
  const scenarios = new Set();
  offResults.forEach((r) => scenarios.add(r.scenarioId));
  lightResults.forEach((r) => scenarios.add(r.scenarioId));
  const summary = {
    meta: { offTimestamp: off.timestamp, lightTimestamp: light.timestamp },
    comparisons: {},
  };
  scenarios.forEach((scenarioId) => {
    const offRec = offResults.find((r) => r.scenarioId === scenarioId) || {
      samples: [],
    };
    const lightRec = lightResults.find((r) => r.scenarioId === scenarioId) || {
      samples: [],
    };
    const offS = ensureArray(offRec.samples);
    const lightS = ensureArray(lightRec.samples);
    summary.comparisons[scenarioId] = summarizeScenario(offS, lightS);
  });
  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));

  // write Markdown summary
  let md = `# SignalTree mode comparison\n\n`;
  md += `- Off run: ${off.timestamp}\n`;
  md += `- Light run: ${light.timestamp}\n\n`;
  md += `## Per-scenario results\n\n`;
  for (const [scenario, data] of Object.entries(summary.comparisons)) {
    md += `### ${scenario}\n\n`;
    md += `- off: n=${data.off.n}, median=${data.off.median} ms, mean=${data.off.mean} ms\n`;
    md += `- light: n=${data.light.n}, median=${data.light.median} ms, mean=${data.light.mean} ms\n`;
    md += `- median delta (light - off): ${data.medianDeltaMs.toFixed(
      6
    )} ms (${data.medianPctChange.toFixed(2)}%)\n`;
    md += `- mean delta (light - off): ${data.meanDeltaMs.toFixed(
      6
    )} ms (${data.meanPctChange.toFixed(2)}%)\n`;
    md += `- Mann–Whitney U: U1=${data.mannWhitney.U1.toFixed(
      3
    )}, U2=${data.mannWhitney.U2.toFixed(3)}, z=${data.mannWhitney.z.toFixed(
      3
    )}, p=${data.mannWhitney.p.toExponential(3)}\n`;
    md += `- Cliff's Delta: ${data.cliffsDelta.delta.toFixed(4)} (${
      data.cliffsDelta.magnitude
    })\n\n`;
  }
  fs.writeFileSync(outMd, md);
  console.log('Wrote:', outJson, outMd);
}

main();
