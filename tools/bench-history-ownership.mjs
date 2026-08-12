#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

if (typeof globalThis.gc !== 'function') {
  console.error('Run with --expose-gc.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CORE_LIB = join(ROOT, 'dist/packages/core/dist/lib/path-notifier.js');
const TMP_ROOT = process.env.TMPDIR ?? '/tmp';
const COMMITTED_3ARG_LIB = join(
  TMP_ROOT,
  'signaltree-history-bench',
  'path-notifier-head.mjs'
);

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? dflt : process.argv[i + 1];
};

const hasFlag = (name) => process.argv.includes(name);
const SAMPLE_COUNT = Number(arg('--samples', hasFlag('--smoke') ? 3 : 21));
const WARMUP_RUNS = Number(arg('--warmup', hasFlag('--smoke') ? 1 : 4));
const BATCHES = Number(arg('--batches', hasFlag('--smoke') ? 20 : 1800));
const WIDTH = Number(arg('--width', hasFlag('--smoke') ? 32 : 128));
const ENTITY_COUNT = Number(arg('--entities', hasFlag('--smoke') ? 64 : 512));
const BOOTSTRAP_ITERATIONS = Number(
  arg('--bootstrap', hasFlag('--smoke') ? 250 : 4000)
);
const EQUIVALENCE_MARGIN_PCT = (() => {
  const value = arg('--equivalence-pct', null);
  return value === null ? null : Number(value);
})();
const SHUFFLE_SEED = Number(arg('--seed', 0x0a11ce));
const REQUIRED_VERDICT = arg('--require-verdict', null);
const ARM = arg('--arm', null);
const JSON_ONLY = hasFlag('--json');

const ARMS = [
  'current-3arg',
  'owner-absent',
  'owner-present-no-history',
  'owner-absent-aa',
  'owner-history-inactive',
  'history-active',
];

function settle() {
  for (let i = 0; i < 4; i++) globalThis.gc();
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const weight = index - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function summarize(values) {
  return {
    minMs: Math.min(...values),
    p10Ms: quantile(values, 0.1),
    medianMs: quantile(values, 0.5),
    p90Ms: quantile(values, 0.9),
    maxMs: Math.max(...values),
  };
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resample(values, rng) {
  const sample = [];
  for (let i = 0; i < values.length; i++) {
    sample.push(values[Math.floor(rng() * values.length)]);
  }
  return sample;
}

function pairwiseDiffs(left, right) {
  if (left.length !== right.length) {
    throw new Error(
      `Expected paired samples of equal length, got ${left.length} and ${right.length}`
    );
  }
  return left.map((value, index) => right[index] - value);
}

function shuffle(values, rng) {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function bootstrapMedianDiff(left, right, iterations) {
  const rng = createRng(0x5eedc0de);
  const pairedDiffs = pairwiseDiffs(left, right);
  const diffs = [];
  for (let i = 0; i < iterations; i++) {
    diffs.push(quantile(resample(pairedDiffs, rng), 0.5));
  }
  diffs.sort((a, b) => a - b);
  return {
    lowMs: quantile(diffs, 0.025),
    medianMs: quantile(diffs, 0.5),
    highMs: quantile(diffs, 0.975),
  };
}

function toPct(valueMs, baselineMs) {
  return baselineMs === 0 ? null : (valueMs / baselineMs) * 100;
}

function toPctInterval(interval, baselineMs) {
  return baselineMs === 0
    ? { lowPct: null, medianPct: null, highPct: null }
    : {
        lowPct: (interval.lowMs / baselineMs) * 100,
        medianPct: (interval.medianMs / baselineMs) * 100,
        highPct: (interval.highMs / baselineMs) * 100,
      };
}

function classifyStructuralOverheadVerdict({
  equivalenceMarginPct,
  aaNoiseFloorPct,
  structuralOverheadCiPct,
}) {
  if (equivalenceMarginPct === null || !Number.isFinite(equivalenceMarginPct)) {
    return {
      verdict: 'INCONCLUSIVE',
      reason: 'no equivalence margin declared',
    };
  }

  if (aaNoiseFloorPct === null || aaNoiseFloorPct > equivalenceMarginPct) {
    return {
      verdict: 'INCONCLUSIVE',
      reason: 'A/A noise floor exceeds the declared equivalence margin',
    };
  }

  if (
    structuralOverheadCiPct.lowPct !== null &&
    structuralOverheadCiPct.highPct !== null &&
    structuralOverheadCiPct.lowPct >= -equivalenceMarginPct &&
    structuralOverheadCiPct.highPct <= equivalenceMarginPct
  ) {
    return {
      verdict: 'PASS',
      reason:
        'current-arm structural-overhead confidence interval is inside the declared equivalence margin',
    };
  }

  if (
    structuralOverheadCiPct.lowPct !== null &&
    structuralOverheadCiPct.highPct !== null &&
    (structuralOverheadCiPct.lowPct > equivalenceMarginPct ||
      structuralOverheadCiPct.highPct < -equivalenceMarginPct)
  ) {
    return {
      verdict: 'FAIL',
      reason:
        'current-arm structural-overhead confidence interval is wholly outside the declared equivalence margin',
    };
  }

  return {
    verdict: 'INCONCLUSIVE',
    reason:
      'current-arm structural-overhead confidence interval straddles the declared equivalence margin',
  };
}

function ensureCommitted3ArgPathNotifierModule() {
  const source = execFileSync(
    'git',
    ['show', 'HEAD:packages/core/src/lib/path-notifier.ts'],
    { cwd: ROOT, encoding: 'utf8' }
  );

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'path-notifier.ts',
  });

  mkdirSync(dirname(COMMITTED_3ARG_LIB), { recursive: true });
  writeFileSync(
    COMMITTED_3ARG_LIB,
    `// transpiled from HEAD:packages/core/src/lib/path-notifier.ts\n${compiled.outputText}`,
    'utf8'
  );
  return COMMITTED_3ARG_LIB;
}

async function loadCommitted3ArgPathNotifier() {
  const modulePath = ensureCommitted3ArgPathNotifierModule();
  const committedModule = await import(`${modulePath}?ts=${Date.now()}`);
  if (!committedModule.PathNotifier) {
    throw new Error('Failed to load committed 3-arg PathNotifier baseline');
  }
  return committedModule.PathNotifier;
}

function buildWorkload({
  notifier,
  ownerPath,
  installHistory,
  activeHistory,
  observeOwners = false,
}) {
  const shouldObserveOwners = observeOwners || installHistory;
  const state = new Map();
  const expected = new Map();
  const observedOwners = new Set();
  const history = [];
  let notifications = 0;
  let flushes = 0;

  notifier.subscribe('rows.*', (value, _prev, path) => {
    const id = Number(path.slice(path.indexOf('.') + 1));
    state.set(id, value);
    notifications++;
  });

  if (shouldObserveOwners) {
    notifier.subscribe('**', (_value, _prev, path, observedOwnerPath) => {
      observedOwners.add(observedOwnerPath ?? path);
    });
  }

  if (installHistory) {
    notifier.onFlush(() => {
      flushes++;
      const ownerPaths = Array.from(observedOwners).sort();
      observedOwners.clear();
      if (!activeHistory) return;
      history.push({
        ownerPaths,
        snapshot: structuredClone(Object.fromEntries(state)),
      });
    });
  }

  const run = async () => {
    for (let batch = 0; batch < BATCHES; batch++) {
      for (let offset = 0; offset < WIDTH; offset++) {
        const id = (batch * WIDTH + offset) % ENTITY_COUNT;
        const path = `rows.${id}`;
        const prev = expected.get(id) ?? { id, value: -1 };
        const next = { id, value: prev.value + 1 };
        expected.set(id, next);
        if (ownerPath === undefined) {
          notifier.notify(path, next, prev);
        } else {
          notifier.notify(path, next, prev, ownerPath);
        }
      }
      await Promise.resolve();
    }
  };

  const verify = () => {
    const expectedNotifications = BATCHES * WIDTH;
    if (notifications !== expectedNotifications) {
      throw new Error(
        `Expected ${expectedNotifications} notifications, got ${notifications}`
      );
    }
    for (const [id, value] of expected) {
      const actual = state.get(id);
      if (!actual || actual.value !== value.value) {
        throw new Error(`State mismatch at rows.${id}`);
      }
    }
    if (installHistory && flushes !== BATCHES) {
      throw new Error(`Expected ${BATCHES} flushes, got ${flushes}`);
    }
    if (observeOwners && ownerPath !== undefined) {
      if (observedOwners.size !== 1 || !observedOwners.has(ownerPath)) {
        throw new Error('Owner-path postcondition failed');
      }
    }
    if (activeHistory) {
      if (history.length !== BATCHES) {
        throw new Error(`Expected ${BATCHES} history entries, got ${history.length}`);
      }
      if (history.some((entry) => entry.ownerPaths.length !== 1 || entry.ownerPaths[0] !== 'rows')) {
        throw new Error('History entry owner paths were not stable');
      }
      const last = history.at(-1);
      const expectedLast = expected.get((BATCHES * WIDTH - 1) % ENTITY_COUNT);
      if (!last || last.snapshot[String(expectedLast.id)].value !== expectedLast.value) {
        throw new Error('History snapshot postcondition failed');
      }
    }
  };

  return { run, verify };
}

async function runSample(arm) {
  settle();
  const { PathNotifier } = existsSync(CORE_LIB)
    ? await import(CORE_LIB)
    : { PathNotifier: null };
  const Committed3ArgPathNotifier =
    arm === 'current-3arg' ? await loadCommitted3ArgPathNotifier() : null;

  let notifier;
  let ownerPath;
  let installHistory = false;
  let activeHistory = false;

  if (arm === 'current-3arg') {
    notifier = new Committed3ArgPathNotifier();
  } else {
    if (!PathNotifier) {
      throw new Error('Build core first so dist path-notifier is available');
    }
    notifier = new PathNotifier();
    if (
      arm === 'owner-present-no-history' ||
      arm === 'owner-history-inactive' ||
      arm === 'history-active'
    ) {
      ownerPath = 'rows';
    }
    if (arm === 'owner-history-inactive' || arm === 'history-active') {
      installHistory = true;
      if (arm === 'history-active') activeHistory = true;
    }
  }

  const workload = buildWorkload({
    notifier,
    ownerPath,
    installHistory,
    activeHistory,
  });

  for (let i = 0; i < WARMUP_RUNS; i++) {
    await workload.run();
  }
  settle();

  const timedWorkload = buildWorkload({
    notifier:
      arm === 'current-3arg'
        ? new Committed3ArgPathNotifier()
        : new PathNotifier(),
    ownerPath,
    installHistory,
    activeHistory,
  });

  settle();
  const start = performance.now();
  await timedWorkload.run();
  await Promise.resolve();
  const durationMs = performance.now() - start;
  timedWorkload.verify();

  if (ownerPath !== undefined) {
    const ownerPathProbe = buildWorkload({
      notifier:
        arm === 'current-3arg'
          ? new Committed3ArgPathNotifier()
          : new PathNotifier(),
      ownerPath,
      installHistory: false,
      activeHistory: false,
      observeOwners: true,
    });
    await ownerPathProbe.run();
    await Promise.resolve();
    ownerPathProbe.verify();
  }

  settle();

  return {
    arm,
    durationMs,
    writes: BATCHES * WIDTH,
    batches: BATCHES,
    width: WIDTH,
    entityCount: ENTITY_COUNT,
  };
}

function runChild(arm) {
  const script = fileURLToPath(import.meta.url);
  const output = execFileSync(
    process.execPath,
    [
      '--expose-gc',
      script,
      '--arm',
      arm,
      '--batches',
      String(BATCHES),
      '--width',
      String(WIDTH),
      '--entities',
      String(ENTITY_COUNT),
      '--warmup',
      String(WARMUP_RUNS),
      '--json',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  return JSON.parse(output.trim());
}

if (ARM) {
  const result = await runSample(ARM);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

const results = {};
for (const arm of ARMS) {
  results[arm] = [];
}

const roundOrderRng = createRng(SHUFFLE_SEED);
for (let round = 0; round < SAMPLE_COUNT; round++) {
  for (const arm of shuffle(ARMS, roundOrderRng)) {
    results[arm].push(runChild(arm));
  }
}

const summaries = Object.fromEntries(
  ARMS.map((arm) => [
    arm,
    summarize(results[arm].map((sample) => sample.durationMs)),
  ])
);

const baseline = summaries['current-3arg'];
const ownerAbsent = summaries['owner-absent'];
const ownerPresentNoHistory = summaries['owner-present-no-history'];
const aaControl = summaries['owner-absent-aa'];
const inactiveHistory = summaries['owner-history-inactive'];
const activeHistory = summaries['history-active'];

const rawBaseline = results['current-3arg'].map((sample) => sample.durationMs);
const rawOwnerAbsent = results['owner-absent'].map((sample) => sample.durationMs);
const rawOwnerPresentNoHistory = results['owner-present-no-history'].map(
  (sample) => sample.durationMs
);
const rawAaControl = results['owner-absent-aa'].map((sample) => sample.durationMs);
const rawInactiveHistory = results['owner-history-inactive'].map(
  (sample) => sample.durationMs
);
const rawActiveHistory = results['history-active'].map((sample) => sample.durationMs);

const decision20DeltaMs = ownerPresentNoHistory.medianMs - ownerAbsent.medianMs;
const structuralOverheadDeltaMs = ownerAbsent.medianMs - baseline.medianMs;
const aaNoiseFloorMs = Math.abs(aaControl.medianMs - ownerAbsent.medianMs);
const decision20DeltaCiMs = bootstrapMedianDiff(
  rawOwnerAbsent,
  rawOwnerPresentNoHistory,
  BOOTSTRAP_ITERATIONS
);
const structuralOverheadDeltaCiMs = bootstrapMedianDiff(
  rawBaseline,
  rawOwnerAbsent,
  BOOTSTRAP_ITERATIONS
);
const aaNoiseFloorCiMs = bootstrapMedianDiff(
  rawOwnerAbsent,
  rawAaControl,
  BOOTSTRAP_ITERATIONS
);
const activeVsInactiveDeltaCiMs = bootstrapMedianDiff(
  rawInactiveHistory,
  rawActiveHistory,
  BOOTSTRAP_ITERATIONS
);
const decision20DeltaCiPct = toPctInterval(
  decision20DeltaCiMs,
  ownerAbsent.medianMs
);
const structuralOverheadDeltaCiPct = toPctInterval(
  structuralOverheadDeltaCiMs,
  baseline.medianMs
);
const aaNoiseFloorCiPct = toPctInterval(aaNoiseFloorCiMs, ownerAbsent.medianMs);
const activeVsInactiveDeltaCiPct = toPctInterval(
  activeVsInactiveDeltaCiMs,
  inactiveHistory.medianMs
);
const decision20CiExcludesZero =
  decision20DeltaCiMs.lowMs > 0 || decision20DeltaCiMs.highMs < 0;
const decision20ResolvesAgainstAa = Math.abs(decision20DeltaMs) > aaNoiseFloorMs;
const decision20Claimable = decision20ResolvesAgainstAa && decision20CiExcludesZero;
const decision20Verdict = classifyStructuralOverheadVerdict({
  equivalenceMarginPct: EQUIVALENCE_MARGIN_PCT,
  aaNoiseFloorPct: toPct(aaNoiseFloorMs, ownerAbsent.medianMs),
  structuralOverheadCiPct: decision20DeltaCiPct,
});
const structuralOverheadCiExcludesZero =
  structuralOverheadDeltaCiMs.lowMs > 0 || structuralOverheadDeltaCiMs.highMs < 0;
const structuralOverheadResolvesAgainstAa =
  Math.abs(structuralOverheadDeltaMs) > aaNoiseFloorMs;
const structuralOverheadClaimable =
  structuralOverheadResolvesAgainstAa && structuralOverheadCiExcludesZero;
const structuralOverheadVerdict = classifyStructuralOverheadVerdict({
  equivalenceMarginPct: EQUIVALENCE_MARGIN_PCT,
  aaNoiseFloorPct: toPct(aaNoiseFloorMs, ownerAbsent.medianMs),
  structuralOverheadCiPct: structuralOverheadDeltaCiPct,
});

const report = {
  config: {
    samples: SAMPLE_COUNT,
    warmupRuns: WARMUP_RUNS,
    batches: BATCHES,
    width: WIDTH,
    entityCount: ENTITY_COUNT,
    shuffleSeed: SHUFFLE_SEED,
    writesPerSample: BATCHES * WIDTH,
    bootstrapIterations: BOOTSTRAP_ITERATIONS,
    bootstrapMethod: 'paired-round-median-delta',
    equivalenceMarginPct: EQUIVALENCE_MARGIN_PCT,
  },
  summaries,
  comparisons: {
    decision20: {
      measured: true,
      deltaMs: decision20DeltaMs,
      deltaPct: toPct(decision20DeltaMs, ownerAbsent.medianMs),
      medianDiffCi95Ms: decision20DeltaCiMs,
      medianDiffCi95Pct: decision20DeltaCiPct,
      resolvesAgainstAa: decision20ResolvesAgainstAa,
      ciExcludesZero: decision20CiExcludesZero,
      claimable: decision20Claimable,
      verdict: decision20Verdict,
    },
    ownerCapabilityStructuralOverheadDeltaMs: structuralOverheadDeltaMs,
    ownerCapabilityStructuralOverheadDeltaPct: toPct(
      structuralOverheadDeltaMs,
      baseline.medianMs
    ),
    ownerCapabilityStructuralOverheadMedianDiffCi95Ms:
      structuralOverheadDeltaCiMs,
    ownerCapabilityStructuralOverheadMedianDiffCi95Pct:
      structuralOverheadDeltaCiPct,
    aaNoiseFloorDeltaMs: aaNoiseFloorMs,
    aaNoiseFloorDeltaPct: toPct(aaNoiseFloorMs, ownerAbsent.medianMs),
    aaNoiseFloorMedianDiffCi95Ms: aaNoiseFloorCiMs,
    aaNoiseFloorMedianDiffCi95Pct: aaNoiseFloorCiPct,
    ownerCapabilityStructuralOverheadResolvesAgainstAa:
      structuralOverheadResolvesAgainstAa,
    ownerCapabilityStructuralOverheadCiExcludesZero:
      structuralOverheadCiExcludesZero,
    ownerCapabilityStructuralOverheadClaimable: structuralOverheadClaimable,
    ownerCapabilityStructuralOverheadVerdict: structuralOverheadVerdict,
    unusedOwnerDeltaMs: decision20DeltaMs,
    unusedOwnerDeltaPct: toPct(decision20DeltaMs, ownerAbsent.medianMs),
    unusedOwnerMedianDiffCi95Ms: decision20DeltaCiMs,
    unusedOwnerMedianDiffCi95Pct: decision20DeltaCiPct,
    unusedOwnerResolvesAgainstAa: decision20ResolvesAgainstAa,
    unusedOwnerCiExcludesZero: decision20CiExcludesZero,
    unusedOwnerClaimable: decision20Claimable,
    unusedOwnerVerdict: decision20Verdict,
    activeVsInactiveDeltaMs: activeHistory.medianMs - inactiveHistory.medianMs,
    activeVsInactiveDeltaPct: toPct(
      activeHistory.medianMs - inactiveHistory.medianMs,
      inactiveHistory.medianMs
    ),
    activeVsInactiveMedianDiffCi95Ms: activeVsInactiveDeltaCiMs,
    activeVsInactiveMedianDiffCi95Pct: activeVsInactiveDeltaCiPct,
  },
  interpretation: {
    decision20:
      decision20Verdict.verdict === 'PASS'
        ? 'load-bearing: unused-owner cost is equivalent within the declared margin on the same PathNotifier implementation'
        : decision20Verdict.verdict === 'FAIL'
          ? 'load-bearing: unused-owner cost falls outside the declared margin on the same PathNotifier implementation'
          : 'decision 20 is now measured; with no declared margin it remains inconclusive under this harness contract',
    ownerCapabilityStructuralOverhead:
      structuralOverheadVerdict.verdict === 'PASS'
        ? 'current-arm comparison only: the owner-capable notifier stays within the declared structural-overhead margin against the benchmark-local 3-arg baseline'
        : structuralOverheadVerdict.verdict === 'FAIL'
          ? 'current-arm comparison only: the owner-capable notifier falls outside the declared structural-overhead margin against the benchmark-local 3-arg baseline'
          : 'current-arm comparison only: structural overhead remains inconclusive under this harness contract',
    historyInactive:
      'informational only; if this arm appears faster than baseline, treat that as harness noise rather than a real speedup',
    historyActive:
      'well above the A/A floor; active recording cost is resolvable under this harness',
  },
  raw: Object.fromEntries(
    ARMS.map((arm) => [arm, results[arm].map((sample) => sample.durationMs)])
  ),
};

if (JSON_ONLY) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('Ownership attribution benchmark');
  console.log(JSON.stringify(report, null, 2));
}

if (
  REQUIRED_VERDICT !== null &&
  report.comparisons.decision20.verdict.verdict !== REQUIRED_VERDICT
) {
  console.error(
    [
      `Expected decision-20 verdict ${REQUIRED_VERDICT},`,
      `got ${report.comparisons.decision20.verdict.verdict}.`,
      report.comparisons.decision20.verdict.reason,
    ].join(' ')
  );
  process.exit(1);
}
