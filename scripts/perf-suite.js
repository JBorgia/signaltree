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

// use helpers from ./lib/metrics.cjs directly

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
    const parsed = metrics.parseRecursiveOutput(res.out);
    for (const k of Object.keys(buckets))
      if (parsed[k] != null) buckets[k].push(parsed[k]);
  }

  const summary = {};
  for (const k of Object.keys(buckets)) summary[k] = metrics.stats(buckets[k]);

  // Run entity CRUD performance benchmarks
  console.log('\n🧪 Running entity-crud-performance benchmarks');
  const ecpRes = run('node', ['scripts/performance/entity-crud-performance.js']);
  let entityResults = null;
  if (ecpRes.code !== 0) {
    console.warn('  ⚠ entity-crud-performance failed:', ecpRes.err || ecpRes.out);
  } else {
    console.log('  ✅ Entity CRUD benchmarks completed');
    entityResults = metrics.parseEntityOutput(ecpRes.out);
  }

  // Run proxy callable overhead microbench
  console.log('\n⏱ Running proxy-call-overhead microbench');
  // Ensure core ESM bundle exists for the microbench import
  const coreEsm = path.join(process.cwd(), 'dist/packages/core/dist/index.js');
  if (!fs.existsSync(coreEsm)) {
    const buildMsg =
      '  ⏳ building @signaltree/core (production) for microbench...';
    console.log(buildMsg);
    const b = run('pnpm', [
      'nx',
      'build',
      'core',
      '--configuration=production',
    ]);
    if (b.code !== 0) {
      console.warn(
        '  ⚠ core build failed, microbench may fail too:',
        b.err || b.out
      );
    }
  }
  const pco = run('node', ['scripts/performance/proxy-call-overhead.js']);
  let proxyOverhead = null;
  if (pco.code !== 0) {
    console.warn('  ⚠ proxy-call-overhead failed:', pco.err || pco.out);
  } else {
    process.stdout.write(pco.out);
    proxyOverhead = metrics.parseProxyOverhead(pco.out);
  }

  // Run consolidated bundle analysis if available
  let bundleResults = null;
  if (fs.existsSync(path.join(__dirname, 'consolidated-bundle-analysis.js'))) {
    console.log('\n📦 Running consolidated-bundle-analysis.js');
    // Prefer requiring the analyzer to capture structured results
    try {
      const Analyzer = require('./consolidated-bundle-analysis.js');
      const analyzer = new Analyzer();
      const { exitCode } = analyzer.execute();
      bundleResults = analyzer.results;
      bundleResults.exitCode = exitCode;
    } catch (err) {
      console.warn(
        '  ⚠ structured analyzer invoke failed, falling back to CLI:',
        err && err.message
      );
      const bres = run('node', ['scripts/consolidated-bundle-analysis.js']);
      if (bres.code === 0 || bres.out) {
        bundleResults = metrics.parseBundleReport(bres.out + bres.err);
      }
    }
  } else {
    console.warn(
      '\n⚠ consolidated-bundle-analysis.js not found, skipping bundle size parse'
    );
  }

  // Baseline handling and deltas
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);
  const baselinePath = path.join(artifactsDir, 'perf-baseline.json');
  let baseline = null;
  if (fs.existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch (e) {
      console.warn(
        '  ⚠ failed to parse baseline, will recreate:',
        e && e.message
      );
    }
  }
  const updateBaseline = process.env.PERF_UPDATE_BASELINE === '1';
  if (!baseline || updateBaseline) {
    const newBaseline = {
      timestamp: new Date().toISOString(),
      summary,
      proxyOverhead,
      packages:
        bundleResults && bundleResults.packages ? bundleResults.packages : [],
    };
    fs.writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2));
    if (updateBaseline) console.log(`\n💾 Baseline updated at ${baselinePath}`);
    baseline = newBaseline;
  }

  // Compute deltas
  const packageDeltas = metrics.deltaPackages(
    bundleResults && bundleResults.packages,
    baseline && baseline.packages
  );
  const perfDeltas = metrics.deltaPerf(summary, baseline && baseline.summary);
  const proxyDeltas = metrics.deltaProxy(
    proxyOverhead,
    baseline && baseline.proxyOverhead
  );

  // Constraints check (soft):
  // - No package exceeds maxAllowed (already tracked in bundleResults)
  // - Proxy overhead set/update mean increase vs baseline < budget (default 25%)
  // - Perf basic/medium/extreme/unlimited mean increase vs baseline < budget (default 25%)
  // - Optional: enforce claimed sizes (PERF_ENFORCE_CLAIMS=1)
  const constraintViolations = [];
  const overheadBudgetPct = Number(process.env.PERF_OVERHEAD_BUDGET_PCT || 25); // allowed regression threshold
  for (const k of ['set', 'update']) {
    const pct = proxyDeltas[k]?.pct;
    if (typeof pct === 'number' && pct > overheadBudgetPct) {
      constraintViolations.push(
        `proxy.${k} +${pct.toFixed(1)}% > ${overheadBudgetPct}%`
      );
    }
  }
  for (const k of ['basic', 'medium', 'extreme', 'unlimited']) {
    const pct = perfDeltas[k]?.pct;
    if (typeof pct === 'number' && pct > overheadBudgetPct) {
      constraintViolations.push(
        `perf.${k} +${pct.toFixed(1)}% > ${overheadBudgetPct}%`
      );
    }
  }
  const anyPackageFailed = Array.isArray(bundleResults?.packages)
    ? bundleResults.packages.some((p) => p && p.passed === false)
    : false;
  if (anyPackageFailed) constraintViolations.push('package size budget failed');

  // Optional: enforce claimed sizes as constraints
  const enforceClaims = process.env.PERF_ENFORCE_CLAIMS === '1';
  let anyClaimExceeded = false;
  if (enforceClaims && Array.isArray(bundleResults?.packages)) {
    anyClaimExceeded = bundleResults.packages.some(
      (p) => p && p.claimMet === false
    );
    if (anyClaimExceeded)
      constraintViolations.push('package claimed size exceeded');
  }

  const out = {
    timestamp: new Date().toISOString(),
    runs,
    summary,
    proxyOverhead,
    bundleResults,
    baseline: {
      timestamp: baseline?.timestamp,
      proxyOverhead: baseline?.proxyOverhead || null,
      summary: baseline?.summary || null,
      packages: baseline?.packages || [],
    },
    deltas: {
      proxyOverhead: proxyDeltas,
      perf: perfDeltas,
      packages: packageDeltas,
    },
    constraints: {
      overheadBudgetPct,
      enforceClaims,
      violations: constraintViolations,
      pass: constraintViolations.length === 0,
    },
  };

  // Ensure artifacts directory
  const outPath = path.join(artifactsDir, 'perf-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log('\n📊 Performance summary:');
  console.dir(summary, { depth: 3 });
  if (bundleResults) {
    console.log('\n📦 Bundle gzipped sizes (KB):');
    if (Array.isArray(bundleResults.packages)) {
      console.table(
        bundleResults.packages.map((p) => ({
          name: p.name,
          gzipKB: (p.gzipSize / 1024).toFixed(2),
          maxKB: (p.maxAllowed / 1024).toFixed(2),
          passed: p.passed,
        }))
      );
    } else {
      console.table(bundleResults);
    }
    if (out.constraints && !out.constraints.pass) {
      console.log('\n❌ Constraint violations:');
      out.constraints.violations.forEach((v) => console.log(` - ${v}`));
    } else {
      console.log('\n✅ Constraints: PASS');
    }
  }

  console.log(`\n✅ Written summary to ${outPath}`);
}

main().catch((err) => {
  console.error('perf-suite failed:', err);
  process.exit(1);
});
