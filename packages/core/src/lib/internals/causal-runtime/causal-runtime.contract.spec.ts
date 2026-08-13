/**
 * Executable semantic reference model for the future causal kernel.
 * This harness is intentionally not an implementation blueprint and should
 * prefer clarity over runtime complexity.
 */
import type {
  CausalEffect,
  CausalTurn,
  PositionId,
  ReversalEffect,
  ReversalResult,
  TurnState,
} from './causal-types';
import { TurnStore } from './turn-store';

type UndoAssessment =
  | 'eligible'
  | 'outside-boundary'
  | 'frontier-blocked'
  | 'history-evicted';

type RedoAssessment =
  | 'eligible'
  | 'outside-boundary'
  | 'prefix-blocked'
  | 'history-evicted';

type UndoResult = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'frontier-blocked' }
  | { readonly kind: 'history-evicted' }
>;

type RedoResult = ReversalResult<
  | { readonly kind: 'outside-boundary' }
  | { readonly kind: 'prefix-blocked' }
  | { readonly kind: 'history-evicted' }
>;

type RollbackResult = ReversalResult<
  | { readonly kind: 'dependency-conflict' }
  | { readonly kind: 'history-evicted' }
>;

interface RuntimeSnapshot {
  values: Record<string, unknown>;
  confirmedTurnIds: number[];
  appliedTurnIds: number[];
  pendingTurnIds: number[];
  redoTurnIds: number[];
  frontiers: Record<string, number>;
  positionIndex: Record<string, number[]>;
}

interface KernelStateSnapshot {
  values: Record<string, unknown>;
  canonicalTurnIds: number[];
  canonicalPositionIndex: Record<string, number[]>;
  canonicalFrontiers: Record<string, number>;
  appliedTurnIds: number[];
  redoTurnIds: number[];
  appliedFrontiers: Record<string, number>;
  appliedPositionIndex: Record<string, number[]>;
}

interface UndoConfirmedOperationOptions {
  refusalAfterPlanning?: UndoResult['refusal'];
  failPhysicalApplicationWith?: Error;
  onApplyAtomically?: (effects: readonly ReversalEffect[]) => void;
}

interface RedoConfirmedOperationOptions {
  refusalAfterPlanning?: RedoResult['refusal'];
  failPhysicalApplicationWith?: Error;
  onApplyAtomically?: (effects: readonly ReversalEffect[]) => void;
}

class ContractRuntime {
  private readonly rootValues: Record<string, unknown>;
  private readonly parentByPosition: Partial<Record<PositionId, PositionId>>;
  private readonly capacity: number;

  private nextTurnId = 1;
  private baselineValues: Record<string, unknown>;
  private currentValues: Record<string, unknown>;
  private uncapturedValues: Record<string, unknown> = {};
  private confirmedTurns: CausalTurn[] = [];
  private appliedTurnIds: number[] = [];
  private pendingTurns: CausalTurn[] = [];
  private redoTurns: CausalTurn[] = [];
  private frontiers: Record<string, number> = {};
  private positionIndex: Record<string, number[]> = {};

  constructor(options: {
    values?: Record<string, unknown>;
    parentByPosition: Partial<Record<PositionId, PositionId>>;
    capacity?: number;
  }) {
    this.rootValues = { ...(options.values ?? {}) };
    this.baselineValues = { ...this.rootValues };
    this.currentValues = { ...this.rootValues };
    this.parentByPosition = options.parentByPosition;
    this.capacity = options.capacity ?? Number.POSITIVE_INFINITY;
  }

  confirmTurn(effects: readonly CausalEffect[]): CausalTurn {
    const turn = this.createTurn(effects, 'confirmed');
    this.confirmedTurns.push(turn);
    this.appliedTurnIds.push(turn.id);
    if (this.redoTurns.length > 0) {
      this.invalidateOverlappingRedoTurns(turn.participants);
    }

    this.enforceCapacity();
    this.recomputeDerivedState();
    return turn;
  }

  addPendingTurn(effects: readonly CausalEffect[]): CausalTurn {
    const turn = this.createTurn(effects, 'pending');
    this.pendingTurns.push(turn);
    this.recomputeDerivedState();
    return turn;
  }

  applyUncapturedMutation(owner: PositionId, after: unknown): void {
    this.uncapturedValues[owner] = after;
    this.recomputeDerivedState();
  }

