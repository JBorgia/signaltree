import type { ISignalTree, PositionId, StructuralHistoryEffect, UpdateMetadata } from '../../types';
import { getPathNotifier } from '../../path-notifier';
import { getActiveWriteContext, withWriteContext } from '../../write-context';
import { deepClone } from '@signaltree/shared';
import {
  getOwnedOwnerPath,
  getOwnedPositionIds,
} from '../owned-mutation';
import { getPhysicalCommitClock } from '../physical-commit-clock';
import { getTreeScalarSlotRuntime } from '../tree-scalar-slot-angular-runtime';
import { isTraversableNode } from '../../utils';
import { visitTree } from '../visit-tree';

import type { ReversalEffect, ReversalRefusal } from './causal-types';
import { normalizeScopedValuePath } from './scoped-value-addressing';

type StructuralDriftRefusal = Extract<ReversalRefusal, { readonly kind: 'structural-drift' }>;

const TREE_REALIZATION_DESCRIPTORS = Symbol.for(
  'SignalTree:TreeRealizationDescriptors'
);
const TREE_REALIZATION_PORT = Symbol.for('SignalTree:TreeRealizationPort');

type CollectionNode = {
  byIdOrFail(id: string | number): unknown;
  changeId(from: string | number, to: string | number): void;
  removeOne(id: string | number): void;
  __planFreshAdd?(
    key: string | number,
    entity: unknown,
    subjectId: number
  ): {
    commit(options?: { advancePhysicalRevision?: boolean }): void;
    publish(metaOverride?: UpdateMetadata): void;
  };
  __planRemove?(
    key: string | number,
    subjectId: number
  ): {
    commit(options?: { advancePhysicalRevision?: boolean }): void;
    publish(metaOverride?: UpdateMetadata): void;
  };
  __planRestore?(
    key: string | number,
    entity: unknown,
    subjectId: number,
    beforeSubject?: number,
    afterSubject?: number
  ): {
    commit(options?: { advancePhysicalRevision?: boolean }): void;
    publish(metaOverride?: UpdateMetadata): void;
  };
  __planRekey?(
    from: string | number,
    to: string | number
  ): {
    commit(options?: { advancePhysicalRevision?: boolean }): void;
    publish(metaOverride?: UpdateMetadata): void;
  };
  __planPreparedRekey?(
    from: string | number,
    to: string | number,
    subjectId: number,
    entity: unknown,
    subjectPositions?: readonly PositionId[]
  ): {
    commit(options?: { advancePhysicalRevision?: boolean }): void;
    publish(metaOverride?: UpdateMetadata): void;
  };
  __findKeyBySubjectId?(subjectId: number): string | number | undefined;
  __inspectSubjectResources?(subjectId: number): { state: 'active' | 'tombstoned' } | undefined;
  __restoreOne?(
    key: string | number,
    entity: unknown,
    subjectId: number,
    beforeSubject?: number,
    afterSubject?: number
  ): void;
};

type WritableLeaf = {
  set(value: unknown): void;
};

type WritableEntityNode = {
  (value: unknown): void;
};

type PreparedSubjectRealization = {
  collectionPath: string;
  subjectId: number;
  reachable: boolean;
  currentKey: string | number | undefined;
  value: unknown;
  subjectPositions?: readonly PositionId[];
};

type PreparedOccupancyState = number | 'vacant';

class PreparedRealizationContext {
  private readonly subjects = new Map<number, PreparedSubjectRealization>();
  private readonly occupancy = new Map<
    string,
    Map<string | number, PreparedOccupancyState>
  >();

  private occupancyEntries(
    collectionPath: string,
    createIfMissing = false
  ): Map<string | number, PreparedOccupancyState> | undefined {
    let entries = this.occupancy.get(collectionPath);
    if (!entries && createIfMissing) {
      entries = new Map<string | number, PreparedOccupancyState>();
      this.occupancy.set(collectionPath, entries);
    }

    return entries;
  }

  private setOccupancy(
    collectionPath: string,
    key: string | number,
    state: PreparedOccupancyState
  ): void {
    this.occupancyEntries(collectionPath, true)?.set(key, state);
  }

  rememberRestoredSubject(
    subjectId: number,
    collectionPath: string,
    key: string | number,
    value: unknown,
    subjectPositions?: readonly PositionId[]
  ): void {
    this.subjects.set(subjectId, {
      collectionPath,
      subjectId,
      reachable: true,
      currentKey: key,
      value,
      subjectPositions,
    });
    this.setOccupancy(collectionPath, key, subjectId);
  }

  rememberRekeyedSubject(subjectId: number, key: string | number): void {
    const existing = this.subjects.get(subjectId);
    if (!existing) {
      return;
    }

    this.setOccupancy(
      existing.collectionPath,
      existing.currentKey as string | number,
      'vacant'
    );
    this.setOccupancy(existing.collectionPath, key, subjectId);

    this.subjects.set(subjectId, {
      ...existing,
      reachable: true,
      currentKey: key,
    });
  }

  rememberRemovedSubject(
    subjectId: number,
    collectionPath: string,
    key: string | number,
    value: unknown,
    subjectPositions?: readonly PositionId[]
  ): void {
    const existing = this.subjects.get(subjectId);
    const currentValue = existing?.value ?? value;
    const currentPositions = existing?.subjectPositions ?? subjectPositions;

    if (existing?.currentKey !== undefined) {
      this.setOccupancy(existing.collectionPath, existing.currentKey, 'vacant');
    } else {
      this.setOccupancy(collectionPath, key, 'vacant');
    }

    this.subjects.set(subjectId, {
      collectionPath,
      subjectId,
      reachable: false,
      currentKey: undefined,
      value: currentValue,
      subjectPositions: currentPositions,
    });
  }

  resolveSubject(subjectId: number): PreparedSubjectRealization | undefined {
    return this.subjects.get(subjectId);
  }

  resolveOccupancy(
    collectionPath: string,
    key: string | number
  ): PreparedOccupancyState | undefined {
    return this.occupancyEntries(collectionPath)?.get(key);
  }
}

type SubjectRealizationDescriptor = {
  path: string;
  ownerPath: string;
  collectionPath?: string;
  fieldPathFromRow?: string;
};

type InlineSubjectAddressEffect = ReversalEffect & {
  subjectId: number;
  path: string;
  ownerPath: string;
};

export interface TreeRealizationDescriptor {
  readonly path?: string;
  readonly ownerPath?: string;
  readonly collectionPath?: string;
  readonly fieldPathFromRow?: string;
  readonly structuralHistoryEffects?: ReadonlyMap<string, StructuralHistoryEffect>;
  readonly structuralHistoryBySubject?: ReadonlyMap<string, StructuralHistoryEffect>;
  readonly subjectDescriptors?: ReadonlyMap<string, SubjectRealizationDescriptor>;
}

