import type { PositionRegistry } from '../position-registry';

import type { AppliedHistory } from './applied-history';
import { assessConfirmedUndo } from './authority-assessment';
import type { PositionId, ReversalResult } from './causal-types';
import type { EffectApplicationPort } from './effect-applier';
import { applyReversalPlan } from './effect-applier';
import { planConfirmedReversal } from './reversal-planner';
import type { RealizationContext } from './realization-context';
import type { TurnStore } from './turn-store';

export type UndoConfirmedResult = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
  | { readonly kind: 'history-evicted' }
  | { readonly kind: 'dependency-conflict' }
  | { readonly kind: 'structural-drift' }
>;

export interface UndoConfirmedPort extends EffectApplicationPort {
  validateEffects?(
    effects: Parameters<EffectApplicationPort['applyAtomically']>[0]
  ): Extract<UndoConfirmedResult, { readonly ok: false }>['refusal'] | undefined;
}

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
  readonly port: UndoConfirmedPort;
  readonly realizationContext: RealizationContext;
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

  if (hasLaterStructuralDependency(assessment.turnId, options.store, options.appliedHistory)) {
    return { ok: false, refusal: { kind: 'dependency-conflict' } };
  }

  const reversal = dependencies.planConfirmedReversal({
    turnId: assessment.turnId,
    store: options.store,
    realizationContext: options.realizationContext,
  });
  if (!reversal.ok) {
    return reversal;
  }

  const validationRefusal = options.port.validateEffects?.(reversal.plan.effects);
  if (validationRefusal) {
    return { ok: false, refusal: validationRefusal };
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

function hasLaterStructuralDependency(
  turnId: number,
  store: Pick<TurnStore, 'getTurn'>,
  appliedHistory: Pick<AppliedHistory, 'getAppliedTurnIds'>
): boolean {
  const turn = store.getTurn(turnId);
  if (!turn) {
    return false;
  }

  const laterAppliedTurns = appliedHistory
    .getAppliedTurnIds()
    .filter((candidateTurnId) => candidateTurnId > turnId)
    .map((candidateTurnId) => store.getTurn(candidateTurnId))
    .filter((candidateTurn): candidateTurn is NonNullable<typeof turn> => candidateTurn !== undefined);

  return turn.effects.some((effect) => {
    if (!effect.structural || effect.subjectId === undefined) {
      return false;
    }

    const restoredStructuralResource = getRestoredStructuralResource(effect);
    if (
      restoredStructuralResource !== undefined &&
      laterAppliedTurns.some((laterTurn) =>
        laterTurn.effects.some(
          (laterEffect) => getAcquiredStructuralResource(laterEffect) === restoredStructuralResource
        )
      )
    ) {
      return true;
    }

    return laterAppliedTurns.some((laterTurn) =>
      laterTurn.effects.some(
        (laterEffect) =>
          laterEffect.subjectId === effect.subjectId && laterEffect.structural !== undefined
      )
    );
  });
}

function getRestoredStructuralResource(
  effect: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>['effects'][number]
): unknown {
  switch (effect.structural) {
    case 'remove':
    case 'rekey':
      return effect.before;
    default:
      return undefined;
  }
}

function getAcquiredStructuralResource(
  effect: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>['effects'][number]
): unknown {
  switch (effect.structural) {
    case 'add':
    case 'rekey':
      return effect.after;
    default:
      return undefined;
  }
}
