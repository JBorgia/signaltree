import type { PositionRegistry } from '../position-registry';

import type { PositionId, ReversalEffect, ReversalResult, TurnId, CausalTurn } from './causal-types';
import type { EffectApplicationPort } from './effect-applier';
import type { RealizationContext } from './realization-context';
import type {
  PreparePendingTurnDiscardResult,
  PreparedPendingTurnDiscard,
  TurnStore,
} from './turn-store';

export type RollbackPendingResult = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'dependency-conflict' }
  | { readonly kind: 'history-evicted' }
  | { readonly kind: 'structural-drift' }
>;

export interface PendingRollbackPort extends EffectApplicationPort {
  validateEffects?(
    effects: readonly ReversalEffect[]
  ): Extract<RollbackPendingResult, { readonly ok: false }>['refusal'] | undefined;
}

export interface RollbackPendingTurnAtOptions {
  readonly authority: PositionId;
  readonly turnId: TurnId;
  readonly store: Pick<
    TurnStore,
    | 'commitPreparedDiscardPending'
    | 'getPendingTurn'
    | 'getPendingTurns'
    | 'getTurns'
    | 'prepareDiscardPendingTurn'
  >;
  readonly topology: Pick<PositionRegistry, 'contains'>;
  readonly port: PendingRollbackPort;
  readonly realizationContext: RealizationContext;
  readonly onMaintenanceMayBeUseful?: (turn: CausalTurn) => void;
  readonly reportMaintenanceObserverError?: (error: unknown, turn: CausalTurn) => void;
  readonly onPendingTurnDiscarded?: (turn: CausalTurn) => void;
  readonly reportDiscardObserverError?: (error: unknown, turn: CausalTurn) => void;
}

export function rollbackPendingTurnAt(
  options: RollbackPendingTurnAtOptions
): RollbackPendingResult {
  const turn = options.store.getPendingTurn(options.turnId);
  if (!turn) {
    return { ok: false, refusal: { kind: 'history-evicted' } };
  }

  if (
    !turn.participants.every((participant) =>
      options.topology.contains(options.authority, participant)
    )
  ) {
    return { ok: false, refusal: { kind: 'outside-boundary' } };
  }

  if (hasLaterStructuralDependency(turn, options.store)) {
    return { ok: false, refusal: { kind: 'dependency-conflict' } };
  }

  const effects = createPendingRollbackEffects(turn, options.realizationContext);
  const validationRefusal = options.port.validateEffects?.(effects);
  if (validationRefusal) {
    return { ok: false, refusal: validationRefusal };
  }

  const transition = options.store.prepareDiscardPendingTurn(turn.id);
  if (!transition.ok) {
    return mapDiscardFailure(transition);
  }

  options.port.applyAtomically(effects);
  const discardedTurn = options.store.commitPreparedDiscardPending(
    transition.transition
  );

  const maintenanceObserver =
    options.onMaintenanceMayBeUseful ?? options.onPendingTurnDiscarded;
  const maintenanceErrorObserver =
    options.reportMaintenanceObserverError ?? options.reportDiscardObserverError;

  if (discardedTurn && maintenanceObserver) {
    try {
      maintenanceObserver(discardedTurn);
    } catch (error) {
      if (maintenanceErrorObserver) {
        maintenanceErrorObserver(error, discardedTurn);
      } else {
        queueMicrotask(() => {
          throw normalizeError(error);
        });
      }
    }
  }

  return { ok: true, turnId: turn.id };
}

function createPendingRollbackEffects(
  turn: CausalTurn,
  realizationContext: RealizationContext
): readonly ReversalEffect[] {
  const dominantStructuralEffectsBySubject = new Map<unknown, CausalTurn['effects'][number]>();
  for (const effect of turn.effects) {
    if (
      effect.subjectId !== undefined &&
      (effect.structural === 'add' || effect.structural === 'remove')
    ) {
      dominantStructuralEffectsBySubject.set(effect.subjectId, effect);
    }
  }

  const firstEffectIndexByOwner = new Map<PositionId, number>();
  turn.effects.forEach((effect, index) => {
    if (!firstEffectIndexByOwner.has(effect.owner)) {
      firstEffectIndexByOwner.set(effect.owner, index);
    }
  });

  return turn.effects
    .filter(
      (effect, index) => {
        if (effect.subjectId !== undefined) {
          const dominantStructuralEffect = dominantStructuralEffectsBySubject.get(
            effect.subjectId
          );
          if (dominantStructuralEffect) {
            return dominantStructuralEffect === effect;
          }
        }

        return firstEffectIndexByOwner.get(effect.owner) === index;
      }
    )
    .map((effect) =>
      createPendingRollbackEffect(effect, turn.id, realizationContext, turn)
    )
    .filter((effect) => effect.before !== effect.after);
}

