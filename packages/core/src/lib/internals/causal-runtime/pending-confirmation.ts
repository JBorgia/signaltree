import type { AppliedHistory } from './applied-history';
import type { ReversalResult, TurnId } from './causal-types';
import type { RealizationContextSource } from './realization-context';
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
  readonly retentionObserver?: Pick<RealizationContextSource, 'consumeForgottenConfirmedTurns'>;
  readonly onConfirmedTurnsForgotten?: (turns: readonly { readonly id: TurnId }[]) => void;
  readonly reportRetentionObserverError?: (
    error: unknown,
    turns: readonly { readonly id: TurnId }[]
  ) => void;
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

  const forgottenTurns = options.retentionObserver?.consumeForgottenConfirmedTurns() ?? [];
  if (forgottenTurns.length > 0 && options.onConfirmedTurnsForgotten) {
    try {
      options.onConfirmedTurnsForgotten(forgottenTurns);
    } catch (error) {
      if (options.reportRetentionObserverError) {
        options.reportRetentionObserverError(error, forgottenTurns);
      } else {
        queueMicrotask(() => {
          throw normalizeError(error);
        });
      }
    }
  }

  return {
    ok: true,
    turnId: confirmedTurn.id,
  };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
