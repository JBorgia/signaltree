import type {
  EnhancerMeta,
  ISignalTree,
  PendingTransaction,
  TransactionMethods,
  UpdateMetadata,
} from '../../lib/types';

import { getCausalWriteMode } from '../../lib/causal-write-mode';
import {
  ENHANCER_META,
  SignalTreeRollbackError,
} from '../../lib/types';
import {
  openCommitScope,
  settleCommitScope,
} from '../../lib/internals/commit-consequence';
import { AppliedHistory } from '../../lib/internals/causal-runtime/applied-history';
import type {
  CausalEffect,
  PositionId as CausalPositionId,
} from '../../lib/internals/causal-runtime/causal-types';
import { rollbackPendingTurnAt } from '../../lib/internals/causal-runtime/pending-rollback';
import { createRealizationContextSource } from '../../lib/internals/causal-runtime/realization-context';
import {
  createTreeRealizationAdapter,
  defineTreeRealizationDescriptors,
  defineTreeRealizationPort,
  getTreeRealizationDescriptors,
  getTreeRealizationPort,
  rememberTreeRealizationDescriptor,
} from '../../lib/internals/causal-runtime/tree-realization-adapter';
import { TurnStore } from '../../lib/internals/causal-runtime/turn-store';
import { interceptLeafSignals } from '../../lib/internals/intercept-leaf-signals';
import { getMutationCaptureRuntime } from '../../lib/internals/mutation-capture-runtime';
import { getOwnedPositionIds } from '../../lib/internals/owned-mutation';
import { getPositionRegistry } from '../../lib/internals/position-registry';
import { getPathNotifier } from '../../lib/path-notifier';
import { isTraversableNode } from '../../lib/utils';
import { getActiveWriteContext, withWriteContext } from '../../lib/write-context';

type TurnEffectBase = {
  position: number;
  ownerPath: string;
  path: string;
};

export type ScalarSetEffect = TurnEffectBase & {
  kind: 'set';
  subject?: number;
  before: unknown;
  after: unknown;
  mutationIntent?: 'replace' | 'derive';
};

export type CollectionAddEffect = TurnEffectBase & {
  kind: 'add';
  subject: number;
  key: string | number;
  value: unknown;
  beforeSubject?: number;
  afterSubject?: number;
  subjectPositions?: readonly number[];
};

export type CollectionRemoveEffect = TurnEffectBase & {
  kind: 'remove';
  subject: number;
  key: string | number;
  value: unknown;
  beforeSubject?: number;
  afterSubject?: number;
  subjectPositions?: readonly number[];
};

export type CollectionRekeyEffect = TurnEffectBase & {
  kind: 'rekey';
  subject: number;
  beforeKey: string | number;
  afterKey: string | number;
  subjectPositions?: readonly number[];
};

export type TurnEffect =
  | ScalarSetEffect
  | CollectionAddEffect
  | CollectionRemoveEffect
  | CollectionRekeyEffect;

type LaterAppliedEffect = {
  turnId: number;
  effect: TurnEffect;
};

type PendingRollbackDependencyConflict = {
  kind: 'later-confirmed-dependency';
  pendingTurnId: number;
  pendingEffect: TurnEffect;
  conflictingTurnId?: number;
  conflictingEffect?: TurnEffect;
};

type PendingRollbackPlan =
  | { compensation: TurnEffect[] }
  | { conflict: PendingRollbackDependencyConflict };

type RollbackFailureCause =
  | PendingRollbackDependencyConflict
  | {
      kind: 'effect-validation-failed';
      pendingTurnId: number;
      compensation: TurnEffect[];
      errorMessage: string;
      cause?: unknown;
      callbackError?: unknown;
    };

type PendingEffectMap = Map<string, TurnEffect>;

type CaptureBucket = {
  ownerPaths: Set<string>;
  subjectIds: Set<number>;
  positionIds: Set<number>;
  baselineValues: Map<number, unknown>;
  effects: PendingEffectMap;
};

export type TransactionTurnRecord = {
  id: number;
  __ownerPaths?: string[];
  __subjectIds?: number[];
  __positionIds?: number[];
  __effects?: TurnEffect[];
  __baselineValues?: Map<number, unknown>;
};

type TransactionLifecycleListener = (turn: TransactionTurnRecord) => void;

export interface InternalTransactionRuntime {
  transaction(fn: () => void): PendingTransaction;
  getConfirmedTurnCount(): number;
  getPendingTurnCount(): number;
  getConfirmedTurnIds(): number[];
  getPendingTurnIds(): number[];
  onPendingCreated(listener: TransactionLifecycleListener): () => void;
  onPendingConfirmed(listener: TransactionLifecycleListener): () => void;
  onPendingDiscarded(listener: TransactionLifecycleListener): () => void;
}

const INTERNAL_TRANSACTION_RUNTIME = Symbol(
  'signaltree:internal:transaction-runtime'
);

const ROLLBACK_ERROR_MESSAGE =
  'SignalTree could not rollback the pending transaction';