function createPendingRollbackEffect(
  effect: CausalTurn['effects'][number],
  turnId: TurnId,
  realizationContext: RealizationContext,
  turn: CausalTurn
): ReversalEffect {
  const structural = deriveCompensationStructuralEffect(effect.structural);

  if (effect.structural !== undefined) {
    return {
      owner: effect.owner,
      before: deriveStructuralRollbackBefore(effect),
      after: deriveStructuralRollbackAfter(effect),
      subjectId: effect.subjectId,
      structural,
      structuralContext: effect.structuralContext,
      subjectState: deriveSubjectState(turn, effect, turnId, realizationContext),
    };
  }

  return {
    owner: effect.owner,
    before: realizationContext.getCurrentValue(effect.owner),
    after: realizationContext.getValueWithoutPendingTurn(turnId, effect.owner),
    subjectId: effect.subjectId,
    structural,
    structuralContext: effect.structuralContext,
    subjectState: deriveSubjectState(turn, effect, turnId, realizationContext),
  };
}

function deriveStructuralRollbackBefore(
  effect: CausalTurn['effects'][number]
): unknown {
  switch (effect.structural) {
    case 'add':
    case 'rekey':
      return effect.after;
    case 'remove':
      return effect.after;
    default:
      return effect.before;
  }
}

function deriveStructuralRollbackAfter(
  effect: CausalTurn['effects'][number]
): unknown {
  switch (effect.structural) {
    case 'add':
      return effect.before;
    case 'remove':
    case 'rekey':
      return effect.before;
    default:
      return effect.after;
  }
}

function deriveSubjectState(
  turn: CausalTurn,
  effect: CausalTurn['effects'][number],
  turnId: TurnId,
  realizationContext: RealizationContext
): Readonly<Record<string, unknown>> | undefined {
  if (effect.structural !== 'remove' || !effect.subjectPositions) {
    return undefined;
  }

  const entries = effect.subjectPositions
    .filter((positionId) => positionId !== effect.owner)
    .map((positionId) => [
      String(positionId),
      realizationContext.getValueWithoutPendingTurn(turnId, positionId),
    ] as const)
    .filter((entry) => entry[1] !== undefined);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function hasLaterStructuralDependency(
  pendingTurn: CausalTurn,
  store: Pick<TurnStore, 'getPendingTurns' | 'getTurns'>
): boolean {
  const laterTurns = [...store.getTurns(), ...store.getPendingTurns()].filter(
    (turn) => turn.id > pendingTurn.id
  );

  return pendingTurn.effects.some((pendingEffect) => {
    if (!pendingEffect.structural || !pendingEffect.subjectId) {
      return false;
    }

    if (pendingEffect.structural === 'add') {
      return laterTurns.some((turn) =>
        turn.effects.some((effect) => effect.subjectId === pendingEffect.subjectId)
      );
    }

    const restoredStructuralResource = getRestoredStructuralResource(pendingEffect);
    if (
      restoredStructuralResource !== undefined &&
      laterTurns.some((turn) =>
        turn.effects.some(
          (effect) => getAcquiredStructuralResource(effect) === restoredStructuralResource
        )
      )
    ) {
      return true;
    }

    return laterTurns.some((turn) =>
      turn.effects.some(
        (effect) =>
          effect.subjectId === pendingEffect.subjectId && effect.structural !== undefined
      )
    );
  });
}

function getRestoredStructuralResource(
  effect: CausalTurn['effects'][number]
): unknown {
  switch (effect.structural) {
    case 'remove':
    case 'rekey':
      return effect.before;
    default:
      return undefined;
  }
}

function getAcquiredStructuralResource(
  effect: CausalTurn['effects'][number]
): unknown {
  switch (effect.structural) {
    case 'add':
    case 'rekey':
      return effect.after;
    default:
      return undefined;
  }
}

function deriveCompensationStructuralEffect(
  structural: CausalTurn['effects'][number]['structural']
): CausalTurn['effects'][number]['structural'] {
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

function mapDiscardFailure(
  result: Extract<PreparePendingTurnDiscardResult, { readonly ok: false }>
): RollbackPendingResult {
  if (result.reason === 'history-evicted') {
    return { ok: false, refusal: { kind: 'history-evicted' } };
  }

  return { ok: false, refusal: { kind: 'history-evicted' } };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