export interface RememberTreeRealizationDescriptorOptions {
  readonly descriptors: Map<PositionId, TreeRealizationDescriptor>;
  readonly path: string;
  readonly ownerPath?: string;
  readonly positionIds?: readonly number[];
  readonly subjectIds?: readonly number[];
  readonly meta?: UpdateMetadata;
}

export interface CreateTreeRealizationAdapterOptions {
  readonly tree: ISignalTree<object>;
  readonly descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>;
}

export interface TreeRealizationPort {
  validateEffects(
    effects: readonly ReversalEffect[]
  ): StructuralDriftRefusal | undefined;
  applyAtomically(effects: readonly ReversalEffect[]): void;
}

function isRealizationAttachmentHost(
  node: unknown
): node is Record<PropertyKey, unknown> {
  return isTraversableNode(node) || typeof node === 'function';
}

export function rememberTreeRealizationDescriptor(
  options: RememberTreeRealizationDescriptorOptions
): void {
  const owner = options.positionIds?.[0] as PositionId | undefined;
  if (owner === undefined) {
    return;
  }

  const existing = options.descriptors.get(owner);
  const structuralHistoryEffects =
    existing?.structuralHistoryEffects instanceof Map
      ? (existing.structuralHistoryEffects as Map<string, StructuralHistoryEffect>)
      : new Map(existing?.structuralHistoryEffects ?? []);
  const structuralHistoryBySubject =
    existing?.structuralHistoryBySubject instanceof Map
      ? (existing.structuralHistoryBySubject as Map<string, StructuralHistoryEffect>)
      : new Map(existing?.structuralHistoryBySubject ?? []);
  const subjectDescriptors =
    existing?.subjectDescriptors instanceof Map
      ? (existing.subjectDescriptors as Map<string, SubjectRealizationDescriptor>)
      : new Map(existing?.subjectDescriptors ?? []);
  if (options.meta?.historyEffect) {
    structuralHistoryEffects.set(
      toStructuralHistoryEffectKey(options.meta.historyEffect),
      options.meta.historyEffect
    );
    if (
      options.meta.historyEffect.kind === 'add' ||
      options.meta.historyEffect.kind === 'remove'
    ) {
      structuralHistoryBySubject.set(
        String(options.meta.historyEffect.subject),
        options.meta.historyEffect
      );
    }
  }

  const subjectId = options.subjectIds?.[0];
  const ownerPath = options.ownerPath ?? options.path;
  const collectionPath = deriveCollectionPath(
    options.path,
    ownerPath,
    subjectId,
    options.meta?.historyEffect
  );
  const fieldPathFromRow = deriveFieldPathFromRow(
    options.path,
    ownerPath,
    subjectId,
    options.meta?.historyEffect
  );
  if (typeof subjectId === 'number') {
    const subjectKey = String(subjectId);
    const existingSubjectDescriptor = subjectDescriptors.get(subjectKey);
    if (
      !existingSubjectDescriptor ||
      existingSubjectDescriptor.path !== options.path ||
      existingSubjectDescriptor.ownerPath !== ownerPath ||
      existingSubjectDescriptor.collectionPath !== collectionPath ||
      existingSubjectDescriptor.fieldPathFromRow !== fieldPathFromRow
    ) {
      subjectDescriptors.set(subjectKey, {
        path: options.path,
        ownerPath,
        collectionPath,
        fieldPathFromRow,
      });
    }
  }

  const nextPath = existing?.path ?? options.path;
  const nextOwnerPath = existing?.ownerPath ?? ownerPath;
  const nextCollectionPath = existing?.collectionPath ?? collectionPath;
  const nextFieldPathFromRow =
    existing?.fieldPathFromRow ?? fieldPathFromRow;

  if (
    existing?.path === nextPath &&
    existing?.ownerPath === nextOwnerPath &&
    existing?.collectionPath === nextCollectionPath &&
    existing?.fieldPathFromRow === nextFieldPathFromRow &&
    existing?.structuralHistoryEffects === structuralHistoryEffects &&
    existing?.structuralHistoryBySubject === structuralHistoryBySubject &&
    existing?.subjectDescriptors === subjectDescriptors
  ) {
    return;
  }

  options.descriptors.set(owner, {
    path: nextPath,
    ownerPath: nextOwnerPath,
    collectionPath: nextCollectionPath,
    fieldPathFromRow: nextFieldPathFromRow,
    structuralHistoryEffects,
    structuralHistoryBySubject,
    subjectDescriptors,
  });
}

export function createTreeRealizationAdapter(
  options: CreateTreeRealizationAdapterOptions
): TreeRealizationPort {
  const scalarSlotRuntime =
    getTreeScalarSlotRuntime(options.tree) ?? getTreeScalarSlotRuntime(options.tree.$);
  const physicalCommitClock =
    getPhysicalCommitClock(options.tree) ?? getPhysicalCommitClock(options.tree.$);
  const structuralOwnerPaths = indexStructuralOwnerPaths(options.tree.$);

  return {
    validateEffects(effects) {
      const preparedContext = buildPreparedRealizationContext(
        options.tree,
        options.descriptors,
        structuralOwnerPaths,
        scalarSlotRuntime,
        effects
      );
      if (!preparedContext) {
        return { kind: 'structural-drift' };
      }

      return undefined;
    },
    applyAtomically(effects) {
      const heterogeneousFrame = planHeterogeneousFrame(
        options.tree,
        options.descriptors,
        structuralOwnerPaths,
        scalarSlotRuntime,
        physicalCommitClock,
        effects
      );
      if (heterogeneousFrame) {
        heterogeneousFrame.commit();
        return;
      }

      const scalarFrame = planScalarFrame(
        options.tree,
        options.descriptors,
        structuralOwnerPaths,
        scalarSlotRuntime,
        effects
      );
      if (scalarFrame) {
        scalarFrame.commit();
        return;
      }

      for (const effect of effects) {
        applyEffect(
          options.tree,
          options.descriptors,
          structuralOwnerPaths,
          scalarSlotRuntime,
          effect
        );
      }
    },
  };
}

export function defineTreeRealizationDescriptors(
  node: object,
  descriptors: Map<PositionId, TreeRealizationDescriptor>
): void {
  Object.defineProperty(node, TREE_REALIZATION_DESCRIPTORS, {
    value: descriptors,
    enumerable: false,
    configurable: true,
  });
}

