import type { ConfirmedReversalPlan, ReversalEffect } from './causal-types';

export interface EffectApplicationPort {
  applyAtomically(effects: readonly ReversalEffect[]): void;
}

export interface ApplyReversalPlanOptions {
  readonly plan: ConfirmedReversalPlan;
  readonly port: EffectApplicationPort;
}

export function applyReversalPlan(
  options: ApplyReversalPlanOptions
): void {
  options.port.applyAtomically(options.plan.effects);
}