const createRollbackError = (
  cause: RollbackFailureCause
): SignalTreeRollbackError =>
  new SignalTreeRollbackError(ROLLBACK_ERROR_MESSAGE, { cause });

function cloneTurnEffect(effect: TurnEffect): TurnEffect {
  return { ...effect };
}

function combineScalarMutationIntent(
  left?: 'replace' | 'derive',
  right?: 'replace' | 'derive'
): 'replace' | 'derive' | undefined {
  if (left === 'replace' || right === 'replace') {
    return 'replace';
  }
  if (left === 'derive' || right === 'derive') {
    return 'derive';
  }
  return undefined;
}

function buildPendingRollbackPlan(
  pendingTurn: TransactionTurnRecord | undefined,
  laterEffects: LaterAppliedEffect[]
): PendingRollbackPlan {
  if (!pendingTurn) {
    return { compensation: [] };
  }

  const pendingEffects = pendingTurn.__effects ?? [];
  const makeScalarKey = (effect: ScalarSetEffect): string =>
    `${effect.position}\u0000${effect.path}\u0000${effect.subject ?? ''}`;
  const supersededScalarKeys = new Set(
    laterEffects
      .map(({ effect }) => effect)
      .filter((effect): effect is ScalarSetEffect => effect.kind === 'set')
      .map(makeScalarKey)
  );

  const classifyLaterOverlap = (
    effect: ScalarSetEffect
  ):
    | { kind: 'none' }
    | { kind: 'superseded' }
    | {
        kind: 'conflict';
        conflictingTurnId?: number;
        conflictingEffect?: TurnEffect;
      } => {
    let superseded = false;
    for (const laterEntry of laterEffects) {
      const laterEffect = laterEntry.effect;
      if (laterEffect.position !== effect.position) {
        continue;
      }
      if (
        laterEffect.subject !== undefined &&
        effect.subject !== undefined &&
        laterEffect.subject !== effect.subject
      ) {
        continue;
      }
      if (laterEffect.path === effect.path) {
        if (laterEffect.kind !== 'set') {
          return {
            kind: 'conflict',
            conflictingTurnId: laterEntry.turnId,
            conflictingEffect: laterEffect,
          };
        }
        if (laterEffect.mutationIntent === 'replace') {
          if (supersededScalarKeys.has(makeScalarKey(effect))) {
            superseded = true;
            continue;
          }
        }
        return {
          kind: 'conflict',
          conflictingTurnId: laterEntry.turnId,
          conflictingEffect: laterEffect,
        };
      }
      if (
        laterEffect.path.startsWith(`${effect.path}.`) ||
        effect.path.startsWith(`${laterEffect.path}.`)
      ) {
        return {
          kind: 'conflict',
          conflictingTurnId: laterEntry.turnId,
          conflictingEffect: laterEffect,
        };
      }
    }
    return superseded ? { kind: 'superseded' } : { kind: 'none' };
  };

  const hasSameSubjectDependency = (
    effect: CollectionAddEffect | CollectionRemoveEffect | CollectionRekeyEffect
  ):
    | { conflictingTurnId?: number; conflictingEffect?: TurnEffect }
    | undefined => {
    for (const laterEntry of laterEffects) {
      const laterEffect = laterEntry.effect;
      if (laterEffect.kind === 'set') {
        if (laterEffect.subject === effect.subject && effect.kind !== 'rekey') {
          return {
            conflictingTurnId: laterEntry.turnId,
            conflictingEffect: laterEffect,
          };
        }
        continue;
      }
      if (laterEffect.subject === effect.subject) {
        return {
          conflictingTurnId: laterEntry.turnId,
          conflictingEffect: laterEffect,
        };
      }
    }
    return undefined;
  };

  const compensation: TurnEffect[] = [];
  for (let i = pendingEffects.length - 1; i >= 0; i--) {
    const effect = pendingEffects[i];
    switch (effect.kind) {
      case 'set': {
        const overlap = classifyLaterOverlap(effect);
        if (overlap.kind === 'conflict') {
          return {
            conflict: {
              kind: 'later-confirmed-dependency',
              pendingTurnId: pendingTurn.id,
              pendingEffect: effect,
              conflictingTurnId: overlap.conflictingTurnId,
              conflictingEffect: overlap.conflictingEffect,
            },
          };
        }
        if (overlap.kind === 'superseded') {
          continue;
        }
        compensation.push(effect);
        break;
      }
      case 'add':
      case 'remove':
      case 'rekey': {
        const dependency = hasSameSubjectDependency(effect);
        if (dependency) {
          return {
            conflict: {
              kind: 'later-confirmed-dependency',
              pendingTurnId: pendingTurn.id,
              pendingEffect: effect,
              conflictingTurnId: dependency.conflictingTurnId,
              conflictingEffect: dependency.conflictingEffect,
            },
          };
        }
        compensation.push(effect);
        break;
      }
    }
  }

  return { compensation };
}

