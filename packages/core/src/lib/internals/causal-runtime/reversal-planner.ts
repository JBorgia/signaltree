import type { ConfirmedReversalPlan, ReversalResult, TurnId } from './causal-types';
import type { RealizationContext } from './realization-context';
import type { TurnStore } from './turn-store';

export type ConfirmedReversalPlanningResult =
  | { readonly ok: true; readonly plan: ConfirmedReversalPlan }
  | {
      readonly ok: false;
      readonly refusal: Extract<Extract<ReversalResult, { readonly ok: false }>['refusal'], { kind: 'history-evicted' }>;
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
): ConfirmedReversalPlan['effects'] {
  if (!realizationContext) {
    return [...turn.effects]
      .reverse()
      .map(({ owner, before, after, subjectId, structural, subjectPositions }) => ({
        owner,
        before: after,
        after: before,
        subjectId,
        structural: deriveUndoStructural(structural),
        subjectPositions: subjectPositions ? [...subjectPositions] : undefined,
        subjectState: undefined,
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

    const reversedEffect = {
      owner: effect.owner,
      before,
      after,
      subjectId: effect.subjectId,
      structural: deriveUndoStructural(effect.structural),
      subjectPositions: effect.subjectPositions ? [...effect.subjectPositions] : undefined,
      subjectState: deriveUndoSubjectState({
        turn,
        effect,
        originalIndex,
        realizationContext,
      }),
    };

    seedCurrentBoundary(currentByOwner, reversedEffect);

    return reversedEffect;
  });
}

function deriveUndoStructural(
  structural: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>['effects'][number]['structural']
): NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>['effects'][number]['structural'] {
  switch (structural) {
    case 'add':
      return 'remove';
    case 'remove':
      return 'add';
    case 'rekey':
      return 'rekey';
    default:
      return undefined;
  }
}

function deriveUndoSubjectState(options: {
  turn: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>;
  effect: NonNullable<ReturnType<Pick<TurnStore, 'getTurn'>['getTurn']>>['effects'][number];
  originalIndex: number;
  realizationContext: RealizationContext;
}): Readonly<Record<string, unknown>> | undefined {
  const { effect, originalIndex, realizationContext, turn } = options;
  if (effect.structural !== 'remove' || effect.subjectId === undefined || !effect.subjectPositions) {
    return undefined;
  }

  const priorSameSubjectEffects = turn.effects.filter(
    (candidateEffect, index) =>
      index < originalIndex && candidateEffect.subjectId === effect.subjectId
  );
  const relevantPositions = effect.subjectPositions.filter(
    (positionId) => positionId !== effect.owner
  );
  if (relevantPositions.length === 0) {
    return undefined;
  }

  const values = new Map<number, unknown>();
  for (const positionId of relevantPositions) {
    values.set(
      positionId,
      realizationContext.getValueWithoutConfirmedTurn(turn.id, positionId)
    );
  }

  for (const priorEffect of priorSameSubjectEffects) {
    if (
      priorEffect.subjectId === effect.subjectId &&
      values.has(priorEffect.owner)
    ) {
      values.set(priorEffect.owner, priorEffect.after);
    }
  }

  const entries = [...values.entries()].filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map(([positionId, value]) => [String(positionId), value]));
}

function seedCurrentBoundary(
  currentByOwner: Map<number, unknown>,
  effect: ConfirmedReversalPlan['effects'][number]
): void {
  currentByOwner.set(effect.owner, effect.after);

  for (const [positionId, value] of Object.entries(effect.subjectState ?? {})) {
    currentByOwner.set(Number(positionId), value);
  }
}
