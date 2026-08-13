import type { PositionId, ReversalEffect } from './causal-types';
import { AppliedHistory } from './applied-history';
import { redoConfirmedAt } from './confirmed-redo';
import { undoConfirmedAt } from './confirmed-undo';
import { createPositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;

describe('confirmed undo/redo after rejected speculative causality', () => {
  it('uses the surviving realized predecessor instead of the stale canonical predecessor', () => {
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

    const t2 = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(t2.id)).toEqual({ ok: true });

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
        for (const [position, value] of staged) {
          values.set(position, value);
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
    ).toEqual({ ok: true, turnId: t2.id });

    expect(appliedEffects[0]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'C',
        after: 'A',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('A');
    expect(store.getTurn(t2.id)).toEqual({
      id: t2.id,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
      participants: [P_FIRST_NAME],
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
    ).toEqual({ ok: true, turnId: t2.id });

    expect(appliedEffects[1]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'A',
        after: 'C',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('C');
    expect(store.getTurn(t2.id)).toEqual({
      id: t2.id,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
      participants: [P_FIRST_NAME],
      state: 'confirmed',
    });
  });

  it('preserves same-owner internal effect order while contextualizing only the external predecessor', () => {
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

    const t2 = store.admitConfirmed({
      id: 2,
      effects: [
        { owner: P_FIRST_NAME, before: 'B', after: 'C' },
        { owner: P_FIRST_NAME, before: 'C', after: 'D' },
      ],
    });
    expect(appliedHistory.admitConfirmed(t2.id)).toEqual({ ok: true });

    const values = new Map<PositionId, unknown>([[P_FIRST_NAME, 'D']]);
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
        for (const [position, value] of staged) {
          values.set(position, value);
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
    ).toEqual({ ok: true, turnId: t2.id });

    expect(appliedEffects[0]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'D',
        after: 'C',
      },
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
    ).toEqual({ ok: true, turnId: t2.id });

    expect(appliedEffects[1]).toEqual([
      {
        owner: P_FIRST_NAME,
        before: 'A',
        after: 'C',
      },
      {
        owner: P_FIRST_NAME,
        before: 'C',
        after: 'D',
      },
    ]);
    expect(values.get(P_FIRST_NAME)).toBe('D');
    expect(store.getTurn(t2.id)).toEqual({
      id: t2.id,
      effects: [
        { owner: P_FIRST_NAME, before: 'B', after: 'C' },
        { owner: P_FIRST_NAME, before: 'C', after: 'D' },
      ],
      participants: [P_FIRST_NAME],
      state: 'confirmed',
    });
  });
});
