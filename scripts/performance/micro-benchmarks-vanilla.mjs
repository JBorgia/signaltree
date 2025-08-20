#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import util from 'node:util';
import path from 'node:path';

async function loadCore() {
  try {
    return await import(
      '../../dist/packages/core/fesm2022/signaltree-core.mjs'
    );
  } catch {
    console.log('Building core package for micro benchmarks (vanilla)...');
    const { execSync } = await import('node:child_process');
    execSync('pnpm nx build core --configuration=production', {
      stdio: 'inherit',
    });
    return await import(
      '../../dist/packages/core/fesm2022/signaltree-core.mjs'
    );
  }
}

function time(label, fn, iterations = 1000) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const end = performance.now();
  return { label, ms: (end - start) / iterations };
}

(async () => {
  const core = await loadCore();
  // Swap engine early
  core.configureSignalEngine({ ...core.vanillaEngine });
  const results = [];

  results.push(time('create:small', () => core.signalTree({ a: 1 }), 300));
  const tree = core.signalTree({ count: 0, nested: { value: 1 } });
  results.push(
    time(
      'update:primitive',
      () => {
        const current = tree.state.count();
        tree.state.count.set(current + 1);
      },
      5000
    )
  );
  const double = core.computed(() => tree.state.count() * 2);
  results.push(time('read:computed', () => double(), 5000));

  const out = { ts: new Date().toISOString(), engine: 'vanilla', results };
  const outPath = path.resolve(
    process.cwd(),
    'scripts/performance/latest-micro-bench-vanilla.json'
  );
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const useColor = !process.env.NO_COLOR;
  const c = (code) => (s) => useColor ? `\u001b[${code}m${s}\u001b[0m` : s;
  const cyan = c('36');
  const magenta = c('35');
  const yellow = c('33');
  const green = c('32');
  const dim = c('2');
  const gray = dim;
  function box(lines, colorFn = cyan) {
    const width = Math.max(...lines.map((l) => l.length));
    const top = '┌' + '─'.repeat(width + 2) + '┐';
    const mid = lines.map((l) => '│ ' + l.padEnd(width, ' ') + ' │').join('\n');
    const bottom = '└' + '─'.repeat(width + 2) + '┘';
    return colorFn([top, mid, bottom].join('\n'));
  }
  function tableBox(rows, title) {
    const nameWidth = Math.max(
      'metric'.length,
      ...rows.map((r) => r[0].length)
    );
    const descWidth = Math.max(
      'description'.length,
      ...rows.map((r) => r[1].length)
    );
    const total = nameWidth + descWidth + 7;
    const top = '┌' + '─'.repeat(total) + '┐';
    const bottom = '└' + '─'.repeat(total) + '┘';
    const header = `│ ${title.padEnd(total - 2, ' ')} │`;
    const sep =
      '├' + '─'.repeat(nameWidth + 2) + '┬' + '─'.repeat(descWidth + 2) + '┤';
    const headRow =
      '│ ' +
      'metric'.padEnd(nameWidth, ' ') +
      ' │ ' +
      'description'.padEnd(descWidth, ' ') +
      ' │';
    const body = rows
      .map(
        ([n, d]) =>
          '│ ' +
          n.padEnd(nameWidth, ' ') +
          ' │ ' +
          d.padEnd(descWidth, ' ') +
          ' │'
      )
      .join('\n');
    return cyan([top, header, sep, headRow, sep, body, bottom].join('\n'));
  }
  console.log(
    box(
      [
        'SignalTree Micro Benchmarks (Vanilla)',
        `Timestamp: ${new Date().toLocaleString()}`,
        `Output: ${outPath}`,
      ],
      magenta
    )
  );
  const metricRows = [
    ['create:small', 'Construct a small SignalTree'],
    ['update:primitive', 'Primitive signal set op'],
    ['read:computed', 'Access a computed (may recompute)'],
  ];
  console.log(tableBox(metricRows, 'Metric Definitions (Vanilla)'));
  console.log(dim('Values: mean ms per iteration (lower is better).'));
  const colorize = (text, colorFn) =>
    useColor
      ? { [util.inspect.custom]: () => colorFn(text), toString: () => text }
      : text;
  const tableRows = results.map((r) => ({
    metric: colorize(r.label, yellow),
    ms: colorize(r.ms.toFixed(6), green),
  }));
  console.table(tableRows);
  console.log(
    gray(
      'Tip: Add --update-baseline after a known good change to refresh regression baselines.'
    )
  );
})();
