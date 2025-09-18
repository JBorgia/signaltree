#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const artifactsDir = path.resolve(__dirname, '..', 'artifacts');
const outJson = path.join(
  artifactsDir,
  'mode-comparison-signaltree-aggregated.json'
);
const outMd = path.join(
  artifactsDir,
  'mode-comparison-signaltree-aggregated.md'
);

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function listArtifacts() {
  return fs
    .readdirSync(artifactsDir)
    .filter((f) => /SignalTree-(off|light)-run\d+\.json$/.test(f));
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
function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function mannWhitneyU(a, b) {
  const combined = a
    .map((v) => ({ v, who: 0 }))
    .concat(b.map((v) => ({ v, who: 1 })))
    .map((e, i) => ({ ...e, idx: i }));
  combined.sort((x, y) => x.v - y.v);
  const ranks = new Array(combined.length);
  for (let i = 0; i < combined.length; ) {
    let j = i + 1;
    while (j < combined.length && combined[j].v === combined[i].v) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) ranks[combined[k].idx] = avg;
    i = j;
  }
  let ra = 0;
  for (let i = 0; i < combined.length; i++)
    if (combined[i].who === 0) ra += ranks[combined[i].idx];
  const n1 = a.length,
    n2 = b.length;
  const U1 = ra - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const meanU = (n1 * n2) / 2;
  const sdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (U1 - meanU - 0.5) / sdU;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { U1, U2, z, p };
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
  let mag = 'negligible';
  if (ad < 0.147) mag = 'negligible';
  else if (ad < 0.33) mag = 'small';
  else if (ad < 0.474) mag = 'medium';
  else mag = 'large';
  return { delta, magnitude: mag, gt, lt, eq };
}

function loadRuns() {
  const files = listArtifacts();
  const grouped = { off: [], light: [] };
  files.forEach((f) => {
    const m = f.match(/SignalTree-(off|light)-run(\d+)\.json/);
    if (!m) return;
    const mode = m[1];
    const runNum = Number(m[2]);
    const content = readJSON(path.join(artifactsDir, f));
    const rec = content.results.find((r) => r.libraryId === 'signaltree');
    if (rec && Array.isArray(rec.samples))
      grouped[mode].push({ run: runNum, samples: rec.samples });
  });
  return grouped;
}

function poolSamples(list) {
  return list.reduce((acc, r) => acc.concat(r.samples), []);
}

function main() {
  const runs = loadRuns();
  if (runs.off.length === 0 || runs.light.length === 0) {
    console.error(
      'Need at least one run file per mode named SignalTree-<mode>-run<N>.json in artifacts/'
    );
    process.exit(1);
  }
  const pooledOff = poolSamples(runs.off);
  const pooledLight = poolSamples(runs.light);
  const data = {
    meta: {
      offRuns: runs.off.map((r) => r.run),
      lightRuns: runs.light.map((r) => r.run),
    },
    pooled: {
      off: {
        n: pooledOff.length,
        median: median(pooledOff),
        mean: mean(pooledOff),
      },
      light: {
        n: pooledLight.length,
        median: median(pooledLight),
        mean: mean(pooledLight),
      },
    },
    mannWhitney: mannWhitneyU(pooledOff, pooledLight),
    cliffs: cliffsDelta(pooledOff, pooledLight),
  };
  fs.writeFileSync(outJson, JSON.stringify(data, null, 2));
  let md = '# Aggregated SignalTree mode comparison\n\n';
  md += `- off runs: ${data.meta.offRuns.join(', ')}\n`;
  md += `- light runs: ${data.meta.lightRuns.join(', ')}\n`;
  md += `\n`;
  md += `## pooled results\n\n`;
  md += `- off: n=${data.pooled.off.n}, median=${data.pooled.off.median} ms, mean=${data.pooled.off.mean} ms\n`;
  md += `- light: n=${data.pooled.light.n}, median=${data.pooled.light.median} ms, mean=${data.pooled.light.mean} ms\n`;
  md += `\n- Mann–Whitney: U1=${data.mannWhitney.U1.toFixed(
    3
  )}, U2=${data.mannWhitney.U2.toFixed(3)}, z=${data.mannWhitney.z.toFixed(
    3
  )}, p=${data.mannWhitney.p.toExponential(3)}\n`;
  md += `- Cliff's Delta: ${data.cliffs.delta.toFixed(4)} (${
    data.cliffs.magnitude
  })\n`;
  fs.writeFileSync(outMd, md);
  console.log('Wrote aggregated results to', outJson, outMd);
}

main();
