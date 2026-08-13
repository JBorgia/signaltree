import type { PositionRegistry } from '../position-registry';

import type { AppliedHistory, PreparedAppliedHistoryUnapply } from './applied-history';
import { assessConfirmedUndo } from './authority-assessment';
import type { PositionId, ReversalResult } from './causal-types';
import type { EffectApplicationPort } from './effect-applier';
import { applyReversalPlan } from './effect-applier';
import { planConfirmedReversal } from './reversal-planner';
import type { TurnStore } from './turn-store';

export type UndoConfirmedResult = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
  | { readonly kind: 'history-evicted' }
>;

export interface UndoConfirmedAtOptions {
  readonly authority: PositionId;
  readonly store: Pick<TurnStore, 'getTurn'>;
  readonly appliedHistory: Pick<
    AppliedHistory,
    | 'getAppliedTurnIds'
    | 'getFrontier'
    | 'prepareUnapplyConfirmedTurn'
    | 'commitPreparedUnapply'
  >;
  readonly topology: Pick<PositionRegistry, 'contains'>;
  readonly port: EffectApplicationPort;
}

export interface UndoConfirmedDependencies {
  readonly assessConfirmedUndo: typeof assessConfirmedUndo;
  readonly planConfirmedReversal: typeof planConfirmedReversal;
  readonly applyReversalPlan: typeof applyReversalPlan;
}

const defaultDependencies: UndoConfirmedDependencies = {
  assessConfirmedUndo,
  planConfirmedReversal,
  applyReversalPlan,
};

export function undoConfirmedAt(
  options: UndoConfirmedAtOptions,
  dependencies: UndoConfirmedDependencies = defaultDependencies
): UndoConfirmedResult {
  const assessment = dependencies.assessConfirmedUndo({
    authority: options.authority,
    store: options.store,
    appliedHistory: options.appliedHistory,
    topology: options.topology,
  });
  if (!assessment.ok) {
    return assessment;
  }

  const reversal = dependencies.planConfirmedReversal({
    turnId: assessment.turnId,
    store: options.store,
  });
  if (!reversal.ok) {
    return reversal;
  }

  const transition = options.appliedHistory.prepareUnapplyConfirmedTurn(
    assessment.turnId
  );
  if (!transition.ok) {
    return mapPrepareFailureToUndoResult(transition.reason);
  }

  dependencies.applyReversalPlan({
    plan: reversal.plan,
    port: options.port,
  });

  options.appliedHistory.commitPreparedUnapply(transition.transition);
  return { ok: true, turnId: assessment.turnId };
}

function mapPrepareFailureToUndoResult(
  reason: 'history-evicted' | 'not-applied-frontier'
): UndoConfirmedResult {
  if (reason === 'history-evicted') {
    return { ok: false, refusal: { kind: 'history-evicted' } };
  }

  return { ok: false, refusal: { kind: 'frontier-blocked' } };
}
