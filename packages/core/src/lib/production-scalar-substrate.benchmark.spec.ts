import { mkdirSync, writeFileSync } from 'node:fs';

import type { WritableSignal } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';

import { timeTravel } from '../enhancers/time-travel/time-travel';
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
import { getPathNotifier } from './path-notifier';
import { signalTree } from './signal-tree';
import type { ISignalTree, PositionId } from './types';

const RUN_TIMING = process.env['ST_PERF'] === '1';
const timingDescribe = describe.runIf(RUN_TIMING);
const OUTPUT_FILE = process.env['ST_PERF_OUTPUT_FILE'];
const COMPLEXITY_SIZES = [10, 100, 1_000, 10_000, 100_000] as const;
const LOGICAL_AUDIT_SIZES = [100, 1_000] as const;
const STRUCTURAL_LOGICAL_AUDIT_SIZES = [100, 100_000] as const;
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
  | 'entity-changeId'
  | 'entity-undoRemove';

type EntityFrameTimingOperation =
  | 'entity-frame-addOne'
  | 'entity-frame-restoreOne';

type EntityFrameLogicalWorkOperation =
  | 'entity-frame-addOne'
  | 'entity-frame-removeOne'
  | 'entity-frame-changeId';

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

type PublicUndoLogicalWorkRow = {
  positions: number;
  projectionRebuilds: number;
  projectionEntriesVisited: number;
  projectionRestores: number;
  publicUndoPositionEntriesExamined: number;
  publicUndoTurnEffectsExamined: number;
};

type ProjectionRestoreHarness = {
  prepareRestore(): void;
  restoreOne(): void;
};

type UndoEntityHarness = {
  prepareUndo(): void;
  undoRemove(): void;
  destroy(): void;
};

type EntityFrameLogicalWorkRow = {
  operation: EntityFrameLogicalWorkOperation;
  positions: number;
  structuralActiveKeyLookups: number;
  structuralActiveKeyEntriesVisited: number;
  structuralSubjectsCreated: number;
  structuralSubjectTransfers: number;
  structuralSubjectTombstones: number;
  valueStoreWrites: number;
  projectionAppends: number;
  projectionRemovals: number;
  projectionRekeys: number;
};

type EntityLogicalWorkRow = {
  operation: EntityLogicalWorkOperation;
  positions: number;
  projectionRebuilds: number;
  projectionEntriesVisited: number;
  projectionReplacements: number;
  publicAddPreviousTailReads: number;
  publicAddExistingKeysCopied: number;
};

