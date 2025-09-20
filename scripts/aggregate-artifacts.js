#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts');
const OUT_JSON = path.join(ARTIFACTS_DIR, 'aggregate-report.json');
const OUT_MD = path.join(ARTIFACTS_DIR, 'aggregate-report.md');

function safeNum(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

function analyzeSamples(samples) {
  const n = samples.length;
  if (n === 0)
    return {
      count: 0,
      manyZeros: false,
      quantized: false,
      stddev: null,
      median: null,
    };
  const zeros = samples.filter((x) => x === 0).length;
  const uniq = Object.create(null);
  samples.forEach((s) => {
    uniq[String(s)] = (uniq[String(s)] || 0) + 1;
  });
  const maxSame = Math.max(...Object.values(uniq));
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  const sorted = samples.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  // Compute median/p95 on non-zero samples when many zeros are present to avoid
  // reporting misleading 0 medians caused by timer quantization.
  const nonZero = samples.filter((x) => x !== 0);
  let medianNonZero = null;
  if (nonZero.length) {
    const s2 = nonZero.slice().sort((a, b) => a - b);
    medianNonZero = s2[Math.floor(s2.length / 2)];
  }
  const manyZeros = zeros / n >= 0.25; // heuristic
  const quantized = maxSame / n >= 0.35 && median < 0.5; // many identical low values
  const relStd = median ? stddev / Math.max(1e-12, median) : null;
  const highVariance = relStd !== null && relStd > 1.0;
  return {
    count: n,
    zeros,
    manyZeros,
    quantized,
    maxSame,
    stddev,
    median: medianNonZero !== null && manyZeros ? medianNonZero : median,
    medianNonZero: medianNonZero,
    relStd,
    highVariance,
  };
}

function readArtifacts() {
  const files = fs
    .readdirSync(ARTIFACTS_DIR)
    .filter((f) => f.endsWith('-results.json'));
  const libs = {};
  files.forEach((f) => {
    const raw = fs.readFileSync(path.join(ARTIFACTS_DIR, f), 'utf8');
    try {
      const json = JSON.parse(raw);
      const name =
        (json.summaries && json.summaries[0] && json.summaries[0].name) ||
        f.replace(/-results.json$/, '');
      // map results by scenario
      libs[name] = json;
    } catch (e) {
      console.error('Failed parse', f, e.message);
    }
  });
  return libs;
}

function aggregate(libs) {
  // collect all scenario ids
  const scenarios = new Set();
  Object.values(libs).forEach((j) => {
    (j.results || []).forEach((r) => scenarios.add(r.scenarioId));
  });
  const table = {};
  Array.from(scenarios).forEach((scenario) => {
    table[scenario] = { scenario, libraries: {} };
    Object.entries(libs).forEach(([libName, json]) => {
      const entry = (json.results || []).find((r) => r.scenarioId === scenario);
      if (!entry) return;
      const stats = analyzeSamples(entry.samples || []);
      table[scenario].libraries[libName] = {
        median: safeNum(entry.median),
        p95: safeNum(entry.p95),
        opsPerSecond: safeNum(entry.opsPerSecond),
        sampleCount: stats.count,
        zeros: stats.zeros || 0,
        manyZeros: !!stats.manyZeros,
        quantized: !!stats.quantized,
        stdDev: safeNum(stats.stddev),
        relStd: safeNum(stats.relStd),
        highVariance: !!stats.highVariance,
      };
    });
  });
  return table;
}

function writeReports(table) {
  const out = { generatedAt: new Date().toISOString(), scenarios: table };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

  const libs = new Set();
  Object.values(table).forEach((s) =>
    Object.keys(s.libraries).forEach((l) => libs.add(l))
  );
  const libList = Array.from(libs);

  const lines = [];
  lines.push('# Aggregate benchmark report');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('');
  lines.push('## Summary');
  lines.push(`Libraries found: ${libList.join(', ')}`);
  lines.push('');
  lines.push('## Per-scenario table');
  Object.values(table).forEach((s) => {
    lines.push(`### ${s.scenario}`);
    lines.push('');

    // Compute ranking (lower median is better). Ignore libs with missing median.
    const rankCandidates = Object.entries(s.libraries)
      .filter(([, c]) => typeof c.median === 'number')
      .map(([lib, c]) => ({ lib, median: c.median }));
    rankCandidates.sort((a, b) => a.median - b.median);
    const top3 = rankCandidates.slice(0, 3).map((r) => r.lib);

    lines.push(
      '| Library | median (ms) | p95 (ms) | ops/s | samples | manyZeros | quantized | highVariance | Rank |'
    );
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    libList.forEach((lib) => {
      const cell = s.libraries[lib];
      if (!cell || cell.median == null) {
        // Don't award trophies for N/A; show N/A in Rank
        lines.push(`| ${lib} | - | - | - | 0 | - | - | - | N/A |`);
      } else {
        // Determine medal icon if in top 3
        let rankIcon = '';
        const idx = top3.indexOf(lib);
        if (idx === 0) rankIcon = '🏆';
        else if (idx === 1) rankIcon = '🥈';
        else if (idx === 2) rankIcon = '🥉';

        lines.push(
          `| ${lib} | ${cell.median ?? '-'} | ${cell.p95 ?? '-'} | ${
            cell.opsPerSecond ?? '-'
          } | ${cell.sampleCount} | ${cell.manyZeros ? 'YES' : 'no'} | ${
            cell.quantized ? 'YES' : 'no'
          } | ${cell.highVariance ? 'YES' : 'no'} | ${rankIcon || '-'} |`
        );
      }
    });
    lines.push('');
    // recommendations
    const flagged = [];
    Object.entries(s.libraries).forEach(([lib, c]) => {
      if (c.manyZeros) flagged.push(`${lib}: many zeros`);
      if (c.quantized) flagged.push(`${lib}: quantized low samples`);
      if (c.highVariance) flagged.push(`${lib}: high variance`);
    });
    if (flagged.length) {
      lines.push('**Flags**:');
      flagged.forEach((f) => lines.push('- ' + f));
      lines.push('');
      lines.push(
        '**Recommendation**: For scenarios flagged with many zeros / quantized: increase per-sample work, set the enhanced runner (longer minDuration), or rerun with aggregation mode to avoid timer quantization.'
      );
      lines.push('');
    }
  });

  fs.writeFileSync(OUT_MD, lines.join('\n'));
  console.log('Wrote', OUT_JSON, OUT_MD);
}

function main() {
  const libs = readArtifacts();
  const table = aggregate(libs);
  writeReports(table);
}

main();
