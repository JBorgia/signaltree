import type { PositionId } from '../../types';

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
