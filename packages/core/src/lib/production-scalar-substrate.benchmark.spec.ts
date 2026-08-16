import { mkdirSync, writeFileSync } from 'node:fs';

import type { WritableSignal } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';

import { entityMap } from './markers/entity-map';
import { EntityMutationFrame } from './physical/entity-mutation-frame';
import { EntityValueStore } from './physical/entity-value-store';
import { MaterializedEntityProjection } from './physical/materialized-entity-projection';
import { StructuralStore } from './physical/structural-store';
import {
  clearProductionSubstrateStatsForTesting,
  installProductionSubstrateStatsForTesting,
  resetProductionSubstrateStatsForTesting,
  type ProductionSubstrateStats,
} from './internals/production-substrate-stats';
import { getTreeScalarSlotRuntime } from './internals/tree-scalar-slot-angular-runtime';
import { getOwnedPositionIds } from './internals/owned-mutation';
import { signalTree } from './signal-tree';
import type { ISignalTree, PositionId } from './types';

const RUN_TIMING = process.env['ST_PERF'] === '1';
const timingDescribe = describe.runIf(RUN_TIMING);
const OUTPUT_FILE = process.env['ST_PERF_OUTPUT_FILE'];
const COMPLEXITY_SIZES = [10, 100, 1_000, 10_000, 100_000] as const;
const LOGICAL_AUDIT_SIZES = [100, 100_000] as const;
const FRAME_WIDTHS = [2, 10, 100] as const;
const TIMING_READ_ITERATIONS = 20_000;
const TIMING_WRITE_ITERATIONS = 5_000;
const TIMING_FRAME_ITERATIONS = 1_000;
const ENTITY_UPDATE_ITERATIONS = 2_000;
const ENTITY_STRUCTURAL_ITERATIONS = 200;
const WARMUP_RUNS = 1;
const MEASURE_RUNS = 3;
const TIMING_RATIO_LIMIT = 40;
const MAX_FRAME_WIDTH = FRAME_WIDTHS[FRAME_WIDTHS.length - 1];

type ScalarLeaf = WritableSignal<number>;

type ScalarTimingOperation =
  | 'compiled-read'
  | 'compiled-write'
  | 'frame-2'
  | 'frame-10'
  | 'frame-100';

type EntityTimingOperation =
  | 'entity-updateOne'
  | 'entity-addOne'
  | 'entity-removeOne'
  | 'entity-changeId';

type EntityFrameTimingOperation = 'entity-frame-addOne';

type EntityLogicalWorkOperation =
  | EntityTimingOperation
  | 'entity-mixed-structural-frame';

type ScalarTimingRow = {
  operation: ScalarTimingOperation;
  positions: number;
  perOperationUs: number;
};

type EntityTimingRow = {
  operation: EntityTimingOperation;
  positions: number;
  perOperationUs: number;
};

type EntityFrameTimingRow = {
  operation: EntityFrameTimingOperation;
  positions: number;
  perOperationUs: number;
};

type EntityLogicalWorkRow = {
  operation: EntityLogicalWorkOperation;
  positions: number;
  projectionRebuilds: number;
  projectionEntriesVisited: number;
  projectionReplacements: number;
};

type ScalarHarness = {
  runtime: NonNullable<ReturnType<typeof getTreeScalarSlotRuntime>>;
  targetLeaf: ScalarLeaf;
  targetSlot: number;
  frameSlots: readonly number[];
  readTarget(): number;
  setTarget(value: number): void;
  commitFrame(width: number, seed: number): void;
  destroy(): void;
};

type EntityRow = {
  id: number;
  value: number;
};

type EntityCollection = {
  addMany(entities: readonly EntityRow[]): void;
  addOne(entity: EntityRow): void;
  updateOne(id: number, changes: Partial<EntityRow>): void;
  removeOne(id: number): void;
  changeId(from: number, to: number): void;
};

