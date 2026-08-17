/**
 * ENHANCER METADATA AUTHORITY — the frozen contract.
 *
 * Every concept has exactly one semantic owner:
 *
 *   name                      enhancer IDENTITY — duplicate detection, diagnostics
 *   provides: string[]        CAPABILITY TOKENS this enhancer satisfies
 *   requires: string[]        CAPABILITY TOKENS that must already be satisfied
 *   capabilities: TreeCapability[]
 *                             tree SUBSTRATE requirements (`buildTreePlan`) —
 *                             a separate axis. Do NOT merge it with `provides`
 *                             just because both say "capability": one answers
 *                             "what enhancer-level prerequisite do I satisfy?",
 *                             the other "what physical runtime substrate must
 *                             exist?".
 *
 * Both mechanisms that read `requires` now answer the SAME question:
 *
 *     requires.every((req) => providedCapabilities.has(req))
 *
 * `resolveEnhancerOrder` uses that relation to ORDER; `.with()` uses it to
 * ENFORCE, fail-closed. Neither translates `requires` through `name`.
 *
 * WHAT THIS REPLACED. A requirement used to be satisfiable only when the
 * provider was BOTH named `x` AND declared `provides: ['x']` — the sorter
 * matched capabilities, the guard matched names, and only their accidental
 * intersection worked. Every built-in happens to declare `name === provides[0]`,
 * so nothing in-repo failed; meanwhile two of the three DOCUMENTED authoring
 * examples could not work, and `persistence`'s second capability
 * (`provides: ['persistence','serialization']`) was unusable.
 *
 * DO NOT "FIX" A FAILURE HERE WITH A NAME FALLBACK. Writing
 * `provided.has(req) || appliedNames.has(req)` restores the ambiguity instead
 * of resolving it, and case 3 below exists specifically to fail if you do.
 */
import { describe, expect, it } from 'vitest';

import { createEnhancer } from '../enhancers/index';
import { signalTree } from './signal-tree';

import type { ISignalTree } from '../index';

/** An enhancer that records when it runs and adds nothing. */
function tracer(meta: Record<string, unknown>, log: string[]) {
  return createEnhancer(meta as never, <T>(tree: ISignalTree<T>) => {
    log.push(String(meta['name'] ?? 'anonymous'));
    return tree;
  });
}

describe('enhancer metadata authority', () => {
  it('1. the pre-existing convention still works (name === provides[0])', () => {
    const log: string[] = [];
    expect(() =>
      signalTree({ count: 0 })
        .with(tracer({ name: 'x', provides: ['x'] }, log) as never)
        .with(tracer({ name: 'consumer', requires: ['x'] }, log) as never)
    ).not.toThrow();
    expect(log).toEqual(['x', 'consumer']);
  });

  it('2. a capability satisfies a requirement even when name !== provides', () => {
    // The repair. This is the shape both authoring guides document and that
    // could not work before.
    const log: string[] = [];
    expect(() =>
      signalTree({ count: 0 })
        .with(tracer({ name: 'withLogger', provides: ['logger'] }, log) as never)
        .with(
          tracer(
            { name: 'withAudit', provides: ['audit'], requires: ['logger'] },
            log
          ) as never
        )
    ).not.toThrow();
    expect(log).toEqual(['withLogger', 'withAudit']);
  });

  it('3. IDENTITY ALONE DOES NOT SATISFY A REQUIREMENT — no name fallback', () => {
    // An enhancer NAMED `x` that does not PROVIDE `x` grants nothing. If this
    // ever passes, someone has added `|| appliedNames.has(req)` back.
    const log: string[] = [];
    expect(() =>
      signalTree({ count: 0 })
        .with(tracer({ name: 'x', provides: ['something-else'] }, log) as never)
        .with(tracer({ name: 'consumer', requires: ['x'] }, log) as never)
    ).toThrow(/requires capability "x"/);
    // Fail-closed: the dependent enhancer never ran.
    expect(log).toEqual(['x']);
  });

  it('4. a SECONDARY capability satisfies a requirement (the persistence shape)', () => {
    // `persistence` ships as { name: 'persistence',
    //                          provides: ['persistence', 'serialization'] }.
    // Its second capability was unusable before this contract.
    const log: string[] = [];
    expect(() =>
      signalTree({ count: 0 })
        .with(tracer({ name: 'provider', provides: ['a', 'b'] }, log) as never)
        .with(tracer({ name: 'consumer', requires: ['b'] }, log) as never)
    ).not.toThrow();
    expect(log).toEqual(['provider', 'consumer']);
  });

  it('5. an unsatisfied requirement fails CLOSED before the consumer runs', () => {
    const log: string[] = [];
    expect(() =>
      signalTree({ count: 0 }).with(
        tracer({ name: 'consumer', requires: ['nobody-provides-this'] }, log) as never
      )
    ).toThrow(/requires capability "nobody-provides-this"/);
    expect(log).toEqual([]);
  });

  it('6. duplicate detection is by NAME and independent of capabilities', () => {
    const log: string[] = [];
    const tree = signalTree({ count: 0 }).with(
      tracer({ name: 'dup', provides: ['one'] }, log) as never
    );
    // Same name, DIFFERENT provides — still a duplicate.
    expect(() =>
      tree.with(tracer({ name: 'dup', provides: ['two'] }, log) as never)
    ).toThrow(/has already been applied/);
    expect(log).toEqual(['dup']);
  });

  // --- temporal contract: state is published only on SUCCESS ---------------

  it('a THROWING enhancer publishes neither its name nor its capabilities', () => {
    const log: string[] = [];
    const exploding = createEnhancer(
      { name: 'exploding', provides: ['exploded'] },
      <T>(_tree: ISignalTree<T>): ISignalTree<T> => {
        throw new Error('enhancer body failed');
      }
    );

    const tree = signalTree({ count: 0 });
    expect(() => tree.with(exploding as never)).toThrow('enhancer body failed');

    // Its capability was never granted — a dependent must not proceed.
    expect(() =>
      tree.with(tracer({ name: 'consumer', requires: ['exploded'] }, log) as never)
    ).toThrow(/requires capability "exploded"/);
    expect(log).toEqual([]);

    // ...and its name was never marked applied, so a retry is not a duplicate.
    expect(() =>
      tree.with(tracer({ name: 'exploding', provides: ['exploded'] }, log) as never)
    ).not.toThrow();
    expect(log).toEqual(['exploding']);
  });

  it('capabilities become visible to the NEXT .with() once application succeeds', () => {
    const log: string[] = [];
    const tree = signalTree({ count: 0 });

    // Not yet satisfiable.
    expect(() =>
      tree.with(tracer({ name: 'early', requires: ['late-cap'] }, log) as never)
    ).toThrow(/requires capability "late-cap"/);

    tree.with(tracer({ name: 'provider', provides: ['late-cap'] }, log) as never);

    // Now it is.
    expect(() =>
      tree.with(tracer({ name: 'consumer', requires: ['late-cap'] }, log) as never)
    ).not.toThrow();
    expect(log).toEqual(['provider', 'consumer']);
  });

  it('an ANONYMOUS enhancer still has its requirements validated', () => {
    // Previously the entire block was gated on `meta.name`, so an unnamed
    // enhancer's `requires` was silently ignored.
    const log: string[] = [];
    expect(() =>
      signalTree({ count: 0 }).with(
        tracer({ requires: ['absent'] }, log) as never
      )
    ).toThrow(/This enhancer requires capability "absent"/);
    expect(log).toEqual([]);
  });
});
