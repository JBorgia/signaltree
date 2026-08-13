import type { ISignalTree, PositionId, StructuralHistoryEffect, UpdateMetadata } from '../../types';
import { getPathNotifier } from '../../path-notifier';
import { getActiveWriteContext, withWriteContext } from '../../write-context';
import { getOwnedPositionIds } from '../owned-mutation';
import { getTreeScalarSlotRuntime } from '../tree-scalar-slot-runtime';
import { visitTree } from '../visit-tree';

import type { ReversalEffect, ReversalRefusal } from './causal-types';

type StructuralDriftRefusal = Extract<ReversalRefusal, { readonly kind: 'structural-drift' }>;

type CollectionNode = {
  byIdOrFail(id: string | number): unknown;
  changeId(from: string | number, to: string | number): void;
  removeOne(id: string | number): void;
  __planRekey?(
    from: string | number,
    to: string | number
  ): {
    commit(): void;
    publish(metaOverride?: UpdateMetadata): void;
  };
  __findKeyBySubjectId?(subjectId: number): string | number | undefined;
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

export interface TreeRealizationDescriptor {
  readonly path?: string;
  readonly ownerPath?: string;
  readonly structuralHistoryEffects?: ReadonlyMap<string, StructuralHistoryEffect>;
}

export interface RememberTreeRealizationDescriptorOptions {
  readonly descriptors: Map<PositionId, TreeRealizationDescriptor>;
  readonly path: string;
  readonly ownerPath?: string;
  readonly positionIds?: readonly number[];
  readonly meta?: UpdateMetadata;
}

export interface CreateTreeRealizationAdapterOptions {
  readonly tree: ISignalTree<object>;
  readonly descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>;
}

export function rememberTreeRealizationDescriptor(
  options: RememberTreeRealizationDescriptorOptions
): void {
  const owner = options.positionIds?.[0] as PositionId | undefined;
  if (owner === undefined) {
    return;
  }

  const existing = options.descriptors.get(owner);
  const structuralHistoryEffects = new Map(existing?.structuralHistoryEffects ?? []);
  if (options.meta?.historyEffect) {
    structuralHistoryEffects.set(
      toStructuralHistoryEffectKey(options.meta.historyEffect),
      options.meta.historyEffect
    );
  }

  options.descriptors.set(owner, {
    path: options.path,
    ownerPath: options.ownerPath ?? options.path,
    structuralHistoryEffects,
  });
}

export function createTreeRealizationAdapter(
  options: CreateTreeRealizationAdapterOptions
): {
  validateEffects(
    effects: readonly ReversalEffect[]
  ): StructuralDriftRefusal | undefined;
  applyAtomically(effects: readonly ReversalEffect[]): void;
} {
  return {
    validateEffects(effects) {
      for (const effect of effects) {
        if (!canApplyEffect(options.tree, options.descriptors, effect)) {
          return { kind: 'structural-drift' };
        }
      }

      return undefined;
    },
    applyAtomically(effects) {
      const heterogeneousFrame = planHeterogeneousFrame(
        options.tree,
        options.descriptors,
        effects
      );
      if (heterogeneousFrame) {
        heterogeneousFrame.commit();
        return;
      }

      const scalarFrame = planScalarFrame(options.tree, options.descriptors, effects);
      if (scalarFrame) {
        scalarFrame.commit();
        return;
      }

      for (const effect of effects) {
        applyEffect(options.tree, options.descriptors, effect);
      }
    },
  };
}

function planHeterogeneousFrame(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  effects: readonly ReversalEffect[]
): { commit(): void } | undefined {
  if (
    effects.length === 0 ||
    !effects.some((effect) => effect.structural === 'rekey') ||
    effects.some((effect) => effect.structural && effect.structural !== 'rekey')
  ) {
    return undefined;
  }

  const scalarSlotRuntime =
    getTreeScalarSlotRuntime(tree) ?? getTreeScalarSlotRuntime(tree.$);
  if (!scalarSlotRuntime) {
    return undefined;
  }

  const scalarEffects = effects.filter((effect) => !effect.structural);
  const rekeyEffects = effects.filter(
    (effect): effect is ReversalEffect & { structural: 'rekey' } =>
      effect.structural === 'rekey'
  );

  const scalarFrame = scalarSlotRuntime.beginFrame();
  const plannedRekeys: Array<{
    effect: ReversalEffect & { structural: 'rekey' };
    plan: { commit(): void; publish(metaOverride?: UpdateMetadata): void };
  }> = [];

  for (const effect of scalarEffects) {
    const slotIndex = scalarSlotRuntime.resolveScalarSlot(effect.owner);
    if (slotIndex === undefined) {
      return undefined;
    }
    scalarFrame.set(slotIndex, effect.after);
  }

  for (const effect of rekeyEffects) {
    const liveNode = resolveLiveNodeByPositionId(tree, effect.owner);
    if (!isCollectionNode(liveNode) || typeof liveNode.__planRekey !== 'function') {
      return undefined;
    }

    plannedRekeys.push({
      effect,
      plan: liveNode.__planRekey(
        effect.before as string | number,
        effect.after as string | number
      ),
    });
  }

  return {
    commit(): void {
      for (const { plan } of plannedRekeys) {
        plan.commit();
      }

      scalarFrame.commit();

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

      for (const effect of scalarEffects) {
        const descriptor = descriptors.get(effect.owner);
        if (!descriptor?.path) {
          continue;
        }

        getPathNotifier().notify(
          descriptor.path,
          effect.after,
          effect.before,
          descriptor.ownerPath ?? descriptor.path,
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
  effects: readonly ReversalEffect[]
): { commit(): void } | undefined {
  if (effects.length === 0 || effects.some((effect) => effect.structural)) {
    return undefined;
  }

  const scalarSlotRuntime =
    getTreeScalarSlotRuntime(tree) ?? getTreeScalarSlotRuntime(tree.$);
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
        if (!descriptor?.path) {
          continue;
        }

        getPathNotifier().notify(
          descriptor.path,
          effect.after,
          effect.before,
          descriptor.ownerPath ?? descriptor.path,
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
  effect: ReversalEffect
): boolean {
  const descriptor = descriptors.get(effect.owner);
  if (!descriptor && !effect.structural) {
    return false;
  }

  const liveNode = resolveLiveNodeByPositionId(tree, effect.owner);
  if (!liveNode) {
    return false;
  }

  if (!effect.structural) {
    return isWritableLeaf(
      resolveLiveScalarNode(tree, descriptor ?? {}, effect, liveNode)
    );
  }

  const ownerNode = liveNode;
  if (!isCollectionNode(ownerNode)) {
    return false;
  }

  const currentSubjectKey =
    typeof effect.subjectId === 'number'
      ? ownerNode.__findKeyBySubjectId?.(effect.subjectId)
      : undefined;

  switch (effect.structural) {
    case 'remove':
      return (
        hasCollectionKey(ownerNode, effect.before as string | number) &&
        (typeof effect.subjectId !== 'number' || currentSubjectKey === effect.before)
      );
    case 'rekey':
      return (
        hasCollectionKey(ownerNode, effect.before as string | number) &&
        (typeof effect.subjectId !== 'number' || currentSubjectKey === effect.before) &&
        !hasCollectionKey(ownerNode, effect.after as string | number)
      );
    case 'add': {
      if (
        typeof effect.subjectId !== 'number' ||
        typeof ownerNode.__restoreOne !== 'function' ||
        hasCollectionKey(ownerNode, effect.after as string | number) ||
        currentSubjectKey !== undefined
      ) {
        return false;
      }

      return getStructuralRestoreEffect(descriptor, effect)?.kind === 'remove';
    }
  }
}

function applyEffect(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  effect: ReversalEffect
): void {
  const descriptor = descriptors.get(effect.owner);
  if (!descriptor && !effect.structural) {
    throw new Error(`Missing live descriptor for owner ${String(effect.owner)}`);
  }

  const liveNode = resolveLiveNodeByPositionId(tree, effect.owner);
  if (!liveNode) {
    throw new Error(`Missing live node for owner ${String(effect.owner)}`);
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
        const leaf = resolveLiveScalarNode(tree, descriptor ?? {}, effect, liveNode);
        if (!isWritableLeaf(leaf)) {
          throw new Error(`Missing live leaf for owner ${String(effect.owner)}`);
        }

        leaf.set(effect.after);
        return;
      }

      const ownerNode = liveNode;
      if (!isCollectionNode(ownerNode)) {
        throw new Error(`Missing structural owner for ${String(effect.owner)}`);
      }

      switch (effect.structural) {
        case 'rekey':
          ownerNode.changeId(
            effect.before as string | number,
            effect.after as string | number
          );
          return;
        case 'remove':
          ownerNode.removeOne(effect.before as string | number);
          return;
        case 'add': {
          const historyEffect = getStructuralRestoreEffect(descriptor, effect);
          if (!historyEffect || historyEffect.kind !== 'remove') {
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
          applySubjectState(tree, ownerNode, effect);
          return;
        }
      }
    }
  );
}

function applySubjectState(
  tree: ISignalTree<object>,
  ownerNode: CollectionNode,
  effect: ReversalEffect
): void {
  for (const [positionId, value] of Object.entries(effect.subjectState ?? {})) {
    const liveNode =
      resolveSubjectNodeByPositionId(
        ownerNode.byIdOrFail(effect.after as string | number),
        Number(positionId)
      ) ?? resolveLiveNodeByPositionId(tree, Number(positionId));
    if (!isWritableLeaf(liveNode)) {
      throw new Error(`Missing live subject leaf for owner ${positionId}`);
    }

    liveNode.set(value);
  }
}

function resolveLiveScalarNode(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor,
  effect: ReversalEffect,
  liveNode: unknown
): unknown {
  if (isWritableLeaf(liveNode)) {
    return liveNode;
  }

  if (descriptor.path) {
    const pathNode = resolveNodeAtPath(tree.$ as Record<string, unknown>, descriptor.path);
    if (isWritableLeaf(pathNode)) {
      return pathNode;
    }
  }

  if (
    !isCollectionNode(liveNode) ||
    typeof effect.subjectId !== 'number' ||
    !descriptor.path ||
    !descriptor.ownerPath
  ) {
    return undefined;
  }

  const currentKey = liveNode.__findKeyBySubjectId?.(effect.subjectId);
  if (currentKey === undefined) {
    return undefined;
  }

  const fieldSuffix = descriptor.path.startsWith(`${descriptor.ownerPath}.`)
    ? descriptor.path.slice(descriptor.ownerPath.length + 1)
    : undefined;
  if (!fieldSuffix) {
    return undefined;
  }

  const rowNode = liveNode.byIdOrFail(currentKey);
  return resolveNodeAtPath(
    rowNode as Record<string, unknown>,
    fieldSuffix
  );
}

function resolveLiveNodeByPositionId(
  tree: ISignalTree<object>,
  owner: PositionId
): unknown {
  let exactMatch: unknown;
  let containingMatch: unknown;

  visitTree(
    tree.$,
    (node) => {
      const positionIds = getOwnedPositionIds(node);
      if (positionIds?.[0] === owner) {
        exactMatch = node;
        return false;
      }

      if (containingMatch === undefined && positionIds?.includes(owner)) {
        containingMatch = node;
      }

      return undefined;
    },
    {
      skipKey: (key) => key === 'set' || key === 'update' || key.startsWith('_'),
    }
  );

  return exactMatch ?? containingMatch;
}

function resolveSubjectNodeByPositionId(
  subjectRoot: unknown,
  owner: PositionId
): unknown {
  let exactMatch: unknown;

  visitTree(
    subjectRoot,
    (node) => {
      if (getOwnedPositionIds(node)?.[0] === owner) {
        exactMatch = node;
        return false;
      }

      return undefined;
    },
    {
      skipKey: (key) => key === 'set' || key === 'update' || key.startsWith('_'),
    }
  );

  return exactMatch;
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

function getStructuralRestoreEffect(
  descriptor: TreeRealizationDescriptor | undefined,
  effect: ReversalEffect
): StructuralHistoryEffect | undefined {
  if (effect.structural !== 'add' || typeof effect.subjectId !== 'number') {
    return undefined;
  }

  if (isStructuralHistoryEffect(effect.structuralContext)) {
    return effect.structuralContext.kind === 'remove'
      ? effect.structuralContext
      : undefined;
  }

  return descriptor?.structuralHistoryEffects?.get(
    toStructuralRestoreLookupKey(effect)
  );
}

function toStructuralRestoreLookupKey(effect: ReversalEffect): string {
  return `remove:${String(effect.subjectId)}:${String(effect.after)}`;
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
