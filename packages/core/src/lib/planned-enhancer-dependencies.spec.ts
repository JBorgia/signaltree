/**
 * Enhancer dependency metadata under `plannedSignalTree()` — CHARACTERIZATION.
 *
 * Written while proving the `composeEnhancers` deletion, and kept because it
 * pins behaviour that has nothing to do with that symbol.
 *
 * Two things are recorded here. The first is a guarantee worth protecting; the
 * second is a defect worth not forgetting.
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
 * 2. THE DEFECT — `requires` is resolved against TWO DIFFERENT NAMESPACES by
 *    the two things that read it:
 *
 *      resolveEnhancerOrder   edges only when `a.provides.has(req)`  -> CAPABILITY
 *      .with() guard          `appliedEnhancers.has(req)`            -> NAME
 *
 *    So a requirement is satisfiable only when some enhancer is BOTH named `x`
 *    AND declares `provides: ['x']`. The two natural spellings both fail, and
 *    they fail at build time with a message that names the requirement but not
 *    the reason. Pinned as CURRENT BEHAVIOUR, not endorsed — repairing it is
 *    enhancer-metadata work, not part of the deletion slice that found it.
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
    // The only spelling that works: named `provider` AND provides `provider`.
    expect(build({ name: 'provider', provides: ['provider'] }, 'provider')).toEqual([
      'provider',
      'consumer',
    ]);
  });

  it('DEFECT: a capability-only `provides` does not satisfy `requires`', () => {
    // Reads as the obvious spelling — consumer requires the "base" capability,
    // provider supplies it — and it throws, because the guard wants a NAME.
    expect(() => build({ name: 'provider', provides: ['base'] }, 'base')).toThrow(
      /Enhancer "consumer" requires "base" to be applied first/
    );
  });

  it('DEFECT: requiring the provider BY NAME does not satisfy it either', () => {
    // The mirror-image spelling. Now the guard would be happy, but
    // `resolveEnhancerOrder` builds no edge (nobody PROVIDES "provider"), so no
    // reordering happens and the guard fires on the original order.
    expect(() => build({ name: 'provider', provides: ['base'] }, 'provider')).toThrow(
      /Enhancer "consumer" requires "provider" to be applied first/
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
    ).toThrow(/requires "nothing-provides-this"/);
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
