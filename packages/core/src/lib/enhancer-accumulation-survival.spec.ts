/**
 * ACCUMULATED CAPABILITY SURVIVES IDENTITY REPLACEMENT — runtime.
 *
 * Closes the identity-replacing enhancer class (`batching`, `timeTravel`,
 * `devTools`) with the property their type contracts CANNOT prove.
 *
 * `.with()` returns `this & TAdded`, so at the type level an earlier enhancer's
 * methods always appear on the result — that is type algebra, and it holds
 * whether or not the replacement object actually carries them. The runtime
 * question is separate and is the one that matters:
 *
 *   an enhancer applied BEFORE an identity-replacing one adds `foo()`.
 *   after the replacement, does `foo()` still exist and still work?
 *
 * A type-only proof here would be exactly the "green representative example"
 * failure this release has already paid for twice: both sides green while they
 * disagree about the same object.
 *
 * The reverse order is included as the control — it exercises no replacement of
 * an already-enhanced tree, so a failure there would mean something much more
 * basic is broken.
 */
import { describe, expect, it } from 'vitest';

import { batching } from '../enhancers/batching/batching';
import { devTools } from '../enhancers/devtools/devtools';
import { createEnhancer } from '../enhancers/index';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { signalTree } from './signal-tree';

import type { ISignalTree } from '../index';

interface FooMethods {
  foo(): string;
}

/** Adds `foo()` by mutation — the ordinary enhancer shape. */
const addsFoo = createEnhancer({ name: 'addsFoo', provides: ['foo'] }, <T>(
  tree: ISignalTree<T>
) => Object.assign(tree, { foo: () => 'foo-result' }) as ISignalTree<T> & FooMethods);

const REPLACERS: Array<[string, () => unknown]> = [
  ['batching', () => batching()],
  ['timeTravel', () => timeTravel()],
  ['devTools', () => devTools()],
];

describe('accumulated capability survives identity replacement', () => {
  for (const [name, make] of REPLACERS) {
    it(`${name}: a property added BEFORE it still works after`, () => {
      const tree = signalTree({ count: 0 })
        .with(addsFoo as never)
        .with(make() as never) as unknown as FooMethods & {
        $: { count: () => number };
      };

      expect(typeof tree.foo).toBe('function');
      expect(tree.foo()).toBe('foo-result');
      // ...and the state surface is still reachable through the replacement.
      expect(tree.$.count()).toBe(0);
    });

    it(`${name}: control — a property added AFTER it works too`, () => {
      const tree = signalTree({ count: 0 })
        .with(make() as never)
        .with(addsFoo as never) as unknown as FooMethods & {
        $: { count: () => number };
      };

      expect(tree.foo()).toBe('foo-result');
      expect(tree.$.count()).toBe(0);
    });
  }

  it('survives TWO stacked replacements', () => {
    const tree = signalTree({ count: 0 })
      .with(addsFoo as never)
      .with(batching())
      .with(timeTravel() as never) as unknown as FooMethods & {
      $: { count: () => number };
      batch(fn: () => void): void;
    };

    expect(tree.foo()).toBe('foo-result');
    expect(tree.$.count()).toBe(0);
    // the intermediate replacement's own surface survived the next one
    expect(typeof tree.batch).toBe('function');
  });
});
