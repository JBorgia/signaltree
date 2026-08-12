#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENTITY_SIGNAL_LIB = join(
  ROOT,
  'dist/packages/core/dist/lib/entity-signal.js'
);
const PATH_NOTIFIER_LIB = join(
  ROOT,
  'dist/packages/core/dist/lib/path-notifier.js'
);

const arg = (name, dflt) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? dflt : process.argv[index + 1];
};

const hasFlag = (name) => process.argv.includes(name);
const ARM = arg('--arm', null);
const JSON_ONLY = hasFlag('--json');
const SAMPLE_COUNT = Number(arg('--samples', hasFlag('--smoke') ? 3 : 15));
const WARMUP_RUNS = Number(arg('--warmup', hasFlag('--smoke') ? 1 : 3));
const BOOTSTRAP_ITERATIONS = Number(
  arg('--bootstrap', hasFlag('--smoke') ? 250 : 4000)
);
const SHUFFLE_SEED = Number(arg('--seed', 0x0a11ce));
const MATERIALIZATIONS = Number(
  arg('--materializations', hasFlag('--smoke') ? 2500 : 25000)
);
const BATCHES = Number(arg('--batches', hasFlag('--smoke') ? 20 : 1200));
const WIDTH = Number(arg('--width', hasFlag('--smoke') ? 16 : 96));
const ENTITY_COUNT = Number(arg('--entities', hasFlag('--smoke') ? 64 : 512));

const ARMS = [
  'materialization-no-position-aa',
  'materialization-no-position',
  'materialization-position',
  'writes-no-position',
  'writes-no-position-aa',
  'writes-position-stamped-only',
  'writes-position-carried-legacy-batching',
  'writes-position-semantic-batching',
  'writes-position-semantic-batching-composite',
  'writes-position-semantic-batching-pre-rewrite',
  'writes-position-observer-inactive',
  'writes-position-retained',
];

class PreRewritePathNotifier {
  static ownerBoundarySeparator = '\u0000';

  batchingEnabled = true;
  batchIdentityMode = 'path-position-subject';
  pendingFlush = false;
  pending = new Map();
  firstValues = new Map();
  subscribers = new Map();
  flushCallbacks = new Set();

  setBatchingEnabled(enabled) {
    this.batchingEnabled = enabled;
  }

  setBatchIdentityModeForTesting(mode = 'path-position-subject') {
    this.batchIdentityMode = mode;
  }

