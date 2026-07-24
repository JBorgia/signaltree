# RFC 0005 — Where does the entity loader live? Tree-shaking and composability options for `entityMap`'s loading capability

**Status:** **Decided after adversarial review (2026-07-23): option A stays — see §6.** §3's recommendation of option B is superseded; B is archived as the proven fallback design.
**Date:** 2026-07-23
**Builds on:** [RFC 0002](0002-entity-collection.md), [RFC 0003](0003-keyed-entity-collection.md) (§0 fold-in), [RFC 0004](0004-v12-optimal-iteration.md) (§5 ratchet)
**Affects:** `@signaltree/core` (`entityMap`, `entity-loader`), size claims, all doc surfaces

## 0. The measured problem

The docs claim (`entity-map.ts` module comment, cookbook, llms-full.txt): *"the
loader machinery lives in `./entity-loader` and is only pulled in when `load`
is used."* **Measured 2026-07-23, this is false:**

| Bundle (esbuild, `@angular/*`/rxjs external, branch-12 dist) | gzip |
|---|---|
| `signalTree` only | 7,618 B |
| `signalTree` + plain `entityMap()` (no `load`) | **13,470 B** |
| `signalTree` + `entityMap({ load })` | 13,484 B |

> **Correction (§6, 2026-07-23):** the sentence below misattributes the
> delta. The loader's true removable share is **~2.3 KB gzip unminified /
> ~1.5 KB min+gzip** (measured by loader-stubbed and option-B-simulated
> bundles); the rest is `entity-signal.ts` CRUD machinery a plain collection
> legitimately uses. "~5.9 KB loader penalty" wherever it appears in §§0-3 is
> wrong and superseded.

A plain client-side collection pays the full ~5.9 KB gzip loader penalty —
the plain and loaded bundles are byte-for-byte nearly identical, with 15
loader-unique identifiers present in both. Root cause:
`entity-map.ts:6` **statically imports** `attachLoader` and calls it behind a
runtime config check — a conditional no bundler can dead-code-eliminate.
(`entity-loader.ts` is 601 lines and also pulls
`@angular/core/rxjs-interop` + rxjs machinery.)

Two consequences:

1. **A false public claim** (RFC 0004 audit class a) — must be corrected in
   docs *regardless of which option wins*, and a loader-shake case must be
   added to `verify-tree-shaking.js` (which today only tests enhancers), with
   a negative test proving the check fails on the current build (§5 rule 2).
2. **RFC 0003 §0's fold-in rationale is partially undermined.** It argued
   "no tree-shaking win from splitting" — the win exists (~5.9 KB); it just
   was never implemented. Note the rationale conflated two axes: *marker
   count* (one vs two markers — the decision-burden axis, correctly resolved
   toward ONE marker) and *import structure* (static vs injected capability —
   the tree-shaking axis, never actually addressed). This RFC is only about
   the second axis; nothing here reopens the single-marker decision.

## 1. The in-repo precedent

v11.0.0 solved this exact shape for `security` (`signal-tree.ts:116-134`):

> "the validator + its recursive walk live in `@signaltree/core/security` and
> are carried on `config.security` by the `security()` helper. Core no longer
> statically imports SecurityValidator, so it tree-shakes out of every bundle
> that doesn't opt in."

With a **fail-closed guard**: a raw config object that isn't the branded
helper output throws a coded error instead of silently skipping — "TS
consumers get a compile error; this guard catches the JS/`any` case and fails
loudly." `lazy()` follows the same injected-feature pattern. This is the
blueprint: capability code arrives via the *import*, the config *carries* it,
and absence of the helper is loud, never silent-inert (§5 rule 4's defect
class).

## 2. Options

### A. Status quo — `entityMap({ load: fn })`, static import

- **Pro:** shipped (11.4.0); most agent-guessable shape (TanStack prior:
  config object with a query function); one concept, zero migration.
- **Con:** every plain-collection user pays ~5.9 KB gzip for machinery they
  don't use; the "only pay for what you use" pitch is false for the
  second-most-important marker; inconsistent with the library's own
  `security()`/`lazy()` precedent. Keeping A means *changing the claim to
  match the code* — publicly documenting that `entityMap` always includes the
  loader.