export function getTreeRealizationDescriptors(
  node: unknown
): Map<PositionId, TreeRealizationDescriptor> | undefined {
  if (!isRealizationAttachmentHost(node)) {
    return undefined;
  }

  return (node as Record<symbol, Map<PositionId, TreeRealizationDescriptor> | undefined>)[
    TREE_REALIZATION_DESCRIPTORS
  ];
}

export function defineTreeRealizationPort(
  node: object,
  port: TreeRealizationPort
): void {
  Object.defineProperty(node, TREE_REALIZATION_PORT, {
    value: port,
    enumerable: false,
    configurable: true,
  });
}

export function getTreeRealizationPort(
  node: unknown
): TreeRealizationPort | undefined {
  if (!isRealizationAttachmentHost(node)) {
    return undefined;
  }

  return (node as Record<symbol, TreeRealizationPort | undefined>)[
    TREE_REALIZATION_PORT
  ];
}

function planHeterogeneousFrame(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  physicalCommitClock: ReturnType<typeof getPhysicalCommitClock>,
  effects: readonly ReversalEffect[]
): { commit(): void } | undefined {
  if (
    effects.length === 0 ||
    !effects.some(
      (effect) =>
        effect.structural === 'rekey' ||
        effect.structural === 'add' ||
        effect.structural === 'remove'
    ) ||
    effects.some(
      (effect) =>
        effect.structural &&
        effect.structural !== 'rekey' &&
        effect.structural !== 'add' &&
        effect.structural !== 'remove'
    )
  ) {
    return undefined;
  }

  const scalarEffects = effects.filter((effect) => !effect.structural);
  const preparedContext = buildPreparedRealizationContext(
    tree,
    descriptors,
    structuralOwnerPaths,
    scalarSlotRuntime,
    effects
  );
  if (!preparedContext) {
    return undefined;
  }

  const removeKeysByEffect = new Map<
    ReversalEffect & { structural: 'remove'; subjectId: number },
    string | number
  >();
  const planningPreparedContext = new PreparedRealizationContext();
  for (const effect of effects) {
    if (
      effect.structural === 'remove' &&
      typeof effect.subjectId === 'number'
    ) {
      const descriptor = descriptors.get(effect.owner);
      const collectionNode = resolveCollectionNode(
        tree,
        descriptor,
        structuralOwnerPaths,
        effect
      );
      if (!collectionNode) {
        return undefined;
      }

      const effectiveRemoveKey = resolveEffectiveRemoveKey(
        collectionNode,
        planningPreparedContext,
        effect
      );
      if (effectiveRemoveKey === undefined) {
        return undefined;
      }

      removeKeysByEffect.set(effect, effectiveRemoveKey);
    }

    updatePreparedRealizationContext(
      tree,
      descriptors,
      structuralOwnerPaths,
      planningPreparedContext,
      effect
    );
  }

  const preparedSubjectScalarEffects = scalarEffects.filter((effect) =>
    isPreparedSubjectScalarEffect(effect, preparedContext)
  );
  const framedScalarEffects = scalarEffects.filter(
    (effect) => !isPreparedSubjectScalarEffect(effect, preparedContext)
  );
  const rekeyEffects = effects.filter(
    (effect): effect is ReversalEffect & { structural: 'rekey' } =>
      effect.structural === 'rekey'
  );
  const restoreEffects = effects.filter(
    (effect): effect is ReversalEffect & { structural: 'add'; subjectId: number } =>
      effect.structural === 'add' && typeof effect.subjectId === 'number'
  );
  const baseRevision = scalarSlotRuntime?.revision();
  const scalarFrameRuntime = framedScalarEffects.length > 0 ? scalarSlotRuntime : undefined;

  const scalarFrame =
    framedScalarEffects.length > 0 ? scalarFrameRuntime?.beginFrame() : undefined;
  if (framedScalarEffects.length > 0 && (!scalarFrameRuntime || !scalarFrame)) {
    return undefined;
  }
  const resolvedScalarFrameRuntime = scalarFrameRuntime;
  const plannedRestores: Array<{
    effect: ReversalEffect & { structural: 'add'; subjectId: number };
    plan: {
      commit(options?: { advancePhysicalRevision?: boolean }): void;
      publish(metaOverride?: UpdateMetadata): void;
    };
  }> = [];
  const plannedFreshAdds: Array<{
    effect: ReversalEffect & { structural: 'add'; subjectId: number };
    plan: {
      commit(options?: { advancePhysicalRevision?: boolean }): void;
      publish(metaOverride?: UpdateMetadata): void;
    };
  }> = [];
  const plannedRekeys: Array<{
    effect: ReversalEffect & { structural: 'rekey' };
    plan: {
      commit(options?: { advancePhysicalRevision?: boolean }): void;
      publish(metaOverride?: UpdateMetadata): void;
    };
  }> = [];
  const plannedRemoves: Array<{
    effect: ReversalEffect & { structural: 'remove'; subjectId: number };
    plan: {
      commit(options?: { advancePhysicalRevision?: boolean }): void;
      publish(metaOverride?: UpdateMetadata): void;
    };
  }> = [];

  for (const effect of restoreEffects) {
    const descriptor = descriptors.get(effect.owner);
    const collectionNode = resolveCollectionNode(
      tree,
      descriptor,
      structuralOwnerPaths,
      effect
    );
    const historyEffect = getStructuralAddEffect(descriptor, effect);
    const collectionPath = resolveCollectionPath(
      descriptor,
      structuralOwnerPaths,
      effect
    );
    const subjectInventory = collectionNode?.__inspectSubjectResources?.(effect.subjectId);
    const isFreshSubject = subjectInventory === undefined;
    if (
      !collectionNode ||
      !historyEffect ||
      !collectionPath ||
      (isFreshSubject
        ? typeof collectionNode.__planFreshAdd !== 'function'
        : typeof collectionNode.__planRestore !== 'function')
    ) {
      scalarFrame?.discard();
      return undefined;
    }

    const preparedSubject = preparedContext.resolveSubject(effect.subjectId);
    if (!preparedSubject) {
      scalarFrame?.discard();
      return undefined;
    }

    if (isFreshSubject) {
      const planFreshAdd = collectionNode.__planFreshAdd;
      if (typeof planFreshAdd !== 'function') {
        scalarFrame?.discard();
        return undefined;
      }

      plannedFreshAdds.push({
        effect,
        plan: planFreshAdd(
          effect.after as string | number,
          preparedSubject.value,
          effect.subjectId
        ),
      });
      continue;
    }

    const planRestore = collectionNode.__planRestore;
    if (typeof planRestore !== 'function') {
      scalarFrame?.discard();
      return undefined;
    }

    plannedRestores.push({
      effect,
      plan: planRestore(
        effect.after as string | number,
        preparedSubject.value,
        effect.subjectId,
        historyEffect.beforeSubject,
        historyEffect.afterSubject
      ),
    });
  }

  for (const effect of framedScalarEffects) {
    if (!resolvedScalarFrameRuntime) {
      scalarFrame?.discard();
      return undefined;
    }

    const slotIndex = resolvedScalarFrameRuntime.resolveScalarSlot(effect.owner);
    if (slotIndex === undefined) {
      scalarFrame?.discard();
      return undefined;
    }
    scalarFrame?.set(slotIndex, effect.after);
  }

  for (const effect of rekeyEffects) {
    const descriptor = descriptors.get(effect.owner);
    const collectionNode = resolveCollectionNode(
      tree,
      descriptor,
      structuralOwnerPaths,
      effect
    );
    if (
      !collectionNode ||
      (typeof collectionNode.__planRekey !== 'function' &&
        typeof collectionNode.__planPreparedRekey !== 'function')
    ) {
      scalarFrame?.discard();
      return undefined;
    }

    const preparedSubject =
      typeof effect.subjectId === 'number'
        ? preparedContext.resolveSubject(effect.subjectId)
        : undefined;
    const plan =
      preparedSubject && typeof collectionNode.__planPreparedRekey === 'function'
        ? collectionNode.__planPreparedRekey(
            effect.before as string | number,
            effect.after as string | number,
            effect.subjectId as number,
            preparedSubject.value,
            preparedSubject.subjectPositions
          )
        : typeof collectionNode.__planRekey === 'function'
          ? collectionNode.__planRekey(
              effect.before as string | number,
              effect.after as string | number
            )
          : undefined;
    if (!plan) {
      scalarFrame?.discard();
      return undefined;
    }

    plannedRekeys.push({
      effect,
      plan,
    });

    if (typeof effect.subjectId === 'number') {
      preparedContext.rememberRekeyedSubject(
        effect.subjectId,
        effect.after as string | number
      );
    }
  }

  const removeEffects = effects.filter(
    (effect): effect is ReversalEffect & { structural: 'remove'; subjectId: number } =>
      effect.structural === 'remove' && typeof effect.subjectId === 'number'
  );

  for (const effect of removeEffects) {
    const descriptor = descriptors.get(effect.owner);
    const collectionNode = resolveCollectionNode(
      tree,
      descriptor,
      structuralOwnerPaths,
      effect
    );
    if (!collectionNode || typeof collectionNode.__planRemove !== 'function') {
      scalarFrame?.discard();
      return undefined;
    }

    const effectiveRemoveKey = removeKeysByEffect.get(effect);
    if (effectiveRemoveKey === undefined) {
      scalarFrame?.discard();
      return undefined;
    }

    plannedRemoves.push({
      effect,
      plan: collectionNode.__planRemove(effectiveRemoveKey, effect.subjectId),
    });
  }

  return {
    commit(): void {
      if (
        scalarFrame &&
        physicalCommitClock &&
        physicalCommitClock.revision() !== baseRevision
      ) {
        throw new Error('Heterogeneous realization base revision is stale.');
      }

      const scalarCommitResult = scalarFrame?.commit({
        advanceRevision: false,
        publish: false,
      });

      for (const { plan } of plannedRemoves) {
        plan.commit({ advancePhysicalRevision: false });
      }

      for (const { plan } of plannedFreshAdds) {
        plan.commit({ advancePhysicalRevision: false });
      }

      for (const { plan } of plannedRestores) {
        plan.commit({ advancePhysicalRevision: false });
      }

      for (const { plan } of plannedRekeys) {
        plan.commit({ advancePhysicalRevision: false });
      }

      physicalCommitClock?.advance();
      if (scalarCommitResult && scalarSlotRuntime) {
        scalarSlotRuntime.publishPrepared(scalarCommitResult);
      }

      for (const { effect, plan } of plannedRemoves) {
        plan.publish({
          ...(getActiveWriteContext() ?? {}),
          intent: 'system',
          source: 'system',
          causalMode: 'realization',
          positionIds: [effect.owner],
          subjectIds: [effect.subjectId],
        });
      }

      for (const { effect, plan } of plannedRestores) {
        plan.publish({
          ...(getActiveWriteContext() ?? {}),
          intent: 'system',
          source: 'system',
          causalMode: 'realization',
          positionIds: [effect.owner],
          subjectIds: [effect.subjectId],
        });
      }

      for (const { effect, plan } of plannedFreshAdds) {
        plan.publish({
          ...(getActiveWriteContext() ?? {}),
          intent: 'system',
          source: 'system',
          causalMode: 'realization',
          positionIds: [effect.owner],
          subjectIds: [effect.subjectId],
        });
      }

      for (const { effect, plan } of plannedRekeys) {
        plan.publish({
          ...(getActiveWriteContext() ?? {}),
          intent: 'system',
          source: 'system',
          causalMode: 'realization',
          positionIds: [effect.owner],
          subjectIds:
            typeof effect.subjectId === 'number' ? [effect.subjectId] : undefined,
        });
      }

      for (const effect of [...preparedSubjectScalarEffects, ...framedScalarEffects]) {
        const descriptor = descriptors.get(effect.owner);
        const notifyPath = resolveNotifyPath(
          tree,
          descriptor,
          structuralOwnerPaths,
          effect
        );
        if (!notifyPath) {
          continue;
        }

        getPathNotifier().notify(
          notifyPath,
          effect.after,
          effect.before,
          descriptor?.ownerPath ?? notifyPath,
          typeof effect.subjectId === 'number' ? [effect.subjectId] : undefined,
          [effect.owner],
          {
            ...(getActiveWriteContext() ?? {}),
            intent: 'system',
            source: 'system',
            causalMode: 'realization',
            positionIds: [effect.owner],
            subjectIds:
              typeof effect.subjectId === 'number' ? [effect.subjectId] : undefined,
          }
        );
      }
    },
  };
}