  subscribe(pattern, handler) {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    const handlers = this.subscribers.get(pattern);
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(pattern);
      }
    };
  }

  notify(path, value, prev, ownerPath, subjectIds, positionIds) {
    if (!this.batchingEnabled) {
      return this.runNotify(path, value, prev, ownerPath, undefined, subjectIds, positionIds);
    }

    const batchKey = this.getBatchKey(path, positionIds, subjectIds);
    if (!this.pending.has(batchKey)) {
      this.firstValues.set(batchKey, prev);
    }

    this.pending.set(batchKey, {
      path,
      newValue: value,
      oldValue: this.firstValues.get(batchKey),
      ownerPath,
      source: undefined,
      subjectIds,
      positionIds,
    });

    if (!this.pendingFlush) {
      this.pendingFlush = true;
      queueMicrotask(() => this.flush());
    }

    return { blocked: false, value };
  }

  runNotify(path, value, prev, ownerPath, source, subjectIds, positionIds) {
    for (const [pattern, handlers] of this.subscribers) {
      if (!this.matches(pattern, path)) {
        continue;
      }
      for (const handler of handlers) {
        handler(value, prev, path, ownerPath, source, subjectIds, positionIds);
      }
    }
    return { blocked: false, value };
  }

  flush() {
    const toNotify = new Map(this.pending);
    this.pending.clear();
    this.firstValues.clear();
    this.pendingFlush = false;

    for (const entry of toNotify.values()) {
      const isOwnerOnlyMarkerSignal =
        entry.ownerPath !== undefined &&
        entry.newValue === undefined &&
        entry.oldValue === undefined;
      if (entry.newValue === entry.oldValue && !isOwnerOnlyMarkerSignal) {
        continue;
      }
      this.runNotify(
        entry.path,
        entry.newValue,
        entry.oldValue,
        entry.ownerPath,
        entry.source,
        entry.subjectIds,
        entry.positionIds
      );
    }

    for (const callback of Array.from(this.flushCallbacks)) {
      callback();
    }
  }

  onFlush(callback) {
    this.flushCallbacks.add(callback);
    return () => this.flushCallbacks.delete(callback);
  }

  matches(pattern, path) {
    if (pattern === '**') return true;
    if (pattern === path) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix + '.');
    }
    return false;
  }

  getBatchKey(path, positionIds, subjectIds) {
    if (this.batchIdentityMode === 'path') {
      return path;
    }

    const positionKey = positionIds?.join(',') ?? '';
    if (this.batchIdentityMode === 'path-position') {
      return `${path}${PreRewritePathNotifier.ownerBoundarySeparator}${positionKey}`;
    }

    if (
      (!positionIds || positionIds.length === 0) &&
      (!subjectIds || subjectIds.length === 0)
    ) {
      return path;
    }

    const subjectKey = subjectIds?.join(',') ?? '';
    return `${path}${PreRewritePathNotifier.ownerBoundarySeparator}${positionKey}${PreRewritePathNotifier.ownerBoundarySeparator}${subjectKey}`;
  }
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

function toPctInterval(interval, baselineMs) {
  return baselineMs === 0
    ? { lowPct: null, medianPct: null, highPct: null }
    : {
        lowPct: (interval.lowMs / baselineMs) * 100,
        medianPct: (interval.medianMs / baselineMs) * 100,
        highPct: (interval.highMs / baselineMs) * 100,
      };
}

function quantile(values, q) {
  const sorted = [...values].sort((left, right) => left - right);
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
    medianMs: quantile(values, 0.5),
    p90Ms: quantile(values, 0.9),
    maxMs: Math.max(...values),
  };
}

function settle() {
  if (typeof globalThis.gc !== 'function') {
    return;
  }
  for (let i = 0; i < 4; i++) {
    globalThis.gc();
  }
}

async function loadModules() {
  if (!existsSync(ENTITY_SIGNAL_LIB) || !existsSync(PATH_NOTIFIER_LIB)) {
    throw new Error('Build core first so dist entity-signal/path-notifier modules exist');
  }

  const [entitySignalModule, pathNotifierModule] = await Promise.all([
    import(`${ENTITY_SIGNAL_LIB}?ts=${Date.now()}`),
    import(`${PATH_NOTIFIER_LIB}?ts=${Date.now()}`),
  ]);

  return {
    createEntitySignal: entitySignalModule.createEntitySignal,
    setEntityPositionIdAllocatorForTesting:
      entitySignalModule.setEntityPositionIdAllocatorForTesting ??
      entitySignalModule.createEntitySignal?.__setPositionIdAllocatorForTesting,
    setEntityPositionIdNotifyEnabledForTesting:
      entitySignalModule.setEntityPositionIdNotifyEnabledForTesting ??
      entitySignalModule.createEntitySignal?.__setPositionIdNotifyEnabledForTesting,
    PathNotifier: pathNotifierModule.PathNotifier,
  };
}

function configurePositionAllocator(setAllocator, enabled) {
  if (enabled) {
    setAllocator(undefined);
    return;
  }
  setAllocator(() => undefined);
}

