import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { applyReversalPlan } from './effect-applier';
import { planConfirmedReversal } from './reversal-planner';
import { TurnStore } from './turn-store';

const P_FIRST_NAME = 3 as PositionId;
const P_LAST_NAME = 4 as PositionId;
const P_THEME = 6 as PositionId;

describe('applyReversalPlan', () => {
  it('passes the immutable reversal plan effects to the atomic application port in planner order', () => {
    const store = new TurnStore();

    store.admitConfirmed({
      id: 1,
      effects: [
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
        {
          owner: P_THEME,
          before: 'light',
          after: 'dark',
        },
      ],
    });

    const planResult = planConfirmedReversal({ turnId: 1, store });
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) {
      throw new Error('Expected reversal plan to exist');
    }

    const applyAtomically = vi.fn<void, [typeof planResult.plan.effects]>();

    applyReversalPlan({
      plan: planResult.plan,
      port: { applyAtomically },
    });

    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_THEME,
        before: 'dark',
        after: 'light',
      },
      {
        owner: P_LAST_NAME,
        before: 'Hopper',
        after: 'Lovelace',
      },
      {
        owner: P_FIRST_NAME,
        before: 'Grace',
        after: 'Ada',
      },
    ]);
  });

  it('propagates atomic application failure without mutating canonical or applied bookkeeping state', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });

    const planResult = planConfirmedReversal({ turnId: 1, store });
    expect(planResult.ok).toBe(true);
    if (!planResult.ok) {
      throw new Error('Expected reversal plan to exist');
    }

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();
    const failure = new Error('silent application failed');

    expect(() =>
      applyReversalPlan({
        plan: planResult.plan,
        port: {
          applyAtomically: () => {
            throw failure;
          },
        },
      })
    ).toThrow(failure);

    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('does not require access to turn storage or applied history to apply a plan', () => {
    const plan = {
      turnId: 42,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Grace',
          after: 'Ada',
        },
      ],
    } as const;
    const applyAtomically = vi.fn<void, [typeof plan.effects]>();

    applyReversalPlan({
      plan,
      port: { applyAtomically },
    });

    expect(applyAtomically).toHaveBeenCalledWith(plan.effects);
  });
});
