#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const metrics = require('./lib/metrics.cjs');

function run(cmd, args = []) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    code: res.status || 0,
    out: res.stdout || '',
    err: res.stderr || '',
  };
}

function parseRecursiveOutput(out) {
  const lines = out.split(/\r?\n/);
  const avgRe = /(Basic|Medium|Extreme|Unlimited).*?:\s*([0-9.]+)ms\s*avg/i;
  const metrics = {};
  for (const line of lines) {
    const m = line.match(avgRe);
    if (m) metrics[m[1].toLowerCase()] = Number(m[2]);
  }
  return metrics;
}

function stats(values) {
  if (!values || values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  return { runs: n, mean, min, max, stddev };
}

function parseBundleReport(out) {
  // split by package marker used in bundle-size-report.js (\ud83d\udce6)
  const blocks = out.split('\ud83d\udce6').slice(1);
  const packages = [];
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const name = lines[0].replace(':', '').trim();
    const gzMatch = block.match(/Gzipped:\s*([0-9.]+)KB/i);
    const gz = gzMatch ? Number(gzMatch[1]) : null;
    packages.push({ package: name, gzippedKB: gz });
  }
  return packages;
}

async function main() {
  const runs = Number(process.env.RUNS || process.argv[2] || 3);
  console.log(`\n🧪 Running perf-suite (runs=${runs})`);

  const buckets = { basic: [], medium: [], extreme: [], unlimited: [] };

  for (let i = 0; i < runs; i++) {
    console.log(`  ▶ run ${i + 1}/${runs}`);
    const res = run('node', ['scripts/performance/recursive-performance.js']);
    if (res.code !== 0) {
      console.error('  ❌ recursive-performance failed:', res.err || res.out);
      process.exit(res.code || 1);
    }
    const parsed = parseRecursiveOutput(res.out);
    for (const k of Object.keys(buckets))
      if (parsed[k] != null) buckets[k].push(parsed[k]);
  }

  const summary = {};
  for (const k of Object.keys(buckets)) summary[k] = metrics.stats(buckets[k]);

  // Run bundle-size-report if available
  let bundleResults = null;
  if (fs.existsSync(path.join(__dirname, 'bundle-size-report.js'))) {
    console.log('\n📦 Running bundle-size-report.js');
    const bres = run('node', ['scripts/bundle-size-report.js']);
    if (bres.code === 0 || bres.out) {
      bundleResults = metrics.parseBundleReport(bres.out + bres.err);
    } else {
      console.warn('  ⚠ bundle-size-report failed or returned nothing');
    }
  } else {
    console.warn(
      '\n⚠ bundle-size-report.js not found, skipping bundle size parse'
    );
  }

  const out = {
    timestamp: new Date().toISOString(),
    runs,
    summary,
    bundleResults,
  };

  // Ensure artifacts directory
  const artifacts = path.join(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifacts)) fs.mkdirSync(artifacts);
  const outPath = path.join(artifacts, 'perf-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log('\n📊 Performance summary:');
  console.dir(summary, { depth: 3 });
  if (bundleResults) {
    console.log('\n📦 Bundle gzipped sizes (KB):');
    console.table(bundleResults);
  }

  console.log(`\n✅ Written summary to ${outPath}`);
}

main().catch((err) => {
  console.error('perf-suite failed:', err);
  process.exit(1);
});
