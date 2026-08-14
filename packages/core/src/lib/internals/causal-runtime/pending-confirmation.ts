import type { AppliedHistory } from './applied-history';
import type { CausalTurn, ReversalResult, TurnId } from './causal-types';
import type { RealizationContextSource } from './realization-context';
import type { TurnStore } from './turn-store';

export interface PendingConfirmationMaintenanceHint {
  readonly forgottenConfirmedTurnIds: readonly TurnId[];
  readonly invalidatedRedoTurnIds: readonly TurnId[];
  readonly settledPendingSubjectReference: boolean;
}

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
  readonly onMaintenanceMayBeUseful?: (
    hint: PendingConfirmationMaintenanceHint
  ) => void;
  readonly reportMaintenanceObserverError?: (
    error: unknown,
    hint: PendingConfirmationMaintenanceHint
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

  const invalidatedRedoTurnIds = options.appliedHistory.commitPreparedAdmitConfirmed(
    preparedAppliedHistory
  );

  const confirmedTurn = options.store.commitPreparedConfirmPending(
    prepared.transition
  );

  const forgottenTurns = options.retentionObserver?.consumeForgottenConfirmedTurns() ?? [];
  const maintenanceHint = deriveMaintenanceHint(
    prepared.transition.pendingTurn,
    forgottenTurns,
    invalidatedRedoTurnIds
  );
  if (maintenanceHint && options.onMaintenanceMayBeUseful) {
    try {
      options.onMaintenanceMayBeUseful(maintenanceHint);
    } catch (error) {
      if (options.reportMaintenanceObserverError) {
        options.reportMaintenanceObserverError(error, maintenanceHint);
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

function deriveMaintenanceHint(
  pendingTurn: CausalTurn,
  forgottenTurns: readonly { readonly id: TurnId }[],
  invalidatedRedoTurnIds: readonly TurnId[]
): PendingConfirmationMaintenanceHint | undefined {
  const settledPendingSubjectReference = pendingTurn.effects.some(
    (effect) => effect.subjectId !== undefined
  );

  if (
    forgottenTurns.length === 0 &&
    invalidatedRedoTurnIds.length === 0 &&
    !settledPendingSubjectReference
  ) {
    return undefined;
  }

  return {
    forgottenConfirmedTurnIds: forgottenTurns.map(({ id }) => id),
    invalidatedRedoTurnIds: [...invalidatedRedoTurnIds],
    settledPendingSubjectReference,
  };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