async function runMaterializationArm(enablePositionIds) {
  const {
    createEntitySignal,
    setEntityPositionIdAllocatorForTesting,
    setEntityPositionIdNotifyEnabledForTesting,
  } = await loadModules();
  configurePositionAllocator(
    setEntityPositionIdAllocatorForTesting,
    enablePositionIds
  );
  setEntityPositionIdNotifyEnabledForTesting(false);

  const notifier = {
    notify: () => ({ blocked: false, value: undefined }),
  };

  for (let i = 0; i < WARMUP_RUNS; i++) {
    for (let j = 0; j < Math.max(1, Math.floor(MATERIALIZATIONS / 10)); j++) {
      createEntitySignal({ selectId: (row) => row.id }, notifier, 'rows');
    }
  }

  settle();
  const start = performance.now();
  for (let i = 0; i < MATERIALIZATIONS; i++) {
    createEntitySignal({ selectId: (row) => row.id }, notifier, 'rows');
  }
  const durationMs = performance.now() - start;
  setEntityPositionIdNotifyEnabledForTesting(true);
  setEntityPositionIdAllocatorForTesting(undefined);
  settle();

  return {
    arm: enablePositionIds
      ? 'materialization-position'
      : 'materialization-no-position',
    durationMs,
    operations: MATERIALIZATIONS,
  };
}

async function runWriteArm(mode) {
  const {
    createEntitySignal,
    setEntityPositionIdAllocatorForTesting,
    setEntityPositionIdNotifyEnabledForTesting,
    PathNotifier,
  } = await loadModules();
  configurePositionAllocator(
    setEntityPositionIdAllocatorForTesting,
    mode !== 'no-position'
  );
  setEntityPositionIdNotifyEnabledForTesting(
    mode !== 'no-position' && mode !== 'position-stamped-only'
  );

  const notifier =
    mode === 'position-semantic-batching-pre-rewrite'
      ? new PreRewritePathNotifier()
      : new PathNotifier();
  if (mode === 'position-carried-legacy-batching') {
    notifier.setBatchIdentityModeForTesting('path');
  }
  if (mode === 'position-semantic-batching') {
    notifier.setBatchIdentityModeForTesting('path-position-subject');
  }
  if (mode === 'position-semantic-batching-composite') {
    notifier.setBatchIdentityModeForTesting('path-position-subject-composite');
  }
  if (mode === 'position-semantic-batching-pre-rewrite') {
    notifier.setBatchIdentityModeForTesting('path-position-subject');
  }
  if (mode === 'observer-inactive' || mode === 'retained') {
    notifier.setBatchIdentityModeForTesting('path-position-subject');
  }
  const api = createEntitySignal(
    { selectId: (row) => row.id },
    notifier,
    'rows'
  );
  const values = Array.from({ length: ENTITY_COUNT }, () => 0);
  const seenPositionIds = new Set();
  const retained = [];
  let notifications = 0;

  api.addMany(
    Array.from({ length: ENTITY_COUNT }, (_, id) => ({ id, value: 0 }))
  );
  await Promise.resolve();
  await Promise.resolve();

  if (mode === 'observer-inactive') {
    notifier.subscribe('rows.*', () => {
      notifications++;
    });
  }

  if (mode === 'retained') {
    notifier.subscribe(
      'rows.*',
      (value, _prev, path, _ownerPath, _source, _subjectIds, positionIds) => {
        notifications++;
        const id = Number(path.slice(path.indexOf('.') + 1));
        values[id] = value.value;
        for (const positionId of positionIds ?? []) {
          seenPositionIds.add(positionId);
        }
      }
    );
    notifier.onFlush(() => {
      retained.push({
        ownerCount: seenPositionIds.size,
        snapshotSize: ENTITY_COUNT,
      });
      seenPositionIds.clear();
    });
  }

  const run = async () => {
    for (let batch = 0; batch < BATCHES; batch++) {
      for (let offset = 0; offset < WIDTH; offset++) {
        const id = (batch * WIDTH + offset) % ENTITY_COUNT;
        const nextValue = values[id] + 1;
        values[id] = nextValue;
        api.updateOne(id, { value: nextValue });
      }
      await Promise.resolve();
    }
  };

  for (let i = 0; i < WARMUP_RUNS; i++) {
    await run();
  }

  values.fill(0);
  api.setAll(Array.from({ length: ENTITY_COUNT }, (_, id) => ({ id, value: 0 })));
  await Promise.resolve();
  await Promise.resolve();
  notifications = 0;
  retained.length = 0;
  seenPositionIds.clear();

  settle();
  const start = performance.now();
  await run();
  await Promise.resolve();
  const durationMs = performance.now() - start;
  settle();

  if (mode === 'observer-inactive') {
    const expectedNotifications = BATCHES * WIDTH;
    if (notifications !== expectedNotifications) {
      throw new Error(
        `Expected ${expectedNotifications} notifications, got ${notifications}`
      );
    }
  }

  if (mode === 'retained') {
    if (retained.length !== BATCHES) {
      throw new Error(`Expected ${BATCHES} retained flushes, got ${retained.length}`);
    }
    if (retained.some((entry) => entry.ownerCount !== 1)) {
      throw new Error('Retained owner ids were not stable within a batch');
    }
  }

  setEntityPositionIdNotifyEnabledForTesting(true);
  setEntityPositionIdAllocatorForTesting(undefined);

  return {
    arm:
      mode === 'no-position'
        ? 'writes-no-position'
        : mode === 'position-stamped-only'
          ? 'writes-position-stamped-only'
          : mode === 'position-carried-legacy-batching'
            ? 'writes-position-carried-legacy-batching'
            : mode === 'position-semantic-batching'
              ? 'writes-position-semantic-batching'
              : mode === 'position-semantic-batching-composite'
                ? 'writes-position-semantic-batching-composite'
                : mode === 'position-semantic-batching-pre-rewrite'
                  ? 'writes-position-semantic-batching-pre-rewrite'
          : mode === 'observer-inactive'
            ? 'writes-position-observer-inactive'
            : 'writes-position-retained',
    durationMs,
    writes: BATCHES * WIDTH,
    entities: ENTITY_COUNT,
    batches: BATCHES,
    width: WIDTH,
  };
}

