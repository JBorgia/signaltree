import { linkedSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { linked } from './linked';
import { signalTree } from './signal-tree';

/**
 * DERIVATION — `linked`.
 *
 * `linked` is 82 lines, of which the implementation is four:
 *
 *     if (typeof arg === 'function') return linkedSignal(arg);
 *     const { source, computation, equal } = arg;
 *     return linkedSignal({ source, computation, ...(equal ? { equal } : {}) });
 *
 * A pure pass-through to Angular's `linkedSignal`, with the same two call forms
 * Angular already offers. Its docblock attributes the type-level writability to
 * the `ProcessDerived` fix — which lives in the derived pipeline, NOT in
 * `linked` — so the null is simply: use `linkedSignal` directly inside
 * `.derived()`.
 *
 * THE FALSIFIER: is there any measurable difference?
 */
type Option = { id: number; label: string };

const OPTS: Option[] = [
  { id: 1, label: 'a' },
  { id: 2, label: 'b' },
];

describe('linked — the null is Angular', () => {
  it('THE INCUMBENT — sticky selection survives a source change', () => {
    const tree = signalTree({ options: OPTS }).derived(($) => ({
      selected: linked({
        source: () => $.options(),
        computation: (opts, prev): Option | undefined =>
          opts.find((o) => o.id === prev?.value?.id) ?? opts[0],
      }),
    }));

    expect(tree.$.selected()?.id).toBe(1);
    tree.$.selected.set({ id: 2, label: 'b' });
    expect(tree.$.selected()?.id).toBe(2);

    // Source changes; the prior intent is preserved because id 2 still exists.
    tree.$.options.set([
      { id: 2, label: 'b2' },
      { id: 3, label: 'c' },
    ]);
    expect(tree.$.selected()?.id).toBe(2);
    expect(tree.$.selected()?.label).toBe('b2');
  });

  it('THE NULL — `linkedSignal` used directly is INDISTINGUISHABLE', () => {
    const tree = signalTree({ options: OPTS }).derived(($) => ({
      selected: linkedSignal({
        source: () => $.options(),
        computation: (opts, prev): Option | undefined =>
          opts.find((o) => o.id === prev?.value?.id) ?? opts[0],
      }),
    }));

    expect(tree.$.selected()?.id).toBe(1);
    // Writable at runtime AND at the type level — no cast, because the
    // writability fix is in ProcessDerived, not in `linked`.
    tree.$.selected.set({ id: 2, label: 'b' });
    expect(tree.$.selected()?.id).toBe(2);

    tree.$.options.set([
      { id: 2, label: 'b2' },
      { id: 3, label: 'c' },
    ]);
    expect(tree.$.selected()?.id).toBe(2);
    expect(tree.$.selected()?.label).toBe('b2');
  });

  it('THE SHORT FORM is equally indistinguishable', () => {
    const viaLinked = signalTree({ count: 2 }).derived(($) => ({
      doubled: linked(() => $.count() * 2),
    }));
    const viaAngular = signalTree({ count: 2 }).derived(($) => ({
      doubled: linkedSignal(() => $.count() * 2),
    }));

    for (const t of [viaLinked, viaAngular]) {
      expect(t.$.doubled()).toBe(4);
      t.$.doubled.set(99); // override
      expect(t.$.doubled()).toBe(99);
      t.$.count.set(5); // source change re-derives, discarding the override
      expect(t.$.doubled()).toBe(10);
    }
  });

  it('THE NULL FAILS ON `equal` — and this is the one thing `linked` contributes', () => {
    // Angular's own overload lets `equal` participate in inference, so `V`
    // collapses to `unknown` and the callback's parameters become `unknown`:
    //
    //   linkedSignal({ source, computation, equal: (a, b) => a.boxed === b.boxed })
    //     -> TS2769 "No overload matches this call"
    //        Type '(a: {boxed:number}, b: {boxed:number}) => boolean' is not
    //        assignable to 'ValueEqualityFn<unknown>'
    //
    // `LinkedOptions` annotates `equal?: (a: NoInfer<V>, b: NoInfer<V>)`, so `V`
    // resolves from `computation`'s return and the callback types correctly.
    const viaLinked = signalTree({ n: 1 }).derived(($) => ({
      v: linked({
        source: () => $.n(),
        computation: (n) => ({ boxed: n }),
        equal: (a, b) => a.boxed === b.boxed,
      }),
    }));

    // The null still REACHES the behaviour — it needs explicit type arguments.
    const viaAngular = signalTree({ n: 1 }).derived(($) => ({
      v: linkedSignal<number, { boxed: number }>({
        source: () => $.n(),
        computation: (n) => ({ boxed: n }),
        equal: (a, b) => a.boxed === b.boxed,
      }),
    }));

    expect(viaLinked.$.v().boxed).toBe(1);
    expect(viaAngular.$.v().boxed).toBe(1);
    viaLinked.$.n.set(7);
    viaAngular.$.n.set(7);
    expect(viaLinked.$.v().boxed).toBe(7);
    expect(viaAngular.$.v().boxed).toBe(7);

    // So the contribution is an INFERENCE FIX over a third-party signature, not
    // a behaviour. The function is Angular's; what `linked` saves is an
    // annotation.
  });
});
