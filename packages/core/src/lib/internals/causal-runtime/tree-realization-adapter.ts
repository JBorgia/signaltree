import type { ISignalTree, PositionId, StructuralHistoryEffect, UpdateMetadata } from '../../types';
import { getPathNotifier } from '../../path-notifier';
import { getActiveWriteContext, withWriteContext } from '../../write-context';
import {
  getOwnedOwnerPath,
  getOwnedPositionIds,
} from '../owned-mutation';
import { getTreeScalarSlotRuntime } from '../tree-scalar-slot-angular-runtime';
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

type WritableEntityNode = {
  (value: unknown): void;
};

type SubjectRealizationDescriptor = {
  path: string;
  ownerPath: string;
  collectionPath?: string;
  fieldPathFromRow?: string;
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

export function rememberTreeRealizationDescriptor(
  options: RememberTreeRealizationDescriptorOptions
): void {
  const owner = options.positionIds?.[0] as PositionId | undefined;
  if (owner === undefined) {
    return;
  }

  const existing = options.descriptors.get(owner);
  const structuralHistoryEffects = new Map(existing?.structuralHistoryEffects ?? []);
  const structuralHistoryBySubject = new Map(existing?.structuralHistoryBySubject ?? []);
  const subjectDescriptors = new Map(existing?.subjectDescriptors ?? []);
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
  const collectionPath = deriveCollectionPath(options.path, ownerPath, subjectId, options.meta?.historyEffect);
  const fieldPathFromRow = deriveFieldPathFromRow(options.path, ownerPath, subjectId, options.meta?.historyEffect);
  if (typeof subjectId === 'number') {
    subjectDescriptors.set(String(subjectId), {
      path: options.path,
      ownerPath,
      collectionPath,
      fieldPathFromRow,
    });
  }

  options.descriptors.set(owner, {
    path: existing?.path ?? options.path,
    ownerPath: existing?.ownerPath ?? ownerPath,
    collectionPath: existing?.collectionPath ?? collectionPath,
    fieldPathFromRow: existing?.fieldPathFromRow ?? fieldPathFromRow,
    structuralHistoryEffects,
    structuralHistoryBySubject,
    subjectDescriptors,
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
  const scalarSlotRuntime =
    getTreeScalarSlotRuntime(options.tree) ?? getTreeScalarSlotRuntime(options.tree.$);
  const structuralOwnerPaths = indexStructuralOwnerPaths(options.tree.$);

  return {
    validateEffects(effects) {
      for (const effect of effects) {
        if (
          !canApplyEffect(
            options.tree,
            options.descriptors,
            structuralOwnerPaths,
            scalarSlotRuntime,
            effect
          )
        ) {
          return { kind: 'structural-drift' };
        }
      }

      return undefined;
    },
    applyAtomically(effects) {
      const heterogeneousFrame = planHeterogeneousFrame(
        options.tree,
        options.descriptors,
        structuralOwnerPaths,
        scalarSlotRuntime,
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

function planHeterogeneousFrame(
  tree: ISignalTree<object>,
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effects: readonly ReversalEffect[]
): { commit(): void } | undefined {
  if (
    effects.length === 0 ||
    !effects.some((effect) => effect.structural === 'rekey') ||
    effects.some((effect) => effect.structural && effect.structural !== 'rekey')
  ) {
    return undefined;
  }

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
    const descriptor = descriptors.get(effect.owner);
    const collectionNode = resolveCollectionNode(
      tree,
      descriptor,
      structuralOwnerPaths,
      effect
    );
    if (
      !collectionNode ||
      typeof collectionNode.__planRekey !== 'function'
    ) {
      return undefined;
    }

    plannedRekeys.push({
      effect,
      plan: collectionNode.__planRekey(
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
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  scalarSlotRuntime: ReturnType<typeof getTreeScalarSlotRuntime>,
  effect: ReversalEffect
): boolean {
  const descriptor = descriptors.get(effect.owner);
  if (!descriptor && !effect.structural && !scalarSlotRuntime?.resolveScalarLeaf(effect.owner)) {
    return false;
  }

  if (!effect.structural) {
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
  if (!descriptor && !effect.structural && !scalarSlotRuntime?.resolveScalarLeaf(effect.owner)) {
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
        case 'remove':
          ownerNode.removeOne(effect.before as string | number);
          return;
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
  const directLeaf = scalarSlotRuntime?.resolveScalarLeaf(effect.owner);
  if (directLeaf) {
    return directLeaf;
  }

  if (typeof effect.subjectId === 'number') {
    return resolveCurrentSubjectTarget(tree, descriptor, effect.subjectId, effect);
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

function resolveCollectionNode(
  tree: ISignalTree<object>,
  descriptor: TreeRealizationDescriptor | undefined,
  structuralOwnerPaths: ReadonlyMap<PositionId, string>,
  effect: ReversalEffect
): CollectionNode | undefined {
  const collectionPath = descriptor?.collectionPath ??
    (effect.structural ? descriptor?.ownerPath : undefined) ??
    structuralOwnerPaths.get(effect.owner);
  if (collectionPath === undefined) {
    return undefined;
  }

  const node = resolveNodeAtPath(tree.$ as Record<string, unknown>, collectionPath);
  return isCollectionNode(node) ? node : undefined;
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
  const subjectDescriptor = descriptor?.subjectDescriptors?.get(String(subjectId));
  const collectionPath =
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
    subjectDescriptor?.fieldPathFromRow ?? descriptor?.fieldPathFromRow;

  if (fieldPathFromRow === '') {
    return rowNode;
  }

  if (!fieldPathFromRow) {
    return undefined;
  }

  return resolveNodeAtPath(rowNode as Record<string, unknown>, fieldPathFromRow);
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
