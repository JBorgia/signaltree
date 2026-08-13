import type { PositionId, TurnId, CausalTurn } from './causal-types';

import type { AppliedHistory } from './applied-history';
import type { TurnStore } from './turn-store';

export interface RealizationContext {
  getCurrentValue(positionId: PositionId): unknown;
  getValueWithoutConfirmedTurn(turnId: TurnId, positionId: PositionId): unknown;
  getValueWithoutPendingTurn(turnId: TurnId, positionId: PositionId): unknown;
}

export interface RealizationContextSource extends RealizationContext {
  retainEvictedConfirmedTurn(turn: CausalTurn): void;
}

export interface CreateRealizationContextSourceOptions {
  readonly baselineValues?: ReadonlyMap<PositionId, unknown>;
  readonly store: Pick<TurnStore, 'getTurn' | 'getPendingTurns'>;
  readonly appliedHistory: Pick<AppliedHistory, 'forgetRetainedTurn' | 'getAppliedTurnIds'>;
  readonly getOverlayValues?: () => ReadonlyMap<PositionId, unknown>;
}

class ProjectionRealizationContextSource implements RealizationContextSource {
  private readonly baselineValues = new Map<PositionId, unknown>();

  constructor(private readonly options: CreateRealizationContextSourceOptions) {
    for (const [positionId, value] of options.baselineValues ?? []) {
      this.baselineValues.set(positionId, value);
    }
  }

  getCurrentValue(positionId: PositionId): unknown {
    return this.computeValues().get(positionId);
  }

  getValueWithoutConfirmedTurn(turnId: TurnId, positionId: PositionId): unknown {
    return this.computeValues(turnId).get(positionId);
  }

  getValueWithoutPendingTurn(turnId: TurnId, positionId: PositionId): unknown {
    return this.computeValues(undefined, turnId).get(positionId);
  }

  retainEvictedConfirmedTurn(turn: CausalTurn): void {
    const disposition = this.options.appliedHistory.forgetRetainedTurn(turn.id);
    if (!disposition.wasApplied) {
      return;
    }

    for (const effect of turn.effects) {
      this.baselineValues.set(effect.owner, effect.after);
    }
  }

  private computeValues(
    excludingConfirmedTurnId?: TurnId,
    excludingPendingTurnId?: TurnId
  ): Map<PositionId, unknown> {
    const values = new Map(this.baselineValues);
    const activeConfirmedTurns = this.options.appliedHistory
      .getAppliedTurnIds()
      .filter((turnId) => turnId !== excludingConfirmedTurnId)
      .map((turnId) => this.options.store.getTurn(turnId))
      .filter((turn): turn is CausalTurn => turn !== undefined);
    const activePendingTurns = this.options.store
      .getPendingTurns()
      .filter((turn) => turn.id !== excludingPendingTurnId);
    const activeTurns = [...activeConfirmedTurns, ...activePendingTurns].sort(
      (left, right) => left.id - right.id
    );

    for (const turn of activeTurns) {
      for (const effect of turn.effects) {
        values.set(effect.owner, effect.after);
      }
    }

    for (const [positionId, value] of this.options.getOverlayValues?.() ?? []) {
      values.set(positionId, value);
    }

    return values;
  }
}

export function createRealizationContextSource(
  options: CreateRealizationContextSourceOptions
): RealizationContextSource {
  return new ProjectionRealizationContextSource(options);
}
