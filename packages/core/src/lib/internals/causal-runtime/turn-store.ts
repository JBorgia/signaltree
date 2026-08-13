import type { CausalEffect, CausalTurn, PositionId, TurnId } from './causal-types';

export interface ConfirmedTurnInput {
  readonly id: TurnId;
  readonly effects: readonly CausalEffect[];
}

export interface PendingTurnInput {
  readonly id: TurnId;
  readonly effects: readonly CausalEffect[];
}

export interface TurnStoreSnapshot {
  readonly turnIds: TurnId[];
  readonly positionIndex: Record<string, TurnId[]>;
  readonly frontiers: Record<string, TurnId>;
}

export class TurnStore {
  private readonly capacity: number;
  private readonly confirmedTurns = new Map<TurnId, CausalTurn>();
  private readonly pendingTurns = new Map<TurnId, CausalTurn>();
  private orderedConfirmedTurnIds: TurnId[] = [];
  private readonly positionIndex = new Map<PositionId, TurnId[]>();

  constructor(options?: { capacity?: number }) {
    this.capacity = options?.capacity ?? Number.POSITIVE_INFINITY;
  }

  admitConfirmed(turn: ConfirmedTurnInput): CausalTurn {
    const canonicalTurn: CausalTurn = {
      id: turn.id,
      effects: [...turn.effects],
      participants: this.deriveParticipants(turn.effects),
      state: 'confirmed',
    };

    this.insertConfirmed(canonicalTurn);
    return canonicalTurn;
  }

  admitPending(turn: PendingTurnInput): CausalTurn {
    const pendingTurn: CausalTurn = {
      id: turn.id,
      effects: [...turn.effects],
      participants: this.deriveParticipants(turn.effects),
      state: 'pending',
    };

    this.pendingTurns.set(pendingTurn.id, pendingTurn);
    return pendingTurn;
  }

  confirmPending(turnId: TurnId): CausalTurn | undefined {
    const pendingTurn = this.pendingTurns.get(turnId);
    if (!pendingTurn) {
      return undefined;
    }

    this.pendingTurns.delete(turnId);
    const confirmedTurn: CausalTurn = {
      ...pendingTurn,
      state: 'confirmed',
    };
    this.insertConfirmed(confirmedTurn);
    return confirmedTurn;
  }

  discardPending(turnId: TurnId): CausalTurn | undefined {
    const pendingTurn = this.pendingTurns.get(turnId);
    if (!pendingTurn) {
      return undefined;
    }

    this.pendingTurns.delete(turnId);
    return pendingTurn;
  }

  hasPendingTurn(turnId: TurnId): boolean {
    return this.pendingTurns.has(turnId);
  }

  getTurn(turnId: TurnId): CausalTurn | undefined {
    return this.confirmedTurns.get(turnId) ?? this.pendingTurns.get(turnId);
  }

  getTurns(): readonly CausalTurn[] {
    return this.orderedConfirmedTurnIds
      .map((turnId) => this.confirmedTurns.get(turnId))
      .filter((turn): turn is CausalTurn => turn !== undefined);
  }

  getPendingTurn(turnId: TurnId): CausalTurn | undefined {
    return this.pendingTurns.get(turnId);
  }

  getPendingTurns(): readonly CausalTurn[] {
    return [...this.pendingTurns.values()].sort((left, right) => left.id - right.id);
  }

  getPendingTurnIds(): readonly TurnId[] {
    return this.getPendingTurns().map(({ id }) => id);
  }

  getTurnIdsForPosition(positionId: PositionId): readonly TurnId[] {
    return [...(this.positionIndex.get(positionId) ?? [])];
  }

  getTurnsForPosition(positionId: PositionId): readonly CausalTurn[] {
    return this.getTurnIdsForPosition(positionId)
      .map((turnId) => this.confirmedTurns.get(turnId))
      .filter((turn): turn is CausalTurn => turn !== undefined);
  }

  getFrontier(positionId: PositionId): TurnId | undefined {
    const turnIds = this.positionIndex.get(positionId);
    if (!turnIds || turnIds.length === 0) {
      return undefined;
    }

    return turnIds[turnIds.length - 1];
  }

  inspect(): TurnStoreSnapshot {
    const positionIndex = Object.fromEntries(
      [...this.positionIndex.entries()].map(([positionId, turnIds]) => [
        String(positionId),
        [...turnIds],
      ])
    );

    return {
      turnIds: [...this.orderedConfirmedTurnIds],
      positionIndex,
      frontiers: Object.fromEntries(
        Object.entries(positionIndex).map(([positionId, turnIds]) => [
          positionId,
          turnIds[turnIds.length - 1],
        ])
      ),
    };
  }

  private deriveParticipants(effects: readonly CausalEffect[]): PositionId[] {
    return [...new Set(effects.map(({ owner }) => owner))];
  }

  private insertConfirmed(turn: CausalTurn): void {
    this.confirmedTurns.set(turn.id, turn);

    const insertAt = this.orderedConfirmedTurnIds.findIndex(
      (candidateTurnId) => candidateTurnId > turn.id
    );
    if (insertAt === -1) {
      this.orderedConfirmedTurnIds.push(turn.id);
    } else {
      this.orderedConfirmedTurnIds.splice(insertAt, 0, turn.id);
    }

    for (const participant of turn.participants) {
      const turnIds = this.positionIndex.get(participant) ?? [];
      const participantInsertAt = turnIds.findIndex(
        (candidateTurnId) => candidateTurnId > turn.id
      );
      if (participantInsertAt === -1) {
        turnIds.push(turn.id);
      } else {
        turnIds.splice(participantInsertAt, 0, turn.id);
      }
      this.positionIndex.set(participant, turnIds);
    }

    this.enforceCapacity();
  }

  private enforceCapacity(): void {
    while (this.orderedConfirmedTurnIds.length > this.capacity) {
      const evictedTurnId = this.orderedConfirmedTurnIds.shift();
      if (evictedTurnId === undefined) {
        return;
      }

      const evictedTurn = this.confirmedTurns.get(evictedTurnId);
      this.confirmedTurns.delete(evictedTurnId);
      if (!evictedTurn) {
        continue;
      }

      for (const participant of evictedTurn.participants) {
        const turnIds = this.positionIndex.get(participant);
        if (!turnIds) {
          continue;
        }

        const nextTurnIds = turnIds.filter((turnId) => turnId !== evictedTurnId);
        if (nextTurnIds.length === 0) {
          this.positionIndex.delete(participant);
          continue;
        }

        this.positionIndex.set(participant, nextTurnIds);
      }
    }
  }
}
