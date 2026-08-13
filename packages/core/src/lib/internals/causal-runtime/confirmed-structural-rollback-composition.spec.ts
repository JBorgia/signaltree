import type { PositionId, ReversalEffect } from './causal-types';
import { AppliedHistory } from './applied-history';
import { redoConfirmedAt } from './confirmed-redo';
import { undoConfirmedAt } from './confirmed-undo';
import { createPositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_DRIVER_KEY = 3 as PositionId;
const P_DRIVER_NAME = 4 as PositionId;
const P_SETTINGS = 4 as PositionId;
const P_OTHER_DRIVER_KEY = 5 as PositionId;
const SUBJECT_DRIVER = 'driver-1';
const SUBJECT_OTHER_DRIVER = 'driver-2';

describe('confirmed structural undo/redo composition', () => {
  it('undoes and redoes a confirmed rekey plus scalar turn with authored ordering and structural metadata preserved', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'A'],
        [P_DRIVER_NAME, 'Alice'],
      ]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'B'],
      [P_DRIVER_NAME, 'Alicia'],
    ]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = {
      applyAtomically(effects: readonly ReversalEffect[]) {
        const staged = new Map(values);

        for (const effect of effects) {
          expect(staged.get(effect.owner)).toEqual(effect.before);
          staged.set(effect.owner, effect.after);
        }

        appliedEffects.push(effects.map((effect) => ({ ...effect })));

        values.clear();
        for (const [positionId, value] of staged) {
          values.set(positionId, value);
        }
      },
    };

    expect(
      undoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: confirmed.id });

    expect(appliedEffects[0]).toEqual([
      {
        owner: P_DRIVER_NAME,
        before: 'Alicia',
        after: 'Alice',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
      {
        owner: P_DRIVER_KEY,
        before: 'B',
        after: 'A',
        subjectId: SUBJECT_DRIVER,
        structural: 'rekey',
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
    expect(store.getTurn(confirmed.id)).toEqual({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
      participants: [P_DRIVER_KEY, P_DRIVER_NAME],
      state: 'confirmed',
    });

    expect(
      redoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: confirmed.id });

    expect(appliedEffects[1]).toEqual([
      {
        owner: P_DRIVER_KEY,
        before: 'A',
        after: 'B',
        subjectId: SUBJECT_DRIVER,
        structural: 'rekey',
      },
      {
        owner: P_DRIVER_NAME,
        before: 'Alice',
        after: 'Alicia',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('B');
    expect(values.get(P_DRIVER_NAME)).toBe('Alicia');
  });

  it('refuses confirmed structural undo with dependency-conflict when later confirmed work causally consumes the restored resource', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const settings = topology.allocate(root);
    const otherDriverKey = topology.allocate(settings);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(settings).toBe(P_SETTINGS);
    expect(otherDriverKey).toBe(P_OTHER_DRIVER_KEY);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'A'],
        [P_OTHER_DRIVER_KEY, undefined],
      ]),
      store,
      appliedHistory,
    });

    const earlier = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    const later = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_OTHER_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: SUBJECT_OTHER_DRIVER,
          structural: 'add',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(earlier.id)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(later.id)).toEqual({ ok: true });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const validateEffects = vi.fn();
    const appliedBefore = appliedHistory.inspect();
    const storeBefore = store.inspect();

    expect(
      undoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically, validateEffects },
        realizationContext,
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(validateEffects).not.toHaveBeenCalled();
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('refuses confirmed structural undo with structural-drift when uncaptured occupancy blocks the restored resource', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_DRIVER_KEY, 'A']]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const validateEffects = vi.fn(() => ({ kind: 'structural-drift' as const }));
    const appliedBefore = appliedHistory.inspect();
    const storeBefore = store.inspect();

    expect(
      undoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically, validateEffects },
        realizationContext,
      })
    ).toEqual({ ok: false, refusal: { kind: 'structural-drift' } });

    expect(validateEffects).toHaveBeenCalledTimes(1);
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('keeps a structural confirmed turn redoable when redo validation refuses with structural-drift', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'A'],
        [P_DRIVER_NAME, 'Alice'],
      ]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'B'],
      [P_DRIVER_NAME, 'Alicia'],
    ]);
    const port = {
      applyAtomically(effects: readonly ReversalEffect[]) {
        const staged = new Map(values);

        for (const effect of effects) {
          staged.set(effect.owner, effect.after);
        }

        values.clear();
        for (const [positionId, value] of staged) {
          values.set(positionId, value);
        }
      },
    };

    expect(
      undoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: confirmed.id });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const validateEffects = vi.fn(() => ({ kind: 'structural-drift' as const }));
    const appliedBefore = appliedHistory.inspect();
    const storeBefore = store.inspect();

    expect(
      redoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically, validateEffects },
        realizationContext,
      })
    ).toEqual({ ok: false, refusal: { kind: 'structural-drift' } });

    expect(validateEffects).toHaveBeenCalledTimes(1);
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });
});
