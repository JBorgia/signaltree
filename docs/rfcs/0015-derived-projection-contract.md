# RFC 0015 — The derived projection contract

Status: **derivation frozen; API cut not authorized**
Evidence: `packages/core/src/lib/derived-projection-contract.typing.spec.ts`

This RFC records a derivation, not an implementation plan. It froze one
architectural result and explicitly refused to freeze three others. The refusals
are the point: each was a place where a measured result was one inference step
away from being promoted into an architecture it did not establish.

## What was being asked

Whether TypeScript can support a single declarative construction —

```ts
signalTree({
  store: { quantity: 2, price: 10 },
  derived: {
    subtotal: ($) => $.quantity() * $.price(),
    tax: ($) => $.subtotal() * 0.08,
    total: ($) => $.subtotal() + $.tax(),
  },
});
```

— with strongly inferred `tree.store`, `tree.derived` and a unified `tree.$`,
with zero user annotations and zero `any` leakage.

## Result 1 — the exact target is refuted, and the first "proof" was a false green

The proposed encoding `derived: D & CheckedDerived<S, D>` appears to work.
Revealing the inferred generic shows why it does not:

```
D = { fullName: ($: any) => string;  subtotal: ($: any) => number;
      tax:      ($: any) => number;  total:    ($: any) => any }
```

`$` is `any` in every projector. `fullName` is `string` because a template
literal always is; `subtotal` and `tax` are `number` because `any * 0.08` is
`number` by the arithmetic operator's rule. Only `total` — `any + any` — exposes
the leak.

Twelve encodings were measured: bare intersection, F-bounded constraint,
reverse-mapped result map, `ThisType` (the Vue options-API technique, in both
its `unknown`- and `any`-returning constraint forms), overload phases, `NoInfer`,
defaulted type params, recursive skeletons, staged tuples, keys-only facade, and
the store-only kernel. The finding, stated as measured rather than as a theorem:

> Across the tested TypeScript 6.0.3 encodings, a same-call contextual facade
> that depends on sibling projector return inference either degrades to `any`,
> collapses to `unknown`, or loses contextual typing entirely. A separate
> inference/call boundary is the only measured mechanism that restored precise
> cross-tier typing.

The mechanism: TypeScript defers context-sensitive arguments to a later inference
pass, and every context-sensitive property of one object literal — and every
element of one tuple argument — is processed in that same pass. A construction
facade may therefore depend only on information obtainable without checking any
projector body. Store shape qualifies. Derived key names qualify, via a
function-free inference site such as `Record<K, unknown>`. Derived return types
do not.

### Return annotations are disqualified, not merely limited

```ts
tax: ($): number => $.subtotal().definitelyNotANumberMethod() as number
//                              ^ no error; tree.$.tax() still reports `number`
```

An annotation restores only the exported type. The body stays unchecked, so the
annotation launders `any` into a declared `number`. This was initially reported
as the "minimum unavoidable concession"; it is neither minimum nor a concession,
and the correction is pinned in section B of the spec.

## Result 2 — cross-derived composition does not survive hostile subtraction

Under the null hypothesis that projectors read store truth only:

- **Semantics — DELETE.** Projectors are pure functions of store truth, so any
  finite acyclic composition collapses by substitution:
  `tax = f(subtotal(store))` = `(f ∘ subtotal)(store)`. Two things become
  unrepresentable, both beneficially: cycles, which have no fixpoint semantics
  as projections, and accumulators reading their own prior output, which are
  state and belong in `store`.
- **Reuse — DELETE.** Ordinary pure functions, identical precision.
- **Identity — DELETE.** Falsification attempted and failed: every real
  cross-derived read consumes a value (`user.id`, `post.authorId`, `.length`),
  never a reference.
- **Realization — DELETE.** Optimizational only. Store-only makes the graph
  depth-1, retiring derived ordering, topological scheduling, invalidation
  propagation, and derived-to-derived lifetime from core.
- **Module composition, nesting — DELETE.** Strictly easier: the facade is
  `DeepStore<S>`, independent of `D`, so an external read model needs only the
  store shape.
- **Shared memoization — the function SURVIVES.**

Real consumers agree. Of 11 projections in the demo's three derived tiers, three
cross tiers: two re-read a two-line id lookup (code reuse), one reads a filtered
list (performance). Tier 1 is already documented "Dependencies: base state only".

## Result 3 — the memoization function survives; SignalTree's ownership of it does not

Measured on the one real case, 5,000 posts, 200 invalidations, two consumers:

```
A cross-derived (tier2 reads tier1)   evals=200   58.2ms
B private computed, outside tree      evals=200   50.9ms
C private memo, inside store-only     evals=200   55.3ms
D store-only factory + lexical const  evals=200   54.7ms
```

Naive store-only duplication is the contrast: 400 evals / 72ms — a bounded
constant factor equal to fan-out, not a complexity change. All of B, C and D
recover the shared count exactly, with identical externally visible values,
correct invalidation across successive changes, and per-tree lifecycle isolation.

Form D is the cleanest: the shared node is an ordinary lexical `const`, so the
dependency edge is a JavaScript variable and SignalTree models nothing.

Function survives. **Owner: SignalTree — refuted.**

## The frozen contract

```
A derived projection
  is read-only
  is a direct projection of canonical store truth
  has no derived -> derived dependency
  has no causal identity
  has no persistence identity
  may live in a nested derived namespace
  composes with store branches into tree.$
  may not collide with a store TERMINAL
```

Branch overlap composes recursively; only terminal overlap is an error, reported
as a dotted path (`"customer.name"`). `DeepMergeTree`'s recursive-composition
half is the right idea; its "derived wins at a terminal collision" rule is the
wrong terminal rule, because `$` cannot honestly merge two terminals.

Spelling frozen as the object-literal form. Two load-bearing encoding details,
each measured wrong first: the spec constraint must be an index signature, not a
recursive conditional over `D` (which yields TS7006 and no contextual type); and
the collision guard must be a defaulted type param read from the return type,
not a constraint member (where it is evaluated against `D`'s constraint and fires
on every non-colliding tree).

## Deliberately NOT frozen

| Item | State |
|---|---|
| `.derived()` chain, derived tiers, `WithDerived` | DELETE candidates — cut not authorized |
| `derivedFrom()` | function PROVED (TS7006 at a module boundary is real); reduces to the external read-model helper; form unsettled |
| `linked()` as derived | REFUTED |
| `linked()` function / owner / store placement | UNPROVEN, all three |

`linked()` deserves its own audit. It wraps Angular's `linkedSignal`: writable,
holds a `.set()` override, and its `computation(source, prev)` reads its own
previous value. That is not a projection of store truth — it is truth with a
re-derivation policy. It lives in `.derived()` only for facade access, by its own
documentation, and `ProcessDerived` carries a dedicated `WritableSignal`-before-
`Signal` branch purely to carry it back out. So today's `derived` conflates two
ontologies. That its current placement is wrong says nothing about where it goes,
or whether the function survives at all.

## Note on the typecheck gate

`tsc -p packages/core/tsconfig.typecheck.json` is red on HEAD independently of
this RFC: 16 errors, from `marker-resolution.typing.spec.ts`,
`readonly.typing.spec.ts` and `signal-tree-type-matrix.typing.spec.ts` importing
`form` / `FormSignal` / `ReadonlyFormWizard`, which the ng-forms reslice removed,
plus ten failing `Expect` rows in `readonly.typing.spec.ts`. Unrelated to this
work and not fixed here, but a type-level gate that is already red cannot defend
anything.
