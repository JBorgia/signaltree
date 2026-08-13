import type { PathNotifierHandler } from '../../path-notifier';

import type { PositionId, StructuralHistoryEffect, UpdateMetadata } from '../../types';

import type { ExplicitTransactionEffect, GreenfieldTransactionDraft } from './greenfield-transactions';

export function toExplicitTransactionEffect(options: {
  next: unknown;
  prev: unknown;
  subjectIds?: number[];
  positionIds?: number[];
  meta?: UpdateMetadata;
}): ExplicitTransactionEffect | undefined {
  const owner = options.positionIds?.[0] as PositionId | undefined;
  if (owner === undefined) {
    return undefined;
  }

  const subjectId = options.subjectIds?.[0];
  const historyEffect = options.meta?.historyEffect;
  if (!historyEffect) {
    return {
      owner,
      before: options.prev,
      after: options.next,
      subjectId,
    };
  }

  return mapStructuralEffect(owner, subjectId, historyEffect);
}

export function createTransactionCaptureBridge(options: {
  draft: GreenfieldTransactionDraft;
  turnId: number;
  transactionOwner: object;
}): PathNotifierHandler {
  return (
    next,
    prev,
    _path,
    _ownerPath,
    _source,
    subjectIds,
    positionIds,
    meta
  ) => {
    if (
      meta?.transactionId !== options.turnId ||
      meta.transactionOwner !== options.transactionOwner
    ) {
      return;
    }

    const effect = toExplicitTransactionEffect({
      next,
      prev,
      subjectIds,
      positionIds,
      meta,
    });
    if (!effect) {
      return;
    }

    options.draft.capture(effect);
  };
}

function mapStructuralEffect(
  owner: PositionId,
  subjectId: number | undefined,
  historyEffect: StructuralHistoryEffect
): ExplicitTransactionEffect {
  switch (historyEffect.kind) {
    case 'add':
      return {
        owner,
        before: undefined,
        after: historyEffect.key,
        subjectId,
        structural: 'add',
        structuralContext: historyEffect,
        subjectPositions: historyEffect.subjectPositions,
      };
    case 'remove':
      return {
        owner,
        before: historyEffect.key,
        after: undefined,
        subjectId,
        structural: 'remove',
        structuralContext: historyEffect,
        subjectPositions: historyEffect.subjectPositions,
      };
    case 'rekey':
      return {
        owner,
        before: historyEffect.beforeKey,
        after: historyEffect.afterKey,
        subjectId,
        structural: 'rekey',
        structuralContext: historyEffect,
        subjectPositions: historyEffect.subjectPositions,
      };
  }
}