function planScalarFrame(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effects: readonly ReversalEffect[]
): { commit(): void } | undefined {
  void tree;
  void descriptors;
  void structuralOwnerPaths;
  if (effects.length === 0 || effects.some((effect) => effect.structural)) {
    return undefined;
  }

  if (!scalarSlotRuntime) {
    return undefined;
  }

  const frame = scalarSlotRuntime.beginFrame();
  for (const effect of effects) {
    const slotIndex = scalarSlotRuntime.resolveScalarSlot(effect.owner);
    if (slotIndex === undefined) {
      return undefined;
    }

    frame.set(slotIndex, effect.after);
  }

  return {
    commit(): void {
      frame.commit();

      for (const effect of effects) {
        const descriptor = descriptors.get(effect.owner);
        const notifyPath = resolveNotifyPath(
          tree,
          descriptor,
          structuralOwnerPaths,
          effect
        );
        if (!notifyPath) {
          continue;
        }

        getPathNotifier().notify(
          notifyPath,
          effect.after,
          effect.before,
          descriptor?.ownerPath ?? notifyPath,
          typeof effect.subjectId === 'number' ? [effect.subjectId] : undefined,
          [effect.owner],
          {
            ...(getActiveWriteContext() ?? {}),
            intent: 'system',
            source: 'system',
            causalMode: 'realization',
            positionIds: [effect.owner],
            subjectIds:
              typeof effect.subjectId === 'number' ? [effect.subjectId] : undefined,
          }
        );
      }
    },
  };
}

