import type { StructuralHistoryEffect } from '../../types';

import type { AppliedHistory } from './applied-history';
import type { CausalTurn, PositionId, ReversalResult, TurnId } from './causal-types';
import { confirmPendingTurnAt } from './pending-confirmation';
import type { RollbackPendingResult } from './pending-rollback';
import type { TurnStore } from './turn-store';

export interface ExplicitTransactionEffect {
  readonly owner: PositionId;
  readonly before: unknown;
  readonly after: unknown;
  readonly subjectId?: unknown;
  readonly structural?: 'add' | 'remove' | 'rekey';
  readonly structuralContext?: StructuralHistoryEffect;
  readonly subjectPositions?: readonly PositionId[];
}

export type GreenfieldTransactionLifecycle =
  | 'open'
  | 'sealed'
  | 'confirmed'
  | 'aborted';

export interface GreenfieldTransactionDraft {
  capture(effect: ExplicitTransactionEffect): void;
  seal(): CausalTurn;
  confirm(): ReversalResult<{ readonly kind: 'history-evicted' }>;
  abort(): RollbackPendingResult;
  getLifecycle(): GreenfieldTransactionLifecycle;
}

export interface CreateGreenfieldTransactionDraftOptions {
  readonly turnId: TurnId;
  readonly store: Pick<TurnStore, 'admitPending'> & Pick<
    TurnStore,
    'prepareConfirmPendingTurn' | 'commitPreparedConfirmPending'
  >;
  readonly appliedHistory: Pick<
    AppliedHistory,
    'prepareAdmitConfirmedTurn' | 'commitPreparedAdmitConfirmed'
  >;
  readonly abortPendingTurn?: (turnId: TurnId) => RollbackPendingResult;
}

type DraftState = GreenfieldTransactionLifecycle;

class DefaultGreenfieldTransactionDraft implements GreenfieldTransactionDraft {
  private state: DraftState = 'open';
  private readonly capturedEffects: ExplicitTransactionEffect[] = [];
  private sealedTurn?: CausalTurn;

  constructor(private readonly options: CreateGreenfieldTransactionDraftOptions) {}

  capture(effect: ExplicitTransactionEffect): void {
    this.assertState('open');
    this.capturedEffects.push({
      owner: effect.owner,
      before: effect.before,
      after: effect.after,
      subjectId: effect.subjectId,
      structural: effect.structural,
      structuralContext: effect.structuralContext,
      subjectPositions: effect.subjectPositions ? [...effect.subjectPositions] : undefined,
    });
  }

  seal(): CausalTurn {
    this.assertState('open');

    const effects = normalizeDraftEffects(this.capturedEffects);

    this.sealedTurn = this.options.store.admitPending({
      id: this.options.turnId,
      effects,
    });
    this.state = 'sealed';
    return this.sealedTurn;
  }

  confirm(): ReversalResult<{ readonly kind: 'history-evicted' }> {
    this.assertState('sealed');

    const result = confirmPendingTurnAt({
      turnId: this.options.turnId,
      store: this.options.store,
      appliedHistory: this.options.appliedHistory,
    });
    if (result.ok) {
      this.state = 'confirmed';
      this.sealedTurn = undefined;
    }

    return result;
  }

  abort(): RollbackPendingResult {
    this.assertState('sealed');

    if (!this.options.abortPendingTurn) {
      throw new Error('Greenfield transaction abort is not configured');
    }

    const result = this.options.abortPendingTurn(this.options.turnId);
    if (result.ok) {
      this.state = 'aborted';
      this.sealedTurn = undefined;
    }

    return result;
  }

  getLifecycle(): GreenfieldTransactionLifecycle {
    return this.state;
  }

  private assertState(expected: DraftState): void {
    if (this.state !== expected) {
      throw new Error(
        `Greenfield transaction draft must be ${expected} before this operation`
      );
    }
  }
}

export function createGreenfieldTransactionDraft(
  options: CreateGreenfieldTransactionDraftOptions
): GreenfieldTransactionDraft {
  return new DefaultGreenfieldTransactionDraft(options);
}

function normalizeDraftEffects(
  effects: readonly ExplicitTransactionEffect[]
): CausalTurn['effects'] {
  const normalizedEffects: Array<CausalTurn['effects'][number]> = [];
  const scalarIndexByOwner = new Map<PositionId, number>();

  for (const effect of effects) {
    if (shouldPreserveAuthoredEffect(effect)) {
      normalizedEffects.push(copyEffect(effect));
      continue;
    }

    const existingIndex = scalarIndexByOwner.get(effect.owner);
    if (existingIndex === undefined) {
      scalarIndexByOwner.set(effect.owner, normalizedEffects.length);
      normalizedEffects.push(copyEffect(effect));
      continue;
    }

    const existingEffect = normalizedEffects[existingIndex];
    normalizedEffects[existingIndex] = {
      owner: existingEffect.owner,
      before: existingEffect.before,
      after: effect.after,
    };
  }

  return normalizedEffects.filter((effect) => !Object.is(effect.before, effect.after));
}

function shouldPreserveAuthoredEffect(effect: ExplicitTransactionEffect): boolean {
  return (
    effect.subjectId !== undefined ||
    effect.structural !== undefined ||
    effect.structuralContext !== undefined ||
    effect.subjectPositions !== undefined
  );
}

function copyEffect(
  effect: ExplicitTransactionEffect
): CausalTurn['effects'][number] {
  return {
    owner: effect.owner,
    before: effect.before,
    after: effect.after,
    subjectId: effect.subjectId,
    structural: effect.structural,
    structuralContext: effect.structuralContext,
    subjectPositions: effect.subjectPositions ? [...effect.subjectPositions] : undefined,
  };
}
