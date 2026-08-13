import type { ConfirmedReapplyPlan, ReversalResult, TurnId } from './causal-types';
import type { TurnStore } from './turn-store';

export type ConfirmedReapplyPlanningResult =
  | { readonly ok: true; readonly plan: ConfirmedReapplyPlan }
  | {
      readonly ok: false;
      readonly refusal: Extract<ReversalResult['refusal'], { kind: 'history-evicted' }>;
    };

export interface PlanConfirmedReapplyOptions {
  readonly turnId: TurnId;
  readonly store: Pick<TurnStore, 'getTurn'>;
}

export function planConfirmedReapply(
  options: PlanConfirmedReapplyOptions
): ConfirmedReapplyPlanningResult {
  const turn = options.store.getTurn(options.turnId);
  if (!turn) {
    return { ok: false, refusal: { kind: 'history-evicted' } };
  }

  return {
    ok: true,
    plan: {
      turnId: turn.id,
      effects: turn.effects.map(({ owner, before, after }) => ({
        owner,
        before,
        after,
      })),
    },
  };
}
