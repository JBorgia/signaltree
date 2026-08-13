import type { PositionRegistry } from '../position-registry';

import type { PositionId, ReversalResult } from './causal-types';
import type { AppliedHistory } from './applied-history';
import type { TurnStore } from './turn-store';

export type ConfirmedUndoAssessment = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
>;

export interface AssessConfirmedUndoOptions {
  readonly authority: PositionId;
  readonly store: Pick<TurnStore, 'getTurn'>;
  readonly appliedHistory: Pick<AppliedHistory, 'getAppliedTurnIds' | 'getFrontier'>;
  readonly topology: Pick<PositionRegistry, 'contains'>;
}

export function assessConfirmedUndo(
  options: AssessConfirmedUndoOptions
): ConfirmedUndoAssessment {
  const { authority, appliedHistory, store, topology } = options;
  const latestContainedTurn = [...appliedHistory.getAppliedTurnIds()]
    .reverse()
    .map((turnId) => store.getTurn(turnId))
    .find((turn) =>
      turn !== undefined &&
      turn.participants.every((participant) =>
        topology.contains(authority, participant)
      )
    );

  if (!latestContainedTurn) {
    return { ok: false, refusal: { kind: 'outside-boundary' } };
  }

  const isAtFrontier = latestContainedTurn.participants.every(
    (participant) => appliedHistory.getFrontier(participant) === latestContainedTurn.id
  );
  if (!isAtFrontier) {
    return { ok: false, refusal: { kind: 'frontier-blocked' } };
  }

  return { ok: true, turnId: latestContainedTurn.id };
}