### B. Injected capability — `entityMap({ load: loader(fn, opts) })` ★ recommended

The `loader()` helper (exact name deferred to RFC 0004 §4 S0 — candidates:
`loader`, `loading`, `fetched`) is a separate export carrying `attachLoader`
and the loader-family options (`staleTime`/`swr`/`tags`/`persist`/`equal`/
`clearOnParamsChange`) as a branded feature object, exactly like
`security()`:

```ts
import { signalTree, entityMap, loader } from '@signaltree/core';

const tree = signalTree({
  plants: entityMap<Plant, string>({
    selectId: (p) => p.url,
    load: loader(() => api.list$(), { staleTime: '30m', swr: true, tags: ['plants'] }),
  }),
});
```

- **Pro:** true structural tree-shaking (import-driven, not config-driven);
  keeps ONE marker — preserves RFC 0003's hard-won anti-decision-burden
  outcome; exact `security()` precedent including the fail-closed guard (a
  raw function on `load` without the helper → coded `[ST####]` error naming
  the fix — silent-inert is impossible); the branded feature object can carry
  the scope-param type `P`, likely *improving* the current three-generic
  inference story; loader-family config keys move inside the helper, so the
  plain `entityMap` config surface gets smaller and more honest.
- **Con:** +1 import and +1 wrapper call of ceremony; a *fourth* shape for
  this capability in five weeks (11.2 separate marker → 11.3 `key` shape →
  11.4 fold-in → this) — prior-churn is real, though adoption is ~zero and
  the 11.4 shape is three days old, so this is the cheapest moment there will
  ever be; `load: loader(...)` reads slightly doubled (naming for S0).

### C. Wrapper marker — `loadable(entityMap(cfg), opts)` (the prompting idea)

- **Pro:** true tree-shaking; generalizes to a node-level combinator algebra
  (`persisted(loadable(entityMap()))`…) that would extend SignalTree's
  "capabilities compose at any node" differentiator vs NgRx's root-only
  `with*`.