function canApplyEffect(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effect: ReversalEffect,
  preparedContext?: PreparedRealizationContext
): boolean {
  const descriptor = descriptors.get(effect.owner);
  if (
    !descriptor &&
    !effect.structural &&
    !scalarSlotRuntime?.resolveScalarLeaf(effect.owner) &&
    !hasInlineSubjectAddress(effect) &&
    !hasInlineScopedAddress(effect)
  ) {
    return false;
  }

  if (!effect.structural) {
    if (canResolvePreparedSubjectTarget(descriptor, effect, preparedContext)) {
      return true;
    }

    const target = resolveLiveScalarNode(
      tree,
      descriptor,
      scalarSlotRuntime,
      effect
    );
    return isWritableLeaf(target) || isWritableEntityNode(target);
  }

  const ownerNode = resolveCollectionNode(
    tree,
    descriptor,
    structuralOwnerPaths,
    effect
  );
  if (!ownerNode) {
    return false;
  }

  const currentSubjectKey =
    typeof effect.subjectId === 'number'
      ? resolvePreparedOrLiveSubjectKey(ownerNode, preparedContext, effect.subjectId)
      : undefined;
  const collectionPath = resolveCollectionPath(
    descriptor,
    structuralOwnerPaths,
    effect
  );
  const destinationOccupied =
    effect.structural === 'rekey' || effect.structural === 'add'
      ? isCollectionKeyOccupied(
          ownerNode,
          collectionPath,
          effect.after as string | number,
          preparedContext
        )
      : false;

  switch (effect.structural) {
    case 'remove':
      return (
        (typeof effect.subjectId === 'number'
          ? resolveEffectiveRemoveKey(ownerNode, preparedContext, effect) !== undefined
          : hasCollectionKey(ownerNode, effect.before as string | number)) &&
        (typeof effect.subjectId !== 'number' || currentSubjectKey !== undefined)
      );
    case 'rekey':
      return (
        (typeof effect.subjectId === 'number'
          ? currentSubjectKey === effect.before
          : hasCollectionKey(ownerNode, effect.before as string | number)) &&
        (typeof effect.subjectId !== 'number' || currentSubjectKey === effect.before) &&
        !destinationOccupied
      );
    case 'add': {
      if (
        typeof effect.subjectId !== 'number' ||
        typeof ownerNode.__restoreOne !== 'function' ||
        destinationOccupied ||
        currentSubjectKey !== undefined
      ) {
        return false;
      }

      return getStructuralAddEffect(descriptor, effect) !== undefined;
    }
  }
}

function applyEffect(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effect: ReversalEffect
): void {
  const descriptor = descriptors.get(effect.owner);
  if (
    !descriptor &&
    !effect.structural &&
    !scalarSlotRuntime?.resolveScalarLeaf(effect.owner) &&
    !hasInlineSubjectAddress(effect) &&
    !hasInlineScopedAddress(effect)
  ) {
    throw new Error(`Missing live descriptor for owner ${String(effect.owner)}`);
  }

  withWriteContext(
    {
      ...(getActiveWriteContext() ?? {}),
      intent: 'system',
      source: 'system',
      causalMode: 'realization',
      positionIds: [effect.owner],
      subjectIds:
        typeof effect.subjectId === 'number' ? [effect.subjectId] : undefined,
    },
    () => {
      if (!effect.structural) {
        const target = resolveLiveScalarNode(
          tree,
          descriptor,
          scalarSlotRuntime,
          effect
        );
        if (isWritableLeaf(target)) {
          target.set(effect.after);
          return;
        }

        if (isWritableEntityNode(target)) {
          target(effect.after);
          return;
        }

        if (!isWritableLeaf(target)) {
          throw new Error(`Missing live leaf for owner ${String(effect.owner)}`);
        }
        return;
      }

      const ownerNode = resolveCollectionNode(
        tree,
        descriptor,
        structuralOwnerPaths,
        effect
      );
      if (!ownerNode) {
        throw new Error(`Missing structural owner for ${String(effect.owner)}`);
      }

      switch (effect.structural) {
        case 'rekey':
          ownerNode.changeId(
            effect.before as string | number,
            effect.after as string | number
          );
          return;
        case 'remove': {
          const effectiveRemoveKey =
            typeof effect.subjectId === 'number'
              ? resolveEffectiveRemoveKey(ownerNode, undefined, effect)
              : (effect.before as string | number);
          if (effectiveRemoveKey === undefined) {
            throw new Error(
              `Missing live structural subject for owner ${String(effect.owner)}`
            );
          }

          ownerNode.removeOne(effectiveRemoveKey);
          return;
        }
        case 'add': {
          const historyEffect = getStructuralAddEffect(descriptor, effect);
          if (!historyEffect) {
            throw new Error(
              `Missing structural restore metadata for owner ${String(effect.owner)}`
            );
          }

          ownerNode.__restoreOne?.(
            effect.after as string | number,
            historyEffect.value,
            effect.subjectId as number,
            historyEffect.beforeSubject,
            historyEffect.afterSubject
          );
          applySubjectState(tree, descriptors, scalarSlotRuntime, ownerNode, effect);
          return;
        }
      }
    }
  );
}

function applySubjectState(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  ownerNode: CollectionNode,
  effect: ReversalEffect
): void {
  const rowNode = ownerNode.byIdOrFail(effect.after as string | number);

  for (const [positionId, value] of Object.entries(effect.subjectState ?? {})) {
    const numericPositionId = Number(positionId) as PositionId;
    const liveNode =
      scalarSlotRuntime?.resolveScalarLeaf(numericPositionId) ??
      resolveSubjectTargetFromDescriptor(
        rowNode,
        descriptors.get(numericPositionId)
      );
    if (!isWritableLeaf(liveNode)) {
      throw new Error(`Missing live subject leaf for owner ${positionId}`);
    }

    liveNode.set(value);
  }
}