  assessUndo(authority: PositionId, turnId: number): UndoAssessment {
    const turn = this.confirmedTurns.find(({ id }) => id === turnId);
    if (!turn) {
      return 'history-evicted';
    }

    const intersectsAuthority = turn.participants.some((participant) =>
      this.isContainedWithin(authority, participant)
    );
    if (!intersectsAuthority) {
      return 'outside-boundary';
    }

    const fullyContained = turn.participants.every((participant) =>
      this.isContainedWithin(authority, participant)
    );
    if (!fullyContained) {
      return 'outside-boundary';
    }

    const atFrontier = turn.participants.every(
      (participant) => this.frontiers[participant] === turn.id
    );
    if (!atFrontier) {
      return 'frontier-blocked';
    }

    return 'eligible';
  }

  undoAt(authority: PositionId): UndoResult {
    const latestIntersectingTurn = [...this.appliedTurnIds]
      .reverse()
      .map((turnId) => this.confirmedTurns.find(({ id }) => id === turnId))
      .find((turn) =>
        turn !== undefined &&
        turn.participants.some((participant) =>
          this.isContainedWithin(authority, participant)
        )
      );

    if (!latestIntersectingTurn) {
      return { ok: false, refusal: { kind: 'outside-boundary' } };
    }

    const assessment = this.assessUndo(authority, latestIntersectingTurn.id);
    if (assessment !== 'eligible') {
      return { ok: false, refusal: { kind: assessment } };
    }

    this.removeAppliedTurn(latestIntersectingTurn.id);
    this.redoTurns.push(latestIntersectingTurn);
    this.recomputeDerivedState();
    return { ok: true, turnId: latestIntersectingTurn.id };
  }

  assessRedo(authority: PositionId, turnId: number): RedoAssessment {
    const turn = this.confirmedTurns.find(({ id }) => id === turnId);
    if (!turn) {
      return 'history-evicted';
    }

    const isRedoable = this.redoTurns.some(({ id }) => id === turnId);
    if (!isRedoable) {
      return 'history-evicted';
    }

    const intersectsAuthority = turn.participants.some((participant) =>
      this.isContainedWithin(authority, participant)
    );
    if (!intersectsAuthority) {
      return 'outside-boundary';
    }

    const fullyContained = turn.participants.every((participant) =>
      this.isContainedWithin(authority, participant)
    );
    if (!fullyContained) {
      return 'outside-boundary';
    }

    const restoresValidPrefix = turn.participants.every(
      (participant) => this.getFirstUnappliedTurnIdForParticipant(participant) === turn.id
    );
    if (!restoresValidPrefix) {
      return 'prefix-blocked';
    }

    return 'eligible';
  }

  redoConfirmedOperation(
    authority: PositionId,
    turnId: number,
    options?: RedoConfirmedOperationOptions
  ): RedoResult {
    const assessment = this.assessRedo(authority, turnId);
    if (assessment !== 'eligible') {
      return { ok: false, refusal: { kind: assessment } };
    }

    const turn = this.confirmedTurns.find(({ id }) => id === turnId);
    if (!turn) {
      return { ok: false, refusal: { kind: 'history-evicted' } };
    }

    const reapplyEffects = this.createConfirmedReapplyEffects(turn);

    if (options?.refusalAfterPlanning) {
      return { ok: false, refusal: options.refusalAfterPlanning };
    }

    options?.onApplyAtomically?.(reapplyEffects);
    if (options?.failPhysicalApplicationWith) {
      throw options.failPhysicalApplicationWith;
    }

    this.redoTurns = this.redoTurns.filter((turn) => turn.id !== turnId);
    this.insertAppliedTurn(turnId);
    this.recomputeDerivedState();
    return { ok: true, turnId };
  }

  undoConfirmedOperation(
    authority: PositionId,
    options?: UndoConfirmedOperationOptions
  ): UndoResult {
    const latestIntersectingTurn = [...this.appliedTurnIds]
      .reverse()
      .map((turnId) => this.confirmedTurns.find(({ id }) => id === turnId))
      .find(
        (turn) =>
          turn !== undefined &&
          turn.participants.some((participant) =>
            this.isContainedWithin(authority, participant)
          )
      );

    if (!latestIntersectingTurn) {
      return { ok: false, refusal: { kind: 'outside-boundary' } };
    }

    const assessment = this.assessUndo(authority, latestIntersectingTurn.id);
    if (assessment !== 'eligible') {
      return { ok: false, refusal: { kind: assessment } };
    }

    const reversalEffects = this.createConfirmedReversalEffects(
      latestIntersectingTurn
    );

    if (options?.refusalAfterPlanning) {
      return { ok: false, refusal: options.refusalAfterPlanning };
    }

    options?.onApplyAtomically?.(reversalEffects);
    if (options?.failPhysicalApplicationWith) {
      throw options.failPhysicalApplicationWith;
    }

    this.removeAppliedTurn(latestIntersectingTurn.id);
    this.redoTurns.push(latestIntersectingTurn);
    this.recomputeDerivedState();
    return { ok: true, turnId: latestIntersectingTurn.id };
  }

