import type { ConfirmedReversalPlan, ReversalResult, TurnId } from './causal-types';
import type { TurnStore } from './turn-store';

export type ConfirmedReversalPlanningResult =
  | { readonly ok: true; readonly plan: ConfirmedReversalPlan }
  | {
      readonly ok: false;
      readonly refusal: Extract<ReversalResult['refusal'], { kind: 'history-evicted' }>;
    };

export interface PlanConfirmedReversalOptions {
  readonly turnId: TurnId;
  readonly store: Pick<TurnStore, 'getTurn'>;
}

export function planConfirmedReversal(
  options: PlanConfirmedReversalOptions
): ConfirmedReversalPlanningResult {
  const turn = options.store.getTurn(options.turnId);
  if (!turn) {
    return { ok: false, refusal: { kind: 'history-evicted' } };
  }

  return {
    ok: true,
    plan: {
      turnId: turn.id,
      effects: [...turn.effects]
        .reverse()
        .map(({ owner, before, after }) => ({
          owner,
          before: after,
          after: before,
        })),
    },
  };
}
