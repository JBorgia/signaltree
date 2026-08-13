import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [leftRoot, rightRoot] = process.argv.slice(2);

if (!leftRoot || !rightRoot) {
  console.error(
    'usage: node tools/bench-position-topology-ab.mjs <left-root> <right-root>'
  );
  process.exit(1);
}

const importFromRoot = async (root, relativePath) => {
  const target = pathToFileURL(path.join(root, relativePath)).href;
  return import(`${target}?cacheBust=${encodeURIComponent(root)}`);
};

const loadVariant = async (label, root) => {
  const [
    { signalTree, plannedSignalTree },
    { timeTravel },
    { visitTree },
    { getPathNotifier },
  ] = await Promise.all([
    importFromRoot(root, 'dist/packages/core/dist/lib/signal-tree.js'),
    importFromRoot(root, 'dist/packages/core/dist/enhancers/time-travel/time-travel.js'),
    importFromRoot(root, 'dist/packages/core/dist/lib/internals/visit-tree.js'),
    importFromRoot(root, 'dist/packages/core/dist/lib/path-notifier.js'),
  ]);

  return {
    label,
    root,
    signalTree,
    plannedSignalTree,
    timeTravel,
    visitTree,
    getPathNotifier,
  };
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p))
  );
  return sorted[index];
};

const shuffle = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const flatState = (count) => {
  const state = {};
  for (let index = 0; index < count; index += 1) {
    state[`leaf_${index}`] = index;
  }
  return state;
};

const profileState = () => ({
  profile: {
    firstName: '',
    lastName: '',
    email: '',
  },
});

const measure = (fn, warmup = 3, samples = 15) => {
  for (let index = 0; index < warmup; index += 1) {
    fn();
  }

  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  return values;
};

const scenarios = [
  {
    name: 'construct-1k',
    run(variant) {
      const tree = variant.signalTree(flatState(1_000));
      const snapshot = tree();
      if (snapshot.leaf_999 !== 999) {
        throw new Error(`${variant.label} construct-1k readback failed`);
      }
      tree.destroy();
    },
  },
  {
    name: 'construct-10k',
    run(variant) {
      const tree = variant.signalTree(flatState(10_000));
      const snapshot = tree();
      if (snapshot.leaf_9999 !== 9_999) {
        throw new Error(`${variant.label} construct-10k readback failed`);
      }
      tree.destroy();
    },
  },
  {
    name: 'leaf-set',
    run(variant) {
      const tree = variant.signalTree({ value: 0 });
      for (let index = 0; index < 2_500; index += 1) {
        tree.$.value.set(index);
      }
      if (tree.$.value() !== 2_499) {
        throw new Error(`${variant.label} leaf-set readback failed`);
      }
      tree.destroy();
    },
  },
  {
    name: 'callable-two-leaf',
    run(variant) {
      const tree = variant.signalTree(profileState());
      for (let index = 0; index < 1_500; index += 1) {
        tree.$.profile((current) => ({
          ...current,
          firstName: `A${index}`,
          lastName: `B${index}`,
        }));
      }
      const current = tree.$.profile();
      if (current.firstName !== 'A1499' || current.lastName !== 'B1499') {
        throw new Error(`${variant.label} callable-two-leaf readback failed`);
      }
      tree.destroy();
    },
  },
  {
    name: 'history-leaf-set',
    run(variant) {
      const tree = variant.signalTree({ value: 0 }).with(variant.timeTravel());
      for (let index = 0; index < 1_500; index += 1) {
        tree.$.value.set(index);
      }
      if (tree.$.value() !== 1_499) {
        throw new Error(`${variant.label} history-leaf-set readback failed`);
      }
      tree.destroy();
    },
  },
  {
    name: 'position-count-10k',
    run(variant) {
      const tree = variant.signalTree(flatState(10_000));
      const positionIds = new Set();
      variant.visitTree(tree.$, (node) => {
        const positionId = node?.__positionIds?.[0];
        if (typeof positionId === 'number') {
          positionIds.add(positionId);
        }
      });
      const count = positionIds.size;
      tree.destroy();
      return count;
    },
    mode: 'value',
  },
];

