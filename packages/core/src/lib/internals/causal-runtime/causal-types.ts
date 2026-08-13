import type { PositionId, StructuralHistoryEffect } from '../../types';

export type { PositionId };

export type TurnId = number;
export type TurnState = 'pending' | 'confirmed';
export type StructuralEffect = 'add' | 'remove' | 'rekey';

export interface CausalEffect {
  readonly owner: PositionId;
  readonly before: unknown;
  readonly after: unknown;
  readonly subjectId?: unknown;
  readonly structural?: StructuralEffect;
  /**
   * Producer-authored structural information required to realize this
   * existence transition after the original mutation context is gone.
   *
   * This is durable canonical history. It is an authored structural snapshot,
   * not the current contextual subject state; planners derive that separately
   * as `subjectState` when realizing undo/redo.
   */
  readonly structuralContext?: StructuralHistoryEffect;
  // Structural coverage for an authored existence transition. These positions may
  // supply payload needed to physically realize add/remove without becoming
  // independent value participants in the turn.
  readonly subjectPositions?: readonly PositionId[];
}

export interface CausalTurn {
  readonly id: TurnId;
  readonly effects: readonly CausalEffect[];
  readonly participants: readonly PositionId[];
  readonly state: TurnState;
}

export interface ReversalEffect {
  readonly owner: PositionId;
  readonly before: unknown;
  readonly after: unknown;
  readonly subjectId?: unknown;
  readonly structural?: StructuralEffect;
  /** Durable structural recipe carried from canonical history into realization. */
  readonly structuralContext?: StructuralHistoryEffect;
  // Structural coverage carried forward so reversal can reconstruct the physical
  // subject boundary at the structural effect boundary.
  readonly subjectPositions?: readonly PositionId[];
  readonly subjectState?: Readonly<Record<string, unknown>>;
}

export interface ConfirmedReversalPlan {
  readonly turnId: TurnId;
  readonly effects: readonly ReversalEffect[];
}

export interface ConfirmedReapplyPlan {
  readonly turnId: TurnId;
  readonly effects: readonly ReversalEffect[];
}

export type ReversalRefusal =
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
  | { readonly kind: 'history-evicted' }
  | { readonly kind: 'dependency-conflict' }
  | { readonly kind: 'structural-drift' }
  | { readonly kind: 'not-found' };

export type ReversalResult<
  TRefusal extends ReversalRefusal = ReversalRefusal,
> =
  | { readonly ok: true; readonly turnId: TurnId }
  | { readonly ok: false; readonly refusal: TRefusal };