type EntityHarness = {
  rows: EntityCollection;
  updateOne(value: number): void;
  addOne(): void;
  removeOne(): void;
  changeId(): void;
  destroy(): void;
};

type ProjectionFrameHarness = {
  updateOne(value: number): void;
  addOne(): void;
  removeOne(): void;
  changeId(): void;
  runMixedFrame(): void;
};

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchmark(fn: () => void, warmup = WARMUP_RUNS, runs = MEASURE_RUNS): number {
  for (let index = 0; index < warmup; index++) {
    fn();
  }

  const samples: number[] = [];
  for (let index = 0; index < runs; index++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }

  return median(samples);
}

function perOperationUs(totalMs: number, iterations: number): number {
  return Number(((totalMs * 1000) / iterations).toFixed(4));
}

function measureOnceMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function buildFlatState(size: number): Record<string, number> {
  const state: Record<string, number> = {};
  for (let index = 0; index < size; index++) {
    state[`leaf_${index}`] = index;
  }
  return state;
}

function createScalarHarness(size: number): ScalarHarness {
  const tree = signalTree(buildFlatState(size)) as ISignalTree<Record<string, ScalarLeaf>>;
  const runtime = getTreeScalarSlotRuntime(tree.$);
  if (!runtime) {
    throw new Error('Expected scalar slot runtime on production signalTree path.');
  }

  const targetKey = `leaf_${Math.floor(size / 2)}` as keyof typeof tree.$;
  const targetLeaf = tree.$[targetKey] as ScalarLeaf;
  const targetSlot = resolveLeafSlot(runtime, targetLeaf);
  const frameSlots = collectFrameSlots(tree, runtime, Math.min(size, MAX_FRAME_WIDTH));

  return {
    runtime,
    targetLeaf,
    targetSlot,
    frameSlots,
    readTarget: () => targetLeaf(),
    setTarget: (value) => targetLeaf.set(value),
    commitFrame: (width, seed) => {
      const frame = runtime.beginFrame();
      for (let index = 0; index < width; index++) {
        frame.set(frameSlots[index], seed + index);
      }
      frame.commit();
    },
    destroy: () => tree.destroy(),
  };
}

function createEntityHarness(size: number): EntityHarness {
  const tree = signalTree({ rows: entityMap<EntityRow, number>() }) as ISignalTree<{
    rows: EntityCollection;
  }>;
  const rows = tree.$.rows;
  rows.addMany(buildEntityRows(size));

  const stableId = Math.floor(size / 2);
  let nextId = size;
  let removableId = size - 1;
  let currentChangeId = stableId;
  let nextChangeId = nextId++;

  return {
    rows,
    updateOne(value: number): void {
      rows.updateOne(stableId, { value });
    },
    addOne(): void {
      rows.addOne({ id: nextId, value: nextId });
      nextId += 1;
    },
    removeOne(): void {
      rows.removeOne(removableId);
      removableId -= 1;
    },
    changeId(): void {
      rows.changeId(currentChangeId, nextChangeId);
      const previousId = currentChangeId;
      currentChangeId = nextChangeId;
      nextChangeId = previousId;
    },
    destroy(): void {
      tree.destroy();
    },
  };
}