const writePathModes = [
  {
    name: 'raw-signal',
    prepare() {},
    build() {
      const { signal } = globalThis.ng?.core ?? {};
      if (typeof signal !== 'function') {
        throw new Error('Angular signal factory unavailable');
      }
      const leaf = signal(0);
      return {
        run(iterations = 2_500) {
          for (let index = 0; index < iterations; index += 1) {
            leaf.set(index);
          }
          if (leaf() !== iterations - 1) {
            throw new Error('raw-signal readback failed');
          }
        },
        destroy() {},
      };
    },
  },
  {
    name: 'current-no-observers',
    prepare() {},
  },
  {
    name: 'current-with-subscriber',
    prepare() {},
    attachObserver(variant) {
      return variant.getPathNotifier().subscribe('value', () => {});
    },
  },
  {
    name: 'current-with-history',
    prepare() {},
    withHistory: true,
  },
];

const makeCapabilityEnhancer = (name) => {
  const enhancer = (tree) => tree;
  enhancer.metadata = {
    name,
    capabilities: ['causal-runtime'],
  };
  return enhancer;
};

const runScenario = (scenario, variants, rounds = 9) => {
  if (scenario.mode === 'value') {
    return Object.fromEntries(
      variants.map((variant) => [variant.label, scenario.run(variant)])
    );
  }

  const samples = new Map(variants.map((variant) => [variant.label, []]));
  for (let round = 0; round < rounds; round += 1) {
    for (const variant of shuffle(variants)) {
      const values = measure(() => scenario.run(variant));
      samples.get(variant.label).push(median(values));
    }
  }

  return Object.fromEntries(
    [...samples.entries()].map(([label, values]) => [
      label,
      {
        median: median(values),
        p10: percentile(values, 0.1),
        p90: percentile(values, 0.9),
        rounds: values.length,
      },
    ])
  );
};

