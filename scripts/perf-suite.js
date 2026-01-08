#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const metrics = require('./lib/metrics.cjs');

// Helper run() accepts optional env overrides and optionally silences parent logs
function run(cmd, args = [], options = {}) {
  const env = Object.assign({}, process.env, options.env || {});
  const res = spawnSync(cmd, args, { encoding: 'utf8', env });
  return {
    code: res.status || 0,
    out: res.stdout || '',
    err: res.stderr || '',
  };
}

// Mute / restore console for critical timing windows
function muteConsole() {
  if (!globalThis.__perf_original_console) {
    globalThis.__perf_original_console = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }
}
function restoreConsole() {
  if (globalThis.__perf_original_console) {
    console.log = globalThis.__perf_original_console.log;
    console.warn = globalThis.__perf_original_console.warn;
    console.error = globalThis.__perf_original_console.error;
    delete globalThis.__perf_original_console;
  }
}

// use helpers from ./lib/metrics.cjs directly

async function main() {
  const runs = Number(process.env.RUNS || process.argv[2] || 3);
  const quiet = process.env.PERF_QUIET === '1';
  if (quiet) process.env.SILENT_DEPRECATIONS = '1';

  if (!quiet) console.log(`\n🧪 Running perf-suite (runs=${runs})`);

  // Pre-build: ensure packages are built before time-sensitive runs to avoid
  // file-system noise during timing.
  if (!quiet) console.log('\n🔧 Ensuring production builds are available...');
  const buildRes = run(
    'pnpm',
    ['nx', 'run-many', '--target=build', '--all', '--configuration=production'],
    {
      env: {
        ...process.env,
        SILENT_DEPRECATIONS: process.env.SILENT_DEPRECATIONS,
      },
    }
  );
  if (buildRes.code !== 0) {
    if (!quiet)
      console.warn(
        '  ⚠ Build step encountered an error (continuing):',
        buildRes.err || buildRes.out
      );
  } else {
    if (!quiet) console.log('  ✅ Build step completed');
  }

  const buckets = { basic: [], medium: [], extreme: [], unlimited: [] };

  for (let i = 0; i < runs; i++) {
    if (!quiet) console.log(`  ▶ run ${i + 1}/${runs}`);
    if (quiet) muteConsole();
    const res = run('node', ['scripts/performance/recursive-performance.js'], {
      env: { SILENT_DEPRECATIONS: process.env.SILENT_DEPRECATIONS },
    });
    if (quiet) restoreConsole();
    if (res.code !== 0) {
      console.error('  ❌ recursive-performance failed:', res.err || res.out);
      process.exit(res.code || 1);
    }
    const parsed = metrics.parseRecursiveOutput(res.out);
    for (const k of Object.keys(buckets))
      if (parsed[k] != null) buckets[k].push(parsed[k]);
  }

  // Optionally trim min/max outliers when requested
  const trimOutliers = process.env.PERF_TRIM_OUTLIERS === '1';
  const summary = {};
  for (const k of Object.keys(buckets)) {
    const values = buckets[k].slice();
    if (trimOutliers && values.length >= 4) {
      values.sort((a, b) => a - b);
      values.shift();
      values.pop();
    }
    summary[k] = metrics.stats(values);
  }

  // Run entity CRUD performance benchmarks
  if (!quiet) console.log('\n🧪 Running entity-crud-performance benchmarks');
  if (quiet) muteConsole();
  const ecpRes = run(
    'node',
    ['scripts/performance/entity-crud-performance.js'],
    { env: { SILENT_DEPRECATIONS: process.env.SILENT_DEPRECATIONS } }
  );
  if (quiet) restoreConsole();
  let entityResults = null;
  if (ecpRes.code !== 0) {
    console.warn(
      '  ⚠ entity-crud-performance failed:',
      ecpRes.err || ecpRes.out
    );
  } else {
    if (!quiet) console.log('  ✅ Entity CRUD benchmarks completed');
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
  if (!quiet) console.log('\n⏱ Running proxy-call-overhead microbench');
  if (quiet) muteConsole();
  const pco = run('node', ['scripts/performance/proxy-call-overhead.js'], {
    env: { SILENT_DEPRECATIONS: process.env.SILENT_DEPRECATIONS },
  });
  if (quiet) restoreConsole();
  let proxyOverhead = null;
  if (pco.code !== 0) {
    console.warn('  ⚠ proxy-call-overhead failed:', pco.err || pco.out);
  } else {
    if (!quiet) process.stdout.write(pco.out);
    proxyOverhead = metrics.parseProxyOverhead(pco.out);
  }

  // Run consolidated bundle analysis if available
  let bundleResults = null;
  if (fs.existsSync(path.join(__dirname, 'consolidated-bundle-analysis.js'))) {
    console.log('\n📦 Running consolidated-bundle-analysis.js');
    // Prefer requiring the analyzer to capture structured results
    try {
      if (quiet) muteConsole();
      const Analyzer = require('./consolidated-bundle-analysis.js');
      const analyzer = new Analyzer();
      const { exitCode } = analyzer.execute();
      if (quiet) restoreConsole();
      bundleResults = analyzer.results;
      bundleResults.exitCode = exitCode;
    } catch (err) {
      if (quiet) restoreConsole();
      console.warn(
        '  ⚠ structured analyzer invoke failed, falling back to CLI:',
        err && err.message
      );
      const bres = run('node', ['scripts/consolidated-bundle-analysis.js'], {
        env: { SILENT_DEPRECATIONS: process.env.SILENT_DEPRECATIONS },
      });
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

  if (!quiet) {
    console.log('\n📊 Performance summary:');
    console.dir(summary, { depth: 3 });
  }
  if (bundleResults && !quiet) {
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

  if (quiet) {
    console.log(
      `\n✅ perf-suite finished (quiet). Summary written to ${outPath}`
    );
  } else {
    console.log(`\n✅ Written summary to ${outPath}`);
  }

  // Optionally fail the process when constraints are violated (CI safety)
  const failOnViolation = process.env.PERF_FAIL_ON_VIOLATION === '1';
  if (failOnViolation && out.constraints && !out.constraints.pass) {
    console.error(
      '\n❌ perf-suite: constraints violated, failing per PERF_FAIL_ON_VIOLATION'
    );
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('perf-suite failed:', err);
  process.exit(1);
});