function createProjectionFrameHarness(size: number): ProjectionFrameHarness {
  const valueStore = new EntityValueStore<EntityRow>();
  const projection = new MaterializedEntityProjection<number, EntityRow>();
  const structuralStore = new StructuralStore<number>();

  for (let index = 0; index < size; index++) {
    const subjectId = index + 1;
    const entity = { id: index, value: index };
    structuralStore.createSubject(subjectId, index);
    valueStore.retainSubjectValue(subjectId, entity);
    projection.replaceEntry(index, entity);
  }

  const stableKey = Math.floor(size / 2);
  const stableSubjectId = structuralStore.subjectIdForKey(stableKey);
  const removableKey = size - 1;
  const removableSubjectId = structuralStore.subjectIdForKey(removableKey);
  const transferredKey = size + 10_000;
  const freshKey = size + 20_000;
  const freshSubjectId = size + 1;

  if (stableSubjectId === undefined || removableSubjectId === undefined) {
    throw new Error('Expected seeded structural subjects for projection frame harness.');
  }

  return {
    updateOne(value: number): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageValueReplacement({
        kind: 'replace-value',
        key: stableKey,
        subjectId: stableSubjectId,
        nextValue: { id: stableKey, value },
      });
      const result = frame.commit();
      frame.project(result);
    },
    addOne(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageFreshSubject({
        kind: 'create-fresh-subject',
        key: freshKey,
        subjectId: freshSubjectId,
        nextValue: { id: freshKey, value: freshKey },
      });
      const result = frame.commit();
      frame.project(result);
    },
    removeOne(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageSubjectTombstone({
        kind: 'tombstone-subject',
        key: removableKey,
        subjectId: removableSubjectId,
        restoreAllowed: true,
      });
      const result = frame.commit();
      frame.project(result);
    },
    changeId(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageKeyTransfer({
        kind: 'transfer-key',
        fromKey: stableKey,
        toKey: transferredKey,
        subjectId: stableSubjectId,
      });
      const result = frame.commit();
      frame.project(result);
    },
    runMixedFrame(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageKeyTransfer({
        kind: 'transfer-key',
        fromKey: stableKey,
        toKey: transferredKey,
        subjectId: stableSubjectId,
      });
      frame.stageValueReplacement({
        kind: 'replace-value',
        key: transferredKey,
        subjectId: stableSubjectId,
        nextValue: { id: transferredKey, value: transferredKey },
      });
      frame.stageSubjectTombstone({
        kind: 'tombstone-subject',
        key: removableKey,
        subjectId: removableSubjectId,
        restoreAllowed: true,
      });
      frame.stageFreshSubject({
        kind: 'create-fresh-subject',
        key: freshKey,
        subjectId: freshSubjectId,
        nextValue: { id: freshKey, value: freshKey },
      });
      const result = frame.commit();
      frame.project(result);
    },
  };
}

function buildEntityRows(size: number): EntityRow[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index,
    value: index,
  }));
}

function resolveLeafSlot(
  runtime: NonNullable<ReturnType<typeof getTreeScalarSlotRuntime>>,
  leaf: unknown
): number {
  const positionId = getOwnedPositionIds(leaf)?.[0] as PositionId | undefined;
  if (positionId === undefined) {
    throw new Error('Expected compiled scalar leaf to expose a PositionId.');
  }

  const slotIndex = runtime.resolveScalarSlot(positionId);
  if (slotIndex === undefined) {
    throw new Error(`Expected scalar slot for PositionId ${positionId}.`);
  }

  return slotIndex;
}

function collectFrameSlots(
  tree: ISignalTree<Record<string, ScalarLeaf>>,
  runtime: NonNullable<ReturnType<typeof getTreeScalarSlotRuntime>>,
  count: number
): number[] {
  const slots: number[] = [];
  for (let index = 0; index < count; index++) {
    slots.push(resolveLeafSlot(runtime, tree.$[`leaf_${index}`]));
  }
  return slots;
}

function scaleRatio<T extends { positions: number; perOperationUs: number }>(
  rows: readonly T[],
  positions: readonly number[]
): number {
  const smallest = rows.find((row) => row.positions === positions[0]);
  const largest = rows.find((row) => row.positions === positions[positions.length - 1]);
  if (!smallest || !largest) {
    throw new Error('Missing benchmark rows for scaling ratio.');
  }

  return largest.perOperationUs / Math.max(smallest.perOperationUs, 0.0001);
}

