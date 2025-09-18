#!/usr/bin/env node
// Aggregate NDJSON benchmark results across multiple repeat files and compute
// Mann-Whitney U and Cliff's Delta per scenario.

const fs = require('fs');
const path = require('path');

function readNdjsonFiles(paths) {
  const results = [];
  for (const p of paths) {
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        results.push(JSON.parse(line));
      } catch (e) {
        console.error('failed parse', p, e.message);
      }
    }
  }
  return results;
}

function groupByScenario(results) {
  const map = new Map();
  for (const r of results) {
    const key = r.scenario || r.label || 'unknown';
    if (!map.has(key)) map.set(key, []);
    // assume r.samples is an array of measured iteration times
    if (Array.isArray(r.samples)) map.get(key).push(r.samples);
    else if (Array.isArray(r.data)) map.get(key).push(r.data);
    else if (typeof r.p50 === 'number') map.get(key).push([r.p50]);
    else map.get(key).push([]);
  }
  return map;
}

function flatten(arrays) {
  return arrays.reduce((acc, a) => acc.concat(a), []);
}

// Mann-Whitney U and Cliff's Delta implementations
function mannWhitneyU(a, b) {
  // Return U, p not computed (approximation could be added)
  // Use rank-sum approach
  const combined = a
    .map((v) => ({ v, g: 0 }))
    .concat(b.map((v) => ({ v, g: 1 })));
  combined.sort((x, y) => x.v - y.v);
  let rank = 1;
  for (let i = 0; i < combined.length; i++) {
    // average ranks for ties
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
    const avg = (rank + (rank + (j - i))) / 2;
    for (let k = i; k <= j; k++) combined[k].rank = avg;
    rank += j - i + 1;
    i = j;
  }
  const r1 = combined.filter((x) => x.g === 0).reduce((s, x) => s + x.rank, 0);
  const n1 = a.length;
  const n2 = b.length;
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  // approximate p-value via normal approximation with continuity correction
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (u - mu + 0.5) / sigma;
  // two-sided
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { u, p, z };
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function erf(x) {
  // numerical erf approx
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function cliffsDelta(a, b) {
  // return delta and qualitative magnitude
  let gt = 0;
  let lt = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i] > b[j]) gt++;
      else if (a[i] < b[j]) lt++;
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
  return { delta, magnitude };
}