class TransactionAuthority {
  private confirmedTurns: TransactionTurnRecord[] = [];
  private pendingTurns = new Map<number, TransactionTurnRecord>();
  private nextTurnId = 1;

  private buildTurn(
    ownerPaths?: string[],
    subjectIds?: number[],
    positionIds?: number[],
    effects?: TurnEffect[],
    baselineValues?: ReadonlyMap<number, unknown>
  ): TransactionTurnRecord | undefined {
    if (
      (ownerPaths?.length ?? 0) === 0 &&
      (subjectIds?.length ?? 0) === 0 &&
      (positionIds?.length ?? 0) === 0 &&
      (effects?.length ?? 0) === 0
    ) {
      return undefined;
    }

    return {
      id: this.nextTurnId++,
      __ownerPaths: ownerPaths ? [...ownerPaths] : undefined,
      __subjectIds: subjectIds ? [...subjectIds] : undefined,
      __positionIds: positionIds ? [...positionIds] : undefined,
      __effects: effects ? effects.map(cloneTurnEffect) : undefined,
      __baselineValues: baselineValues ? new Map(baselineValues) : undefined,
    };
  }

  recordConfirmed(
    ownerPaths?: string[],
    subjectIds?: number[],
    positionIds?: number[],
    effects?: TurnEffect[]
  ): TransactionTurnRecord | undefined {
    const turn = this.buildTurn(ownerPaths, subjectIds, positionIds, effects);
    if (!turn) {
      return undefined;
    }
    this.insertConfirmed(turn);
    return cloneTurnRecord(turn);
  }

  createPending(
    ownerPaths?: string[],
    subjectIds?: number[],
    positionIds?: number[],
    effects?: TurnEffect[],
    baselineValues?: ReadonlyMap<number, unknown>
  ): TransactionTurnRecord | undefined {
    const turn = this.buildTurn(
      ownerPaths,
      subjectIds,
      positionIds,
      effects,
      baselineValues
    );
    if (!turn) {
      return undefined;
    }
    this.pendingTurns.set(turn.id, turn);
    return cloneTurnRecord(turn);
  }

  confirmPending(turnId: number): TransactionTurnRecord | undefined {
    const turn = this.pendingTurns.get(turnId);
    if (!turn) {
      return undefined;
    }
    this.pendingTurns.delete(turnId);
    this.insertConfirmed(turn);
    return cloneTurnRecord(turn);
  }

  discardPending(turnId: number): TransactionTurnRecord | undefined {
    const turn = this.pendingTurns.get(turnId);
    if (!turn) {
      return undefined;
    }
    this.pendingTurns.delete(turnId);
    return cloneTurnRecord(turn);
  }

  hasConfirmedTurnAfter(turnId: number): boolean {
    return this.confirmedTurns.some((turn) => turn.id > turnId);
  }

  getPendingRollbackPlan(turnId: number): PendingRollbackPlan {
    const laterEffects = this.confirmedTurns
      .filter((turn) => turn.id > turnId)
      .flatMap((turn) =>
        (turn.__effects ?? []).map((effect) => ({ turnId: turn.id, effect }))
      );
    return buildPendingRollbackPlan(this.pendingTurns.get(turnId), laterEffects);
  }

  getConfirmedTurnCount(): number {
    return this.confirmedTurns.length;
  }

  getPendingTurnCount(): number {
    return this.pendingTurns.size;
  }

  getConfirmedTurnIds(): number[] {
    return this.confirmedTurns.map((turn) => turn.id);
  }

  getPendingTurnIds(): number[] {
    return [...this.pendingTurns.keys()].sort((left, right) => left - right);
  }

  private insertConfirmed(turn: TransactionTurnRecord): void {
    const insertIndex = this.confirmedTurns.findIndex(
      (candidate) => candidate.id > turn.id
    );
    if (insertIndex === -1) {
      this.confirmedTurns.push(turn);
    } else {
      this.confirmedTurns.splice(insertIndex, 0, turn);
    }
  }
}

function cloneTurnRecord(turn: TransactionTurnRecord): TransactionTurnRecord {
  return {
    ...turn,
    __ownerPaths: turn.__ownerPaths ? [...turn.__ownerPaths] : undefined,
    __subjectIds: turn.__subjectIds ? [...turn.__subjectIds] : undefined,
    __positionIds: turn.__positionIds ? [...turn.__positionIds] : undefined,
    __effects: turn.__effects ? turn.__effects.map(cloneTurnEffect) : undefined,
    __baselineValues: turn.__baselineValues
      ? new Map(turn.__baselineValues)
      : undefined,
  };
}

function createCaptureBucket(): CaptureBucket {
  return {
    ownerPaths: new Set<string>(),
    subjectIds: new Set<number>(),
    positionIds: new Set<number>(),
    baselineValues: new Map(),
    effects: new Map(),
  };
}