const main = async () => {
  const baseline = await loadVariant('baseline', path.resolve(leftRoot));
  const current = await loadVariant('current', path.resolve(rightRoot));
  const aaControl = [baseline, baseline];
  const abVariants = [baseline, current];

  const report = {
    roots: {
      baseline: baseline.root,
      current: current.root,
    },
    aa: {},
    ab: {},
    decomposition: {
      writePath: {},
      topology: {},
    },
    prototypeAa: {},
    prototype: {},
  };

  for (const scenario of scenarios) {
    if (scenario.mode === 'value') {
      report.ab[scenario.name] = runScenario(scenario, abVariants);
      continue;
    }

    const aa = runScenario(scenario, aaControl.map((variant, index) => ({
      ...variant,
      label: `baseline-${index + 1}`,
    })));
    const ab = runScenario(scenario, abVariants);
    report.aa[scenario.name] = aa;
    report.ab[scenario.name] = {
      ...ab,
      deltaPct:
        ((ab.current.median - ab.baseline.median) / ab.baseline.median) * 100,
    };
  }

  const { signal } = await import('@angular/core');
  globalThis.ng ??= {};
  globalThis.ng.core = { ...(globalThis.ng.core ?? {}), signal };

  const measureWriteMode = (mode, iterations = 2_500, rounds = 9) => {
    mode.prepare?.(current);
    const samples = [];

    for (let round = 0; round < rounds; round += 1) {
      const run =
        mode.build?.() ??
        (() => {
          const tree = mode.withHistory
            ? current.signalTree({ value: 0 }).with(current.timeTravel())
            : current.signalTree({ value: 0 });
          const detach = mode.attachObserver?.(current);
          return {
            run() {
              for (let index = 0; index < iterations; index += 1) {
                tree.$.value.set(index);
              }
              if (tree.$.value() !== iterations - 1) {
                throw new Error(`${mode.name} readback failed`);
              }
            },
            destroy() {
              detach?.();
              tree.destroy();
            },
          };
        })();

      const values = measure(() => run.run());
      samples.push(median(values));
      run.destroy();
    }
    return {
      median: median(samples),
      p10: percentile(samples, 0.1),
      p90: percentile(samples, 0.9),
      rounds: samples.length,
    };
  };

  const measureTopology = (rounds = 9) => {
    const construct1k = [];
    const construct10k = [];
    const leafSet = [];
    const positionCount = [];

    for (let round = 0; round < rounds; round += 1) {
      let values = measure(() => {
        const tree = current.signalTree(flatState(1_000));
        if (tree().leaf_999 !== 999) {
          throw new Error('topology construct-1k readback failed');
        }
        tree.destroy();
      });
      construct1k.push(median(values));

      values = measure(() => {
        const tree = current.signalTree(flatState(10_000));
        if (tree().leaf_9999 !== 9_999) {
          throw new Error('topology construct-10k readback failed');
        }
        tree.destroy();
      }, 1, 6);
      construct10k.push(median(values));

      values = measure(() => {
        const tree = current.signalTree({ value: 0 });
        for (let index = 0; index < 2_500; index += 1) {
          tree.$.value.set(index);
        }
        if (tree.$.value() !== 2_499) {
          throw new Error('topology leaf-set readback failed');
        }
        tree.destroy();
      });
      leafSet.push(median(values));

      const tree = current.signalTree(flatState(10_000));
      const ids = new Set();
      current.visitTree(tree.$, (node) => {
        const positionId = node?.__positionIds?.[0];
        if (typeof positionId === 'number') {
          ids.add(positionId);
        }
      });
      positionCount.push(ids.size);
      tree.destroy();
    }

    return {
      construct1k: {
        median: median(construct1k),
        p10: percentile(construct1k, 0.1),
        p90: percentile(construct1k, 0.9),
        rounds: construct1k.length,
      },
      construct10k: {
        median: median(construct10k),
        p10: percentile(construct10k, 0.1),
        p90: percentile(construct10k, 0.9),
        rounds: construct10k.length,
      },
      leafSet: {
        median: median(leafSet),
        p10: percentile(leafSet, 0.1),
        p90: percentile(leafSet, 0.9),
        rounds: leafSet.length,
      },
      positionCount: {
        median: median(positionCount),
        p10: percentile(positionCount, 0.1),
        p90: percentile(positionCount, 0.9),
        rounds: positionCount.length,
      },
    };
  };

  for (const mode of writePathModes) {
    report.decomposition.writePath[mode.name] = measureWriteMode(mode);
  }

  report.decomposition.topology.current = measureTopology();

  if (typeof current.plannedSignalTree === 'function') {
    const measurePrototypeMode = (mode, rounds = 9) => {
      const samples = [];
      for (let round = 0; round < rounds; round += 1) {
        const tree = mode.createTree();
        const detach = mode.attachObserver?.(tree);
        const values = measure(() => {
          for (let index = 0; index < 2_500; index += 1) {
            tree.$.value.set(index);
          }
          if (tree.$.value() !== 2_499) {
            throw new Error(`${mode.name} readback failed`);
          }
        });
        samples.push(median(values));
        detach?.();
        tree.destroy();
      }

      return {
        median: median(samples),
        p10: percentile(samples, 0.1),
        p90: percentile(samples, 0.9),
        rounds: samples.length,
      };
    };

    const prototypeModes = [
      {
        name: 'planned-no-capability',
        createTree() {
          return current.plannedSignalTree({ value: 0 }).build();
        },
      },
      {
        name: 'planned-causal-current',
        createTree() {
          return current
            .plannedSignalTree({ value: 0 })
            .with(makeCapabilityEnhancer('bench-planned-current'))
            .build();
        },
      },
      {
        name: 'planned-causal-capable',
        createTree() {
          return current
            .plannedSignalTree({ value: 0 })
            .with(makeCapabilityEnhancer('bench-planned-causal'))
            .build();
        },
      },
      {
        name: 'planned-causal-observed',
        createTree() {
          return current
            .plannedSignalTree({ value: 0 })
            .with(makeCapabilityEnhancer('bench-planned-observed'))
            .build();
        },
        attachObserver(tree) {
          return current.getPathNotifier().subscribe('value', () => {});
        },
      },
      {
        name: 'planned-actively-recording',
        createTree() {
          return current.plannedSignalTree({ value: 0 }).with(current.timeTravel()).build();
        },
      },
    ];

    for (const mode of prototypeModes) {
      report.prototype[mode.name] = measurePrototypeMode(mode);

      if (
        mode.name === 'planned-no-capability' ||
        mode.name === 'planned-causal-current' ||
        mode.name === 'planned-causal-observed' ||
        mode.name === 'planned-actively-recording'
      ) {
        const left = measurePrototypeMode(mode);
        const right = measurePrototypeMode(mode);
        report.prototypeAa[mode.name] = {
          left,
          right,
          deltaPct: ((right.median - left.median) / left.median) * 100,
        };
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
};

await main();
