import type { PositionId, ReversalEffect } from './causal-types';
import { AppliedHistory } from './applied-history';
import { rollbackPendingTurnAt } from './pending-rollback';
import { redoConfirmedAt } from './confirmed-redo';
import { undoConfirmedAt } from './confirmed-undo';
import { createPositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;
const P_THEME = 4 as PositionId;

describe('pending rollback production composition', () => {
  it('rolls back a pending scalar turn without erasing later confirmed work, and later undo/redo use the surviving context', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const firstName = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(firstName).toBe(P_FIRST_NAME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });
    const pending = store.admitPending({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });
    const confirmedStoreBeforeRollback = store.inspect();
    const appliedHistoryBeforeRollback = appliedHistory.inspect();

    const values = new Map<PositionId, unknown>([[P_FIRST_NAME, 'C']]);
    const appliedEffects: ReversalEffect[][] = [];
    const port = {
      applyAtomically(effects: readonly ReversalEffect[]) {
        if (appliedEffects.length === 0) {
          expect(store.hasPendingTurn(pending.id)).toBe(true);
        }

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
      rollbackPendingTurnAt({
        authority: P_PROFILE,
        turnId: pending.id,
        store,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: pending.id });

    expect(appliedEffects).toEqual([[]]);
    expect(store.hasPendingTurn(pending.id)).toBe(false);
    expect(store.inspect()).toEqual(confirmedStoreBeforeRollback);
    expect(appliedHistory.inspect()).toEqual(appliedHistoryBeforeRollback);
    expect(values.get(P_FIRST_NAME)).toBe('C');
    expect(realizationContext.getCurrentValue(P_FIRST_NAME)).toBe('C');

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

    expect(appliedEffects[1]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'C',
        after: 'A',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('A');

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

    expect(appliedEffects[2]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'A',
        after: 'C',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('C');
  });

  it('realizes one net compensation per owner when rolling back repeated same-owner scalar pending effects', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const firstName = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(firstName).toBe(P_FIRST_NAME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });
    const pending = store.admitPending({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'A', after: 'B' },
        { owner: P_FIRST_NAME, before: 'B', after: 'C' },
      ],
    });

    const values = new Map<PositionId, unknown>([[P_FIRST_NAME, 'C']]);
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
      rollbackPendingTurnAt({
        authority: P_PROFILE,
        turnId: pending.id,
        store,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: pending.id });

    expect(appliedEffects).toEqual([
      [
        {
          owner: P_FIRST_NAME,
          before: 'C',
          after: 'A',
        },
      ],
    ]);
    expect(store.hasPendingTurn(pending.id)).toBe(false);
    expect(values.get(P_FIRST_NAME)).toBe('A');
  });

  it('compensates only positions whose realized value changes when rolling back a pending turn', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const firstName = topology.allocate(profile);
    const theme = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(firstName).toBe(P_FIRST_NAME);
    expect(theme).toBe(P_THEME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_FIRST_NAME, 'A'],
        [P_THEME, 'X'],
      ]),
      store,
      appliedHistory,
    });
    const pending = store.admitPending({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'A', after: 'B' },
        { owner: P_THEME, before: 'X', after: 'Y' },
      ],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([
      [P_FIRST_NAME, 'C'],
      [P_THEME, 'Y'],
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
      rollbackPendingTurnAt({
        authority: P_PROFILE,
        turnId: pending.id,
        store,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: pending.id });

    expect(appliedEffects).toEqual([
      [
        {
          owner: P_THEME,
          before: 'Y',
          after: 'X',
        },
      ],
    ]);
    expect(store.hasPendingTurn(pending.id)).toBe(false);
    expect(values.get(P_FIRST_NAME)).toBe('C');
    expect(values.get(P_THEME)).toBe('X');

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

    expect(appliedEffects[1]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'C',
        after: 'A',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('A');
    expect(values.get(P_THEME)).toBe('X');
  });

  it('does not resurrect rejected pending causality when a later pending turn is rolled back afterward', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const firstName = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(firstName).toBe(P_FIRST_NAME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });
    const t1 = store.admitPending({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    const t2 = store.admitPending({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });

    const values = new Map<PositionId, unknown>([[P_FIRST_NAME, 'C']]);
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
      rollbackPendingTurnAt({
        authority: P_PROFILE,
        turnId: t1.id,
        store,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: t1.id });

    expect(appliedEffects[0]).toEqual([]);
    expect(values.get(P_FIRST_NAME)).toBe('C');
    expect(store.hasPendingTurn(t1.id)).toBe(false);
    expect(store.hasPendingTurn(t2.id)).toBe(true);
    expect(realizationContext.getCurrentValue(P_FIRST_NAME)).toBe('C');

    expect(
      rollbackPendingTurnAt({
        authority: P_PROFILE,
        turnId: t2.id,
        store,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: t2.id });

    expect(appliedEffects[1]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'C',
        after: 'A',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('A');
    expect(store.getPendingTurnIds()).toEqual([]);
  });
});