function measureScalarTimingRows(
  sizes: readonly number[]
): ScalarTimingRow[] {
  const rows: ScalarTimingRow[] = [];

  for (const size of sizes) {
    const harness = createScalarHarness(size);

    try {
      harness.readTarget();

      rows.push({
        operation: 'compiled-read',
        positions: size,
        perOperationUs: perOperationUs(
          benchmark(() => {
            for (let iteration = 0; iteration < TIMING_READ_ITERATIONS; iteration++) {
              harness.readTarget();
            }
          }),
          TIMING_READ_ITERATIONS
        ),
      });

      let writeSeed = size;
      rows.push({
        operation: 'compiled-write',
        positions: size,
        perOperationUs: perOperationUs(
          benchmark(() => {
            for (let iteration = 0; iteration < TIMING_WRITE_ITERATIONS; iteration++) {
              writeSeed += 1;
              harness.setTarget(writeSeed);
            }
          }),
          TIMING_WRITE_ITERATIONS
        ),
      });

      for (const width of FRAME_WIDTHS) {
        if (width > size) {
          continue;
        }

        let frameSeed = size * 1_000;
        rows.push({
          operation: `frame-${width}` as ScalarTimingOperation,
          positions: size,
          perOperationUs: perOperationUs(
            benchmark(() => {
              for (let iteration = 0; iteration < TIMING_FRAME_ITERATIONS; iteration++) {
                frameSeed += width;
                harness.commitFrame(width, frameSeed);
              }
            }),
            TIMING_FRAME_ITERATIONS
          ),
        });
      }
    } finally {
      harness.destroy();
    }
  }

  return rows;
}

function measureEntityTimingRows(
  sizes: readonly number[]
): EntityTimingRow[] {
  const rows: EntityTimingRow[] = [];

  for (const size of sizes) {
    const structuralIterations = Math.min(ENTITY_STRUCTURAL_ITERATIONS, size);

    const updateHarness = createEntityHarness(size);
    try {
      let updateSeed = size;
      rows.push({
        operation: 'entity-updateOne',
        positions: size,
        perOperationUs: perOperationUs(
          measureOnceMs(() => {
            for (let iteration = 0; iteration < ENTITY_UPDATE_ITERATIONS; iteration++) {
              updateSeed += 1;
              updateHarness.updateOne(updateSeed);
            }
          }),
          ENTITY_UPDATE_ITERATIONS
        ),
      });
    } finally {
      updateHarness.destroy();
    }

    const addHarness = createEntityHarness(size);
    try {
      rows.push({
        operation: 'entity-addOne',
        positions: size,
        perOperationUs: perOperationUs(
          measureOnceMs(() => {
            for (let iteration = 0; iteration < ENTITY_STRUCTURAL_ITERATIONS; iteration++) {
              addHarness.addOne();
            }
          }),
          ENTITY_STRUCTURAL_ITERATIONS
        ),
      });
    } finally {
      addHarness.destroy();
    }

    const removeHarness = createEntityHarness(size);
    try {
      rows.push({
        operation: 'entity-removeOne',
        positions: size,
        perOperationUs: perOperationUs(
          measureOnceMs(() => {
            for (let iteration = 0; iteration < structuralIterations; iteration++) {
              removeHarness.removeOne();
            }
          }),
          structuralIterations
        ),
      });
    } finally {
      removeHarness.destroy();
    }

    const changeIdHarness = createEntityHarness(size);
    try {
      rows.push({
        operation: 'entity-changeId',
        positions: size,
        perOperationUs: perOperationUs(
          measureOnceMs(() => {
            for (let iteration = 0; iteration < ENTITY_STRUCTURAL_ITERATIONS; iteration++) {
              changeIdHarness.changeId();
            }
          }),
          ENTITY_STRUCTURAL_ITERATIONS
        ),
      });
    } finally {
      changeIdHarness.destroy();
    }
  }

  return rows;
}

