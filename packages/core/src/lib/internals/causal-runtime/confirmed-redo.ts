import type { PositionRegistry } from '../position-registry';

import type { AppliedHistory } from './applied-history';
import { assessConfirmedRedo } from './redo-assessment';
import type { PositionId, ReversalResult } from './causal-types';
import type { EffectApplicationPort } from './effect-applier';
import { applyReversalPlan } from './effect-applier';
import { planConfirmedReapply } from './reapply-planner';
import type { RealizationContext } from './realization-context';
import type { TurnStore } from './turn-store';

export type RedoConfirmedResult = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
  | { readonly kind: 'history-evicted' }
  | { readonly kind: 'structural-drift' }
>;

export interface RedoConfirmedPort extends EffectApplicationPort {
  validateEffects?(
    effects: Parameters<EffectApplicationPort['applyAtomically']>[0]
  ): Extract<RedoConfirmedResult, { readonly ok: false }>['refusal'] | undefined;
}

export interface RedoConfirmedAtOptions {
  readonly authority: PositionId;
  readonly store: Pick<TurnStore, 'getTurn' | 'getTurns' | 'getTurnIdsForPosition'>;
  readonly appliedHistory: Pick<
    AppliedHistory,
    | 'getAppliedTurnIds'
    | 'getRedoTurnIds'
    | 'prepareReapplyConfirmedTurn'
    | 'commitPreparedReapply'
  >;
  readonly topology: Pick<PositionRegistry, 'contains'>;
  readonly port: RedoConfirmedPort;
  readonly realizationContext: RealizationContext;
}

export interface RedoConfirmedDependencies {
  readonly assessConfirmedRedo: typeof assessConfirmedRedo;
  readonly planConfirmedReapply: typeof planConfirmedReapply;
  readonly applyReversalPlan: typeof applyReversalPlan;
}

const defaultDependencies: RedoConfirmedDependencies = {
  assessConfirmedRedo,
  planConfirmedReapply,
  applyReversalPlan,
};

export function redoConfirmedAt(
  options: RedoConfirmedAtOptions,
  dependencies: RedoConfirmedDependencies = defaultDependencies
): RedoConfirmedResult {
  const assessment = dependencies.assessConfirmedRedo({
    authority: options.authority,
    store: options.store,
    appliedHistory: options.appliedHistory,
    topology: options.topology,
  });
  if (!assessment.ok) {
    return assessment;
  }

  const reapply = dependencies.planConfirmedReapply({
    turnId: assessment.turnId,
    store: options.store,
    realizationContext: options.realizationContext,
  });
  if (!reapply.ok) {
    return reapply;
  }

  const validationRefusal = options.port.validateEffects?.(reapply.plan.effects);
  if (validationRefusal) {
    return { ok: false, refusal: validationRefusal };
  }

  const transition = options.appliedHistory.prepareReapplyConfirmedTurn(
    assessment.turnId
  );
  if (!transition.ok) {
    return mapPrepareFailureToRedoResult(transition.reason);
  }

  dependencies.applyReversalPlan({
    plan: reapply.plan,
    port: options.port,
  });

  options.appliedHistory.commitPreparedReapply(transition.transition);
  return { ok: true, turnId: assessment.turnId };
}

function mapPrepareFailureToRedoResult(
  reason: 'history-evicted' | 'not-redoable-next'
): RedoConfirmedResult {
  if (reason === 'history-evicted') {
    return { ok: false, refusal: { kind: 'history-evicted' } };
  }

  return { ok: false, refusal: { kind: 'frontier-blocked' } };
}