  rollback(turnId: number): RollbackResult {
    const turn = this.pendingTurns.find(({ id }) => id === turnId);
    if (!turn) {
      return { ok: false, refusal: { kind: 'history-evicted' } };
    }

    if (this.hasLaterStructuralDependency(turn)) {
      return { ok: false, refusal: { kind: 'dependency-conflict' } };
    }

    this.pendingTurns = this.pendingTurns.filter(({ id }) => id !== turn.id);
    this.recomputeDerivedState();
    return { ok: true, turnId: turn.id };
  }

  inspect(): RuntimeSnapshot {
    return {
      values: { ...this.currentValues },
      confirmedTurnIds: this.confirmedTurns.map(({ id }) => id),
      appliedTurnIds: [...this.appliedTurnIds],
      pendingTurnIds: this.pendingTurns.map(({ id }) => id),
      redoTurnIds: this.redoTurns.map(({ id }) => id),
      frontiers: { ...this.frontiers },
      positionIndex: Object.fromEntries(
        Object.entries(this.positionIndex).map(([position, turnIds]) => [
          position,
          [...turnIds],
        ])
      ),
    };
  }

  private createTurn(
    effects: readonly CausalEffect[],
    state: TurnState
  ): CausalTurn {
    return {
      id: this.nextTurnId++,
      effects: [...effects],
      participants: [...new Set(effects.map(({ owner }) => owner))],
      state,
    };
  }

  private createConfirmedReversalEffects(
    turn: CausalTurn
  ): readonly ReversalEffect[] {
    return [...turn.effects]
      .reverse()
      .map(({ owner, before, after }) => ({
        owner,
        before: after,
        after: before,
      }));
  }

  private createConfirmedReapplyEffects(
    turn: CausalTurn
  ): readonly ReversalEffect[] {
    return turn.effects.map(({ owner, before, after }) => ({
      owner,
      before,
      after,
    }));
  }

  private enforceCapacity(): void {
    while (this.confirmedTurns.length > this.capacity) {
      const evictedTurn = this.confirmedTurns.shift();
      if (!evictedTurn) {
        return;
      }

      for (const effect of evictedTurn.effects) {
        this.baselineValues[effect.owner] = effect.after;
      }

      this.removeAppliedTurn(evictedTurn.id);
      this.redoTurns = this.redoTurns.filter(({ id }) => id !== evictedTurn.id);
    }
  }

  private getFirstUnappliedTurnIdForParticipant(
    participant: PositionId
  ): number | undefined {
    return this.confirmedTurns.find(
      (turn) =>
        turn.participants.includes(participant) &&
        !this.appliedTurnIds.includes(turn.id)
    )?.id;
  }

  private insertAppliedTurn(turnId: number): void {
    if (this.appliedTurnIds.includes(turnId)) {
      return;
    }

    const insertionIndex = this.appliedTurnIds.findIndex(
      (appliedTurnId) => appliedTurnId > turnId
    );

    if (insertionIndex === -1) {
      this.appliedTurnIds.push(turnId);
      return;
    }

    this.appliedTurnIds.splice(insertionIndex, 0, turnId);
  }

  private recomputeDerivedState(): void {
    const values = { ...this.baselineValues };
    const activeConfirmedTurns = this.appliedTurnIds
      .map((turnId) => this.confirmedTurns.find(({ id }) => id === turnId))
      .filter((turn): turn is CausalTurn => turn !== undefined);
    const activeTurns = [...activeConfirmedTurns, ...this.pendingTurns].sort(
      (left, right) => left.id - right.id
    );

    for (const turn of activeTurns) {
      for (const effect of turn.effects) {
        values[effect.owner] = effect.after;
      }
    }

    for (const [owner, value] of Object.entries(this.uncapturedValues)) {
      values[owner] = value;
    }

    this.currentValues = values;
    this.frontiers = {};
    this.positionIndex = {};

    for (const turn of activeConfirmedTurns) {
      for (const participant of turn.participants) {
        this.frontiers[participant] = turn.id;
        this.positionIndex[participant] ??= [];
        this.positionIndex[participant].push(turn.id);
      }
    }
  }