function resolveLiveScalarNode(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor | undefined,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effect: ReversalEffect
): unknown {
  if (typeof effect.subjectId === 'number') {
    return resolveCurrentSubjectTarget(tree, descriptor, effect.subjectId, effect);
  }

  if (hasInlineScopedAddress(effect)) {
    return resolveCurrentScopedTarget(tree, descriptor, effect);
  }

  const directLeaf = scalarSlotRuntime?.resolveScalarLeaf(effect.owner);
  if (directLeaf) {
    return directLeaf;
  }

  if (!descriptor?.path) {
    return undefined;
  }

  const pathNode = resolveNodeAtPath(
    tree.$ as Record<string, unknown>,
    descriptor.path
  );
  return isWritableLeaf(pathNode) || isWritableEntityNode(pathNode)
    ? pathNode
    : undefined;
}

function canResolvePreparedSubjectTarget(
  descriptor: TreeRealizationDescriptor | undefined,
  effect: ReversalEffect,
  preparedContext: PreparedRealizationContext | undefined
): boolean {
  if (typeof effect.subjectId !== 'number') {
    return false;
  }

  const preparedSubject = preparedContext?.resolveSubject(effect.subjectId);
  if (!preparedSubject) {
    return false;
  }

  if (!preparedSubject.reachable) {
    return false;
  }

  const fieldPathFromRow = resolveSubjectFieldPath(descriptor, effect);
  if (!fieldPathFromRow) {
    return false;
  }

  return resolveNodeAtPath(
    preparedSubject.value as Record<string, unknown>,
    fieldPathFromRow
  ) !== undefined;
}

function resolveCollectionNode(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor | undefined,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  effect: ReversalEffect
): CollectionNode | undefined {
  const collectionPath = resolveCollectionPath(
    descriptor,
    structuralOwnerPaths,
    effect
  );
  if (collectionPath === undefined) {
    return undefined;
  }

  const node = resolveNodeAtPath(tree.$ as Record<string, unknown>, collectionPath);
  return isCollectionNode(node) ? node : undefined;
}

function resolveCollectionPath(
  descriptor: TreeRealizationDescriptor | undefined,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  effect: ReversalEffect
): string | undefined {
  return descriptor?.collectionPath ??
    (effect.structural ? descriptor?.ownerPath : undefined) ??
    structuralOwnerPaths.get(effect.owner);
}

function isCollectionKeyOccupied(
  ownerNode: CollectionNode,
  collectionPath: string | undefined,
  key: string | number,
  preparedContext: PreparedRealizationContext | undefined
): boolean {
  if (collectionPath) {
    const preparedOccupancy = preparedContext?.resolveOccupancy(collectionPath, key);
    if (preparedOccupancy === 'vacant') {
      return false;
    }
    if (preparedOccupancy !== undefined) {
      return true;
    }
  }

  return hasCollectionKey(ownerNode, key);
}

function resolvePreparedOrLiveSubjectKey(
  ownerNode: CollectionNode,
  preparedContext: PreparedRealizationContext | undefined,
  subjectId: number
): string | number | undefined {
  const preparedSubject = preparedContext?.resolveSubject(subjectId);
  if (preparedSubject) {
    return preparedSubject.currentKey;
  }

  return ownerNode.__findKeyBySubjectId?.(subjectId);
}

function resolveEffectiveRemoveKey(
  ownerNode: CollectionNode,
  preparedContext: PreparedRealizationContext | undefined,
  effect: ReversalEffect & { structural: 'remove'; subjectId: number }
): string | number | undefined {
  return resolvePreparedOrLiveSubjectKey(ownerNode, preparedContext, effect.subjectId);
}

function snapshotCollectionEntityValue(
  collectionNode: CollectionNode,
  key: string | number
): unknown {
  const rowNode = collectionNode.byIdOrFail(key);
  return typeof rowNode === 'function' ? rowNode() : rowNode;
}

function updatePreparedRealizationContext(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  preparedContext: PreparedRealizationContext,
  effect: ReversalEffect
): void {
  if (typeof effect.subjectId === 'number' && !effect.structural) {
    const descriptor = descriptors.get(effect.owner);
    const preparedSubject = preparedContext.resolveSubject(effect.subjectId);
    const fieldPathFromRow = resolveSubjectFieldPath(descriptor, effect);
    if (preparedSubject && fieldPathFromRow) {
      assignPreparedSubjectValue(preparedSubject.value, fieldPathFromRow, effect.after);
    }
    return;
  }

  if (typeof effect.subjectId !== 'number' || !effect.structural) {
    return;
  }

  const descriptor = descriptors.get(effect.owner);
  switch (effect.structural) {
    case 'add': {
      const collectionPath = resolveCollectionPath(
        descriptor,
        structuralOwnerPaths,
        effect
      );
      if (!collectionPath) {
        return;
      }
      const historyEffect = getStructuralAddEffect(descriptor, effect);
      if (!historyEffect) {
        return;
      }
      const preparedValue = deepClone(historyEffect.value);
      preparedContext.rememberRestoredSubject(
        effect.subjectId,
        collectionPath,
        effect.after as string | number,
        preparedValue,
        historyEffect.subjectPositions
      );

      for (const [positionId, value] of Object.entries(effect.subjectState ?? {})) {
        const positionDescriptor = descriptors.get(Number(positionId) as PositionId);
        const fieldPathFromRow = positionDescriptor?.fieldPathFromRow;
        if (!fieldPathFromRow) {
          continue;
        }
        assignPreparedSubjectValue(preparedValue, fieldPathFromRow, value);
      }
      return;
    }
    case 'rekey':
      preparedContext.rememberRekeyedSubject(
        effect.subjectId,
        effect.after as string | number
      );
      return;
    case 'remove': {
      const collectionPath = resolveCollectionPath(
        descriptor,
        structuralOwnerPaths,
        effect
      );
      if (!collectionPath) {
        return;
      }

      const collectionNode = resolveCollectionNode(
        tree,
        descriptor,
        structuralOwnerPaths,
        effect
      );
      if (!collectionNode) {
        return;
      }

      const effectiveRemoveKey = resolveEffectiveRemoveKey(
        collectionNode,
        preparedContext,
        effect
      );
      if (effectiveRemoveKey === undefined) {
        return;
      }

      const liveValue = snapshotCollectionEntityValue(
        collectionNode,
        effectiveRemoveKey
      );
      if (liveValue === undefined) {
        return;
      }

      preparedContext.rememberRemovedSubject(
        effect.subjectId,
        collectionPath,
        effectiveRemoveKey,
        liveValue
      );
      return;
    }
  }
}

