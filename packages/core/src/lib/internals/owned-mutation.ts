import { untracked, WritableSignal } from '@angular/core';

import type { MutationCaptureRuntime } from './mutation-capture-runtime';
import { getPathNotifier } from '../path-notifier';
import type {
  MutationEnvelope,
  MutationKind,
  PositionId,
  UpdateMetadata,
} from '../types';
import {
  OWNED_NODE_METADATA,
  type OwnedNodeMetadata,
} from './owned-metadata';

// The READ side of owned-node metadata is framework-neutral and lives in
// owned-metadata.ts; this file keeps the write side, which needs untracked().
// Re-exported so the public surface is unchanged.
export {
  getOwnedPositionIds,
  getOwnedSubjectIds,
  getOwnedOwnerPath,
  hasIntrinsicMutationEmitter,
} from './owned-metadata';
import { getActiveWriteContext } from '../write-context';

type OwnedMutationIntent = NonNullable<UpdateMetadata['mutationIntent']>;

type OwnedMetadataStorage = 'property' | 'sidecar';

type OwnedMutationOptions = {
  path: string;
  ownerPath?: string;
  positionIds: readonly number[] | undefined;
  subjectIds?: readonly number[];
  metadataStorage?: OwnedMetadataStorage;
  captureRuntime?: MutationCaptureRuntime;
};

type OwnedWriteHooks<TValue> = {
  afterSet?: (
    value: TValue,
    before: TValue,
    after: TValue,
    changed: boolean
  ) => void;
  afterUpdate?: (
    before: TValue,
    after: TValue,
    changed: boolean
  ) => void;
};

const toSegments = (path: string): readonly PropertyKey[] =>
  path === '' ? [] : path.split('.');


function mergeOwnedNodeMetadata(
  node: object,
  patch: Partial<OwnedNodeMetadata>
): void {
  const existing = OWNED_NODE_METADATA.get(node) ?? {};
  OWNED_NODE_METADATA.set(node, { ...existing, ...patch });
}





export function defineOwnedPositionIds(
  node: object,
  positionIds: readonly number[] | undefined,
  storage: OwnedMetadataStorage = 'property'
): void {
  if (!positionIds || positionIds.length === 0) {
    return;
  }

  if (storage === 'sidecar') {
    mergeOwnedNodeMetadata(node, { positionIds: [...positionIds] });
    return;
  }

  Object.defineProperty(node, '__positionIds', {
    get: () => [...positionIds],
    enumerable: false,
    configurable: true,
  });
}

export function defineOwnedSubjectIds(
  node: object,
  subjectIds: readonly number[] | undefined,
  storage: OwnedMetadataStorage = 'property'
): void {
  if (!subjectIds || subjectIds.length === 0) {
    return;
  }

  if (storage === 'sidecar') {
    mergeOwnedNodeMetadata(node, { subjectIds: [...subjectIds] });
    return;
  }

  Object.defineProperty(node, '__subjectIds', {
    get: () => [...subjectIds],
    enumerable: false,
    configurable: true,
  });
}

export function defineOwnedOwnerPath(
  node: object,
  ownerPath: string,
  storage: OwnedMetadataStorage = 'property'
): void {
  if (storage === 'sidecar') {
    mergeOwnedNodeMetadata(node, { ownerPath });
    return;
  }

  Object.defineProperty(node, '__ownerPath', {
    value: ownerPath,
    enumerable: false,
    configurable: true,
  });
}

export function defineIntrinsicMutationEmitter(
  node: object,
  storage: OwnedMetadataStorage = 'property'
): void {
  if (storage === 'sidecar') {
    mergeOwnedNodeMetadata(node, { emitsMutations: true });
    return;
  }

  Object.defineProperty(node, '__emitsMutations', {
    value: true,
    enumerable: false,
    configurable: true,
  });
}

export function emitOwnedMutation(
  options: OwnedMutationOptions,
  before: unknown,
  after: unknown,
  kind: MutationKind,
  mutationIntent: OwnedMutationIntent
): void {
  const positionId = options.positionIds?.[0];
  if (positionId === undefined) {
    return;
  }

  const notifier = getPathNotifier();
  if (!notifier.hasObservers()) {
    return;
  }

  const envelope: MutationEnvelope = {
    positionId: positionId as PositionId,
    path: toSegments(options.path),
    ownerPath: toSegments(options.ownerPath ?? options.path),
    before,
    after,
    kind,
    subjectId: options.subjectIds?.[0],
    attribution: {
      ...(getActiveWriteContext() ?? {}),
      mutationIntent,
    },
  };

  notifier.emitMutation(envelope);
}

export function runOwnedMutation<TValue>(
  read: () => TValue,
  apply: () => void,
  options: OwnedMutationOptions,
  kind: MutationKind,
  mutationIntent: OwnedMutationIntent
): { before: TValue; after: TValue; changed: boolean } {
  const before = untracked(read);
  apply();
  const after = untracked(read);
  const changed = !Object.is(before, after);
  if (changed) {
    emitOwnedMutation(options, before, after, kind, mutationIntent);
  }
  return { before, after, changed };
}

export function wrapOwnedWritableSignal<TValue>(
  leaf: WritableSignal<TValue>,
  options: OwnedMutationOptions,
  hooks: OwnedWriteHooks<TValue> = {}
): void {
  const metadataStorage = options.metadataStorage ?? 'property';

  defineOwnedPositionIds(leaf as object, options.positionIds, metadataStorage);

  if (options.subjectIds) {
    defineOwnedSubjectIds(leaf as object, options.subjectIds, metadataStorage);
  }
  defineOwnedOwnerPath(
    leaf as object,
    options.ownerPath ?? options.path,
    metadataStorage
  );
  defineIntrinsicMutationEmitter(leaf as object, metadataStorage);

  const originalSet = leaf.set.bind(leaf);
  const originalUpdate = leaf.update.bind(leaf);

  leaf.set = (value: TValue) => {
    const { before, after, changed } = runOwnedMutation(
      leaf,
      () => originalSet(value),
      options,
      'set',
      'replace'
    );

    hooks.afterSet?.(value, before, after, changed);
  };

  leaf.update = (updater: (value: TValue) => TValue) => {
    const { before, after, changed } = runOwnedMutation(
      leaf,
      () => originalUpdate(updater),
      options,
      'update',
      'derive'
    );

    hooks.afterUpdate?.(before, after, changed);
  };
}