async function runSample(arm) {
  switch (arm) {
    case 'materialization-no-position-aa':
      return runMaterializationArm(false);
    case 'materialization-no-position':
      return runMaterializationArm(false);
    case 'materialization-position':
      return runMaterializationArm(true);
    case 'writes-no-position-aa':
      return runWriteArm('no-position');
    case 'writes-no-position':
      return runWriteArm('no-position');
    case 'writes-position-stamped-only':
      return runWriteArm('position-stamped-only');
    case 'writes-position-carried-legacy-batching':
      return runWriteArm('position-carried-legacy-batching');
    case 'writes-position-semantic-batching':
      return runWriteArm('position-semantic-batching');
    case 'writes-position-semantic-batching-composite':
      return runWriteArm('position-semantic-batching-composite');
    case 'writes-position-semantic-batching-pre-rewrite':
      return runWriteArm('position-semantic-batching-pre-rewrite');
    case 'writes-position-observer-inactive':
      return runWriteArm('observer-inactive');
    case 'writes-position-retained':
      return runWriteArm('retained');
    default:
      throw new Error(`Unknown arm: ${arm}`);
  }
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
      '--warmup',
      String(WARMUP_RUNS),
      '--materializations',
      String(MATERIALIZATIONS),
      '--batches',
      String(BATCHES),
      '--width',
      String(WIDTH),
      '--entities',
      String(ENTITY_COUNT),
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

const results = Object.fromEntries(ARMS.map((arm) => [arm, []]));
const roundOrderRng = createRng(SHUFFLE_SEED);
for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
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

const rawMaterializationNoPosition = results['materialization-no-position'].map(
  (sample) => sample.durationMs
);
const rawMaterializationNoPositionAa = results['materialization-no-position-aa'].map(
  (sample) => sample.durationMs
);
const rawMaterializationPosition = results['materialization-position'].map(
  (sample) => sample.durationMs
);
const rawWritesNoPosition = results['writes-no-position'].map(
  (sample) => sample.durationMs
);
const rawWritesNoPositionAa = results['writes-no-position-aa'].map(
  (sample) => sample.durationMs
);
const rawWritesStampedOnly = results['writes-position-stamped-only'].map(
  (sample) => sample.durationMs
);
const rawWritesCarriedLegacy = results['writes-position-carried-legacy-batching'].map(
  (sample) => sample.durationMs
);
const rawWritesSemantic = results['writes-position-semantic-batching'].map(
  (sample) => sample.durationMs
);
const rawWritesSemanticComposite = results[
  'writes-position-semantic-batching-composite'
].map((sample) => sample.durationMs);
const rawWritesSemanticPreRewrite = results[
  'writes-position-semantic-batching-pre-rewrite'
].map((sample) => sample.durationMs);
const rawWritesObserverInactive = results['writes-position-observer-inactive'].map(
  (sample) => sample.durationMs
);
const rawWritesRetained = results['writes-position-retained'].map(
  (sample) => sample.durationMs
);

const materializationDeltaMs =
  summaries['materialization-position'].medianMs -
  summaries['materialization-no-position'].medianMs;
const stampingDeltaMs =
  summaries['writes-position-stamped-only'].medianMs -
  summaries['writes-no-position'].medianMs;
const carriageDeltaMs =
  summaries['writes-position-carried-legacy-batching'].medianMs -
  summaries['writes-position-stamped-only'].medianMs;
const semanticBatchingDeltaMs =
  summaries['writes-position-semantic-batching'].medianMs -
  summaries['writes-position-carried-legacy-batching'].medianMs;
const compositeEncodingDeltaMs =
  summaries['writes-position-semantic-batching-composite'].medianMs -
  summaries['writes-position-semantic-batching'].medianMs;
const preRewriteDeltaMs =
  summaries['writes-position-semantic-batching-pre-rewrite'].medianMs -
  summaries['writes-position-semantic-batching'].medianMs;
const observerDeltaMs =
  summaries['writes-position-observer-inactive'].medianMs -
  summaries['writes-position-semantic-batching'].medianMs;
const retainedDeltaMs =
  summaries['writes-position-retained'].medianMs -
  summaries['writes-position-semantic-batching'].medianMs;

const materializationDeltaCiMs = bootstrapMedianDiff(
  rawMaterializationNoPosition,
  rawMaterializationPosition,
  BOOTSTRAP_ITERATIONS
);
const materializationAaCiMs = bootstrapMedianDiff(
  rawMaterializationNoPosition,
  rawMaterializationNoPositionAa,
  BOOTSTRAP_ITERATIONS
);
const stampingDeltaCiMs = bootstrapMedianDiff(
  rawWritesNoPosition,
  rawWritesStampedOnly,
  BOOTSTRAP_ITERATIONS
);
const carriageDeltaCiMs = bootstrapMedianDiff(
  rawWritesStampedOnly,
  rawWritesCarriedLegacy,
  BOOTSTRAP_ITERATIONS
);
const semanticBatchingDeltaCiMs = bootstrapMedianDiff(
  rawWritesCarriedLegacy,
  rawWritesSemantic,
  BOOTSTRAP_ITERATIONS
);
const compositeEncodingDeltaCiMs = bootstrapMedianDiff(
  rawWritesSemantic,
  rawWritesSemanticComposite,
  BOOTSTRAP_ITERATIONS
);
const preRewriteDeltaCiMs = bootstrapMedianDiff(
  rawWritesSemantic,
  rawWritesSemanticPreRewrite,
  BOOTSTRAP_ITERATIONS
);
const writesAaCiMs = bootstrapMedianDiff(
  rawWritesNoPosition,
  rawWritesNoPositionAa,
  BOOTSTRAP_ITERATIONS
);
const observerDeltaCiMs = bootstrapMedianDiff(
  rawWritesSemantic,
  rawWritesObserverInactive,
  BOOTSTRAP_ITERATIONS
);
const retainedDeltaCiMs = bootstrapMedianDiff(
  rawWritesSemantic,
  rawWritesRetained,
  BOOTSTRAP_ITERATIONS
);

const report = {
  config: {
    samples: SAMPLE_COUNT,
    warmupRuns: WARMUP_RUNS,
    bootstrapIterations: BOOTSTRAP_ITERATIONS,
    shuffleSeed: SHUFFLE_SEED,
    materializations: MATERIALIZATIONS,
    batches: BATCHES,
    width: WIDTH,
    entities: ENTITY_COUNT,
  },
  summaries,
  deltas: {
    materializationPositionMinusNoPositionMs: materializationDeltaMs,
    writeStampingMinusBaselineMs: stampingDeltaMs,
    writeCarriageMinusStampedOnlyMs: carriageDeltaMs,
    writeSemanticBatchingMinusLegacyBatchingMs: semanticBatchingDeltaMs,
    writeCompositeEncodingMinusSemanticBatchingMs: compositeEncodingDeltaMs,
    writePreRewriteMinusSemanticBatchingMs: preRewriteDeltaMs,
    observerInactiveMinusPositionMs: observerDeltaMs,
    retainedMinusPositionMs: retainedDeltaMs,
  },
  intervals: {
    materializationPositionMinusNoPositionMs: materializationDeltaCiMs,
    materializationPositionMinusNoPositionPct: toPctInterval(
      materializationDeltaCiMs,
      summaries['materialization-no-position'].medianMs
    ),
    materializationAaMs: materializationAaCiMs,
    materializationAaPct: toPctInterval(
      materializationAaCiMs,
      summaries['materialization-no-position'].medianMs
    ),
    writeStampingMinusBaselineMs: stampingDeltaCiMs,
    writeStampingMinusBaselinePct: toPctInterval(
      stampingDeltaCiMs,
      summaries['writes-no-position'].medianMs
    ),
    writeCarriageMinusStampedOnlyMs: carriageDeltaCiMs,
    writeCarriageMinusStampedOnlyPct: toPctInterval(
      carriageDeltaCiMs,
      summaries['writes-position-stamped-only'].medianMs
    ),
    writeSemanticBatchingMinusLegacyBatchingMs: semanticBatchingDeltaCiMs,
    writeSemanticBatchingMinusLegacyBatchingPct: toPctInterval(
      semanticBatchingDeltaCiMs,
      summaries['writes-position-carried-legacy-batching'].medianMs
    ),
    writeCompositeEncodingMinusSemanticBatchingMs: compositeEncodingDeltaCiMs,
    writeCompositeEncodingMinusSemanticBatchingPct: toPctInterval(
      compositeEncodingDeltaCiMs,
      summaries['writes-position-semantic-batching'].medianMs
    ),
    writePreRewriteMinusSemanticBatchingMs: preRewriteDeltaCiMs,
    writePreRewriteMinusSemanticBatchingPct: toPctInterval(
      preRewriteDeltaCiMs,
      summaries['writes-position-semantic-batching'].medianMs
    ),
    writesAaMs: writesAaCiMs,
    writesAaPct: toPctInterval(
      writesAaCiMs,
      summaries['writes-no-position'].medianMs
    ),
    observerInactiveMinusPositionMs: observerDeltaCiMs,
    observerInactiveMinusPositionPct: toPctInterval(
      observerDeltaCiMs,
      summaries['writes-position-semantic-batching'].medianMs
    ),
    retainedMinusPositionMs: retainedDeltaCiMs,
    retainedMinusPositionPct: toPctInterval(
      retainedDeltaCiMs,
      summaries['writes-position-semantic-batching'].medianMs
    ),
  },
};

if (JSON_ONLY) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(0);
}

console.log(JSON.stringify(report, null, 2));
