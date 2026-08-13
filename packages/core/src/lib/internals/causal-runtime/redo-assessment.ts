import type { PositionRegistry } from '../position-registry';

import type { PositionId, ReversalResult, TurnId } from './causal-types';
import type { AppliedHistory } from './applied-history';
import type { TurnStore } from './turn-store';

export type ConfirmedRedoAssessment = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
>;

export interface AssessConfirmedRedoOptions {
  readonly authority: PositionId;
  readonly store: Pick<TurnStore, 'getTurns' | 'getTurnIdsForPosition'>;
  readonly appliedHistory: Pick<AppliedHistory, 'getAppliedTurnIds' | 'getRedoTurnIds'>;
  readonly topology: Pick<PositionRegistry, 'contains'>;
}

export function assessConfirmedRedo(
  options: AssessConfirmedRedoOptions
): ConfirmedRedoAssessment {
  const { authority, appliedHistory, store, topology } = options;
  const appliedTurnIds = new Set(appliedHistory.getAppliedTurnIds());
  const redoTurnIds = new Set(appliedHistory.getRedoTurnIds());

  const candidate = store.getTurns().find(
    (turn) =>
      redoTurnIds.has(turn.id) &&
      turn.participants.every((participant) =>
        topology.contains(authority, participant)
      )
  );

  if (!candidate) {
    return { ok: false, refusal: { kind: 'outside-boundary' } };
  }

  const restoresValidPrefix = candidate.participants.every(
    (participant) =>
      getFirstUnappliedTurnIdForPosition(participant, store, appliedTurnIds) ===
      candidate.id
  );
  if (!restoresValidPrefix) {
    return { ok: false, refusal: { kind: 'frontier-blocked' } };
  }

  return { ok: true, turnId: candidate.id };
}

function getFirstUnappliedTurnIdForPosition(
  positionId: PositionId,
  store: Pick<TurnStore, 'getTurnIdsForPosition'>,
  appliedTurnIds: ReadonlySet<TurnId>
): TurnId | undefined {
  return store
    .getTurnIdsForPosition(positionId)
    .find((turnId) => !appliedTurnIds.has(turnId));
}