  private isContainedWithin(authority: PositionId, participant: PositionId): boolean {
    let current: PositionId | undefined = participant;

    while (current) {
      if (current === authority) {
        return true;
      }

      current = this.parentByPosition[current];
    }

    return false;
  }

  private hasLaterStructuralDependency(pendingTurn: CausalTurn): boolean {
    const laterConfirmedTurns = this.confirmedTurns.filter(
      ({ id }) => id > pendingTurn.id
    );

    return pendingTurn.effects.some((pendingEffect) => {
      if (!pendingEffect.structural || !pendingEffect.subjectId) {
        return false;
      }

      return laterConfirmedTurns.some((turn) =>
        turn.effects.some(
          (effect) =>
            effect.subjectId === pendingEffect.subjectId &&
            effect.structural !== undefined
        )
      );
    });
  }

  private removeAppliedTurn(turnId: number): void {
    const index = this.appliedTurnIds.indexOf(turnId);
    if (index !== -1) {
      this.appliedTurnIds.splice(index, 1);
    }
  }

  private invalidateOverlappingRedoTurns(
    participants: readonly PositionId[]
  ): void {
    const participantSet = new Set(participants);

    this.redoTurns = this.redoTurns.filter(
      (turn) =>
        !turn.participants.some((participant) => participantSet.has(participant))
    );
  }
}

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;
const P_LAST_NAME = 4 as PositionId;
const P_SETTINGS = 5 as PositionId;
const P_THEME = 6 as PositionId;
const P_ENTITY_KEY = 7 as PositionId;
const P_ENTITY_NAME = 8 as PositionId;
const P_NOTIFICATIONS = 9 as PositionId;
const SUBJECT_DRIVER = 'SUBJECT_DRIVER';

const parentByPosition: Partial<Record<PositionId, PositionId>> = {
  [P_PROFILE]: P_ROOT,
  [P_FIRST_NAME]: P_PROFILE,
  [P_LAST_NAME]: P_PROFILE,
  [P_SETTINGS]: P_ROOT,
  [P_THEME]: P_SETTINGS,
  [P_ENTITY_KEY]: P_ROOT,
  [P_ENTITY_NAME]: P_ROOT,
};

const createRuntime = (
  values?: Record<string, unknown>,
  capacity?: number
): ContractRuntime =>
  new ContractRuntime({
    values,
    parentByPosition,
    capacity,
  });

const expectRefusalToBeNeutral = <T>(
  runtime: ContractRuntime,
  attempt: () => T
): T => {
  const before = runtime.inspect();
  const result = attempt();
  expect(runtime.inspect()).toEqual(before);
  return result;
};

const snapshotKernelState = (
  runtime: ContractRuntime,
  store: TurnStore
): KernelStateSnapshot => {
  const runtimeSnapshot = runtime.inspect();
  const storeSnapshot = store.inspect();

  return {
    values: runtimeSnapshot.values,
    canonicalTurnIds: storeSnapshot.turnIds,
    canonicalPositionIndex: storeSnapshot.positionIndex,
    canonicalFrontiers: storeSnapshot.frontiers,
    appliedTurnIds: runtimeSnapshot.appliedTurnIds,
    redoTurnIds: runtimeSnapshot.redoTurnIds,
    appliedFrontiers: runtimeSnapshot.frontiers,
    appliedPositionIndex: runtimeSnapshot.positionIndex,
  };
};

const expectKernelStateToRemainNeutral = <T>(
  runtime: ContractRuntime,
  store: TurnStore,
  attempt: () => T
): T => {
  const before = snapshotKernelState(runtime, store);
  const result = attempt();
  expect(snapshotKernelState(runtime, store)).toEqual(before);
  return result;
};

const expectConfirmedStoreToMatchRuntime = (
  runtime: ContractRuntime,
  store: TurnStore
): void => {
  const snapshot = runtime.inspect();

  expect(store.inspect()).toEqual({
    turnIds: snapshot.confirmedTurnIds,
    positionIndex: snapshot.positionIndex,
    frontiers: snapshot.frontiers,
  });
};