function summaryForScenario(name, arrays) {
  const pooled = flatten(arrays);
  const stats = {
    n: pooled.length,
    min: Math.min(...pooled),
    max: Math.max(...pooled),
    mean: pooled.reduce((s, v) => s + v, 0) / pooled.length,
    median: median(pooled),
  };
  return { name, stats, pooled };
}

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return a[(n - 1) / 2];
  return (a[n / 2 - 1] + a[n / 2]) / 2;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    // If no files provided, attempt to read generated `artifacts/*-results.json`
    const artifactsDir = path.resolve(process.cwd(), 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
      console.log('No input files and artifacts directory not found.');
      process.exit(1);
    }
    const files = fs
      .readdirSync(artifactsDir)
      .filter((f) => f.endsWith('-results.json'))
      .map((f) => path.join(artifactsDir, f));
    if (files.length === 0) {
      console.log('No *-results.json files found in artifacts/.');
      process.exit(1);
    }
    // Build synthetic NDJSON-like entries from each results file
    const synthetic = [];
    for (const fp of files) {
      try {
        const text = fs.readFileSync(fp, 'utf8');
        const obj = JSON.parse(text);
        // extract memo mode from filename (accept off, light, full, shallow, deep)
        const base = path.basename(fp);
        const mMatch = base.match(
          /-(off|light|full|shallow|deep)-results\.json$/i
        );
        const memoMode = mMatch
          ? mMatch[1].toLowerCase()
          : obj.configuration?.memoMode || 'unknown';
        // Each obj.results is an array of { libraryId, scenarioId, samples }
        if (Array.isArray(obj.results)) {
          for (const r of obj.results) {
            synthetic.push({
              scenario: r.scenarioId || r.scenario || r.label,
              memoMode,
              samples: Array.isArray(r.samples)
                ? r.samples
                : Array.isArray(r.data)
                ? r.data
                : [],
            });
          }
        }
      } catch (e) {
        console.error('Failed to read/parse', fp, e && e.message);
      }
    }
    // Now set results to synthetic entries for downstream processing
    const results = synthetic;
    // Build per scenario pools by mode
    const perScenario = {};
    for (const r of results) {
      const scenario = r.scenario || r.label || 'unknown';
      const mode = r.memoMode || 'unknown';
      if (!perScenario[scenario]) perScenario[scenario] = {};
      if (!perScenario[scenario][mode]) perScenario[scenario][mode] = [];
      perScenario[scenario][mode].push(
        Array.isArray(r.samples) ? r.samples : []
      );
    }

    // Perform comparisons and write report files
    const report = { generated: new Date().toISOString(), scenarios: {} };
    let md = '# Aggregate Benchmark Report\n\n';
    for (const scenario of Object.keys(perScenario)) {
      const modes = perScenario[scenario];
      report.scenarios[scenario] = {};
      md += `## ${scenario}\n\n`;
      for (const mode of Object.keys(modes)) {
        const pooled = flatten(modes[mode]);
        const p50 = pooled.length ? median(pooled) : null;
        const mean = pooled.length
          ? pooled.reduce((s, v) => s + v, 0) / pooled.length
          : null;
        report.scenarios[scenario][mode] = {
          n: pooled.length,
          p50,
          mean,
        };
        const p50Str = p50 !== null ? p50.toFixed(3) : 'N/A';
        const meanStr = mean !== null ? mean.toFixed(3) : 'N/A';
        md += `- mode=${mode} n=${pooled.length} p50=${p50Str} mean=${meanStr}\n`;
      }
      const modeKeys = Object.keys(modes);
      if (modeKeys.length >= 2) {
        const leftKey = modeKeys.includes('light') ? 'light' : modeKeys[0];
        const rightKey = modeKeys.includes('full')
          ? 'full'
          : modeKeys[1] || modeKeys[0];
        const left = flatten(modes[leftKey]);
        const right = flatten(modes[rightKey]);
        if (left.length && right.length) {
          const mw = mannWhitneyU(left, right);
          const cd = cliffsDelta(left, right);
          report.scenarios[scenario].comparison = {
            left: leftKey,
            right: rightKey,
            n1: left.length,
            n2: right.length,
            p: mw.p,
            z: mw.z,
            delta: cd.delta,
            magnitude: cd.magnitude,
          };
          md += `\n**Compare ${leftKey} vs ${rightKey}:** n1=${
            left.length
          } n2=${right.length} p=${mw.p.toExponential(3)} z=${mw.z.toFixed(
            3
          )} delta=${cd.delta.toFixed(3)} magnitude=${cd.magnitude}\n\n`;
        }
      }
      md += '\n';
    }
    try {
      const outJson = path.join(artifactsDir, 'aggregate-report.json');
      fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
      const outMd = path.join(artifactsDir, 'aggregate-report.md');
      fs.writeFileSync(outMd, md, 'utf8');
      console.log('Wrote', outJson, outMd);
    } catch (e) {
      console.error('Failed to write reports', e && e.message);
    }
    process.exit(0);
  }
  const files = args;
  const results = readNdjsonFiles(files);
  // For demo, compare first repeat group vs rest grouped by something? We'll assume files include a metadata `mode` field like memo mode.

  // Build per scenario pools by mode
  const perScenario = {};
  for (const r of results) {
    const scenario = r.scenario || r.label || 'unknown';
    const mode =
      r.memoMode ||
      r.mode ||
      (r.label && r.label.match(/memo:(\w+)/)?.[1]) ||
      'unknown';
    if (!perScenario[scenario]) perScenario[scenario] = {};
    if (!perScenario[scenario][mode]) perScenario[scenario][mode] = [];
    const samples = Array.isArray(r.samples)
      ? r.samples
      : Array.isArray(r.data)
      ? r.data
      : typeof r.p50 === 'number'
      ? [r.p50]
      : [];
    perScenario[scenario][mode].push(samples);
  }

  for (const scenario of Object.keys(perScenario)) {
    console.log('\n===', scenario, '===');
    const modes = perScenario[scenario];
    for (const mode of Object.keys(modes)) {
      const pooled = flatten(modes[mode]);
      if (pooled.length === 0) continue;
      console.log(
        `mode=${mode} n=${pooled.length} p50=${median(pooled).toFixed(
          3
        )} mean=${(pooled.reduce((s, v) => s + v, 0) / pooled.length).toFixed(
          3
        )}`
      );
    }
    const modeKeys = Object.keys(modes);
    if (modeKeys.length >= 2) {
      // choose first two modes to compare (prefer 'light' vs 'full')
      const leftKey = modeKeys.includes('light') ? 'light' : modeKeys[0];
      const rightKey = modeKeys.includes('full')
        ? 'full'
        : modeKeys[1] || modeKeys[0];
      const left = flatten(modes[leftKey]);
      const right = flatten(modes[rightKey]);
      if (left.length && right.length) {
        const mw = mannWhitneyU(left, right);
        const cd = cliffsDelta(left, right);
        console.log(
          `Compare ${leftKey} vs ${rightKey}: n1=${left.length} n2=${
            right.length
          } p=${mw.p.toExponential(3)} z=${mw.z.toFixed(
            3
          )} delta=${cd.delta.toFixed(3)} magnitude=${cd.magnitude}`
        );
      }
    }
  }
}

main();