function measureEntityFrameTimingRows(
  sizes: readonly number[]
): EntityFrameTimingRow[] {
  const rows: EntityFrameTimingRow[] = [];

  for (const size of sizes) {
    const frameHarness = createProjectionFrameHarness(size);

    rows.push({
      operation: 'entity-frame-addOne',
      positions: size,
      perOperationUs: perOperationUs(
        measureOnceMs(() => {
          for (let iteration = 0; iteration < ENTITY_STRUCTURAL_ITERATIONS; iteration++) {
            frameHarness.addOne();
          }
        }),
        ENTITY_STRUCTURAL_ITERATIONS
      ),
    });
  }

  return rows;
}

function measureEntityLogicalWorkRows(
  sizes: readonly number[],
  stats: ProductionSubstrateStats
): EntityLogicalWorkRow[] {
  const rows: EntityLogicalWorkRow[] = [];

  const captureRow = (
    operation: EntityLogicalWorkOperation,
    positions: number
  ): void => {
    rows.push({
      operation,
      positions,
      projectionRebuilds: stats.projectionRebuilds,
      projectionEntriesVisited: stats.projectionEntriesVisited,
      projectionReplacements: stats.projectionReplacements,
    });
  };

  for (const size of sizes) {
    const updateHarness = createProjectionFrameHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    updateHarness.updateOne(size + 1);
    captureRow('entity-updateOne', size);

    const addHarness = createProjectionFrameHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    addHarness.addOne();
    captureRow('entity-addOne', size);

    const removeHarness = createProjectionFrameHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    removeHarness.removeOne();
    captureRow('entity-removeOne', size);

    const changeIdHarness = createProjectionFrameHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    changeIdHarness.changeId();
    captureRow('entity-changeId', size);

    const mixedFrameHarness = createProjectionFrameHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    mixedFrameHarness.runMixedFrame();
    captureRow('entity-mixed-structural-frame', size);
  }

  return rows;
}