describe('CausalRuntime contract', () => {
  it('derives explicit participants from effect owners only', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });
    const store = new TurnStore();

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    expect(turn.participants).toEqual([P_FIRST_NAME]);
    expect(turn.participants).not.toContain(P_PROFILE);
    expect(turn.participants).not.toContain(P_ROOT);
    expectConfirmedStoreToMatchRuntime(runtime, store);
  });

  it('treats a cross-position turn as atomic under authority containment', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);

    expectRefusalToBeNeutral(runtime, () => {
      expect(runtime.undoAt(P_PROFILE)).toEqual({
        ok: false,
        refusal: { kind: 'outside-boundary' },
      });
    });

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: turn.id,
    });
    expect(runtime.inspect().values).toEqual({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
  });

  it('does not skip a blocked latest turn to undo an earlier contained turn', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_LAST_NAME]: 'Lovelace',
      [P_THEME]: 'light',
    });

    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
      {
        owner: P_LAST_NAME,
        before: 'Lovelace',
        after: 'Hopper',
      },
    ]);
    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Katherine',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);

    expectRefusalToBeNeutral(runtime, () => {
      expect(runtime.undoAt(P_PROFILE)).toEqual({
        ok: false,
        refusal: { kind: 'outside-boundary' },
      });
    });
  });

  it('keeps confirmed history prefix-closed per participating position', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_LAST_NAME]: 'Lovelace',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Katherine',
      },
      {
        owner: P_LAST_NAME,
        before: 'Lovelace',
        after: 'Hopper',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });
    const t3 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Katherine',
        after: 'Joan',
      },
    ]);
    store.admitConfirmed({
      id: t3.id,
      effects: t3.effects,
    });

    expect(t1.id).toBe(1);
    expect(t2.id).toBe(2);
    expect(t3.id).toBe(3);

    expectRefusalToBeNeutral(runtime, () => {
      expect(runtime.assessUndo(P_PROFILE, t2.id)).toBe('frontier-blocked');
    });

    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 'Joan',
        [P_LAST_NAME]: 'Hopper',
      },
      confirmedTurnIds: [1, 2, 3],
      appliedTurnIds: [1, 2, 3],
      pendingTurnIds: [],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 3,
        [P_LAST_NAME]: 2,
      },
      positionIndex: {
        [P_FIRST_NAME]: [1, 2, 3],
        [P_LAST_NAME]: [2],
      },
    });
    expectConfirmedStoreToMatchRuntime(runtime, store);
  });

  it('treats frontier eligibility as independent from containment', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);
    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Katherine',
      },
    ]);

    expect(runtime.assessUndo(P_ROOT, turn.id)).toBe('frontier-blocked');
  });

  it('rolls back a pending scalar turn without erasing legitimate later confirmed work', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'A',
    });

    const pendingTurn = runtime.addPendingTurn([
      {
        owner: P_FIRST_NAME,
        before: 'A',
        after: 'B',
      },
    ]);

    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'B',
        after: 'C',
      },
    ]);

    expect(runtime.rollback(pendingTurn.id)).toEqual({
      ok: true,
      turnId: pendingTurn.id,
    });
    expect(runtime.inspect().values).toEqual({
      [P_FIRST_NAME]: 'C',
    });
  });

  it('allows scalar follow-up after a pending rekey but refuses later structural dependency', () => {
    const rollbackAllowed = createRuntime({
      [P_ENTITY_KEY]: 'driver-1',
      [P_ENTITY_NAME]: 'Alice',
    });

    const pendingRekey = rollbackAllowed.addPendingTurn([
      {
        owner: P_ENTITY_KEY,
        before: 'driver-1',
        after: 'driver-2',
        subjectId: SUBJECT_DRIVER,
        structural: 'rekey',
      },
    ]);

    rollbackAllowed.confirmTurn([
      {
        owner: P_ENTITY_NAME,
        before: 'Alice',
        after: 'Alicia',
        subjectId: SUBJECT_DRIVER,
      },
    ]);

    expect(rollbackAllowed.rollback(pendingRekey.id)).toEqual({
      ok: true,
      turnId: pendingRekey.id,
    });
    expect(rollbackAllowed.inspect().values).toEqual({
      [P_ENTITY_KEY]: 'driver-1',
      [P_ENTITY_NAME]: 'Alicia',
    });

    const rollbackRefused = createRuntime({
      [P_ENTITY_KEY]: 'driver-1',
    });

    const blockedPendingRekey = rollbackRefused.addPendingTurn([
      {
        owner: P_ENTITY_KEY,
        before: 'driver-1',
        after: 'driver-2',
        subjectId: SUBJECT_DRIVER,
        structural: 'rekey',
      },
    ]);

    rollbackRefused.confirmTurn([
      {
        owner: P_ENTITY_KEY,
        before: 'driver-2',
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: 'remove',
      },
    ]);

    expectRefusalToBeNeutral(rollbackRefused, () => {
      expect(rollbackRefused.rollback(blockedPendingRekey.id)).toEqual({
        ok: false,
        refusal: { kind: 'dependency-conflict' },
      });
    });
  });

  it('keeps uncaptured mutations outside the causal turn boundary', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
    const store = new TurnStore();

    runtime.applyUncapturedMutation(P_THEME, 'dark');

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 'Grace',
        [P_THEME]: 'dark',
      },
      confirmedTurnIds: [turn.id],
      appliedTurnIds: [turn.id],
      pendingTurnIds: [],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: turn.id,
      },
      positionIndex: {
        [P_FIRST_NAME]: [turn.id],
      },
    });
    expectConfirmedStoreToMatchRuntime(runtime, store);

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: turn.id,
    });
    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 'Ada',
        [P_THEME]: 'dark',
      },
      confirmedTurnIds: [turn.id],
      appliedTurnIds: [],
      pendingTurnIds: [],
      redoTurnIds: [turn.id],
      frontiers: {},
      positionIndex: {},
    });
  });

  it('evicts retained history by whole canonical turn and clears dangling index entries', () => {
    const runtime = createRuntime(
      {
        [P_FIRST_NAME]: 0,
        [P_THEME]: 0,
      },
      2
    );
    const store = new TurnStore({ capacity: 2 });

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 0,
        after: 1,
      },
      {
        owner: P_THEME,
        before: 0,
        after: 1,
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_THEME,
        before: 1,
        after: 2,
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });
    const t3 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 1,
        after: 3,
      },
    ]);
    store.admitConfirmed({
      id: t3.id,
      effects: t3.effects,
    });

    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 3,
        [P_THEME]: 2,
      },
      confirmedTurnIds: [2, 3],
      appliedTurnIds: [2, 3],
      pendingTurnIds: [],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 3,
        [P_THEME]: 2,
      },
      positionIndex: {
        [P_THEME]: [2],
        [P_FIRST_NAME]: [3],
      },
    });
    expectConfirmedStoreToMatchRuntime(runtime, store);
  });

  it('truncates redo by canonical turn when new confirmed work lands after undo', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 0,
      [P_THEME]: 0,
    });

    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 0,
        after: 1,
      },
    ]);
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 1,
        after: 2,
      },
      {
        owner: P_THEME,
        before: 0,
        after: 2,
      },
    ]);

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t2.id,
    });
    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 0,
      },
      confirmedTurnIds: [1, 2],
      appliedTurnIds: [1],
      pendingTurnIds: [],
      redoTurnIds: [t2.id],
      frontiers: {
        [P_FIRST_NAME]: 1,
      },
      positionIndex: {
        [P_FIRST_NAME]: [1],
      },
    });

    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 1,
        after: 3,
      },
    ]);

    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 3,
        [P_THEME]: 0,
      },
      confirmedTurnIds: [1, 2, 3],
      appliedTurnIds: [1, 3],
      pendingTurnIds: [],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 3,
      },
      positionIndex: {
        [P_FIRST_NAME]: [1, 3],
      },
    });
  });

  it('preserves redo for disjoint new confirmed work that does not advance a required causal branch', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'A',
      [P_THEME]: 'light',
      [P_NOTIFICATIONS]: false,
    });

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'A',
        after: 'B',
      },
    ]);

    expect(runtime.undoAt(P_FIRST_NAME)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    runtime.confirmTurn([
      {
        owner: P_NOTIFICATIONS,
        before: false,
        after: true,
      },
    ]);

    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 'A',
        [P_THEME]: 'light',
        [P_NOTIFICATIONS]: true,
      },
      confirmedTurnIds: [1, 2],
      appliedTurnIds: [2],
      pendingTurnIds: [],
      redoTurnIds: [1],
      frontiers: {
        [P_NOTIFICATIONS]: 2,
      },
      positionIndex: {
        [P_NOTIFICATIONS]: [2],
      },
    });
  });

  it('invalidates redo atomically when new confirmed work advances a branch required by the redoable turn', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'A',
      [P_THEME]: 'light',
    });

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'A',
        after: 'B',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'B',
        after: 'C',
      },
    ]);

    expect(runtime.inspect()).toEqual({
      values: {
        [P_FIRST_NAME]: 'C',
        [P_THEME]: 'light',
      },
      confirmedTurnIds: [1, 2],
      appliedTurnIds: [2],
      pendingTurnIds: [],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 2,
      },
      positionIndex: {
        [P_FIRST_NAME]: [2],
      },
    });
  });

  it('keeps kernel state unchanged when confirmed undo is refused by authority/frontier rules', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_LAST_NAME]: 'Lovelace',
      [P_THEME]: 'light',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
      {
        owner: P_LAST_NAME,
        before: 'Lovelace',
        after: 'Hopper',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Joan',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expectKernelStateToRemainNeutral(runtime, store, () => {
      expect(
        runtime.undoConfirmedOperation(P_PROFILE, {
          onApplyAtomically: applyAtomically,
        })
      ).toEqual({
        ok: false,
        refusal: { kind: 'outside-boundary' },
      });
    });

    expect(applyAtomically).not.toHaveBeenCalled();
  });

  it('keeps kernel state unchanged when bookkeeping refuses after authority and planning succeed', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });
    const store = new TurnStore();

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expectKernelStateToRemainNeutral(runtime, store, () => {
      expect(
        runtime.undoConfirmedOperation(P_ROOT, {
          refusalAfterPlanning: { kind: 'frontier-blocked' },
          onApplyAtomically: applyAtomically,
        })
      ).toEqual({
        ok: false,
        refusal: { kind: 'frontier-blocked' },
      });
    });

    expect(applyAtomically).not.toHaveBeenCalled();
  });

  it('propagates physical application failure while keeping kernel bookkeeping unchanged', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });
    const store = new TurnStore();

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    const before = snapshotKernelState(runtime, store);
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const failure = new Error('atomic silent application failed');

    expect(() =>
      runtime.undoConfirmedOperation(P_ROOT, {
        onApplyAtomically: applyAtomically,
        failPhysicalApplicationWith: failure,
      })
    ).toThrow(failure);

    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Ada',
      },
    ]);
    expect(snapshotKernelState(runtime, store)).toEqual(before);
  });

  it('moves a confirmed turn from applied to redoable without changing canonical history', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_LAST_NAME]: 'Lovelace',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
      {
        owner: P_LAST_NAME,
        before: 'Lovelace',
        after: 'Hopper',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Joan',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      runtime.undoConfirmedOperation(P_ROOT, {
        onApplyAtomically: applyAtomically,
      })
    ).toEqual({ ok: true, turnId: t2.id });

    expect(snapshotKernelState(runtime, store)).toEqual({
      values: {
        [P_FIRST_NAME]: 'Grace',
        [P_LAST_NAME]: 'Hopper',
      },
      canonicalTurnIds: [1, 2],
      canonicalPositionIndex: {
        [P_FIRST_NAME]: [1, 2],
        [P_LAST_NAME]: [1],
      },
      canonicalFrontiers: {
        [P_FIRST_NAME]: 2,
        [P_LAST_NAME]: 1,
      },
      appliedTurnIds: [1],
      redoTurnIds: [2],
      appliedFrontiers: {
        [P_FIRST_NAME]: 1,
        [P_LAST_NAME]: 1,
      },
      appliedPositionIndex: {
        [P_FIRST_NAME]: [1],
        [P_LAST_NAME]: [1],
      },
    });
    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_FIRST_NAME,
        before: 'Joan',
        after: 'Grace',
      },
    ]);
  });

  it('treats disjoint redo as eligible even while unrelated later work remains applied', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });

    expect(runtime.undoAt(P_FIRST_NAME)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    expect(runtime.assessRedo(P_FIRST_NAME, t1.id)).toBe('eligible');
    expect(runtime.redoConfirmedOperation(P_FIRST_NAME, t1.id)).toEqual({
      ok: true,
      turnId: t1.id,
    });
    expect(snapshotKernelState(runtime, store)).toEqual({
      values: {
        [P_FIRST_NAME]: 'Grace',
        [P_THEME]: 'dark',
      },
      canonicalTurnIds: [1, 2],
      canonicalPositionIndex: {
        [P_FIRST_NAME]: [1],
        [P_THEME]: [2],
      },
      canonicalFrontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
      appliedTurnIds: [1, 2],
      redoTurnIds: [],
      appliedFrontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
      appliedPositionIndex: {
        [P_FIRST_NAME]: [1],
        [P_THEME]: [2],
      },
    });
  });

  it('requires redo to restore per-position confirmed prefix closure', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Joan',
      },
    ]);

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t2.id,
    });
    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    expect(runtime.assessRedo(P_ROOT, t2.id)).toBe('prefix-blocked');
    expect(runtime.assessRedo(P_ROOT, t1.id)).toBe('eligible');
  });

  it('refuses a cross-position redo atomically when any participant is not ready for that confirmed prefix', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Joan',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t2.id,
    });
    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    expectKernelStateToRemainNeutral(runtime, store, () => {
      expect(runtime.redoConfirmedOperation(P_ROOT, t2.id)).toEqual({
        ok: false,
        refusal: { kind: 'prefix-blocked' },
      });
    });
  });

  it('keeps kernel state unchanged when redo is refused before reapplication', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Joan',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t2.id,
    });
    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    expectKernelStateToRemainNeutral(runtime, store, () => {
      expect(runtime.redoConfirmedOperation(P_ROOT, t2.id)).toEqual({
        ok: false,
        refusal: { kind: 'prefix-blocked' },
      });
    });
  });

  it('keeps kernel state unchanged when confirmed redo is refused by assessment rules', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
    const store = new TurnStore();

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: turn.id,
    });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expectKernelStateToRemainNeutral(runtime, store, () => {
      expect(
        runtime.redoConfirmedOperation(P_PROFILE, turn.id, {
          onApplyAtomically: applyAtomically,
        })
      ).toEqual({
        ok: false,
        refusal: { kind: 'outside-boundary' },
      });
    });

    expect(applyAtomically).not.toHaveBeenCalled();
  });

  it('keeps kernel state unchanged when redo bookkeeping refuses after assessment and planning succeed', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });
    const store = new TurnStore();

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: turn.id,
    });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expectKernelStateToRemainNeutral(runtime, store, () => {
      expect(
        runtime.redoConfirmedOperation(P_ROOT, turn.id, {
          refusalAfterPlanning: { kind: 'prefix-blocked' },
          onApplyAtomically: applyAtomically,
        })
      ).toEqual({
        ok: false,
        refusal: { kind: 'prefix-blocked' },
      });
    });

    expect(applyAtomically).not.toHaveBeenCalled();
  });

  it('propagates redo physical application failure while keeping kernel bookkeeping unchanged', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
    });
    const store = new TurnStore();

    const turn = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: turn.id,
      effects: turn.effects,
    });

    expect(runtime.undoAt(P_ROOT)).toEqual({
      ok: true,
      turnId: turn.id,
    });

    const before = snapshotKernelState(runtime, store);
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const failure = new Error('atomic silent application failed');

    expect(() =>
      runtime.redoConfirmedOperation(P_ROOT, turn.id, {
        onApplyAtomically: applyAtomically,
        failPhysicalApplicationWith: failure,
      })
    ).toThrow(failure);

    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    expect(snapshotKernelState(runtime, store)).toEqual(before);
  });

  it('restores a redoable confirmed turn at canonical applied position without changing canonical history', () => {
    const runtime = createRuntime({
      [P_FIRST_NAME]: 'Ada',
      [P_THEME]: 'light',
    });
    const store = new TurnStore();

    const t1 = runtime.confirmTurn([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
    store.admitConfirmed({
      id: t1.id,
      effects: t1.effects,
    });
    const t2 = runtime.confirmTurn([
      {
        owner: P_THEME,
        before: 'light',
        after: 'dark',
      },
    ]);
    store.admitConfirmed({
      id: t2.id,
      effects: t2.effects,
    });

    expect(runtime.undoAt(P_FIRST_NAME)).toEqual({
      ok: true,
      turnId: t1.id,
    });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      runtime.redoConfirmedOperation(P_ROOT, t1.id, {
        onApplyAtomically: applyAtomically,
      })
    ).toEqual({ ok: true, turnId: t1.id });

    expect(snapshotKernelState(runtime, store)).toEqual({
      values: {
        [P_FIRST_NAME]: 'Grace',
        [P_THEME]: 'dark',
      },
      canonicalTurnIds: [1, 2],
      canonicalPositionIndex: {
        [P_FIRST_NAME]: [1],
        [P_THEME]: [2],
      },
      canonicalFrontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
      appliedTurnIds: [1, 2],
      redoTurnIds: [],
      appliedFrontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
      appliedPositionIndex: {
        [P_FIRST_NAME]: [1],
        [P_THEME]: [2],
      },
    });
    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_FIRST_NAME,
        before: 'Ada',
        after: 'Grace',
      },
    ]);
  });
});