export function getOrCreateInternalTransactionRuntime<T>(
  tree: ISignalTree<T>
): InternalTransactionRuntime {
  const existing = (
    tree as unknown as Record<PropertyKey, unknown>
  )[INTERNAL_TRANSACTION_RUNTIME] as InternalTransactionRuntime | undefined;
  if (existing) {
    return existing;
  }

  const authority = new TransactionAuthority();
  const transactionOwnerToken = {};
  let nextTransactionId = 1;
  const isRestoring = false;
  let selfDirty = false;
  let unsubscribeFlush: (() => void) | null = null;
  let unsubscribeNotifications: (() => void) | null = null;
  let unsubscribeReset: (() => void) | null = null;
  let restoreLeafInterceptors: (() => void) | null = null;
  const pendingCapture = createCaptureBucket();
  const pendingTransactions = new Map<number, CaptureBucket>();
  const pendingCreatedListeners = new Set<TransactionLifecycleListener>();
  const pendingConfirmedListeners = new Set<TransactionLifecycleListener>();
  const pendingDiscardedListeners = new Set<TransactionLifecycleListener>();
  const treeWrapper = tree as unknown as object;
  const stateRoot = tree.$ as unknown as object;
  const realizationDescriptors =
    getTreeRealizationDescriptors(stateRoot) ??
    getTreeRealizationDescriptors(treeWrapper) ??
    new Map();
  defineTreeRealizationDescriptors(treeWrapper, realizationDescriptors);
  defineTreeRealizationDescriptors(stateRoot, realizationDescriptors);
  const realizationPort =
    getTreeRealizationPort(stateRoot) ??
    getTreeRealizationPort(treeWrapper) ??
    createTreeRealizationAdapter({
      tree: tree as unknown as ISignalTree<object>,
      descriptors: realizationDescriptors,
    });
  defineTreeRealizationPort(treeWrapper, realizationPort);
  defineTreeRealizationPort(stateRoot, realizationPort);

  const notifyListeners = (
    listeners: Set<TransactionLifecycleListener>,
    turn: TransactionTurnRecord
  ): void => {
    const payload = cloneTurnRecord(turn);
    for (const listener of listeners) {
      listener(payload);
    }
  };

  const drainCaptureBucket = (
    bucket: CaptureBucket
  ): {
    ownerPaths: string[];
    subjectIds: number[];
    positionIds: number[];
    baselineValues: Map<number, unknown>;
    effects: TurnEffect[];
  } => {
    const ownerPaths = Array.from(bucket.ownerPaths).sort();
    bucket.ownerPaths.clear();
    const subjectIds = Array.from(bucket.subjectIds).sort((a, b) => a - b);
    bucket.subjectIds.clear();
    const positionIds = Array.from(bucket.positionIds).sort((a, b) => a - b);
    bucket.positionIds.clear();
    const baselineValues = new Map(bucket.baselineValues);
    bucket.baselineValues.clear();
    const effects = Array.from(bucket.effects.values()).map(cloneTurnEffect);
    bucket.effects.clear();
    return { ownerPaths, subjectIds, positionIds, baselineValues, effects };
  };

  const rememberBaselineValue = (
    bucket: CaptureBucket,
    effect: TurnEffect
  ): void => {
    if (!bucket.baselineValues.has(effect.position)) {
      switch (effect.kind) {
        case 'set':
          bucket.baselineValues.set(effect.position, effect.before);
          break;
        case 'add':
          bucket.baselineValues.set(effect.position, undefined);
          break;
        case 'remove':
          bucket.baselineValues.set(effect.position, effect.key);
          break;
        case 'rekey':
          bucket.baselineValues.set(effect.position, effect.beforeKey);
          break;
      }
    }
  };

  const effectKey = (effect: TurnEffect): string => {
    switch (effect.kind) {
      case 'set':
        return `${effect.kind}\u0000${effect.path}\u0000${effect.position}\u0000${effect.subject ?? ''}`;
      case 'remove':
      case 'add':
      case 'rekey':
        return `${effect.kind}\u0000${effect.ownerPath}\u0000${effect.position}\u0000${effect.subject}`;
    }
  };

  const enqueueEffect = (
    bucket: CaptureBucket,
    effectMap: PendingEffectMap,
    effect: TurnEffect
  ): void => {
    const key = effectKey(effect);
    const existing = effectMap.get(key);
    if (existing) {
      if (existing.kind === 'set' && effect.kind === 'set') {
        existing.after = effect.after;
        existing.mutationIntent = combineScalarMutationIntent(
          existing.mutationIntent,
          effect.mutationIntent
        );
        if (existing.before === existing.after) {
          effectMap.delete(key);
        }
      }
      return;
    }
    rememberBaselineValue(bucket, effect);
    effectMap.set(key, effect);
  };

  const buildTurnEffectFromHistory = (
    meta: UpdateMetadata | undefined,
    ownerPath: string,
    path: string,
    positionIds?: number[],
    subjectIds?: number[]
  ): TurnEffect | undefined => {
    const position = positionIds?.[0];
    const subject = subjectIds?.[0];
    if (position === undefined || subject === undefined) {
      return undefined;
    }

    const effect = meta?.historyEffect;
    if (!effect || effect.subject !== subject) {
      return undefined;
    }

    return {
      ...effect,
      ownerPath,
      path,
      position,
    } as TurnEffect;
  };

  const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Map) &&
    !(value instanceof Set);

  const captureEffects = (
    bucket: CaptureBucket,
    effectMap: PendingEffectMap,
    path: string,
    next: unknown,
    prev: unknown,
    meta?: UpdateMetadata,
    ownerPath?: string,
    subjectIds?: number[],
    positionIds?: number[]
  ): void => {
    const historyEffect = ownerPath
      ? buildTurnEffectFromHistory(meta, ownerPath, path, positionIds, subjectIds)
      : undefined;
    if (historyEffect) {
      enqueueEffect(bucket, effectMap, historyEffect);
      return;
    }

    if (next === undefined && prev === undefined) {
      return;
    }

    if (isPlainRecord(next) && isPlainRecord(prev)) {
      const position = positionIds?.[0];
      const subject = subjectIds?.[0];
      if (position === undefined) {
        return;
      }
      const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
      for (const key of keys) {
        const before = prev[key];
        const after = next[key];
        if (before === after) {
          continue;
        }
        enqueueEffect(bucket, effectMap, {
          kind: 'set',
          path: `${path}.${key}`,
          ownerPath: ownerPath ?? path,
          position,
          subject,
          before,
          after,
          mutationIntent: meta?.mutationIntent,
        });
      }
      return;
    }

    const position = positionIds?.[0];
    if (position === undefined || prev === next) {
      return;
    }

    enqueueEffect(bucket, effectMap, {
      kind: 'set',
      path,
      ownerPath: ownerPath ?? path,
      position,
      subject: subjectIds?.[0],
      before: prev,
      after: next,
      mutationIntent: meta?.mutationIntent,
    });
  };

  const resolveOwnerPositionId = (ownerPath?: string): number | undefined => {
    if (!ownerPath) {
      return undefined;
    }
    const segments = ownerPath.split('.');
    let cursor: unknown = tree.$ as Record<string, unknown>;
    for (const segment of segments) {
      if (!isTraversableNode(cursor)) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    const resolved = (cursor as { __positionIds?: number[] } | undefined)
      ?.__positionIds?.[0];
    return typeof resolved === 'number' ? resolved : undefined;
  };

  const captureIntoBucket = (
    bucket: CaptureBucket,
    path: string,
    next: unknown,
    prev: unknown,
    meta?: UpdateMetadata,
    ownerPath?: string,
    subjectIds?: number[],
    positionIds?: number[]
  ): void => {
    bucket.ownerPaths.add(ownerPath ?? path);
    for (const subjectId of subjectIds ?? []) {
      bucket.subjectIds.add(subjectId);
    }
    const resolvedPositionIds =
      positionIds && positionIds.length > 0
        ? positionIds
        : (() => {
            const fallback = resolveOwnerPositionId(ownerPath);
            return fallback === undefined ? [] : [fallback];
          })();
    for (const positionId of resolvedPositionIds) {
      bucket.positionIds.add(positionId);
    }
    rememberTreeRealizationDescriptor({
      descriptors: realizationDescriptors,
      path,
      ownerPath,
      positionIds: resolvedPositionIds,
      subjectIds,
      meta,
    });
    captureEffects(
      bucket,
      bucket.effects,
      path,
      next,
      prev,
      meta,
      ownerPath,
      subjectIds,
      resolvedPositionIds
    );
  };

  const recordConfirmedBucket = (bucket: CaptureBucket): TransactionTurnRecord | undefined => {
    const { ownerPaths, subjectIds, positionIds, effects } =
      drainCaptureBucket(bucket);
    return authority.recordConfirmed(
      ownerPaths.length > 0 ? ownerPaths : undefined,
      subjectIds.length > 0 ? subjectIds : undefined,
      positionIds.length > 0 ? positionIds : undefined,
      effects.length > 0 ? effects : undefined
    );
  };

  const getTransactionBucket = (transactionId: number): CaptureBucket => {
    let bucket = pendingTransactions.get(transactionId);
    if (!bucket) {
      bucket = createCaptureBucket();
      pendingTransactions.set(transactionId, bucket);
    }
    return bucket;
  };

  const resolveTransactionId = (
    meta?: { transactionId?: unknown; transactionOwner?: unknown }
  ): number | undefined =>
    typeof meta?.transactionId === 'number' &&
    meta.transactionOwner === transactionOwnerToken
      ? meta.transactionId
      : undefined;

  const materializePendingTransaction = (
    transactionId: number
  ): TransactionTurnRecord | undefined => {
    const bucket = pendingTransactions.get(transactionId);
    pendingTransactions.delete(transactionId);
    if (!bucket) {
      return undefined;
    }
    const { ownerPaths, subjectIds, positionIds, effects, baselineValues } =
      drainCaptureBucket(bucket);
    return authority.createPending(
      ownerPaths.length > 0 ? ownerPaths : undefined,
      subjectIds.length > 0 ? subjectIds : undefined,
      positionIds.length > 0 ? positionIds : undefined,
      effects.length > 0 ? effects : undefined,
      baselineValues.size > 0 ? baselineValues : undefined
    );
  };

  const drainTransactionRollbackInput = (
    transactionId: number
  ): { effects: TurnEffect[]; baselineValues: Map<number, unknown> } => {
    const bucket = pendingTransactions.get(transactionId);
    pendingTransactions.delete(transactionId);
    if (!bucket) {
      return { effects: [], baselineValues: new Map() };
    }
    const { effects, baselineValues } = drainCaptureBucket(bucket);
    return { effects, baselineValues };
  };

  const toCausalEffect = (effect: TurnEffect): CausalEffect => {
    switch (effect.kind) {
      case 'set':
        return {
          owner: effect.position as CausalPositionId,
          before: effect.before,
          after: effect.after,
          subjectId: effect.subject,
          path: effect.path,
          ownerPath: effect.ownerPath,
        } as CausalEffect;
      case 'add':
        return {
          owner: effect.position as CausalPositionId,
          before: undefined,
          after: effect.key,
          subjectId: effect.subject,
          path: effect.path,
          ownerPath: effect.ownerPath,
          structural: 'add',
          structuralContext: {
            kind: 'add',
            subject: effect.subject,
            key: effect.key,
            value: effect.value,
            beforeSubject: effect.beforeSubject,
            afterSubject: effect.afterSubject,
            subjectPositions: effect.subjectPositions,
          },
          subjectPositions: effect.subjectPositions,
        } as CausalEffect;
      case 'remove':
        return {
          owner: effect.position as CausalPositionId,
          before: effect.key,
          after: undefined,
          subjectId: effect.subject,
          path: effect.path,
          ownerPath: effect.ownerPath,
          structural: 'remove',
          structuralContext: {
            kind: 'remove',
            subject: effect.subject,
            key: effect.key,
            value: effect.value,
            beforeSubject: effect.beforeSubject,
            afterSubject: effect.afterSubject,
            subjectPositions: effect.subjectPositions,
          },
          subjectPositions: effect.subjectPositions,
        } as CausalEffect;
      case 'rekey':
        return {
          owner: effect.position as CausalPositionId,
          before: effect.beforeKey,
          after: effect.afterKey,
          subjectId: effect.subject,
          path: effect.path,
          ownerPath: effect.ownerPath,
          structural: 'rekey',
          structuralContext: {
            kind: 'rekey',
            subject: effect.subject,
            beforeKey: effect.beforeKey,
            afterKey: effect.afterKey,
            subjectPositions: effect.subjectPositions,
          },
          subjectPositions: effect.subjectPositions,
        } as CausalEffect;
    }
  };

  const rollbackPendingEffectsThroughRealizationPort = (
    transactionId: number,
    effects: TurnEffect[],
    baselineValues: ReadonlyMap<number, unknown>,
    callbackError?: unknown
  ): void => {
    if (effects.length === 0) {
      return;
    }

    const positionRegistry = getPositionRegistry(tree.$);
    const authorityPosition = getOwnedPositionIds(tree.$)?.[0] as
      | CausalPositionId
      | undefined;
    if (!positionRegistry || authorityPosition === undefined) {
      throw createRollbackError({
        kind: 'effect-validation-failed',
        pendingTurnId: transactionId,
        compensation: effects,
        errorMessage: 'Transaction rollback requires tree realization infrastructure',
        callbackError,
      });
    }

    const store = new TurnStore();
    store.admitPending({
      id: transactionId,
      effects: effects.map(toCausalEffect),
    });
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues,
      store,
      appliedHistory,
    });
    const result = rollbackPendingTurnAt({
      authority: authorityPosition,
      turnId: transactionId,
      store,
      topology: positionRegistry,
      port: realizationPort,
      realizationContext,
    });
    if (!result.ok) {
      throw createRollbackError({
        kind: 'effect-validation-failed',
        pendingTurnId: transactionId,
        compensation: effects,
        errorMessage: `Transaction rollback refused: ${result.refusal.kind}`,
        cause: result.refusal,
        callbackError,
      });
    }
  };

  try {
    const notifier = getPathNotifier();
    if (notifier) {
      const subscribeCollectionNotifications = (): void => {
        unsubscribeNotifications?.();
        unsubscribeNotifications = notifier.subscribe(
          '**',
          (next, prev, path, ownerPath, source, subjectIds, positionIds, meta) => {
            if (source === 'time-travel') {
              return;
            }
            if (getCausalWriteMode(meta) === 'realization') {
              return;
            }
            if (
              typeof meta?.transactionId === 'number' &&
              meta.transactionOwner !== transactionOwnerToken
            ) {
              return;
            }
            const transactionId = resolveTransactionId(meta);
            if (transactionId !== undefined) {
              captureIntoBucket(
                getTransactionBucket(transactionId),
                path,
                next,
                prev,
                meta,
                ownerPath,
                subjectIds,
                positionIds
              );
              return;
            }
            selfDirty = true;
            captureIntoBucket(
              pendingCapture,
              path,
              next,
              prev,
              meta,
              ownerPath,
              subjectIds,
              positionIds
            );
          }
        );
      };

      subscribeCollectionNotifications();
      if (typeof notifier.onReset === 'function') {
        unsubscribeReset = notifier.onReset(() => {
          subscribeCollectionNotifications();
        });
      }

      restoreLeafInterceptors = interceptLeafSignals(
        tree.$ as Record<string, unknown>,
        (path, next, prev, meta, ownerPath, subjectIds, positionIds) => {
          const effectiveMeta = meta ?? getActiveWriteContext();
          if (isRestoring) return;
          if (effectiveMeta?.source === 'time-travel') {
            return;
          }
          if (getCausalWriteMode(effectiveMeta) === 'realization') {
            notifier.notify(
              path,
              next,
              prev,
              ownerPath,
              subjectIds,
              positionIds,
              effectiveMeta
            );
            return;
          }
          if (
            typeof effectiveMeta?.transactionId === 'number' &&
            effectiveMeta.transactionOwner !== transactionOwnerToken
          ) {
            return;
          }
          const transactionId = resolveTransactionId(effectiveMeta);
          if (transactionId !== undefined) {
            captureIntoBucket(
              getTransactionBucket(transactionId),
              path,
              next,
              prev,
              effectiveMeta,
              ownerPath,
              subjectIds,
              positionIds
            );
          } else {
            captureEffects(
              pendingCapture,
              pendingCapture.effects,
              path,
              next,
              prev,
              effectiveMeta,
              ownerPath,
              subjectIds,
              positionIds
            );
          }
          notifier.notify(
            path,
            next,
            prev,
            ownerPath,
            subjectIds,
            positionIds,
            effectiveMeta
          );
        }
      );

      if (typeof notifier.onFlush === 'function') {
        unsubscribeFlush = notifier.onFlush(() => {
          if (isRestoring || !selfDirty) {
            return;
          }
          selfDirty = false;
          recordConfirmedBucket(pendingCapture);
        });
      }
    }
  } catch {
    // fall through without capture support
  }

  const runtime: InternalTransactionRuntime = {
    transaction(fn: () => void): PendingTransaction {
      const activeMeta = getActiveWriteContext();
      const notifier = getPathNotifier();
      const captureRuntime = getMutationCaptureRuntime(tree);
      if (typeof activeMeta?.transactionId === 'number') {
        throw new Error('Nested transaction is not supported');
      }

      notifier?.flushSync();
      const transactionId = nextTransactionId++;
      pendingTransactions.set(transactionId, createCaptureBucket());

      // Persistence is post-commit: open the deferral scope BEFORE the callback
      // runs, so speculative writes inside it queue instead of reaching storage.
      openCommitScope(transactionOwnerToken, transactionId, tree as object);

      const releaseCapture = captureRuntime?.activateCapture();
      let primaryError: unknown;
      let cleanupError: unknown;

      try {
        withWriteContext(
          {
            ...(activeMeta ?? {}),
            transactionId,
            transactionOwner: transactionOwnerToken,
          },
          fn
        );
      } catch (error) {
        primaryError = error;
        // Drop the speculative writes before compensating. The callback threw,
        // so nothing it queued is committed truth and none of it may reach
        // storage. Compensation below then writes the restored baseline as an
        // ordinary post-commit write, rather than as a repair of a bad one.
        settleCommitScope(transactionOwnerToken, transactionId, 'discard');
        notifier?.flushSync();
        const { effects, baselineValues } = drainTransactionRollbackInput(
          transactionId
        );
        if (effects.length > 0) {
          rollbackPendingEffectsThroughRealizationPort(
            transactionId,
            effects,
            baselineValues,
            error
          );
        }
      } finally {
        try {
          releaseCapture?.();
        } catch (error) {
          if (primaryError !== undefined) {
            reportCleanupFailure('transaction capture release after failure', error);
          } else {
            cleanupError = error;
          }
        }
      }

      if (primaryError !== undefined) {
        throw primaryError;
      }
      if (cleanupError !== undefined) {
        throw cleanupError;
      }

      notifier?.flushSync();
      const pendingTurn = materializePendingTransaction(transactionId);
      const pendingTurnId = pendingTurn?.id;
      if (pendingTurn) {
        notifyListeners(pendingCreatedListeners, pendingTurn);
      }
      let lifecycle: 'pending' | 'confirmed' | 'rejected' = 'pending';

      return {
        confirm(): void {
          if (lifecycle === 'confirmed') {
            return;
          }
          if (lifecycle === 'rejected') {
            throw new Error('Cannot confirm a rolled back transaction');
          }
          lifecycle = 'confirmed';
          if (pendingTurnId !== undefined) {
            const confirmedTurn = authority.confirmPending(pendingTurnId);
            if (confirmedTurn) {
              notifyListeners(pendingConfirmedListeners, confirmedTurn);
            }
          }
          // The physical state this transaction authored is now committed
          // truth, so its durable consequences may run. Last, so that a
          // throwing storage backend cannot leave the turn unconfirmed.
          settleCommitScope(transactionOwnerToken, transactionId, 'commit');
        },
        rollback(): void {
          if (lifecycle === 'rejected') {
            return;
          }
          if (lifecycle === 'confirmed') {
            throw new Error('Cannot rollback a confirmed transaction');
          }

          const rollbackPlan =
            pendingTurnId !== undefined
              ? authority.getPendingRollbackPlan(pendingTurnId)
              : { compensation: [] };
          if ('conflict' in rollbackPlan) {
            throw createRollbackError(rollbackPlan.conflict);
          }

          lifecycle = 'rejected';
          // Drop the speculative writes before compensating, for the same
          // reason as the thrown-callback path: nothing this transaction
          // authored is committed truth, so none of it may reach storage.
          settleCommitScope(transactionOwnerToken, transactionId, 'discard');
          let discardedTurn: TransactionTurnRecord | undefined;
          if (pendingTurnId !== undefined) {
            discardedTurn = authority.discardPending(pendingTurnId);
          }

          const compensation = rollbackPlan.compensation;
          if (compensation.length > 0) {
            try {
              rollbackPendingEffectsThroughRealizationPort(
                pendingTurnId as number,
                [...compensation].reverse(),
                discardedTurn?.__baselineValues ?? new Map()
              );
            } catch (error) {
              throw createRollbackError({
                kind: 'effect-validation-failed',
                pendingTurnId: pendingTurnId as number,
                compensation,
                errorMessage:
                  error instanceof Error
                    ? error.message
                    : 'Unknown rollback validation failure',
                cause: error,
              });
            }
          }

          if (discardedTurn) {
            notifyListeners(pendingDiscardedListeners, discardedTurn);
          }
        },
      };
    },
    getConfirmedTurnCount: () => authority.getConfirmedTurnCount(),
    getPendingTurnCount: () => authority.getPendingTurnCount(),
    getConfirmedTurnIds: () => authority.getConfirmedTurnIds(),
    getPendingTurnIds: () => authority.getPendingTurnIds(),
    onPendingCreated(listener: TransactionLifecycleListener): () => void {
      pendingCreatedListeners.add(listener);
      return () => pendingCreatedListeners.delete(listener);
    },
    onPendingConfirmed(listener: TransactionLifecycleListener): () => void {
      pendingConfirmedListeners.add(listener);
      return () => pendingConfirmedListeners.delete(listener);
    },
    onPendingDiscarded(listener: TransactionLifecycleListener): () => void {
      pendingDiscardedListeners.add(listener);
      return () => pendingDiscardedListeners.delete(listener);
    },
  };

  const reportCleanupFailure = (step: string, error: unknown): void => {
    console.error(
      `SignalTree: transactions() cleanup failed during ${step}.`,
      error
    );
  };

  if (typeof tree.registerCleanup === 'function') {
    tree.registerCleanup(() => {
      try {
        unsubscribeFlush?.();
      } catch (error) {
        reportCleanupFailure('flush unsubscription', error);
      }
      try {
        unsubscribeNotifications?.();
      } catch (error) {
        reportCleanupFailure('notification unsubscription', error);
      }
      try {
        unsubscribeReset?.();
      } catch (error) {
        reportCleanupFailure('reset unsubscription', error);
      }
      try {
        restoreLeafInterceptors?.();
      } catch (error) {
        reportCleanupFailure('leaf interceptor teardown', error);
      }
      unsubscribeFlush = null;
      unsubscribeNotifications = null;
      unsubscribeReset = null;
      restoreLeafInterceptors = null;
    });
  }

  (tree as unknown as Record<PropertyKey, unknown>)[INTERNAL_TRANSACTION_RUNTIME] =
    runtime;
  return runtime;
}

export function transactions(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & TransactionMethods {
  const enhancerFn = <T>(
    tree: ISignalTree<T>
  ): ISignalTree<T> & TransactionMethods => {
    const runtime = getOrCreateInternalTransactionRuntime(tree);

    (tree as ISignalTree<T> & TransactionMethods).transaction = runtime.transaction;

    (tree as unknown as Record<string, unknown>)['__transactions'] = {
      getConfirmedTurnCount: () => runtime.getConfirmedTurnCount(),
      getPendingTurnCount: () => runtime.getPendingTurnCount(),
      getConfirmedTurnIds: () => runtime.getConfirmedTurnIds(),
      getPendingTurnIds: () => runtime.getPendingTurnIds(),
    };

    return tree as ISignalTree<T> & TransactionMethods;
  };

  const meta: EnhancerMeta = {
    name: 'transactions',
    provides: ['transactions'],
    capabilities: ['causal-runtime'],
  };
  (enhancerFn as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancerFn as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancerFn;
}
