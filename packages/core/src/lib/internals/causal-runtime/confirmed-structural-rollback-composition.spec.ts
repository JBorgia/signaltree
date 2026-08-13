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
const P_DRIVER_ENABLED = 5 as PositionId;
const P_DRIVER_LOCAL = 6 as PositionId;
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

  it('allows confirmed structural undo once the later captured consumer is redoable rather than applied', () => {
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
    const first = store.admitConfirmed({
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
    const second = store.admitConfirmed({
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
    expect(appliedHistory.admitConfirmed(first.id)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(second.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(second.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'B'],
      [P_OTHER_DRIVER_KEY, undefined],
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
    ).toEqual({ ok: true, turnId: first.id });

    expect(appliedEffects).toEqual([
      [
        {
          owner: P_DRIVER_KEY,
          before: 'B',
          after: 'A',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    ]);
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

  it('undoes and redoes a confirmed add plus scalar turn in authored sequence without collapsing to one remove', () => {
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
        [P_DRIVER_KEY, undefined],
        [P_DRIVER_NAME, undefined],
      ]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
        },
        {
          owner: P_DRIVER_NAME,
          before: undefined,
          after: 'Alice',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'A'],
      [P_DRIVER_NAME, 'Alice'],
    ]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = createStructuralPort(values, appliedEffects);

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
        before: 'Alice',
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
      {
        owner: P_DRIVER_KEY,
        before: 'A',
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: 'remove',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBeUndefined();
    expect(values.get(P_DRIVER_NAME)).toBeUndefined();

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
        before: undefined,
        after: 'A',
        subjectId: SUBJECT_DRIVER,
        structural: 'add',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
      },
      {
        owner: P_DRIVER_NAME,
        before: undefined,
        after: 'Alice',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
  });

  it('undoes and redoes a confirmed add with multiple covered fields in strict confirmed sequence', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);
    const driverEnabled = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);
    expect(driverEnabled).toBe(P_DRIVER_ENABLED);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, undefined],
        [P_DRIVER_NAME, undefined],
        [P_DRIVER_ENABLED, undefined],
      ]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED],
        },
        {
          owner: P_DRIVER_NAME,
          before: undefined,
          after: 'Alice',
          subjectId: SUBJECT_DRIVER,
        },
        {
          owner: P_DRIVER_ENABLED,
          before: undefined,
          after: true,
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'A'],
      [P_DRIVER_NAME, 'Alice'],
      [P_DRIVER_ENABLED, true],
    ]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = createStructuralPort(values, appliedEffects);

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
        owner: P_DRIVER_ENABLED,
        before: true,
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
      {
        owner: P_DRIVER_NAME,
        before: 'Alice',
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
      {
        owner: P_DRIVER_KEY,
        before: 'A',
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: 'remove',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED],
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBeUndefined();
    expect(values.get(P_DRIVER_NAME)).toBeUndefined();
    expect(values.get(P_DRIVER_ENABLED)).toBeUndefined();

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
        before: undefined,
        after: 'A',
        subjectId: SUBJECT_DRIVER,
        structural: 'add',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED],
      },
      {
        owner: P_DRIVER_NAME,
        before: undefined,
        after: 'Alice',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
      {
        owner: P_DRIVER_ENABLED,
        before: undefined,
        after: true,
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
    expect(values.get(P_DRIVER_ENABLED)).toBe(true);
  });

  it('undoes and redoes a confirmed scalar plus remove turn using complete remove-boundary state overlaid with same-turn prefix values', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);
    const driverEnabled = topology.allocate(profile);
    const driverLocal = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);
    expect(driverEnabled).toBe(P_DRIVER_ENABLED);
    expect(driverLocal).toBe(P_DRIVER_LOCAL);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'A'],
        [P_DRIVER_NAME, 'Alice'],
        [P_DRIVER_ENABLED, true],
        [P_DRIVER_LOCAL, 'TX'],
      ]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED, P_DRIVER_LOCAL],
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, undefined],
      [P_DRIVER_NAME, undefined],
      [P_DRIVER_ENABLED, undefined],
      [P_DRIVER_LOCAL, undefined],
    ]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = createStructuralPort(values, appliedEffects);

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
        owner: P_DRIVER_KEY,
        before: undefined,
        after: 'A',
        subjectId: SUBJECT_DRIVER,
        structural: 'add',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED, P_DRIVER_LOCAL],
        subjectState: {
          [P_DRIVER_NAME]: 'Alicia',
          [P_DRIVER_ENABLED]: true,
          [P_DRIVER_LOCAL]: 'TX',
        },
      },
      {
        owner: P_DRIVER_NAME,
        before: 'Alicia',
        after: 'Alice',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
    expect(values.get(P_DRIVER_ENABLED)).toBe(true);
    expect(values.get(P_DRIVER_LOCAL)).toBe('TX');

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
        owner: P_DRIVER_NAME,
        before: 'Alice',
        after: 'Alicia',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
      {
        owner: P_DRIVER_KEY,
        before: 'A',
        after: undefined,
        subjectId: SUBJECT_DRIVER,
        structural: 'remove',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED, P_DRIVER_LOCAL],
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBeUndefined();
    expect(values.get(P_DRIVER_NAME)).toBeUndefined();
    expect(values.get(P_DRIVER_ENABLED)).toBeUndefined();
    expect(values.get(P_DRIVER_LOCAL)).toBeUndefined();
  });

  it('undoes a confirmed remove using surviving realized subject state after an earlier pending contribution is rolled back', () => {
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
    const pending = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const discard = store.prepareDiscardPendingTurn(pending.id);
    expect(discard).toEqual({ ok: true, transition: discard.ok ? discard.transition : undefined });
    if (discard.ok) {
      store.commitPreparedDiscardPending(discard.transition);
    }

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, undefined],
      [P_DRIVER_NAME, undefined],
    ]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = createStructuralPort(values, appliedEffects);

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

    expect(appliedEffects).toEqual([
      [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
          subjectState: {
            [P_DRIVER_NAME]: 'Alice',
          },
        },
      ],
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
  });

  it('undoes a confirmed remove with mixed internal and contextual boundary values after a pending untouched-field change is rolled back', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);
    const driverEnabled = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);
    expect(driverEnabled).toBe(P_DRIVER_ENABLED);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'A'],
        [P_DRIVER_NAME, 'Alice'],
        [P_DRIVER_ENABLED, true],
      ]),
      store,
      appliedHistory,
    });
    const pending = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_ENABLED,
          before: true,
          after: false,
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED],
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const discard = store.prepareDiscardPendingTurn(pending.id);
    expect(discard.ok).toBe(true);
    if (discard.ok) {
      store.commitPreparedDiscardPending(discard.transition);
    }

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, undefined],
      [P_DRIVER_NAME, undefined],
      [P_DRIVER_ENABLED, undefined],
    ]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = createStructuralPort(values, appliedEffects);

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
        owner: P_DRIVER_KEY,
        before: undefined,
        after: 'A',
        subjectId: SUBJECT_DRIVER,
        structural: 'add',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED],
        subjectState: {
          [P_DRIVER_NAME]: 'Alicia',
          [P_DRIVER_ENABLED]: true,
        },
      },
      {
        owner: P_DRIVER_NAME,
        before: 'Alicia',
        after: 'Alice',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
    expect(values.get(P_DRIVER_ENABLED)).toBe(true);
  });

  it('keeps a confirmed add redoable when redo validation refuses with structural-drift', () => {
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
        [P_DRIVER_KEY, undefined],
        [P_DRIVER_NAME, undefined],
      ]),
      store,
      appliedHistory,
    });
    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
        },
        {
          owner: P_DRIVER_NAME,
          before: undefined,
          after: 'Alice',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'A'],
      [P_DRIVER_NAME, 'Alice'],
    ]);
    const port = createStructuralPort(values, []);

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
    expect(validateEffects).toHaveBeenCalledWith([
      {
        owner: P_DRIVER_KEY,
        before: undefined,
        after: 'A',
        subjectId: SUBJECT_DRIVER,
        structural: 'add',
        subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
      },
      {
        owner: P_DRIVER_NAME,
        before: undefined,
        after: 'Alice',
        subjectId: SUBJECT_DRIVER,
        structural: undefined,
      },
    ]);
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });
});

function createStructuralPort(
  values: Map<PositionId, unknown>,
  appliedEffects: ReversalEffect[][]
) {
  return {
    applyAtomically(effects: readonly ReversalEffect[]) {
      const staged = new Map(values);

      for (const effect of effects) {
        expect(staged.get(effect.owner)).toEqual(effect.before);
        staged.set(effect.owner, effect.after);

        if (effect.structural === 'remove') {
          for (const positionId of effect.subjectPositions ?? []) {
            if (positionId === effect.owner) {
              continue;
            }

            staged.set(positionId, undefined);
          }
        }

        for (const [positionId, value] of Object.entries(effect.subjectState ?? {})) {
          staged.set(Number(positionId) as PositionId, value);
        }
      }

      appliedEffects.push(effects.map((effect) => ({ ...effect })));

      values.clear();
      for (const [positionId, value] of staged) {
        values.set(positionId, value);
      }
    },
  };
}
