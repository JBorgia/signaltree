#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { colors, box, enhancedTable, THRESHOLDS } from './utils.mjs';
import { readFileSync, existsSync, writeFileSync as writeFile } from 'node:fs';

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

function sample(label, fn, iterations = 120, inner = 50) {
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
    if (existsSync(str)) return JSON.parse(readFileSync(str, 'utf8'));
    return JSON.parse(str);
  } catch (e) {
    console.error('Failed to parse thresholds override', e.message);
    return null;
  }
}
function applyThresholdOverrides(overrides) {
  if (!overrides) return;
  for (const k of Object.keys(overrides))
    if (THRESHOLDS[k]) Object.assign(THRESHOLDS[k], overrides[k]);
}

(async () => {
  const args = parseArgs(process.argv);
  applyThresholdOverrides(loadThresholdOverrides(args.thresholds));
  const core = await loadCore();
  core.configureSignalEngine({ ...core.vanillaEngine });
  const results = [];
  const its = args.iterations || 50;
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
      args.iterations || 100,
      args.inner || 20
    )
  );
  const double = core.computed(() => tree.state.count() * 2);
  results.push(
    sample(
      'read:computed',
      () => double(),
      args.iterations || 100,
      args.inner || 40
    )
  );
  const out = { ts: new Date().toISOString(), engine: 'vanilla', results };
  const ROOT = process.cwd();
  const RESULTS_DIR = path.join(
    ROOT,
    'scripts/performance/results/micro/vanilla'
  );
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
  const outPath = path.join(RESULTS_DIR, 'latest.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const legacyPath = path.join(
    ROOT,
    'scripts/performance/latest-micro-bench-stats-vanilla.json'
  );
  try {
    writeFileSync(legacyPath, JSON.stringify(out, null, 2));
  } catch {
    /* ignore legacy */
  }
  let baselineData = null;
  const regressions = [];
  if (args.baseline || !args.json) {
    try {
      if (args.baseline) {
        baselineData = JSON.parse(readFileSync(args.baseline, 'utf8'));
      } else {
        try {
          baselineData = JSON.parse(
            readFileSync(
              path.join(
                ROOT,
                'scripts/performance/baselines/micro/vanilla/baseline.json'
              ),
              'utf8'
            )
          );
        } catch {
          try {
            baselineData = JSON.parse(
              readFileSync(
                path.join(
                  ROOT,
                  'scripts/performance/baseline-micro-bench-stats-vanilla.json'
                ),
                'utf8'
              )
            );
          } catch {
            /* no legacy baseline */
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
  if (args.json) {
    const jsonOut = {
      ...out,
      thresholds: THRESHOLDS,
      regressionPct: args.regressionPct,
      regressions: regressions.filter((r) => r.regression),
    };
    const jsonFile = args.jsonFile || outPath.replace('.json', '-full.json');
    writeFile(jsonFile, JSON.stringify(jsonOut, null, 2));
    if (args.failOnRegression && regressions.some((r) => r.regression))
      process.exitCode = 1;
    if (args.json && !process.stdout.isTTY) return;
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
    dim,
    brightWhite,
    white,
    bold,
    red,
    brightRed,
    green,
  } = colors;
  if (!args.json)
    console.log(
      '\n' +
        box(
          [
            bold
              ? bold(
                  args.noEmoji
                    ? 'SignalTree Performance Benchmarks (Vanilla)'
                    : '📊 SignalTree Performance Benchmarks (Vanilla)'
                )
              : args.noEmoji
              ? 'SignalTree Performance Benchmarks (Vanilla)'
              : '📊 SignalTree Performance Benchmarks (Vanilla)',
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
  // Definition data
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
        ? 'Metric & Distribution Definitions (Vanilla)'
        : '📖 Metric & Distribution Definitions (Vanilla)',
      definitionData,
      { headerColor: brightBlue, borderColor: blue, labelColor: brightCyan }
    );
  if (!args.json)
    console.log(
      '\n' + gray('📏 Units: milliseconds per operation iteration\n')
    );
  const resultsData = results.map((r) => ({
    metric: r.label,
    median: r.median.toFixed(6),
    stddev: r.stddev.toFixed(6),
    p95: r.p95.toFixed(6),
  }));
  if (!args.json)
    enhancedTable(
      args.noEmoji
        ? 'Performance Results (Vanilla)'
        : '⚡ Performance Results (Vanilla)',
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
  if (!args.json) {
    const summaryLines = [
      bold
        ? bold('Performance Summary (Vanilla)')
        : 'Performance Summary (Vanilla)',
      '',
      ...results.map((r) => {
        const { good, medium } = THRESHOLDS.median;
        let indicator, colorFn;
        if (r.median < good) {
          indicator = '🟢 Excellent';
          colorFn = brightGreen;
        } else if (r.median < medium) {
          indicator = '🟡 Good';
          colorFn = brightYellow;
        } else {
          indicator = '🔴 Needs Attention';
          colorFn = brightRed;
        }
        const stddevRatio = r.stddev / (r.median || 1);
        const tailRatio = (r.p95 - r.median) / (r.median || 1);
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
        return `${brightCyan(r.label.padEnd(20))} ${colorFn(
          indicator
        )}  ${srFlag} ${tailFlag}`;
      }),
      '',
      ...(regressions.length && baselineData
        ? [
            'Baseline Comparison:',
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
            gray(`Results dir: scripts/performance/results/micro/vanilla`),
            gray(
              `Regression threshold: +${(args.regressionPct * 100).toFixed(
                1
              )}% median`
            ),
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
    console.log(
      '\n' +
        dim(
          (args.noEmoji ? 'Tip:' : '💡 Tip:') +
            ' Focus on median for typical performance; watch p95 for outliers.\n'
        )
    );
  }
  if (args.failOnRegression && regressions.some((r) => r.regression))
    process.exitCode = 1;
})();