- **Con:** the algebra is speculative with **n=1 capabilities** — RFC 0001
  forbids pre-demand surface; wrapper nesting/ordering semantics are
  undefined design space and agent-hallucination bait
  (`loadable(persisted(x))` vs `persisted(loadable(x))`); reintroduces a
  "which construct do I reach for" fork that RFC 0003 §0 explicitly killed;
  generic threading (`loadable` must re-expose `E`/`K` and add `P` through
  the builder types) is a second public generic surface; no ecosystem prior
  (TanStack/NgRx agents won't guess it). **Fallback position:** if a second
  genuinely demanded node-level capability appears, revisit — the algebra
  would then earn its keep, and B's helper migrates cleanly into it.

### D. Builder method — `entityMap(cfg).loadable(opts)`

A `.loadable()` method must exist on every builder instance → statically
pulls the loader; fails the tree-shaking goal outright. The salvageable
variant — generic `.use(loader(opts))` where the helper carries the code —
is just B with method-call sugar and one extra concept. Dominated by B.

### E. Subpath twin — `import { entityMap } from '@signaltree/core/loading'`

Two same-named exports with different capabilities: importing the plain one
and passing `load` either silently no-ops (the §5 rule-4 defect class,
disqualifying) or needs the same fail-closed guard as B while *also* carrying
the two-names confusion. Dominated by B.

### F. Separate marker (`entityCollection`)

Tried, shipped (11.2/11.3), reverted same-day with documented reasons
(RFC 0003 §0). Included for completeness; dead.

### G. Dynamic `import()` inside the materializer

Makes materialization async: the loader surface appears a tick after the
signal exists (races with immediate `.load()` calls), non-deterministic under
SSR, bundler chunk side effects. Rejected.

## 3. Recommendation and migration

**B**, staged to be honest about churn and to give the eventual major a real
payload:

- **11.6.0:** introduce `loader()`; raw `load: fn` still works via the static
  import (unchanged behavior) but is deprecated with a dev-mode pointer to
  the helper. Docs/size claims corrected to the measured numbers *now* —
  including the interim truth that the shake win only materializes for apps
  using the helper form once the raw path is gone.
- **v12 (whenever earned):** remove the raw-`fn` path and the static import —
  the ~5.9 KB win becomes real for every plain-collection user. This gives
  the deferred major its first concrete, user-visible payload (RFC 0004
  §3 V-MAJOR said majors are earned by accumulated deliberate breakage — this
  is the first deposit).
- Gates either way: loader-shake case in `verify-tree-shaking.js` (with
  negative test), corrected claims in cookbook/llms/entity-map comments,
  fail-closed guard test, and the S0 naming pass covers the helper's name.

Per RFC 0004 §5 rule 1, this recommendation is a single-pass analysis and
**must survive its own adversarial review before implementation** — including
an attack on whether the ~5.9 KB matters enough to justify a fourth shape,
and a check of what the loaded-path bundle actually contains (e.g. whether
`persist` adapters and rxjs-interop can be split further).

## 4. Extended sweep — where else the pattern applies (measured 2026-07-23)

Full size ladder (esbuild, `@angular/*`/rxjs external, branch-12 dist, gzip):

| Bundle | gzip | Δ over bare |
|---|---|---|
| bare `signalTree` | 7,629 | — |
| + `status()` | 8,528 | +899 |
| + `asyncSource()` | 8,741 | +1,112 |
| + `asyncQuery()` | 9,002 | +1,373 |
| + `stored()` | 9,056 | +1,427 |
| + `form()` plain | 10,272 | +2,643 |
| + `form()` with `asyncValidators` | 10,283 | **+11 vs plain form** |
| + `entityMap()` plain | 13,479 | +5,850 |
| + `entityMap({ load })` | 13,489 | **+10 vs plain** |

**What's healthy:** the marker architecture itself tree-shakes correctly —
each marker pays only its own way (self-registering processors work as
claimed). The violations are all *within-marker capabilities* gated on config
instead of imports.

### Confirmed instances of the anti-pattern

1. **`entityMap` loader** (this RFC's subject): 8,938 raw bytes of
   `entity-loader.js` in every plain-collection bundle (metafile
   attribution); the +10 B plain-vs-loaded delta proves it ships regardless.
2. **`form()` async-validation machinery**: +11 B delta between a form with
   and without `asyncValidators` — the async pipeline ships to every form
   user. Monolithic within `form.ts` (metafile can't split a single module),
   so the fix requires a module split before an injected shape
   (`asyncValidators: asyncRules(...)`) is even measurable. Smaller prize
   (form totals 2.6 KB gzip); candidate, not commitment.
3. **ng-forms manual bridge**: 5 bridge identifiers present in a bundle
   importing only `createFormTree` — Angular 22 consumers ship the bridge
   code unconditionally. Different fix shape (subpath or accelerated
   deprecation of `createFormTree` itself), same root cause: code-path
   gating instead of import gating. **Bonus stale claim found:** the
   bridge's dev warning says it "will be removed in v6.0" — v6.0 shipped
   in 2025; the message names a past version.
   > **Correction (2026-07-24):** the framing above as a "deprecated Angular
   > 20.0–20.2 fallback…selected by runtime feature-detection of `connect()`"
   > is wrong. Angular has never had a `connect()` API on `FormControl`/
   > `FormArray`, so any such feature-detection always resolves false — the
   > manual bridge is not a fallback for a missing native API, it is the
   > sole sync path, unconditionally, on Angular 20/21/22 alike. The "will be
   > removed in v6.0" stale-claim finding stands as originally written.
4. **Broken documented import (live doc bug, agent-facing):**
   `llms-full.txt:232` and `docs/guides/entity-collection-cookbook.md:115`
   teach `import { …, createIndexedDBAdapter } from '@signaltree/core'` —
   but the symbol is only exported from the **`@signaltree/core/storage`**
   subpath. An agent following the flagship persist example writes an import
   that does not compile. This is precisely the phantom-import class RFC 0004
   P6′'s reverse-diff gate exists to catch — concrete validation of that
   gate's design, and an immediate doc fix in the plan.

### Correct-by-construction counterexamples (the shapes to copy)

`security()` and `lazy()` (injected features, fail-closed), enhancers via
`.with()` (import-gated), and the self-registering marker system itself.

## 5. Test plan (gates, not one-off measurements)

1. **Extend `verify-tree-shaking.js` into a size-matrix gate**: the §4 ladder
   becomes a scripted matrix (bare + per-marker + per-capability) with two
   assertion kinds per row — *forbidden identifiers* (e.g. a plain
   `entityMap` bundle must not contain `beginLoad`; a `createFormTree`
   bundle on the post-fix layout must not contain legacy-bridge identifiers)
   and *byte budgets* with tolerance. Wired as a blocking section of
   `pre-publish-validation.sh` (§5 rule 3).
2. **Negative tests first** (§5 rule 2): the forbidden-identifier assertions
   for instances 1–3 **must fail against today's build** before the fixes
   land — that failure is the proof the gate works; they flip green as each
   fix ships.
3. **Reverse-diff docs gate** (RFC 0004 P6′) gets instance 4 as its first
   regression fixture: `createIndexedDBAdapter` taught-at-root must be
   flagged until the doc says `@signaltree/core/storage`.
4. Size claims in README/llms surfaces re-derived from the matrix output, not
   hand-written (ties into the RFC 0004 P6′ claims checks).

## 6. Adversarial review — verdicts and decision (2026-07-23)

Two independent adversarial reviews ran per RFC 0004 §5 rule 1 — one on the
product/DX case, one on the technical design. Both attacked with measurement
(loader-stubbed bundles; an option-B simulation patched into the compiled
dist; strict-tsc probes against real dist types).

### The headline number was wrong — REFUTED

§0 attributed the full plain-entityMap delta ("~5.9 KB gzip loader penalty")
to the loader. Both reviewers independently re-measured by *removing* the
loader (stub / patched dist): the loader's true removable share is
**~2.3 KB gzip unminified / ~1.5 KB min+gzip**. The remaining ~3.6 KB is
`entity-signal.ts` CRUD machinery a plain collection legitimately uses and no
option removes. §0's own metafile datum (8,938 *raw* bytes) was consistent
with ~2.3 KB gzip all along; the rhetoric wasn't.

### It also collided with a standing decision

Project memory records a **2026-07-22 owner decision**: the loader fold's
~1.1 KB floor cost stays — "optimize DX/correctness, not micro-KB… don't
reopen without new evidence." This RFC, dated one day later, reopened it on
evidence that dissolved under measurement into the already-decided number.

### What survived — option B's mechanics, fully proven

The technical attack on B **failed on every mechanism**: P-inference survives
end-to-end through a branded `LoaderFeature<E, P>` (strict-tsc probes, incl.
negative cases); the `TreeNode` dispatch needs zero changes (structural,
type-only); the runtime handoff works (option-B-simulated dist drops every
loader identifier; the `invalidateTag` barrel re-export was confirmed
innocent — `entity-map.ts`'s static *call* is the sole culprit); the
fail-closed guard belongs in the `entityMap()` factory (earlier than
`security`'s construction-time check — today the config isn't validated until
first `.$` access). Naming, if ever built: **`load: load(fn, opts)`** — the
precedent convention is key = helper (`security: security()`, `lazy: lazy()`);
a plain-noun `loader` export would read as a marker (S0 convention-orphan
class). The staged 11.6-deprecation plan was refuted regardless: it ships
ceremony with zero bytes returned until an unscheduled major.

### Decision

- **Shape A stays.** `entityMap({ load: fn })` is unchanged. The ~1.5 KB
  min+gzip prize does not justify a fourth shape in five weeks, a permanent
  first-attempt-guessability regression on the flagship capability (the M3
  acceptance metric), or overriding the 2026-07-22 decision.
- **The false claim is fixed everywhere** (entity-map.ts module comment,
  cookbook, llms surfaces): the loader ships with `entityMap` whether or not
  `load` is configured, ~1.5 KB min+gzip of it removable in principle.
- **Free wins from the review land as fixes** (no API change):
  `takeUntilDestroyed` in `entity-loader.ts` is redundant
  (`destroyRef.onDestroy` already unsubscribes; every settle callback guards
  `destroyed`/run-id) and `isObservable` is duck-typeable — dropping both
  deletes the rxjs/rxjs-interop module edges from the loader entirely.
- **The form-async candidate (§4 instance 2) is closed**, not kept open:
  entangled at six points around the central `errors` computed; extractable
  payload ~200 B against seam plumbing that eats most of it.
- **The persist sub-split is rejected** (~300-500 B against a 3-touchpoint
  hook seam).
- **Option B is archived as the fallback**: typed, simulated, and
  review-hardened. The trigger to revisit is the "new evidence" the
  2026-07-22 decision requires — e.g. the loader growing a multi-scope LRU
  (RFC 0003 §5) that materially raises its weight.
- §5's test plan stands with corrected expectations: the size-matrix gate's
  forbidden-identifier assertions for the loader become **budget assertions**
  (the loader is expected in entityMap bundles under shape A); the
  ng-forms legacy-bridge and stale-claim items are unaffected.

### §6 addendum (2026-07-23, step-3 execution)

The RFC 0004 §4 step-3 work added the deferred destroy-path test (loader
subscription torn down via `destroyRef.onDestroy`; late Observable emissions
neither throw nor write). While writing it, the previously-suspected latent
was **confirmed**: an in-flight `load()` promise held by a caller never
resolves after injector destroy — `onDestroy` clears `inFlightResolve`
without invoking it. Settle callbacks are guarded, so no incorrect writes
occur; the cost is a hung `await`. Fix candidate (resolve-on-destroy) is
deliberately NOT bundled into step 3 — it changes observable promise
semantics and should ride with its own test + changelog note in the 11.6.0
loader pass. Same latent family: post-destroy `loading()` also sticks `true`
forever (`onDestroy` never resets `loadingSignal`); rides with the same
11.6.0 loader-pass fix.

## 7. Owner override — Option B shipped in v12 (2026-07-23)

The §6 decision ("Shape A stays; Option B archived as the fallback, revisit
only on new evidence such as a multi-scope-LRU weight increase") is **overridden
by owner direction**: v12.0.0 ships **Option B** as the sole loading path. This
is recorded as a deliberate override — the §6 analysis is NOT rewritten — in the
same spirit as the RFC 0004 §5 cooling-period override recorded for 11.6.0. The
documented revisit trigger (multi-scope LRU) had not fired; the owner elected to
take the reclaim now and spend the guessability/churn cost as the v12 "earned
major" payload (RFC 0004 §3 V-MAJOR).

**What shipped (breaking):**
- `loader(fn, opts)` is the required way to make an `entityMap` cache-aware:
  `entityMap({ load: loader(fn, { staleTime, swr, tags, persist, equal, lazy,
  clearOnParamsChange }) })`. It returns a branded `LoaderFeature<E, P>` whose
  closure is the sole reference to `attachLoader` (exact `security()` precedent).
- The raw `load: fn` form is **removed**. `entity-map.ts` no longer imports
  `attachLoader`. A raw function on `load` **fails closed** at the `entityMap()`
  call site with `[ST2004]` — checked in the factory, not the marker processor
  (the processor's `create()` is wrapped in a `try/catch` that swallows throws,
  so a processor-level guard would not actually fail closed).

**Measured result (the reclaim §6 said was ~1.5 KB "in principle"):** the
`signaltree-entities` budget bundle dropped **9.89 KB → 8.36 KB gzip**
(own-code; `@angular`/`rxjs`/`tslib` external). Verified structurally: a plain
`entityMap()` bundle contains none of `attachLoader`/`parseDuration`/
`stableStringify`/`invalidateTag`/`DURATION_UNITS`. Budget gate lowered
9.9 → 8.6 to lock it in.

**Cost accepted (per §6's own analysis):** a fourth capability shape and a
first-attempt agent-guessability regression on the flagship loader — mitigated
only by docs/llms teaching `loader()` as the one true form and the fail-closed
`[ST2004]` error naming the fix. The §6 counter-arguments were not refuted;
they were outweighed by owner priority on the size reclaim.
