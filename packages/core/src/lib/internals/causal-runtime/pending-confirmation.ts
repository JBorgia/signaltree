import type { AppliedHistory } from './applied-history';
import type { ReversalResult, TurnId } from './causal-types';
import type { TurnStore } from './turn-store';

export interface ConfirmPendingTurnAtOptions {
  readonly turnId: TurnId;
  readonly store: Pick<
    TurnStore,
    'prepareConfirmPendingTurn' | 'commitPreparedConfirmPending'
  >;
  readonly appliedHistory: Pick<
    AppliedHistory,
    'prepareAdmitConfirmedTurn' | 'commitPreparedAdmitConfirmed'
  >;
}

export function confirmPendingTurnAt(
  options: ConfirmPendingTurnAtOptions
): ReversalResult<{ readonly kind: 'history-evicted' }> {
  const prepared = options.store.prepareConfirmPendingTurn(options.turnId);
  if (!prepared.ok) {
    return {
      ok: false,
      refusal: { kind: 'history-evicted' },
    };
  }

  const preparedAppliedHistory = options.appliedHistory.prepareAdmitConfirmedTurn({
    turnId: prepared.transition.turnId,
    participants: prepared.transition.pendingTurn.participants,
  });

  options.appliedHistory.commitPreparedAdmitConfirmed(preparedAppliedHistory);

  const confirmedTurn = options.store.commitPreparedConfirmPending(
    prepared.transition
  );

  return {
    ok: true,
    turnId: confirmedTurn.id,
  };
}
