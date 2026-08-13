import type { ConfirmedReapplyPlan, ReversalResult, TurnId } from './causal-types';
import type { RealizationContext } from './realization-context';
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
  readonly realizationContext?: RealizationContext;
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
      effects: createReapplyEffects(turn, options.realizationContext),
    },
  };
}

function createReapplyEffects(
  turn: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>,
  realizationContext?: RealizationContext
): readonly ConfirmedReapplyPlan['effects'] {
  if (!realizationContext) {
    return turn.effects.map(({ owner, before, after, subjectId, structural }) => ({
      owner,
      before,
      after,
      subjectId,
      structural,
    }));
  }

  const currentByOwner = new Map<number, unknown>();

  return turn.effects.map((effect) => {
    const before = currentByOwner.has(effect.owner)
      ? currentByOwner.get(effect.owner)
      : realizationContext.getCurrentValue(effect.owner);

    currentByOwner.set(effect.owner, effect.after);

    return {
      owner: effect.owner,
      before,
      after: effect.after,
      subjectId: effect.subjectId,
      structural: effect.structural,
    };
  });
}