function buildPreparedRealizationContext(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effects: readonly ReversalEffect[]
): PreparedRealizationContext | undefined {
  const preparedContext = new PreparedRealizationContext();
  for (const effect of effects) {
    if (
      !canApplyEffect(
        tree,
        descriptors,
        structuralOwnerPaths,
        scalarSlotRuntime,
        effect,
        preparedContext
      )
    ) {
      return undefined;
    }

    updatePreparedRealizationContext(
      tree,
      descriptors,
      structuralOwnerPaths,
      preparedContext,
      effect
    );
  }

  return preparedContext;
}

function resolveSubjectFieldPath(
  descriptor: TreeRealizationDescriptor | undefined,
  effect: ReversalEffect
): string | undefined {
  if (typeof effect.subjectId !== 'number') {
    return undefined;
  }

  const inlineFieldPathFromRow = deriveFieldPathFromEffect(effect);
  return inlineFieldPathFromRow ??
    descriptor?.subjectDescriptors?.get(String(effect.subjectId))?.fieldPathFromRow ??
    descriptor?.fieldPathFromRow;
}

function assignPreparedSubjectValue(
  subjectValue: unknown,
  fieldPathFromRow: string,
  nextValue: unknown
): void {
  if (fieldPathFromRow === '') {
    return;
  }

  if (!isTraversableNode(subjectValue)) {
    return;
  }

  const segments = fieldPathFromRow.split('.');
  let cursor: unknown = subjectValue;
  for (const segment of segments.slice(0, -1)) {
    if (!isTraversableNode(cursor)) {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  const leafKey = segments.at(-1);
  if (!leafKey || !isTraversableNode(cursor)) {
    return;
  }

  (cursor as Record<string, unknown>)[leafKey] = nextValue;
}

function isPreparedSubjectScalarEffect(
  effect: ReversalEffect,
  preparedContext: PreparedRealizationContext
): boolean {
  return (
    typeof effect.subjectId === 'number' &&
    !effect.structural &&
    preparedContext.resolveSubject(effect.subjectId) !== undefined
  );
}

function indexStructuralOwnerPaths(root: unknown): Map<PositionId, string> {
  const ownerPaths = new Map<PositionId, string>();

  visitTree(
    root,
    (node) => {
      if (!isCollectionNode(node)) {
        return undefined;
      }

      const positionId = getOwnedPositionIds(node)?.[0] as PositionId | undefined;
      const ownerPath = getOwnedOwnerPath(node);
      if (positionId === undefined || ownerPath === undefined) {
        return undefined;
      }

      // This is only a current realization address for an actual collection
      // node, not structural identity. PositionId, subject lifetime, and
      // ownerPath can diverge if topology support expands further.
      ownerPaths.set(positionId, ownerPath);
      return undefined;
    },
    {
      skipKey: (key) => key === 'set' || key === 'update' || key.startsWith('_'),
    }
  );

  return ownerPaths;
}

function resolveCurrentSubjectTarget(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor | undefined,
  subjectId: number,
  effect: ReversalEffect
): unknown {
  const inlineCollectionPath = deriveCollectionPathFromEffect(effect);
  const inlineFieldPathFromRow = deriveFieldPathFromEffect(effect);
  const subjectDescriptor = descriptor?.subjectDescriptors?.get(String(subjectId));
  const collectionPath =
    inlineCollectionPath ??
    subjectDescriptor?.collectionPath ??
    descriptor?.collectionPath ??
    (effect.structural ? descriptor?.ownerPath : undefined);
  if (!collectionPath && collectionPath !== '') {
    return undefined;
  }
  const collectionNode = resolveNodeAtPath(
    tree.$ as Record<string, unknown>,
    collectionPath
  );
  if (!isCollectionNode(collectionNode)) {
    return undefined;
  }

  const currentKey = collectionNode.__findKeyBySubjectId?.(subjectId);
  if (currentKey === undefined) {
    return undefined;
  }

  const rowNode = collectionNode.byIdOrFail(currentKey);
  const fieldPathFromRow =
    inlineFieldPathFromRow ??
    subjectDescriptor?.fieldPathFromRow ??
    descriptor?.fieldPathFromRow;

  if (fieldPathFromRow === '') {
    return rowNode;
  }

  if (!fieldPathFromRow) {
    return undefined;
  }

  return resolveNodeAtPath(rowNode as Record<string, unknown>, fieldPathFromRow);
}

function resolveNotifyPath(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor | undefined,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  effect: ReversalEffect
): string | undefined {
  if (hasInlineScopedAddress(effect)) {
    return effect.path;
  }

  if (typeof effect.subjectId !== 'number') {
    return descriptor?.path;
  }

  const inlineCollectionPath = deriveCollectionPathFromEffect(effect);
  const inlineFieldPathFromRow = deriveFieldPathFromEffect(effect);
  const collectionPath =
    inlineCollectionPath ??
    descriptor?.subjectDescriptors?.get(String(effect.subjectId))?.collectionPath ??
    descriptor?.collectionPath ??
    structuralOwnerPaths.get(effect.owner);
  if (collectionPath === undefined) {
    return descriptor?.path;
  }

  const collectionNode = resolveNodeAtPath(
    tree.$ as Record<string, unknown>,
    collectionPath
  );
  if (!isCollectionNode(collectionNode)) {
    return descriptor?.path;
  }

  const currentKey = collectionNode.__findKeyBySubjectId?.(effect.subjectId);
  if (currentKey === undefined) {
    return descriptor?.path;
  }

  const fieldPathFromRow =
    inlineFieldPathFromRow ??
    descriptor?.subjectDescriptors?.get(String(effect.subjectId))?.fieldPathFromRow ??
    descriptor?.fieldPathFromRow;
  const rowPath = `${collectionPath}.${String(currentKey)}`;

  if (fieldPathFromRow === '') {
    return rowPath;
  }

  return fieldPathFromRow ? `${rowPath}.${fieldPathFromRow}` : descriptor?.path;
}

function hasInlineSubjectAddress(
  effect: ReversalEffect
): effect is InlineSubjectAddressEffect {
  return (
    typeof effect.subjectId === 'number' &&
    typeof effect.path === 'string' &&
    typeof effect.ownerPath === 'string'
  );
}

function hasInlineScopedAddress(
  effect: ReversalEffect
): effect is ReversalEffect & { path: string; ownerPath: string } {
  return (
    typeof effect.path === 'string' &&
    typeof effect.ownerPath === 'string' &&
    effect.path !== effect.ownerPath
  );
}

function deriveCollectionPathFromEffect(
  effect: ReversalEffect
): string | undefined {
  if (!hasInlineSubjectAddress(effect)) {
    return undefined;
  }

  return deriveCollectionPath(
    effect.path,
    effect.ownerPath,
    effect.subjectId as number,
    undefined
  );
}

function deriveFieldPathFromEffect(
  effect: ReversalEffect
): string | undefined {
  if (!hasInlineSubjectAddress(effect)) {
    return undefined;
  }

  return deriveFieldPathFromRow(
    effect.path,
    effect.ownerPath,
    effect.subjectId as number,
    undefined
  );
}

function resolveCurrentScopedTarget(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor | undefined,
  effect: ReversalEffect & { path: string; ownerPath: string }
): unknown {
  const scopePath = effect.ownerPath ?? descriptor?.ownerPath;
  if (!scopePath) {
    return undefined;
  }

  const scopeNode = resolveNodeAtPath(
    tree.$ as Record<string, unknown>,
    scopePath
  );
  if (scopeNode === undefined) {
    return undefined;
  }

  const relativePath = effect.path.startsWith(`${scopePath}.`)
    ? effect.path.slice(scopePath.length + 1)
    : '';
  const normalizedRelativePath = normalizeScopedValuePath(relativePath);

  if (normalizedRelativePath === '') {
    return scopeNode;
  }

  const scopedFieldTree =
    scopeNode && typeof scopeNode === 'function' && '$' in (scopeNode as object)
      ? (scopeNode as { $?: unknown }).$
      : undefined;

  if (isTraversableNode(scopedFieldTree)) {
    const scopedTarget = resolveNodeAtPath(
      scopedFieldTree as Record<string, unknown>,
      normalizedRelativePath
    );
    if (isWritableLeaf(scopedTarget) || isWritableEntityNode(scopedTarget)) {
      return scopedTarget;
    }
  }

  if (!isTraversableNode(scopeNode)) {
    return undefined;
  }

  return resolveNodeAtPath(
    scopeNode as Record<string, unknown>,
    normalizedRelativePath
  );
}

function resolveSubjectTargetFromDescriptor(
  rowNode: unknown,
  descriptor: TreeRealizationDescriptor | undefined
): unknown {
  if (!descriptor) {
    return undefined;
  }

  if (descriptor.fieldPathFromRow === '') {
    return rowNode;
  }

  if (!descriptor.fieldPathFromRow) {
    return undefined;
  }

  return resolveNodeAtPath(
    rowNode as Record<string, unknown>,
    descriptor.fieldPathFromRow
  );
}

function resolveNodeAtPath(
  root: Record<string, unknown>,
  path: string
): unknown {
  if (path === '') {
    return root;
  }

  let cursor: unknown = root;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return cursor;
}

function getStructuralAddEffect(
  descriptor: TreeRealizationDescriptor | undefined,
  effect: ReversalEffect
): Extract<StructuralHistoryEffect, { kind: 'add' | 'remove' }> | undefined {
  if (effect.structural !== 'add' || typeof effect.subjectId !== 'number') {
    return undefined;
  }

  if (isStructuralHistoryEffect(effect.structuralContext)) {
    return effect.structuralContext.kind === 'remove' ||
      effect.structuralContext.kind === 'add'
      ? effect.structuralContext
      : undefined;
  }

  const removeEffect = descriptor?.structuralHistoryEffects?.get(
    `remove:${String(effect.subjectId)}:${String(effect.after)}`
  );
  if (removeEffect?.kind === 'remove') {
    return removeEffect;
  }

  const subjectEffect = descriptor?.structuralHistoryBySubject?.get(
    String(effect.subjectId)
  );
  if (subjectEffect?.kind === 'remove' || subjectEffect?.kind === 'add') {
    return subjectEffect;
  }

  const addEffect = descriptor?.structuralHistoryEffects?.get(
    `add:${String(effect.subjectId)}:${String(effect.after)}`
  );
  return addEffect?.kind === 'add' ? addEffect : undefined;
}

function deriveCollectionPath(
  path: string,
  ownerPath: string,
  subjectId: number | undefined,
  historyEffect: StructuralHistoryEffect | undefined
): string | undefined {
  if (historyEffect) {
    return ownerPath;
  }

  if (path === ownerPath) {
    return ownerPath.includes('.') ? parentPath(ownerPath) : undefined;
  }

  if (!path.startsWith(`${ownerPath}.`)) {
    return undefined;
  }

  if (!ownerPath.includes('.')) {
    return ownerPath;
  }

  if (typeof subjectId !== 'number') {
    return undefined;
  }

  return parentPath(ownerPath);
}

function deriveFieldPathFromRow(
  path: string,
  ownerPath: string,
  subjectId: number | undefined,
  historyEffect: StructuralHistoryEffect | undefined
): string | undefined {
  if (historyEffect) {
    return undefined;
  }

  if (path === ownerPath) {
    return '';
  }

  if (typeof subjectId !== 'number' || !path.startsWith(`${ownerPath}.`)) {
    return undefined;
  }

  const relativePath = path.slice(ownerPath.length + 1);
  if (!ownerPath.includes('.')) {
    const firstDot = relativePath.indexOf('.');
    return firstDot === -1 ? '' : relativePath.slice(firstDot + 1);
  }

  return relativePath;
}

function parentPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? '' : path.slice(0, lastDot);
}

function toStructuralHistoryEffectKey(effect: StructuralHistoryEffect): string {
  switch (effect.kind) {
    case 'add':
    case 'remove':
      return `${effect.kind}:${String(effect.subject)}:${String(effect.key)}`;
    case 'rekey':
      return `rekey:${String(effect.subject)}:${String(effect.beforeKey)}:${String(effect.afterKey)}`;
  }
}

function isWritableLeaf(value: unknown): value is WritableLeaf {
  return Boolean(
    value &&
      typeof value === 'function' &&
      'set' in (value as object) &&
      typeof (value as { set?: unknown }).set === 'function'
  );
}

function isWritableEntityNode(value: unknown): value is WritableEntityNode {
  return Boolean(
    value &&
      typeof value === 'function' &&
      !('set' in (value as object))
  );
}

function isStructuralHistoryEffect(value: unknown): value is StructuralHistoryEffect {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'kind' in (value as object) &&
      ((value as StructuralHistoryEffect).kind === 'add' ||
        (value as StructuralHistoryEffect).kind === 'remove' ||
        (value as StructuralHistoryEffect).kind === 'rekey')
  );
}

function isCollectionNode(value: unknown): value is CollectionNode {
  return Boolean(
    value &&
      'byIdOrFail' in (value as object) &&
      'changeId' in (value as object) &&
      'removeOne' in (value as object)
  );
}

function hasCollectionKey(
  node: CollectionNode,
  key: string | number
): boolean {
  try {
    node.byIdOrFail(key);
    return true;
  } catch {
    return false;
  }
}
