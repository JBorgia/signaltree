#!/usr/bin/env node
/**
 * Enhanced micro benchmark runner capturing distribution statistics
 * Produces: latest-micro-bench-stats.json
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { colors, box, enhancedTable, THRESHOLDS } from './utils.mjs';
import { readFileSync, existsSync } from 'node:fs';

async function loadCore() {
  try {
    return await import(
      '../../dist/packages/core/fesm2022/signaltree-core.mjs'
    );
  } catch {
    const { execSync } = await import('node:child_process');
    execSync('pnpm nx build core --configuration=production', {
      stdio: 'inherit',
    });
    return await import(
      '../../dist/packages/core/fesm2022/signaltree-core.mjs'
    );
  }
}

function sample(label, fn, iterations = 200, inner = 100) {
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    for (let j = 0; j < inner; j++) fn();
    const end = performance.now();
    samples.push((end - start) / inner);
  }
  samples.sort((a, b) => a - b);
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const median =
    n % 2 ? samples[(n - 1) / 2] : (samples[n / 2 - 1] + samples[n / 2]) / 2;
  const p95 = samples[Math.min(n - 1, Math.floor(n * 0.95))];
  return { label, mean, median, stddev, p95, samples: samples.slice(0, 5) };
}

// Simple CLI args parsing
function parseArgs(argv) {
  const args = {
    iterations: undefined,
    inner: undefined,
    json: false,
    jsonFile: undefined,
    noColor: false,
    noEmoji: false,
    baseline: undefined,
    failOnRegression: false,
    thresholds: undefined,
    regressionPct: 0.1,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '--json-only') args.json = true;
    else if (a === '--json-file') args.jsonFile = argv[++i];
    else if (a === '--iterations' || a === '-i')
      args.iterations = parseInt(argv[++i], 10);
    else if (a === '--inner') args.inner = parseInt(argv[++i], 10);
    else if (a === '--no-color') {
      process.env.NO_COLOR = '1';
      args.noColor = true;
    } else if (a === '--no-emoji') args.noEmoji = true;
    else if (a === '--baseline') args.baseline = argv[++i];
    else if (a === '--fail-on-regression') args.failOnRegression = true;
    else if (a === '--thresholds') args.thresholds = argv[++i];
    else if (a === '--regression-pct')
      args.regressionPct = parseFloat(argv[++i]);
  }
  return args;
}

function loadThresholdOverrides(str) {
  if (!str) return null;
  try {
    if (existsSync(str)) {
      return JSON.parse(readFileSync(str, 'utf8'));
    }
    return JSON.parse(str);
  } catch {
    console.error('Failed to parse thresholds override', e.message);
    return null;
  }
}

function applyThresholdOverrides(overrides) {
  if (!overrides) return;
  for (const k of Object.keys(overrides)) {
    if (THRESHOLDS[k]) Object.assign(THRESHOLDS[k], overrides[k]);
  }
}

(async () => {
  const args = parseArgs(process.argv);
  applyThresholdOverrides(loadThresholdOverrides(args.thresholds));
  const core = await loadCore();
  const results = [];
  const its = args.iterations || 60;
  const inner = args.inner || 10;
  results.push(
    sample('create:small', () => core.signalTree({ a: 1 }), its, inner)
  );
  const tree = core.signalTree({ count: 0, nested: { value: 1 } });
  results.push(
    sample(
      'update:primitive',
      () => {
        const c = tree.state.count();
        tree.state.count.set(c + 1);
      },
      args.iterations || 120,
      args.inner || 20
    )
  );
  const double = core.computed(() => tree.state.count() * 2);
  results.push(
    sample(
      'read:computed',
      () => double(),
      args.iterations || 120,
      args.inner || 50
    )
  );

  const out = { ts: new Date().toISOString(), results };
  const ROOT = process.cwd();
  const RESULTS_DIR = path.join(
    ROOT,
    'scripts/performance/results/micro/angular'
  );
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
  } catch {
    // ignore directory creation race
  }
  const outPath = path.join(RESULTS_DIR, 'latest.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  // Legacy compatibility write (will be deprecated)
  const legacyPath = path.join(
    ROOT,
    'scripts/performance/latest-micro-bench-stats.json'
  );
  try {
    writeFileSync(legacyPath, JSON.stringify(out, null, 2));
  } catch {
    // ignore legacy write failure
  }

  // Baseline comparison
  let baselineData = null;
  const regressions = [];
  // Auto-attempt baseline if not provided explicitly: organized path then legacy
  if (args.baseline || !args.json) {
    try {
      // Determine baseline path precedence: explicit flag > organized dir > legacy flat file
      const organizedBaseline = path.join(
        ROOT,
        'scripts/performance/baselines/micro/angular/baseline.json'
      );
      if (args.baseline) {
        baselineData = JSON.parse(readFileSync(args.baseline, 'utf8'));
      } else {
        try {
          baselineData = JSON.parse(readFileSync(organizedBaseline, 'utf8'));
        } catch {
          // fallback to legacy if exists
          const legacyBaseline = path.join(
            ROOT,
            'scripts/performance/baseline-micro-bench-stats.json'
          );
          try {
            baselineData = JSON.parse(readFileSync(legacyBaseline, 'utf8'));
          } catch {
            // no baseline found
          }
        }
      }
      if (baselineData) {
        const baseMap = new Map(baselineData.results.map((r) => [r.label, r]));
        for (const r of results) {
          const b = baseMap.get(r.label);
          if (!b) continue;
          const deltaMedian = r.median - b.median;
          const pct = b.median ? deltaMedian / b.median : 0;
          const baseStddevRatio = b.median ? b.stddev / b.median : 0;
          const newStddevRatio = r.median ? r.stddev / r.median : 0;
          const baseTailRatio = b.median ? (b.p95 - b.median) / b.median : 0;
          const newTailRatio = r.median ? (r.p95 - r.median) / r.median : 0;
          const regression = pct > (args.regressionPct ?? 0.1);
          regressions.push({
            label: r.label,
            baselineMedian: b.median,
            newMedian: r.median,
            deltaMedian,
            pct,
            baselineStddevRatio: baseStddevRatio,
            newStddevRatio,
            deltaStddevRatio: newStddevRatio - baseStddevRatio,
            baselineTailRatio: baseTailRatio,
            newTailRatio,
            deltaTailRatio: newTailRatio - baseTailRatio,
            regression,
          });
        }
      }
    } catch (e) {
      console.error('Failed to load baseline', e.message);
    }
  }

  // JSON-only mode
  if (args.json) {
    const jsonOut = {
      ...out,
      thresholds: THRESHOLDS,
      regressionPct: args.regressionPct,
      regressions: regressions.filter((r) => r.regression),
    };
    const jsonFile = args.jsonFile || outPath.replace('.json', '-full.json');
    writeFileSync(jsonFile, JSON.stringify(jsonOut, null, 2));
    if (args.failOnRegression && regressions.some((r) => r.regression)) {
      console.error('Regressions detected.');
      process.exitCode = 1;
    }
    if (args.json && !process.stdout.isTTY) return; // in CI just exit after writing
  }

  const {
    brightMagenta,
    brightYellow,
    cyan,
    brightCyan,
    brightGreen,
    yellow,
    brightBlue,
    blue,
    gray,
    brightWhite,
    white,
    bold,
    red,
    brightRed,
    green,
  } = colors;

  // Header with gradient-like effect
  if (!args.json) {
    console.log(
      '\n' +
        box(
          [
            bold(
              args.noEmoji
                ? 'SignalTree Performance Benchmarks'
                : '📊 SignalTree Performance Benchmarks'
            ),
            `⏱  ${new Date().toLocaleString()}`,
            `📁 ${outPath.replace(process.cwd(), '.')}`,
            args.baseline
              ? `🧪 Baseline: ${args.baseline}`
              : baselineData
              ? '🧪 Baseline: (auto)'
              : undefined,
          ].filter(Boolean),
          {
            borderColor: brightMagenta,
            titleColor: brightYellow,
            contentColor: cyan,
            style: 'double',
          }
        ) +
        '\n'
    );
  }

  // use shared enhancedTable below

  // Prepare definition data
  const definitionData = [
    { name: 'create:small', description: 'Construction latency' },
    { name: 'update:primitive', description: 'Primitive set latency' },
    { name: 'read:computed', description: 'Computed access latency' },
    { name: '', description: '', isSeparator: true },
    { name: 'median', description: '50th percentile (central tendency)' },
    { name: 'stddev', description: 'Standard deviation (stability)' },
    { name: 'p95', description: '95th percentile (tail latency)' },
  ];

  if (!args.json)
    enhancedTable(
      args.noEmoji
        ? 'Metric & Distribution Definitions'
        : '📖 Metric & Distribution Definitions',
      definitionData,
      {
        headerColor: brightBlue,
        borderColor: blue,
        labelColor: brightCyan,
      }
    );
  if (!args.json)
    console.log(
      '\n' + gray('📏 Units: milliseconds per operation iteration\n')
    );

  // Prepare results data with formatted numbers
  const resultsData = results.map((r) => ({
    metric: r.label,
    median: r.median.toFixed(6),
    stddev: r.stddev.toFixed(6),
    p95: r.p95.toFixed(6),
  }));

  // Using shared THRESHOLDS from utils

  // Override printer to use threshold-aware coloring
  if (!args.json)
    enhancedTable(
      args.noEmoji ? 'Performance Results' : '⚡ Performance Results',
      resultsData,
      {
        headerColor: brightGreen,
        borderColor: green,
        labelColor: brightYellow,
        valueColors: {
          good: brightGreen,
          medium: brightYellow,
          bad: brightRed,
        },
        thresholds: THRESHOLDS,
      }
    );

  // Performance indicator with color coding
  if (!args.json) {
    const summaryLines = [
      bold('Performance Summary'),
      '',
      ...results.map((r) => {
        const median = r.median;
        const { good, medium } = THRESHOLDS.median;
        let indicator, color;
        if (median < good) {
          indicator = '🟢 Excellent     ';
          color = brightGreen;
        } else if (median < medium) {
          indicator = '🟡 Good          ';
          color = brightYellow;
        } else {
          indicator = '🔴 Needs Attention';
          color = brightRed;
        }
        // Add tail / stability annotations with reset to prevent bleeding
        const stddevRatio = r.stddev / (median || 1);
        const tailRatio = (r.p95 - median) / (median || 1);
        const srFlag =
          stddevRatio > THRESHOLDS.stddevRatio.medium
            ? red('σ↑')
            : stddevRatio > THRESHOLDS.stddevRatio.good
            ? yellow('σ~')
            : green('σ✓');
        const tailFlag =
          tailRatio > THRESHOLDS.tailRatio.medium
            ? red('tail↑')
            : tailRatio > THRESHOLDS.tailRatio.good
            ? yellow('tail~')
            : green('tail✓');
        // Add explicit reset after each colored element
        return `${brightCyan(r.label.padEnd(20))}\u001b[0m ${color(
          indicator
        )}\u001b[0m  ${srFlag}\u001b[0m ${tailFlag}\u001b[0m`;
      }),
      '',
      ...(regressions.length && baselineData
        ? [
            bold('Baseline Comparison:'),
            ...regressions.map((r) => {
              const pctFmt = (r.pct * 100).toFixed(2) + '%';
              const sign = r.deltaMedian >= 0 ? '+' : '';
              const colorFn = r.regression ? brightRed : brightGreen;
              const sdDelta = (r.deltaStddevRatio * 100).toFixed(1) + 'Δσ%';
              const tailDelta = (r.deltaTailRatio * 100).toFixed(1) + 'Δtail%';
              return `${r.label.padEnd(18)} ${colorFn(
                sign + pctFmt
              )} (base ${r.baselineMedian.toFixed(6)} -> ${r.newMedian.toFixed(
                6
              )}) ${sdDelta} ${tailDelta}`;
            }),
            gray(
              `Regression threshold: +${(args.regressionPct * 100).toFixed(
                1
              )}% median`
            ),
            gray(`Results dir: ${RESULTS_DIR.replace(process.cwd(), '.')}`),
          ]
        : []),
    ];

    console.log(
      '\n' +
        box(summaryLines, {
          borderColor: gray,
          titleColor: brightWhite,
          contentColor: white,
          style: 'rounded',
        })
    );
  }

  if (!args.json)
    console.log(
      '\n' +
        gray(
          '📊 Thresholds:\n' +
            '   • median: < 0.001ms = Excellent, < 0.005ms = Good, else Needs Attention\n' +
            '   • stddev/median: ≤ 0.25 = Excellent, ≤ 0.5 = Good, else High variance\n' +
            '   • (p95 - median)/median: ≤ 1 = Excellent, ≤ 2 = Good, else Heavy tail\n'
        )
    );

  if (args.failOnRegression && regressions.some((r) => r.regression)) {
    process.exitCode = 1;
  }
})();