function writeRows(report: {
  scalarRows: readonly ScalarTimingRow[];
  entityRows: readonly EntityTimingRow[];
  entityFrameRows: readonly EntityFrameTimingRow[];
  entityLogicalRows: readonly EntityLogicalWorkRow[];
}): void {
  if (!OUTPUT_FILE) {
    return;
  }

  const parts = OUTPUT_FILE.split('/');
  parts.pop();
  mkdirSync(parts.join('/'), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
}

afterEach(() => {
  clearProductionSubstrateStatsForTesting();
});

describe('Complexity guard: production scalar substrate', () => {
  it('proves compiled scalar reads and writes stay constant in logical work', () => {
    const stats = installProductionSubstrateStatsForTesting();

    for (const size of COMPLEXITY_SIZES) {
      const harness = createScalarHarness(size);

      try {
        resetProductionSubstrateStatsForTesting(stats);
        expect(harness.readTarget()).toBe(Math.floor(size / 2));
        expect(stats).toEqual<ProductionSubstrateStats>({
          slotReads: 1,
          slotWrites: 0,
          equalityChecks: 0,
          revisionIncrements: 0,
          positionResolutions: 0,
          publicationDependencyReads: 1,
          publications: 0,
          treeVisits: 0,
          projectionRebuilds: 0,
          projectionEntriesVisited: 0,
          projectionReplacements: 0,
        });

        resetProductionSubstrateStatsForTesting(stats);
        harness.setTarget(size + 1);
        expect(stats).toEqual<ProductionSubstrateStats>({
          slotReads: 1,
          slotWrites: 1,
          equalityChecks: 1,
          revisionIncrements: 1,
          positionResolutions: 0,
          publicationDependencyReads: 1,
          publications: 1,
          treeVisits: 0,
          projectionRebuilds: 0,
          projectionEntriesVisited: 0,
          projectionReplacements: 0,
        });
      } finally {
        harness.destroy();
      }

      for (const width of FRAME_WIDTHS) {
        if (width > size) {
          continue;
        }

        const frameHarness = createScalarHarness(size);
        try {
          resetProductionSubstrateStatsForTesting(stats);
          frameHarness.commitFrame(width, size * 10_000 + width);
          expect(stats).toEqual<ProductionSubstrateStats>({
            slotReads: 0,
            slotWrites: width,
            equalityChecks: width,
            revisionIncrements: 1,
            positionResolutions: 0,
            publicationDependencyReads: 0,
            publications: width,
            treeVisits: 0,
            projectionRebuilds: 0,
            projectionEntriesVisited: 0,
            projectionReplacements: 0,
          });
        } finally {
          frameHarness.destroy();
        }
      }
    }
  });
});

describe('Complexity audit: entity structural projection maintenance', () => {
  it(
    'proves value-only writes stay O(1) while structural projection work still scales with collection size',
    () => {
    const stats = installProductionSubstrateStatsForTesting();
    const rows = measureEntityLogicalWorkRows(LOGICAL_AUDIT_SIZES, stats);

    for (const size of LOGICAL_AUDIT_SIZES) {
      const updateRow = rows.find(
        (row) => row.operation === 'entity-updateOne' && row.positions === size
      );
      expect(updateRow).toEqual({
        operation: 'entity-updateOne',
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionReplacements: 1,
      });

      const addRow = rows.find(
        (row) => row.operation === 'entity-addOne' && row.positions === size
      );
      expect(addRow).toEqual({
        operation: 'entity-addOne',
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionReplacements: 0,
      });

      const removeRow = rows.find(
        (row) => row.operation === 'entity-removeOne' && row.positions === size
      );
      expect(removeRow).toEqual({
        operation: 'entity-removeOne',
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionReplacements: 0,
      });

      const changeIdRow = rows.find(
        (row) => row.operation === 'entity-changeId' && row.positions === size
      );
      expect(changeIdRow).toEqual({
        operation: 'entity-changeId',
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionReplacements: 0,
      });

      const mixedRow = rows.find(
        (row) =>
          row.operation === 'entity-mixed-structural-frame' &&
          row.positions === size
      );
      expect(mixedRow).toEqual({
        operation: 'entity-mixed-structural-frame',
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionReplacements: 1,
      });
    }
    },
    20_000
  );
});

describe('Timing guard: production scalar substrate', () => {
  it('rejects catastrophic total-size scaling for compiled scalar operations', () => {
    const rows = measureScalarTimingRows(COMPLEXITY_SIZES);

    for (const operation of ['compiled-read', 'compiled-write'] as const) {
      const operationRows = rows.filter((row) => row.operation === operation);
      expect(scaleRatio(operationRows, COMPLEXITY_SIZES)).toBeLessThan(TIMING_RATIO_LIMIT);
    }

    for (const width of FRAME_WIDTHS) {
      const supportedSizes = COMPLEXITY_SIZES.filter((size) => size >= width);
      const operationRows = rows.filter(
        (row) => row.operation === (`frame-${width}` as ScalarTimingOperation)
      );
      expect(scaleRatio(operationRows, supportedSizes)).toBeLessThan(TIMING_RATIO_LIMIT);
    }
  });
});

timingDescribe('Performance report: production substrate', () => {
  it('reports scalar and entity scaling across the shipped path', () => {
    const scalarRows = measureScalarTimingRows(COMPLEXITY_SIZES);
    const entityRows = measureEntityTimingRows(COMPLEXITY_SIZES);
    const entityFrameRows = measureEntityFrameTimingRows(COMPLEXITY_SIZES);
    const stats = installProductionSubstrateStatsForTesting();
    const entityLogicalRows = measureEntityLogicalWorkRows(LOGICAL_AUDIT_SIZES, stats);

    writeRows({ scalarRows, entityRows, entityFrameRows, entityLogicalRows });
    console.table(scalarRows);
    console.table(entityRows);
    console.table(entityFrameRows);
    console.table(entityLogicalRows);
  }, 120_000);
});
