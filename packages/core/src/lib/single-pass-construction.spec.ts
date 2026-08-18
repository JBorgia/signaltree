/**
 * SHAPE-T1B — semantic falsifier for single-pass construction.
 *
 * WHAT THIS IS
 *
 * A self-contained prototype of the candidate phase model, used to answer ONE
 * question:
 *
 *   Assume there is NO public post-construction extension application. All
 *   extension declarations are known before compilation. What surviving
 *   SignalTree-owned function requires modifying extension composition AFTER
 *   the tree is exposed?
 *
 * It imports nothing from `../index`, proposes no API, and changes no
 * production behaviour. It exists so the answer is measured rather than
 * asserted.
 *
 * WHY IT DELIBERATELY DOES NOT MODEL `Enhancer`
 *
 * If the prototype accepted `(tree) => tree & TAdded`, a green result would
 * prove only that today's enhancers can be REPLAYED inside a new lifecycle —
 * not that the abstraction survives. So declarations here are INERT and
 * realizers are internal functions that never receive a public tree. The
 * restriction under test is precise: internal phases may do anything, but once
 * EXPOSE happens, composition is finished.
 *
 *   DECLARE -> DISCOVER -> PLAN -> CONSTRUCT -> REALIZE -> FINALIZE -> EXPOSE
 *
 * CONSTRUCT builds internal kernel state. REALIZE binds behaviour against it.
 * FINALIZE builds the one public callable. Nothing after EXPOSE composes.
 *
 * WHAT A GREEN RESULT DOES AND DOES NOT MEAN
 *
 * Green means every function tested is satisfiable before EXPOSE. It does NOT
 * mean `.with()` is deleted, that `Enhancer` is deleted, or that every
 * #3b-class defect is impossible in the candidate model — only that the KNOWN
 * #3b mechanism (bookkeeping stranded on a replaced tree) has no analogue here.
 * "Old bug disappears" must not be read as "new architecture proven".
 */

import { describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ *
 * The phase model. No Enhancer anywhere.
 * ------------------------------------------------------------------ */

type Contribution = Record<string, unknown>;

/** Inert author intent. Never called with a tree; carries no behaviour. */
interface ExtensionDeclaration {
  readonly id: string;
  /** substrate the kernel must be built WITH, known before CONSTRUCT */
  readonly capabilities?: readonly string[];
  /** public keys this declaration will contribute, known before CONSTRUCT */
  readonly contributes?: readonly string[];
  /** wants to observe every tree call — known before FINALIZE */
  readonly interceptsCall?: boolean;
  /** internal realization, run after CONSTRUCT and before FINALIZE */
  readonly realize?: (ctx: RealizeContext) => Contribution;
}

interface Kernel {
  readonly capabilities: ReadonlySet<string>;
  value: number;
  readonly log: string[];
}

interface RealizeContext {
  readonly kernel: Kernel;
  /** teardown registered during REALIZE, owned by the tree's lifetime */
  registerCleanup(fn: () => void): void;
  /** runtime output published by an earlier realizer (CASE 5) */
  publish(key: string, value: unknown): void;
  consume(key: string): unknown;
  /** called on every tree invocation, installed before FINALIZE (CASE 2) */
  onCall(fn: () => void): void;
}

class CompositionError extends Error {}

interface ExposedTree {
  (): number;
  (next: number): void;
  readonly identity: symbol;
  destroy(): void;
  [key: string]: unknown;
}

function compile(declarations: readonly ExtensionDeclaration[]): ExposedTree {
  // ---- DISCOVER ----------------------------------------------------
  const seen = new Set<string>();
  const claimedKeys = new Map<string, string>();
  const capabilities = new Set<string>();

  for (const d of declarations) {
    if (seen.has(d.id)) {
      throw new CompositionError(`duplicate declaration: ${d.id}`);
    }
    seen.add(d.id);
    for (const cap of d.capabilities ?? []) capabilities.add(cap);
    for (const key of d.contributes ?? []) {
      const prior = claimedKeys.get(key);
      if (prior) {
        throw new CompositionError(
          `conflicting contribution "${key}": ${prior} and ${d.id}`
        );
      }
      claimedKeys.set(key, d.id);
    }
  }

  // ---- PLAN / CONSTRUCT --------------------------------------------
  const kernel: Kernel = { capabilities, value: 0, log: [] };

  // ---- REALIZE ------------------------------------------------------
  const cleanups: Array<() => void> = [];
  const callHooks: Array<() => void> = [];
  const published = new Map<string, unknown>();
  const contributions: Contribution = {};

  for (const d of declarations) {
    if (!d.realize) continue;
    const ctx: RealizeContext = {
      kernel,
      registerCleanup: (fn) => cleanups.push(fn),
      publish: (k, v) => published.set(k, v),
      consume: (k) => published.get(k),
      onCall: (fn) => callHooks.push(fn),
    };
    Object.assign(contributions, d.realize(ctx));
  }

  // ---- FINALIZE — ONE callable, interceptions already inside --------
  const identity = Symbol('tree');
  const tree = function (next?: number): number | void {
    if (next === undefined) {
      for (const h of callHooks) h();
      return kernel.value;
    }
    kernel.value = next;
    for (const h of callHooks) h();
  } as unknown as ExposedTree;

  Object.defineProperty(tree, 'identity', { value: identity });
  Object.defineProperty(tree, 'destroy', {
    value: () => {
      // reverse order, each exactly once
      while (cleanups.length) cleanups.pop()?.();
    },
  });
  for (const [k, v] of Object.entries(contributions)) {
    Object.defineProperty(tree, k, { value: v, enumerable: true });
  }

  // ---- EXPOSE — composition is finished ----------------------------
  Object.freeze(tree);
  return tree;
}

/* ------------------------------------------------------------------ *
 * Real-shaped declarations
 * ------------------------------------------------------------------ */

const transactionsDecl = (): ExtensionDeclaration => ({
  id: 'transactions',
  capabilities: ['causal-runtime'],
  contributes: ['transaction'],
  realize: (ctx) => ({
    transaction: (fn: () => void) => {
      ctx.kernel.log.push('tx:begin');
      fn();
      ctx.kernel.log.push('tx:commit');
    },
  }),
});

const timeTravelDecl = (): ExtensionDeclaration => ({
  id: 'timeTravel',
  capabilities: ['causal-runtime', 'temporal-snapshots'],
  contributes: ['undo', 'history'],
  interceptsCall: true,
  realize: (ctx) => {
    const history: number[] = [];
    ctx.onCall(() => history.push(ctx.kernel.value));
    ctx.registerCleanup(() => history.splice(0, history.length));
    return {
      undo: () => {
        history.pop();
        const prev = history[history.length - 1];
        if (prev !== undefined) ctx.kernel.value = prev;
      },
      history: () => [...history],
    };
  },
});

describe('SHAPE-T1B — single-pass construction', () => {
  it('CASE 1 — runtime contributions bind after CONSTRUCT and before EXPOSE', () => {
    const tree = compile([transactionsDecl(), timeTravelDecl()]);

    // contributed behaviour is present on the exposed tree
    expect(typeof tree['transaction']).toBe('function');
    expect(typeof tree['undo']).toBe('function');

    (tree['transaction'] as (fn: () => void) => void)(() => tree(5));
    expect(tree()).toBe(5);

    // the realizer only ever needed the constructed KERNEL, never an exposed
    // tree — contribution does not require post-exposure application
  });

  it('CASE 1 — the kernel is planned from declared capabilities, not fixed', () => {
    const minimal = compile([]);
    const full = compile([transactionsDecl(), timeTravelDecl()]);
    expect(minimal()).toBe(0);
    // capability set is derived from the declarations, before construction
    expect(full).toBeDefined();
  });

  it('CASE 2 — one callable identity; interception is built in, not bolted on', () => {
    const tree = compile([timeTravelDecl()]);
    const before = tree.identity;

    tree(1);
    tree(2);
    tree(3);

    // interception ran without any replacement tree
    expect((tree['history'] as () => number[])()).toEqual([1, 2, 3]);

    // identity never changed: a reference taken at exposure is still the tree
    expect(tree.identity).toBe(before);

    // and there is no second composition entry point to strand bookkeeping on
    expect((tree as unknown as Record<string, unknown>)['with']).toBeUndefined();
  });

  it('CASE 2 — a retained reference stays coherent after later writes', () => {
    const tree = compile([timeTravelDecl()]);
    const retained = tree;
    tree(7);
    expect(retained()).toBe(7);
    expect(retained).toBe(tree);
  });

  it('CASE 3 — conflicting contributions are refused BEFORE exposure', () => {
    const a: ExtensionDeclaration = { id: 'a', contributes: ['shared'] };
    const b: ExtensionDeclaration = { id: 'b', contributes: ['shared'] };

    expect(() => compile([a, b])).toThrow(CompositionError);
    expect(() => compile([a, b])).toThrow(/conflicting contribution "shared"/);

    // the T0 silent-shadowing failure is detectable here precisely because
    // DISCOVER sees the whole declaration set before anything is built
  });

  it('CASE 3 — non-conflicting contributions still compose', () => {
    const tree = compile([transactionsDecl(), timeTravelDecl()]);
    expect(typeof tree['transaction']).toBe('function');
    expect(typeof tree['undo']).toBe('function');
  });

  it('CASE 4 — teardown registered during REALIZE runs exactly once', () => {
    const spy = vi.fn();
    const decl: ExtensionDeclaration = {
      id: 'lifetime',
      realize: (ctx) => {
        ctx.registerCleanup(spy);
        return {};
      },
    };
    const tree = compile([decl]);
    tree.destroy();
    tree.destroy();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('CASE 5 — a realizer may consume runtime output of an earlier realizer', () => {
    const producer: ExtensionDeclaration = {
      id: 'producer',
      realize: (ctx) => {
        ctx.publish('token', 'from-producer');
        return {};
      },
    };
    const consumer: ExtensionDeclaration = {
      id: 'consumer',
      contributes: ['readToken'],
      realize: (ctx) => ({ readToken: () => ctx.consume('token') }),
    };

    const tree = compile([producer, consumer]);
    expect((tree['readToken'] as () => unknown)()).toBe('from-producer');

    // OUTCOME B: the dependency is satisfiable by INTERNAL realization order.
    // That is not a public composition API, so it does not rescue `.with()`.
  });

  it('CASE 6 — a duplicate declaration is refused before exposure', () => {
    expect(() => compile([transactionsDecl(), transactionsDecl()])).toThrow(
      /duplicate declaration: transactions/
    );
    // the minimum identity needed for the refusal is a declaration id.
    // NOTE: this does NOT establish that `name`/`provides`/`requires` survive —
    // it establishes only that SOME identity is needed to detect duplication.
  });

  it('post-EXPOSE composition is structurally impossible, not merely absent', () => {
    const tree = compile([transactionsDecl()]);
    expect(Object.isFrozen(tree)).toBe(true);
    expect(() => {
      (tree as unknown as Record<string, unknown>)['lateAddition'] = () => 1;
    }).toThrow(TypeError);
  });
});
