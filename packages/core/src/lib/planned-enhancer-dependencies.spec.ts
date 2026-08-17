/**
 * Enhancer dependency metadata under `plannedSignalTree()` — CHARACTERIZATION.
 *
 * Written while proving the `composeEnhancers` deletion, and kept because it
 * pins behaviour that has nothing to do with that symbol.
 *
 * Two things are recorded here: a guarantee worth protecting, and the enhancer
 * metadata contract as it applies to the PLANNED construction path.
 *
 * 1. THE GUARANTEE — dependency validation is FAIL-CLOSED. The guard runs
 *    inside `.with()` before the enhancer is invoked, so an unsatisfiable
 *    requirement throws and the enhancer never runs. Anything that hands the
 *    planner ONE opaque combined function bypasses this entirely, because the
 *    children never pass through `.with()`. That was one of the reasons
 *    `composeEnhancers` was removed rather than kept as a convenience: its
 *    bypass was fail-OPEN — no error, dependent enhancer runs anyway, tree
 *    looks fine.
 *
 * 2. THE CONTRACT (repaired) — `requires` names CAPABILITY TOKENS, resolved
 *    against what applied enhancers `provides`. Never against enhancer names.
 *    `resolveEnhancerOrder` and the `.with()` guard now answer the same
 *    question, so ordering and enforcement cannot disagree.
 *
 *    This file previously carried DO-NOT-FREEZE rows recording the opposite:
 *    the sorter matched capabilities while the guard matched names, so a
 *    requirement was satisfiable only when the provider was BOTH named `x` AND
 *    declared `provides: ['x']`. Those rows have been converted to positive
 *    assertions of the repaired contract, which is exactly what the banner
 *    asked the next author to do. The full contract lives in
 *    `enhancer-metadata-authority.spec.ts`; this file covers it through the
 *    PLANNED construction path specifically.
 *
 * NOT MEASURED: whether composing also hid child enhancer CAPABILITIES from
 * `buildTreePlan`. The probe could not reach the build plan as an observable
 * property, so there is no result either way — not an open prerequisite.
 */
import { describe, expect, it } from 'vitest';

import { createEnhancer } from '../enhancers/index';
import { plannedSignalTree } from './signal-tree';

/** Applies `consumer` (added first, requiring `req`) then `provider`. */
function build(providerMeta: Record<string, unknown>, req: string) {
  const log: string[] = [];
  const consumer = createEnhancer(
    { name: 'consumer', requires: [req] },
    (tree) => {
      log.push('consumer');
      return tree;
    }
  );
  const provider = createEnhancer(providerMeta as never, (tree) => {
    log.push('provider');
    return tree;
  });

  plannedSignalTree({ count: 0 })
    .with(consumer as never)
    .with(provider as never)
    .build();

  return log;
}

describe('plannedSignalTree enhancer dependency metadata', () => {
  it('reorders the dependent enhancer after its provider (source order ignored)', () => {
    // The planner sorts on capability edges, then the guard enforces on the
    // resolved order. Both read `requires` the same way, so a correctly
    // declared dependency is reordered AND accepted.
    expect(build({ name: 'provider', provides: ['base'] }, 'base')).toEqual([
      'provider',
      'consumer',
    ]);
  });

  it('the redundant name===provides spelling still works', () => {
    // Every built-in ships this shape, so it must keep working.
    expect(build({ name: 'provider', provides: ['provider'] }, 'provider')).toEqual([
      'provider',
      'consumer',
    ]);
  });

  it('a provider NAME does not satisfy a requirement — capabilities only', () => {
    // No name fallback, through the planned path too. `provider` is named
    // `provider` but provides only `base`, so `requires: ['provider']` is
    // unsatisfied — and `resolveEnhancerOrder` builds no edge for it either,
    // which is consistent rather than contradictory now.
    expect(() => build({ name: 'provider', provides: ['base'] }, 'provider')).toThrow(
      /requires capability "provider"/
    );
  });

  it('is FAIL-CLOSED — the dependent enhancer never runs', () => {
    const log: string[] = [];
    const orphan = createEnhancer(
      { name: 'orphan', requires: ['nothing-provides-this'] },
      (tree) => {
        log.push('orphan');
        return tree;
      }
    );

    expect(() =>
      plannedSignalTree({ count: 0 })
        .with(orphan as never)
        .build()
    ).toThrow(/requires capability "nothing-provides-this"/);
    expect(log).toEqual([]);
  });

  it('builds normally when enhancers declare no dependencies', () => {
    const log: string[] = [];
    const plain = createEnhancer({ name: 'plain' }, (tree) => {
      log.push('plain');
      return tree;
    });

    const tree = plannedSignalTree({ count: 7 })
      .with(plain as never)
      .build();

    expect(log).toEqual(['plain']);
    expect(tree.$.count()).toBe(7);
  });
});
