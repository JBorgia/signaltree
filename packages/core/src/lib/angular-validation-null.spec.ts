import { computed, effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { entityMap, signalTree } from '../index';

/**
 * ANG-V0 — THE NULL HYPOTHESIS FOR ANGULAR VALIDATION.
 *
 * V0.6 is reversed: SignalTree ships no validation facility. That left one
 * open question — whether an ANGULAR-REACTIVE VALIDATION PROJECTION is a
 * required function that SignalTree's Angular layer must own.
 *
 * This file does NOT start from a proposed projection API. Starting from
 * `validation.errors()` would already assume a SignalTree-owned projection
 * object exists. The null is harsher:
 *
 *   ASSUME @signaltree/schema DOES NOT EXIST and SignalTree exposes NO
 *   validation-specific Angular API. What required Angular workflow becomes
 *   impossible?
 *
 * The null implementation is ordinary Angular composition over published
 * SignalTree truth plus the application's own validator:
 *
 *     const result = computed(() => myValidator(tree.$.user()));
 *
 * NOTHING in this file may import from `@signaltree/core/authoring`, and
 * nothing may use `interceptLeafSignals`. If the null needs privileged access
 * it has failed, and that failure is the finding.
 *
 * A section characterizing `interceptLeafSignals`' own misses (depth cap,
 * array-valued leaves) lived here while the deletion was being decided. It was
 * EVIDENCE, and it is gone: `@signaltree/schema` is deleted, and a mechanism
 * already queued for hostile audit under MUT must not gain test-backed
 * legitimacy from a suite that pins its current deficiencies. The four measured
 * rows live in RELEASE-1.0.md, which is where a one-shot measurement belongs.
 *
 * THE FALSIFIER IS NOT "a projection API would be convenient". It is a
 * REQUIRED WORKFLOW that cannot be implemented correctly without
 * SignalTree-specific knowledge.
 */

// A stand-in for the application's chosen validator. Deliberately opaque to
// SignalTree: it takes a plain value and returns a validator-native result.
// Shaped like a Standard Schema `validate` so the test is honest about what a
// real zod/valibot/arktype call site looks like.
interface Issue {
  readonly path: readonly string[];
  readonly message: string;
}
interface VResult {
  readonly issues: readonly Issue[];
}

function validateUser(u: { name: string; age: number }): VResult {
  const issues: Issue[] = [];
  if (u.name.length < 2) issues.push({ path: ['name'], message: 'too short' });
  if (u.age < 0) issues.push({ path: ['age'], message: 'negative' });
  return { issues };
}

interface AppState {
  count: number;
  user: { name: string; age: number };
  other: { untouched: string };
}

const initial = (): AppState => ({
  count: 0,
  user: { name: 'Ada', age: 36 },
  other: { untouched: 'x' },
});

// ============================================================================
// ANG-V0-A — does the null WORK AT ALL over every published write form?
// ============================================================================
describe('ANG-V0-A — computed over published truth tracks every write form', () => {
  it('branch read invalidates on a nested leaf .set()', () => {
    const tree = signalTree(initial());
    let runs = 0;
    const result = computed(() => {
      runs++;
      return validateUser(tree.$.user());
    });

    expect(result().issues).toEqual([]);
    expect(runs).toBe(1);

    tree.$.user.name.set('A');

    expect(result().issues.map((i) => i.message)).toEqual(['too short']);
    expect(runs).toBe(2);
  });

  it('branch read invalidates on a BRANCH call-form write', () => {
    const tree = signalTree(initial());
    const result = computed(() => validateUser(tree.$.user()));
    expect(result().issues).toEqual([]);

    tree.$.user({ age: -1 });

    expect(result().issues.map((i) => i.message)).toEqual(['negative']);
  });

  it('branch read invalidates on a branch UPDATER write', () => {
    const tree = signalTree(initial());
    const result = computed(() => validateUser(tree.$.user()));
    expect(result().issues).toEqual([]);

    tree.$.user((c) => ({ ...c, name: '' }));

    expect(result().issues.map((i) => i.message)).toEqual(['too short']);
  });

  it('ROOT read invalidates on a root write', () => {
    const tree = signalTree(initial());
    const result = computed(() => validateUser(tree().user));
    expect(result().issues).toEqual([]);

    tree({ user: { name: 'B', age: 36 } });

    expect(result().issues.map((i) => i.message)).toEqual(['too short']);
  });

  it('root read invalidates on a DEEP LEAF write (root read is not stale)', () => {
    const tree = signalTree(initial());
    const result = computed(() => validateUser(tree().user));
    expect(result().issues).toEqual([]);

    tree.$.user.name.set('C');

    expect(result().issues.map((i) => i.message)).toEqual(['too short']);
  });

  it('leaf-scoped read invalidates on its own leaf write', () => {
    const tree = signalTree(initial());
    const nameOk = computed(() => tree.$.user.name().length >= 2);
    expect(nameOk()).toBe(true);

    tree.$.user.name.set('D');

    expect(nameOk()).toBe(false);
  });
});

// ============================================================================
// ANG-V0-B — is the null PRECISE, or does it merely work?
//
// The strongest surviving argument for a SignalTree-owned projection is that
// SignalTree knows WHICH PATHS a write touched and plain `computed` does not,
// so the null would over-validate. Measured, not assumed.
// ============================================================================
describe('ANG-V0-B — precision of the null', () => {
  it('does NOT recompute when an unrelated sibling branch is written', () => {
    const tree = signalTree(initial());
    let runs = 0;
    const result = computed(() => {
      runs++;
      return validateUser(tree.$.user());
    });
    result();
    expect(runs).toBe(1);

    tree.$.other.untouched.set('y');
    tree.$.count.set(99);
    result();

    expect(runs).toBe(1);
  });

  it('does NOT recompute for a deep-equal write that never landed', () => {
    const tree = signalTree(initial());
    let runs = 0;
    const result = computed(() => {
      runs++;
      return validateUser(tree.$.user());
    });
    result();
    expect(runs).toBe(1);

    // Structurally identical, freshly allocated — core reports this as landing
    // nothing, and the null must inherit that.
    tree.$.user({ name: 'Ada', age: 36 });
    result();

    expect(runs).toBe(1);
  });

  it('a per-field projection recomputes only for its own field', () => {
    const tree = signalTree(initial());
    let nameRuns = 0;
    let ageRuns = 0;
    const nameErr = computed(() => {
      nameRuns++;
      return tree.$.user.name().length < 2 ? 'too short' : null;
    });
    const ageErr = computed(() => {
      ageRuns++;
      return tree.$.user.age() < 0 ? 'negative' : null;
    });
    nameErr();
    ageErr();
    expect([nameRuns, ageRuns]).toEqual([1, 1]);

    tree.$.user.age.set(-5);
    nameErr();
    ageErr();

    expect(nameErr()).toBeNull();
    expect(ageErr()).toBe('negative');
    expect([nameRuns, ageRuns]).toEqual([1, 2]);
  });
});

// ============================================================================
// ANG-V0-C — ASYNC. Does correct async validation require information only
// SignalTree can provide?
//
// The question is NOT "is manual async validation annoying". It is whether
// out-of-order resolution can be made correct with Angular lifecycle plus
// evaluator-local generations alone — the same async ownership result V1
// already established for the non-Angular case.
// ============================================================================
describe('ANG-V0-C — async validation owned entirely by the consumer', () => {
  it('discards a stale in-flight run when truth changes (out-of-order resolve)', async () => {
    const tree = signalTree(initial());

    // Consumer-owned async plumbing. No SignalTree involvement beyond reading.
    const verdict = signal<string | null>('unvalidated');
    const pending = signal(false);
    let generation = 0;
    const resolvers: Array<(v: string | null) => void> = [];

    const runValidator = (_name: string) =>
      new Promise<string | null>((res) => resolvers.push(res));

    TestBed.runInInjectionContext(() => {
      effect(() => {
        const name = tree.$.user.name();
        const mine = ++generation;
        pending.set(true);
        void runValidator(name).then((v) => {
          if (mine !== generation) return; // stale — discard
          verdict.set(v);
          pending.set(false);
        });
      });
    });
    TestBed.tick();

    // W1 then W2, before either resolves.
    tree.$.user.name.set('first');
    TestBed.tick();
    tree.$.user.name.set('second');
    TestBed.tick();

    expect(resolvers.length).toBe(3); // initial + W1 + W2
    expect(pending()).toBe(true);

    // Resolve OUT OF ORDER: the newest first, then the stale ones.
    resolvers[2]('verdict-for-second');
    await Promise.resolve();
    resolvers[1]('verdict-for-first');
    resolvers[0]('verdict-for-initial');
    await Promise.resolve();
    await Promise.resolve();

    expect(verdict()).toBe('verdict-for-second');
    expect(pending()).toBe(false);
  });

  it('exposes pending/settled as ordinary Angular signals', async () => {
    const tree = signalTree(initial());
    const inFlight = signal(0);
    const settled = computed(() => inFlight() === 0);
    const resolvers: Array<() => void> = [];

    TestBed.runInInjectionContext(() => {
      effect(() => {
        tree.$.user.age();
        inFlight.update((n) => n + 1);
        void new Promise<void>((res) => resolvers.push(res)).then(() =>
          inFlight.update((n) => n - 1)
        );
      });
    });
    TestBed.tick();

    expect(settled()).toBe(false);
    tree.$.user.age.set(7);
    TestBed.tick();
    expect(inFlight()).toBe(2);

    resolvers.forEach((r) => r());
    await Promise.resolve();
    await Promise.resolve();

    expect(settled()).toBe(true);
  });
});

// ============================================================================
// ANG-V0-D — THE STRONGEST SURVIVING CANDIDATE.
//
// `@signaltree/schema` does not use `computed` over published truth. It
// attaches `interceptLeafSignals` from `@signaltree/core/authoring` and
// validates PUSH-side, on write events. That is a privileged mechanism the
// null cannot use.
//
// So the question is not whether push works — it does. It is whether push is
// REQUIRED: is there validation-relevant truth that changes WITHOUT notifying
// the Angular read surface a `computed` would subscribe to? If yes, only an
// interceptor-based projection can be correct, and the function survives. If
// no, `interceptLeafSignals` is a mechanism choice, not a requirement.
// ============================================================================
describe('ANG-V0-D — is any truth change invisible to the pull surface?', () => {
  it('entityMap CRUD is visible through its own read surface', () => {
    const tree = signalTree({
      rows: entityMap<{ id: string; n: number }>(),
    });
    let runs = 0;
    const summary = computed(() => {
      runs++;
      return tree.$.rows.all().map((r) => r.n);
    });

    expect(summary()).toEqual([]);
    expect(runs).toBe(1);

    tree.$.rows.addMany([{ id: 'a', n: 1 }]);
    expect(summary()).toEqual([1]);
    expect(runs).toBe(2);

    tree.$.rows.updateOne('a', { n: 2 });
    expect(summary()).toEqual([2]);
    expect(runs).toBe(3);
  });

  // WITHDRAWN WITH STATUS-DEL — "status transitions are visible through the pull
  // surface". ANG-V0's frozen result is recorded and does not rest on this
  // specimen.

  it('CONTROL — a computed that reads nothing never recomputes', () => {
    const tree = signalTree(initial());
    let runs = 0;
    const constant = computed(() => {
      runs++;
      return 1;
    });
    constant();
    tree.$.user.name.set('zzz');
    constant();
    expect(runs).toBe(1);
  });
});

// ============================================================================
// ANG-V0-E — THE ROOT-SNAPSHOT NULL.
//
// The most natural whole-object form is `computed(() => validate(tree()))`.
// It is the form a schema over an entire state shape wants. Measured
// separately because a marker-bearing tree is where root projection is known
// to be fragile.
// ============================================================================
describe('ANG-V0-E — root snapshot as the validated value', () => {
  it('root snapshot recomputes for a plain leaf write', () => {
    const tree = signalTree(initial());
    let runs = 0;
    const snap = computed(() => {
      runs++;
      return tree();
    });
    snap();
    tree.$.user.name.set('Q');
    expect(snap().user.name).toBe('Q');
    expect(runs).toBe(2);
  });

  // WITHDRAWN WITH STATUS-DEL — "MEASURES what a marker projects into the root
  // snapshot". `status()` was the only specimen and the assertion named its
  // shape directly.
});
