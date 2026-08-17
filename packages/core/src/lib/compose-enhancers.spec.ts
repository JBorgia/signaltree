/**
 * P2 — SEMANTIC CAPABILITY of `composeEnhancers`.
 *
 * The type half is `compose-enhancers.typing.spec.ts`. This asks the RUNTIME
 * question, which is the one that decides whether deleting it removes a
 * capability:
 *
 *   Does `composeEnhancers` permit any composition that ordered enhancer
 *   application cannot express?
 *
 * Kept separate from the type question on purpose. "Runtime equivalent" and
 * "type equivalent" are different properties, and an API that is the first but
 * not the second is a strictly worse path, not an alternative one.
 */
import { describe, expect, it } from 'vitest';

import { composeEnhancers } from '../authoring';
import { signalTree } from './signal-tree';

import type { ISignalTree } from '../index';

type Tracked = { order: string[] };

/**
 * Enhancers that record their own application order, so the tests compare
 * OBSERVED SEQUENCE rather than merely "both produced a tree".
 */
function tagging(name: string, log: string[]) {
  return <T>(tree: ISignalTree<T>) => {
    log.push(name);
    (tree as unknown as Record<string, unknown>)[name] = () => name;
    return tree as ISignalTree<T> & Record<string, () => string>;
  };
}

describe('composeEnhancers — semantic capability (P2)', () => {
  it('applies enhancers left-to-right, same order as chained .with()', () => {
    const composedLog: string[] = [];
    const chainedLog: string[] = [];

    signalTree({ count: 0 }).with(
      composeEnhancers(
        tagging('one', composedLog),
        tagging('two', composedLog),
        tagging('three', composedLog)
      ) as never
    );

    signalTree({ count: 0 })
      .with(tagging('one', chainedLog) as never)
      .with(tagging('two', chainedLog) as never)
      .with(tagging('three', chainedLog) as never);

    expect(composedLog).toEqual(['one', 'two', 'three']);
    expect(chainedLog).toEqual(composedLog);
  });

  it('produces the same runtime methods as chained application', () => {
    const composed = signalTree({ count: 0 }).with(
      composeEnhancers(tagging('alpha', []), tagging('beta', [])) as never
    ) as unknown as Record<string, () => string>;

    const chained = signalTree({ count: 0 })
      .with(tagging('alpha', []) as never)
      .with(tagging('beta', []) as never) as unknown as Record<
      string,
      () => string
    >;

    expect(composed['alpha']()).toBe('alpha');
    expect(composed['beta']()).toBe('beta');
    expect(chained['alpha']()).toBe('alpha');
    expect(chained['beta']()).toBe('beta');
  });

  it('state is unaffected by either path', () => {
    const composed = signalTree({ count: 1 }).with(
      composeEnhancers(tagging('x', []), tagging('y', [])) as never
    );
    const chained = signalTree({ count: 1 })
      .with(tagging('x', []) as never)
      .with(tagging('y', []) as never);

    expect(composed.$.count()).toBe(1);
    expect(chained.$.count()).toBe(1);
  });

  it('RECORDED LIMIT: composition is a plain left fold with no extra semantics', () => {
    // The whole implementation is
    //   (tree) => enhancers.reduce((t, e) => e(t), tree)
    // so there is no ordering metadata, no dependency resolution, no
    // deduplication, and no error handling that ordered application lacks.
    // `resolveEnhancerOrder` is the symbol that does dependency-aware ordering,
    // and it is separate and unaffected.
    const log: string[] = [];
    const identity = <T>(t: T) => t;

    const composed = composeEnhancers(
      identity,
      tagging('only', log) as never,
      identity
    );
    signalTree({ count: 0 }).with(composed as never);

    expect(log).toEqual(['only']);
  });

  it('an empty composition is the identity', () => {
    const tree = signalTree({ count: 5 });
    const result = tree.with(composeEnhancers<Tracked>() as never);
    expect(result.$.count()).toBe(5);
  });
});
