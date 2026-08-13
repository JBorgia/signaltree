import type { ConfirmedReversalPlan, ReversalResult, TurnId } from './causal-types';
import type { RealizationContext } from './realization-context';
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
  readonly realizationContext?: RealizationContext;
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
      effects: createReversalEffects(turn, options.realizationContext),
    },
  };
}

function createReversalEffects(
  turn: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>,
  realizationContext?: RealizationContext
): readonly ConfirmedReversalPlan['effects'] {
  if (!realizationContext) {
    return [...turn.effects]
      .reverse()
      .map(({ owner, before, after, subjectId, structural }) => ({
        owner,
        before: after,
        after: before,
        subjectId,
        structural,
      }));
  }

  const firstEffectIndexByOwner = new Map<number, number>();
  turn.effects.forEach((effect, index) => {
    if (!firstEffectIndexByOwner.has(effect.owner)) {
      firstEffectIndexByOwner.set(effect.owner, index);
    }
  });
  const currentByOwner = new Map<number, unknown>();

  return [...turn.effects].reverse().map((effect) => {
    const originalIndex = turn.effects.indexOf(effect);
    const before = currentByOwner.has(effect.owner)
      ? currentByOwner.get(effect.owner)
      : realizationContext.getCurrentValue(effect.owner);
    const after = firstEffectIndexByOwner.get(effect.owner) === originalIndex
      ? realizationContext.getValueWithoutConfirmedTurn(turn.id, effect.owner)
      : effect.before;

    currentByOwner.set(effect.owner, after);

    return {
      owner: effect.owner,
      before,
      after,
      subjectId: effect.subjectId,
      structural: effect.structural,
    };
  });
}