type PublicAddLogicalWorkRow = {
  positions: number;
  publicAddPreviousTailReads: number;
  publicAddExistingKeysCopied: number;
  structuralSubjectsCreated: number;
  valueStoreWrites: number;
  projectionAppends: number;
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

type StructuralAuditHarness = {
  addOne(): void;
  removeOne(): void;
  changeId(): void;
};

type RestoreLogicalWorkRow = {
  positions: number;
  projectionRebuilds: number;
  projectionEntriesVisited: number;
  projectionRestores: number;
  structuralActiveKeyLookups: number;
  structuralActiveKeyEntriesVisited: number;
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

function measurePreparedOperationUs(
  iterations: number,
  prepare: () => void,
  operate: () => void
): number {
  let totalMs = 0;

  for (let iteration = 0; iteration < iterations; iteration++) {
    prepare();
    const start = performance.now();
    operate();
    totalMs += performance.now() - start;
  }

  return perOperationUs(totalMs, iterations);
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

function createUndoEntityHarness(size: number): UndoEntityHarness {
  const tree = signalTree({ rows: entityMap<EntityRow, number>() }).with(
    timeTravel({ maxHistorySize: size + 10 })
  ) as ISignalTree<{
    rows: EntityCollection;
  }> & {
    undo(): void;
  };
  const rows = tree.$.rows;
  const notifier = getPathNotifier();
  const removableId = size - 1;

  rows.addMany(buildEntityRows(size));
  notifier?.flushSync();

  return {
    prepareUndo(): void {
      rows.removeOne(removableId);
      notifier?.flushSync();
    },
    undoRemove(): void {
      tree.undo();
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

function createStructuralAuditHarness(size: number): StructuralAuditHarness {
  const activeKeys = Array.from({ length: size }, (_, index) => index);
  const stableKey = Math.floor(size / 2);
  const stableSubjectId = stableKey + 1;
  const removableKey = size - 1;
  const removableSubjectId = removableKey + 1;
  const transferredKey = size + 10_000;
  const freshKey = size + 20_000;
  const freshSubjectId = size + 1;

  const seedAddStore = (): StructuralStore<number> => {
    const structuralStore = new StructuralStore<number>();
    const seededStore = structuralStore as unknown as {
      activeKeys: number[];
      nextSubjectId: number;
    };
    seededStore.activeKeys = [...activeKeys];
    seededStore.nextSubjectId = freshSubjectId;
    return structuralStore;
  };

  const seedRemoveStore = (): StructuralStore<number> => {
    const structuralStore = new StructuralStore<number>();
    const seededStore = structuralStore as unknown as {
      activeKeys: number[];
      subjectIds: Map<number, number>;
      subjectStates: Map<
        number,
        { active: boolean; key?: number; restoreAllowed: boolean }
      >;
      nextSubjectId: number;
    };
    seededStore.activeKeys = [...activeKeys];
    seededStore.subjectIds = new Map([[removableKey, removableSubjectId]]);
    seededStore.subjectStates = new Map([
      [
        removableSubjectId,
        { active: true, key: removableKey, restoreAllowed: true },
      ],
    ]);
    seededStore.nextSubjectId = freshSubjectId;
    return structuralStore;
  };

  const seedChangeIdStore = (): StructuralStore<number> => {
    const structuralStore = new StructuralStore<number>();
    const seededStore = structuralStore as unknown as {
      activeKeys: number[];
      subjectIds: Map<number, number>;
      subjectStates: Map<
        number,
        { active: boolean; key?: number; restoreAllowed: boolean }
      >;
      nextSubjectId: number;
    };
    seededStore.activeKeys = [...activeKeys];
    seededStore.subjectIds = new Map([[stableKey, stableSubjectId]]);
    seededStore.subjectStates = new Map([
      [stableSubjectId, { active: true, key: stableKey, restoreAllowed: true }],
    ]);
    seededStore.nextSubjectId = freshSubjectId;
    return structuralStore;
  };

  return {
    addOne(): void {
      const valueStore = new EntityValueStore<EntityRow>();
      const projection = new MaterializedEntityProjection<number, EntityRow>();
      const structuralStore = seedAddStore();
      const frame = new EntityMutationFrame(valueStore, projection, structuralStore);
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
      const valueStore = new EntityValueStore<EntityRow>();
      const projection = new MaterializedEntityProjection<number, EntityRow>();
      const structuralStore = seedRemoveStore();
      const frame = new EntityMutationFrame(valueStore, projection, structuralStore);
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
      const valueStore = new EntityValueStore<EntityRow>();
      const projection = new MaterializedEntityProjection<number, EntityRow>();
      const structuralStore = seedChangeIdStore();
      const frame = new EntityMutationFrame(valueStore, projection, structuralStore);
      frame.stageKeyTransfer({
        kind: 'transfer-key',
        fromKey: stableKey,
        toKey: transferredKey,
        subjectId: stableSubjectId,
      });
      const result = frame.commit();
      frame.project(result);
    },
  };
}

function createRestoreAuditHarness(size: number): { restoreOne(): void } {
  const valueStore = new EntityValueStore<EntityRow>();
  const projection = new MaterializedEntityProjection<number, EntityRow>();
  const structuralStore = new StructuralStore<number>();
  const restoreKey = Math.floor(size / 2);
  const restoreSubjectId = restoreKey + 1;
  const beforeSubjectId = restoreSubjectId - 1;
  const afterSubjectId = restoreSubjectId + 1;

  for (let index = 0; index < size; index++) {
    const subjectId = index + 1;
    const entity = { id: index, value: index };
    structuralStore.createSubject(subjectId, index);
    valueStore.retainSubjectValue(subjectId, entity);
    projection.replaceEntry(index, entity);
  }

  structuralStore.tombstoneSubject(restoreSubjectId, restoreKey, true);
  projection.removeEntry(restoreKey);

  return {
    restoreOne(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageSubjectRestore({
        kind: 'restore-subject',
        key: restoreKey,
        subjectId: restoreSubjectId,
        restoreAllowed: true,
        beforeSubject: beforeSubjectId,
        afterSubject: afterSubjectId,
        realizedValue: { id: restoreKey, value: restoreKey },
      });
      const result = frame.commit();
      frame.project(result);
    },
  };
}

function createProjectionRestoreHarness(size: number): ProjectionRestoreHarness {
  const valueStore = new EntityValueStore<EntityRow>();
  const projection = new MaterializedEntityProjection<number, EntityRow>();
  const structuralStore = new StructuralStore<number>();
  const restoreKey = Math.floor(size / 2);
  const restoreSubjectId = restoreKey + 1;
  const beforeSubjectId = restoreSubjectId - 1;
  const afterSubjectId = restoreSubjectId + 1;

  for (let index = 0; index < size; index++) {
    const subjectId = index + 1;
    const entity = { id: index, value: index };
    structuralStore.createSubject(subjectId, index);
    valueStore.retainSubjectValue(subjectId, entity);
    projection.replaceEntry(index, entity);
  }

  return {
    prepareRestore(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageSubjectTombstone({
        kind: 'tombstone-subject',
        key: restoreKey,
        subjectId: restoreSubjectId,
        restoreAllowed: true,
      });
      const result = frame.commit();
      frame.project(result);
    },
    restoreOne(): void {
      const frame = new EntityMutationFrame(
        valueStore,
        projection,
        structuralStore
      );
      frame.stageSubjectRestore({
        kind: 'restore-subject',
        key: restoreKey,
        subjectId: restoreSubjectId,
        restoreAllowed: true,
        beforeSubject: beforeSubjectId,
        afterSubject: afterSubjectId,
        realizedValue: { id: restoreKey, value: restoreKey },
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

        const undoHarness = createUndoEntityHarness(size);
        try {
          rows.push({
            operation: 'entity-undoRemove',
            positions: size,
            perOperationUs: measurePreparedOperationUs(
              structuralIterations,
              () => undoHarness.prepareUndo(),
              () => undoHarness.undoRemove()
            ),
          });
        } finally {
          undoHarness.destroy();
        }
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

    const restoreHarness = createProjectionRestoreHarness(size);
    rows.push({
      operation: 'entity-frame-restoreOne',
      positions: size,
      perOperationUs: measurePreparedOperationUs(
        ENTITY_STRUCTURAL_ITERATIONS,
        () => restoreHarness.prepareRestore(),
        () => restoreHarness.restoreOne()
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
      publicAddPreviousTailReads: stats.publicAddPreviousTailReads,
      publicAddExistingKeysCopied: stats.publicAddExistingKeysCopied,
    });
  };

  for (const size of sizes) {
    const harness = createProjectionFrameHarness(size);

    resetProductionSubstrateStatsForTesting(stats);
    harness.updateOne(size + 1);
    captureRow('entity-updateOne', size);

    resetProductionSubstrateStatsForTesting(stats);
    harness.addOne();
    captureRow('entity-addOne', size);

    resetProductionSubstrateStatsForTesting(stats);
    harness.removeOne();
    captureRow('entity-removeOne', size);

    resetProductionSubstrateStatsForTesting(stats);
    harness.changeId();
    captureRow('entity-changeId', size);

    resetProductionSubstrateStatsForTesting(stats);
    harness.runMixedFrame();
    captureRow('entity-mixed-structural-frame', size);
  }

  return rows;
}

function measureEntityFrameLogicalWorkRows(
  sizes: readonly number[],
  stats: ProductionSubstrateStats
): EntityFrameLogicalWorkRow[] {
  const rows: EntityFrameLogicalWorkRow[] = [];

  const captureRow = (
    operation: EntityFrameLogicalWorkOperation,
    positions: number
  ): void => {
    rows.push({
      operation,
      positions,
      structuralActiveKeyLookups: stats.structuralActiveKeyLookups,
      structuralActiveKeyEntriesVisited: stats.structuralActiveKeyEntriesVisited,
      structuralSubjectsCreated: stats.structuralSubjectsCreated,
      structuralSubjectTransfers: stats.structuralSubjectTransfers,
      structuralSubjectTombstones: stats.structuralSubjectTombstones,
      valueStoreWrites: stats.valueStoreWrites,
      projectionAppends: stats.projectionAppends,
      projectionRemovals: stats.projectionRemovals,
      projectionRekeys: stats.projectionRekeys,
    });
  };

  for (const size of sizes) {
    const addHarness = createStructuralAuditHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    addHarness.addOne();
    captureRow('entity-frame-addOne', size);

    const removeHarness = createStructuralAuditHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    removeHarness.removeOne();
    captureRow('entity-frame-removeOne', size);

    const changeIdHarness = createStructuralAuditHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    changeIdHarness.changeId();
    captureRow('entity-frame-changeId', size);
  }

  return rows;
}

function measureRestoreLogicalWorkRows(
  sizes: readonly number[],
  stats: ProductionSubstrateStats
): RestoreLogicalWorkRow[] {
  const rows: RestoreLogicalWorkRow[] = [];

  for (const size of sizes) {
    const harness = createRestoreAuditHarness(size);
    resetProductionSubstrateStatsForTesting(stats);
    harness.restoreOne();
    rows.push({
      positions: size,
      projectionRebuilds: stats.projectionRebuilds,
      projectionEntriesVisited: stats.projectionEntriesVisited,
      projectionRestores: stats.projectionRestores,
      structuralActiveKeyLookups: stats.structuralActiveKeyLookups,
      structuralActiveKeyEntriesVisited: stats.structuralActiveKeyEntriesVisited,
    });
  }

  return rows;
}

function measurePublicAddLogicalWorkRows(
  sizes: readonly number[],
  stats: ProductionSubstrateStats
): PublicAddLogicalWorkRow[] {
  const rows: PublicAddLogicalWorkRow[] = [];

  for (const size of sizes) {
    const harness = createEntityHarness(size);

    try {
      resetProductionSubstrateStatsForTesting(stats);
      harness.addOne();
      rows.push({
        positions: size,
        publicAddPreviousTailReads: stats.publicAddPreviousTailReads,
        publicAddExistingKeysCopied: stats.publicAddExistingKeysCopied,
        structuralSubjectsCreated: stats.structuralSubjectsCreated,
        valueStoreWrites: stats.valueStoreWrites,
        projectionAppends: stats.projectionAppends,
      });
    } finally {
      harness.destroy();
    }
  }

  return rows;
}

function measurePublicUndoLogicalWorkRows(
  sizes: readonly number[],
  stats: ProductionSubstrateStats
): PublicUndoLogicalWorkRow[] {
  const rows: PublicUndoLogicalWorkRow[] = [];

  for (const size of sizes) {
    const harness = createUndoEntityHarness(size);

    try {
      harness.prepareUndo();
      resetProductionSubstrateStatsForTesting(stats);
      harness.undoRemove();
      rows.push({
        positions: size,
        projectionRebuilds: stats.projectionRebuilds,
        projectionEntriesVisited: stats.projectionEntriesVisited,
        projectionRestores: stats.projectionRestores,
        publicUndoPositionEntriesExamined:
          stats.publicUndoPositionEntriesExamined,
        publicUndoTurnEffectsExamined: stats.publicUndoTurnEffectsExamined,
      });
    } finally {
      harness.destroy();
    }
  }

  return rows;
}

function writeRows(report: {
  scalarRows: readonly ScalarTimingRow[];
  entityRows: readonly EntityTimingRow[];
  entityFrameRows: readonly EntityFrameTimingRow[];
  entityLogicalRows: readonly EntityLogicalWorkRow[];
  entityFrameLogicalRows: readonly EntityFrameLogicalWorkRow[];
  restoreLogicalRows: readonly RestoreLogicalWorkRow[];
  publicUndoLogicalRows: readonly PublicUndoLogicalWorkRow[];
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
          projectionAppends: 0,
          projectionRemovals: 0,
          projectionRekeys: 0,
          projectionRestores: 0,
          structuralActiveKeyLookups: 0,
          structuralActiveKeyEntriesVisited: 0,
          structuralSubjectsCreated: 0,
          structuralSubjectTransfers: 0,
          structuralSubjectTombstones: 0,
          valueStoreWrites: 0,
          publicAddPreviousTailReads: 0,
          publicAddExistingKeysCopied: 0,
          publicUndoPositionEntriesExamined: 0,
          publicUndoTurnEffectsExamined: 0,
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
          projectionAppends: 0,
          projectionRemovals: 0,
          projectionRekeys: 0,
          projectionRestores: 0,
          structuralActiveKeyLookups: 0,
          structuralActiveKeyEntriesVisited: 0,
          structuralSubjectsCreated: 0,
          structuralSubjectTransfers: 0,
          structuralSubjectTombstones: 0,
          valueStoreWrites: 0,
          publicAddPreviousTailReads: 0,
          publicAddExistingKeysCopied: 0,
          publicUndoPositionEntriesExamined: 0,
          publicUndoTurnEffectsExamined: 0,
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
            projectionAppends: 0,
            projectionRemovals: 0,
            projectionRekeys: 0,
            projectionRestores: 0,
            structuralActiveKeyLookups: 0,
            structuralActiveKeyEntriesVisited: 0,
            structuralSubjectsCreated: 0,
            structuralSubjectTransfers: 0,
            structuralSubjectTombstones: 0,
            valueStoreWrites: 0,
            publicAddPreviousTailReads: 0,
            publicAddExistingKeysCopied: 0,
            publicUndoPositionEntriesExamined: 0,
            publicUndoTurnEffectsExamined: 0,
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
    'proves value-only writes stay O(1) while structural projection work stays local',
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
        publicAddPreviousTailReads: 0,
        publicAddExistingKeysCopied: 0,
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
        publicAddPreviousTailReads: 0,
        publicAddExistingKeysCopied: 0,
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
        publicAddPreviousTailReads: 0,
        publicAddExistingKeysCopied: 0,
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
        publicAddPreviousTailReads: 0,
        publicAddExistingKeysCopied: 0,
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
        publicAddPreviousTailReads: 0,
        publicAddExistingKeysCopied: 0,
      });
    }
    },
    20_000
  );
});

describe('Complexity audit: public fresh-add bookkeeping', () => {
  it('proves public add reads one tail anchor and copies no existing key order', () => {
    const stats = installProductionSubstrateStatsForTesting();
    const rows = measurePublicAddLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );

    for (const size of STRUCTURAL_LOGICAL_AUDIT_SIZES) {
      const row = rows.find((candidate) => candidate.positions === size);
      expect(row).toEqual({
        positions: size,
        publicAddPreviousTailReads: 1,
        publicAddExistingKeysCopied: 0,
        structuralSubjectsCreated: 1,
        valueStoreWrites: 1,
        projectionAppends: 1,
      });
    }
  });
});

describe('Complexity audit: structural store order bookkeeping', () => {
  it(
    'proves direct-frame structural mutations avoid inspecting unrelated active keys',
    () => {
    const stats = installProductionSubstrateStatsForTesting();
    const rows = measureEntityFrameLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );

    for (const size of STRUCTURAL_LOGICAL_AUDIT_SIZES) {
      const addRow = rows.find(
        (row) => row.operation === 'entity-frame-addOne' && row.positions === size
      );
      expect(addRow).toEqual({
        operation: 'entity-frame-addOne',
        positions: size,
        structuralActiveKeyLookups: 0,
        structuralActiveKeyEntriesVisited: 0,
        structuralSubjectsCreated: 1,
        structuralSubjectTransfers: 0,
        structuralSubjectTombstones: 0,
        valueStoreWrites: 1,
        projectionAppends: 1,
        projectionRemovals: 0,
        projectionRekeys: 0,
      });

      const removeRow = rows.find(
        (row) => row.operation === 'entity-frame-removeOne' && row.positions === size
      );
      expect(removeRow).toEqual({
        operation: 'entity-frame-removeOne',
        positions: size,
        structuralActiveKeyLookups: 0,
        structuralActiveKeyEntriesVisited: 0,
        structuralSubjectsCreated: 0,
        structuralSubjectTransfers: 0,
        structuralSubjectTombstones: 1,
        valueStoreWrites: 0,
        projectionAppends: 0,
        projectionRemovals: 1,
        projectionRekeys: 0,
      });

      const changeIdRow = rows.find(
        (row) => row.operation === 'entity-frame-changeId' && row.positions === size
      );
      expect(changeIdRow).toEqual({
        operation: 'entity-frame-changeId',
        positions: size,
        structuralActiveKeyLookups: 0,
        structuralActiveKeyEntriesVisited: 0,
        structuralSubjectsCreated: 0,
        structuralSubjectTransfers: 1,
        structuralSubjectTombstones: 0,
        valueStoreWrites: 0,
        projectionAppends: 0,
        projectionRemovals: 0,
        projectionRekeys: 1,
      });
    }
    },
    20_000
  );
});

describe('Complexity audit: restore-one projection maintenance', () => {
  it('proves direct-frame restore stays incremental and rebuild-free', () => {
    const stats = installProductionSubstrateStatsForTesting();
    const rows = measureRestoreLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );

    for (const size of STRUCTURAL_LOGICAL_AUDIT_SIZES) {
      const row = rows.find((candidate) => candidate.positions === size);
      expect(row).toEqual({
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionRestores: 1,
        structuralActiveKeyLookups: 0,
        structuralActiveKeyEntriesVisited: 0,
      });
    }
  });
});

describe('Complexity audit: public undo-of-remove realization', () => {
  it('proves public undo-of-remove realizes through one incremental restore', () => {
    const stats = installProductionSubstrateStatsForTesting();
    const rows = measurePublicUndoLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );

    for (const size of STRUCTURAL_LOGICAL_AUDIT_SIZES) {
      const row = rows.find((candidate) => candidate.positions === size);
      expect(row).toEqual({
        positions: size,
        projectionRebuilds: 0,
        projectionEntriesVisited: 0,
        projectionRestores: 1,
        publicUndoPositionEntriesExamined: 2,
        publicUndoTurnEffectsExamined: 1,
      });
    }
  });
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
    const entityFrameLogicalRows = measureEntityFrameLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );
    const restoreLogicalRows = measureRestoreLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );
    const publicUndoLogicalRows = measurePublicUndoLogicalWorkRows(
      STRUCTURAL_LOGICAL_AUDIT_SIZES,
      stats
    );

    writeRows({
      scalarRows,
      entityRows,
      entityFrameRows,
      entityLogicalRows,
      entityFrameLogicalRows,
      restoreLogicalRows,
      publicUndoLogicalRows,
    });
    console.table(scalarRows);
    console.table(entityRows);
    console.table(entityFrameRows);
    console.table(entityLogicalRows);
    console.table(entityFrameLogicalRows);
    console.table(restoreLogicalRows);
    console.table(publicUndoLogicalRows);
  }, 120_000);
});
