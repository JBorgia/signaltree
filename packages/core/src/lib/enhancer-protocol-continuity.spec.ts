/**
 * ENHANCER PROTOCOL CONTINUITY ACROSS IDENTITY REPLACEMENT.
 *
 * An enhancer may return a NEW callable rather than mutating the tree it was
 * given — `batching`, `timeTravel` and `devTools` all do. Two properties must
 * hold across that handoff, and they are INDEPENDENT: an implementation can
 * satisfy either one while failing the other.
 *
 *   1. BOOKKEEPING follows the tree lineage. Duplicate detection and capability
 *      requirements keep consulting ONE tree's state across any number of
 *      replacements.
 *   2. INVOCATION uses the CURRENT realization. The next enhancer receives the
 *      replacement, not the tree that was replaced.
 *
 * Both failure modes were measured before the fix, and neither existing pattern
 * avoided both:
 *
 *   copying `with`'s descriptor onto the replacement
 *       bookkeeping SURVIVED (the copied closure held it)
 *       receiver was the ORIGINAL tree (the closure captured `tree`)
 *
 *   redefining `with` on the replacement — what the three built-ins do
 *       receiver was CURRENT
 *       bookkeeping was LOST — their `with` checked only that the argument was
 *       a function, so after `.with(batching())` an unmet requirement no longer
 *       threw and a duplicate name no longer threw
 *
 * The second is the same violated invariant as `composeEnhancers`, in a
 * different manifestation, and it is worth stating the difference precisely:
 *
 *   composeEnhancers          an ALTERNATE composition path that never entered
 *                             the authority
 *   identity-replacing        the canonical path STARTS under the authority,
 *   built-ins                 then replaces itself with one that no longer uses it
 *
 * WATCH OUT FOR VACUOUS PASSES. Row G ("a requirement provided before two real
 * replacements is still satisfied afterwards") passed even when the protocol was
 * completely disabled — with no guard, everything passes. G_NEGATIVE is the row
 * that can tell the difference, and a positive-only version of this suite would
 * have reported the bug as fixed.
 */
import { describe, expect, it } from 'vitest';

import { batching } from '../enhancers/batching/batching';
import { createEnhancer } from '../enhancers/index';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { signalTree } from './signal-tree';

import type { ISignalTree } from '../index';

const MARK = Symbol.for('signaltree.test.replacedIdentity');

/** A minimal identity-replacing enhancer: new callable, own keys copied over. */
const REPLACE = <T>(tree: ISignalTree<T>) => {
  const next = ((...args: unknown[]) =>
    (tree as unknown as (...a: unknown[]) => unknown)(
      ...args
    )) as unknown as Record<string | symbol, unknown>;
  Object.setPrototypeOf(next, Object.getPrototypeOf(tree));
  for (const key of Reflect.ownKeys(tree)) {
    const d = Object.getOwnPropertyDescriptor(tree, key);
    if (d) {
      try {
        Object.defineProperty(next, key, d);
      } catch {
        /* non-configurable — ignore */
      }
    }
  }
  next[MARK] = true;
  return next as unknown as ISignalTree<T>;
};

const provider = (cap: string, log: string[] = []) =>
  createEnhancer({ name: `p_${cap}`, provides: [cap] }, (t) => {
    log.push(`p_${cap}`);
    return t;
  });
const consumer = (cap: string, log: string[] = []) =>
  createEnhancer({ name: `c_${cap}`, requires: [cap] }, (t) => {
    log.push(`c_${cap}`);
    return t;
  });

describe('enhancer protocol continuity across identity replacement', () => {
  it('A — a capability provided BEFORE a replacement survives it', () => {
    expect(() =>
      signalTree({ n: 0 })
        .with(provider('cap') as never)
        .with(REPLACE as never)
        .with(consumer('cap') as never)
    ).not.toThrow();
  });

  it('B — a capability provided AFTER a replacement is honoured', () => {
    expect(() =>
      signalTree({ n: 0 })
        .with(REPLACE as never)
        .with(provider('cap') as never)
        .with(consumer('cap') as never)
    ).not.toThrow();
  });

  it('C — an unmet requirement after a replacement still fails CLOSED', () => {
    const log: string[] = [];
    expect(() =>
      signalTree({ n: 0 })
        .with(REPLACE as never)
        .with(consumer('missing', log) as never)
    ).toThrow(/requires capability "missing"/);
    expect(log).toEqual([]);
  });

  it('D — duplicate detection survives a replacement', () => {
    const dup = createEnhancer({ name: 'dup', provides: ['d'] }, (t) => t);
    const tree = signalTree({ n: 0 })
      .with(REPLACE as never)
      .with(dup as never);
    expect(() =>
      (tree as unknown as { with(e: unknown): unknown }).with(dup as never)
    ).toThrow(/has already been applied/);
  });

  it('E — a THROWING enhancer after a replacement contributes nothing', () => {
    const boom = createEnhancer(
      { name: 'boom', provides: ['bcap'] },
      (): never => {
        throw new Error('boom');
      }
    );
    const tree = signalTree({ n: 0 }).with(REPLACE as never);
    expect(() =>
      (tree as unknown as { with(e: unknown): unknown }).with(boom as never)
    ).toThrow('boom');

    const log: string[] = [];
    expect(() =>
      (tree as unknown as { with(e: unknown): unknown }).with(
        consumer('bcap', log) as never
      )
    ).toThrow(/requires capability "bcap"/);
    expect(log).toEqual([]);
  });

  it('F — the next enhancer receives the CURRENT realization', () => {
    // Property 2, independent of every row above. Before the fix this saw the
    // ORIGINAL tree while bookkeeping still worked.
    let seen: unknown = 'never-ran';
    signalTree({ n: 0 })
      .with(REPLACE as never)
      .with(((t: never) => {
        seen = (t as unknown as Record<symbol, unknown>)[MARK] ?? false;
        return t;
      }) as never);
    expect(seen).toBe(true);
  });

  it('G — survives TWO real built-in replacements (batching + timeTravel)', () => {
    expect(() =>
      signalTree({ n: 0 })
        .with(provider('gcap') as never)
        .with(batching())
        .with(timeTravel() as never)
        .with(consumer('gcap') as never)
    ).not.toThrow();
  });

  it('G_NEGATIVE — and still REJECTS an unmet requirement after both', () => {
    // The row that distinguishes "protocol works" from "protocol is absent".
    // G alone passes in both worlds.
    const log: string[] = [];
    expect(() =>
      signalTree({ n: 0 })
        .with(batching())
        .with(timeTravel() as never)
        .with(consumer('never-provided', log) as never)
    ).toThrow(/requires capability "never-provided"/);
    expect(log).toEqual([]);
  });
});
