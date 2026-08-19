/**
 * TYPE-TEST — compile-time only. Checked by
 * `tsc -p packages/core/tsconfig.typecheck.json`, EXCLUDED from vitest (the
 * `*typing*.spec.ts` ignore).
 *
 * WHAT THIS FILE IS FOR
 *
 * The `linked` derivation turns entirely on a TYPE-LEVEL claim, and ordinary
 * `.spec.ts` files are typechecked by no gate: `typecheck:source` is strict over
 * all source but EXCLUDES `**\/*.spec.ts`, and `typecheck:typing` includes only
 * `*.typing.spec.ts`. So the claim lives here, where it is actually gated —
 * `linked-null.spec.ts` keeps the runtime rows.
 *
 * THE CLAIM
 *
 * `linked` is a four-line pass-through to Angular's `linkedSignal`, so the null
 * is "use `linkedSignal` directly". That null holds for both call forms EXCEPT
 * when a custom `equal` is supplied:
 *
 *   Angular's overload lets `equal` participate in inference, so `V` collapses
 *   to `unknown` and the callback's parameters are `unknown`.
 *
 *   `LinkedOptions` annotates `equal?: (a: NoInfer<V>, b: NoInfer<V>)`, so `V`
 *   resolves from `computation`'s return instead.
 *
 * A green file proves the inference fix is REAL. It does not prove the fix is a
 * FUNCTION SignalTree must own — row 3 below is the one that settles that, by
 * showing the null is reachable with explicit type arguments. The contribution
 * is an annotation saved, not a behaviour gained.
 */
import { linkedSignal } from '@angular/core';

import { linked } from './linked';

type Boxed = { boxed: number };

// ── ROW 1 — `linked`'s option form infers `V` through a custom `equal` ────────
declare const n1: () => number;
const viaLinked = linked({
  source: n1,
  computation: (n) => ({ boxed: n }),
  // `a`/`b` are `Boxed`, not `unknown`. If inference regressed, `.boxed` here
  // would be the error.
  equal: (a, b) => a.boxed === b.boxed,
});
const r1: number = viaLinked().boxed;
void r1;

// ── ROW 2 — the SHORT form is a genuine pass-through ──────────────────────────
declare const n2: () => number;
const shortLinked = linked(() => n2() * 2);
const shortAngular = linkedSignal(() => n2() * 2);
const r2a: number = shortLinked();
const r2b: number = shortAngular();
shortLinked.set(1);
shortAngular.set(1);
void r2a;
void r2b;

// ── ROW 3 — THE NULL IS REACHABLE, with explicit type arguments ───────────────
// This is the row that decides the derivation. The behaviour is not exclusive to
// `linked`; only the inference is.
declare const n3: () => number;
const viaAngularAnnotated = linkedSignal<number, Boxed>({
  source: n3,
  computation: (n) => ({ boxed: n }),
  equal: (a, b) => a.boxed === b.boxed,
});
const r3: number = viaAngularAnnotated().boxed;
void r3;

// ── ROW 4 — both produce a WRITABLE signal, which is the shared function ──────
viaLinked.set({ boxed: 9 });
viaAngularAnnotated.set({ boxed: 9 });
viaLinked.update((v) => ({ boxed: v.boxed + 1 }));
viaAngularAnnotated.update((v) => ({ boxed: v.boxed + 1 }));
