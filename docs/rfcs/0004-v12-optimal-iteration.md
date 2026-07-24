# RFC 0004 — The "optimal iteration": walker hardening, honest readonly, Signal Forms parity, verified docs

**Status:** **Amended after adversarial review** (2026-07-23) — §1 is the original plan, kept for the record; **§4 is the plan of record**
**Date:** 2026-07-23
**Affects:** `@signaltree/core`, `@signaltree/enterprise`, `@signaltree/schema`, `@signaltree/ng-forms`, all doc surfaces (README, llms.txt/llms-full.txt, SKILL.md, demo app), release/validation tooling
**Supersedes:** the branch-`12` `init` commit (`54fe4626`) where they overlap
**Versions at writing:** 11.5.3 published; target ~~12.0.0~~ **11.6.0** (see §3 verdict V-MAJOR)
**Selection criterion (explicit):** optimal end-state for the library. Difficulty, time, and cost are excluded from the decision function by owner directive. Options are rejected only for being *worse*, never for being *harder*.

## 0. Context

Branch `12` (single commit `54fe4626 "init"`) bundled six workstreams: an
`isTraversableNode()` predicate consolidating ~13 hand-rolled tree-walker
guards; a bash enforcement script; `defineStore(..., { expose: 'readonly' })`;
validator `validatorKind` tagging for the Signal Forms bridge; `loadOrThrow()`
on the entity loader; and a "cache-aware" → "single-scope freshness-managed"
terminology rename plus doc corrections.

An audit of that commit found it green (all tests/builds pass) but materially
incomplete:

- **F1** `ReadonlyStore<T>` drops all `.derived()` state from the injected type
  (readonly's premier use case).
- **F2** `expose: 'readonly'` on any factory not structurally matching
  `SignalTreeBuilder` silently no-ops (the generic overload still accepts the
  config).
- **F3** Root README claims "no write call signature reachable" while marker
  mutators (`upsertOne`, `setLoading`, …) remain fully reachable.
- **F4** `ReadonlyTreeNode` duplicates `TreeNode`'s marker dispatch — two
  places to update per future marker, no parity test.
- **F5** `verify-no-adhoc-walkers.sh` has confirmed false negatives
  (double-quoted `typeof`, `==`), scans only `packages/*/src`, and enforces
  syntax where the contract is behavioral. Only 2 of ~13 consolidated sites
  got behavior-level regression tests.
- **F6** `isTraversableNode` is `: boolean`, not a type guard — it forced the
  very `as object` casts it should have removed.
- **F7** The terminology rename left 33 "cache-aware" occurrences, including
  every user-facing demo surface — docs and site now disagree.
- **F8** New APIs (`loadOrThrow`, `expose: 'readonly'`) are absent from
  llms.txt / llms-full.txt / SKILL.md — invisible to the AI-agent audience the
  product audit identifies as the primary WHO.
- **F9** No version bump, no changelog, commit message "init", `when()` doesn't
  forward the inner validator's kind.

## 1. Plan (original — superseded by §4)

> **Note:** kept verbatim for the record. Several claims below were refuted
> under adversarial review (§3) — including its own Context section's "13
> sites consolidated" count. Do not implement from this section.

Ordered by dependency, not effort. Branch 12's commit is salvaged where it
overlaps (predicate call-sites, validator tagging mechanism, doc corrections)
and superseded where it fell short.

### P1. One canonical walker

Replace the ~13 independent traversal loops (batching `wrapSignalSetters`,
serialization path-resolution + alias walk, enterprise `PathIndex` +
`OptimizedUpdateEngine`, `invalidateTag`, schema `matcher`/`compact`, ng-forms
`getSignalAtPath`/`findFormSignals`/schema-path cursor, marker materializer)
with a single `walkTree(node, visitor)` primitive in core that owns, once:

- the traversable test (`isTraversableNode`, promoted to a real type guard),
- cycle protection (visited `WeakSet`),
- skip-key conventions (`_`-prefixed, `set`/`update`, enhancer internals),
- callable-branch semantics (NodeAccessors and leaf signals are
  `typeof 'function'` — the root cause of the entire v11.4/11.5 bug class).

Enforcement replaces the bash script (deleted — dominated on every axis):

- an ESLint `no-restricted-syntax` rule banning raw dual-`typeof` guards and
  ad-hoc recursion into tree nodes outside the walker module (AST-based: immune
  to quote style, spacing, `==`),
- a **walker conformance suite**: one deep fixture tree (markers + NodeAccessor
  branches at depth, cycles, built-in leaves like `Date`/`Map`) asserted
  against every walking subsystem, so "walker reaches nested nodes" is a tested
  behavioral contract per subsystem, not a grep.

### P2. Readonly that is actually true

`defineStore(factory, { expose: 'readonly' })` keeps its promise:

- **Per-marker readonly views**: `ReadonlyEntitySignal` (`all/byId/where/find/
  count/ids/has/empty` + loader reads `loading/loaded/error/lastLoadedAt/
  params`), `ReadonlyStatusSignal` (predicates only), `ReadonlyFormSignal`
  (`values/errors/valid/dirty/touched/pristine`), readonly async marker views —
  mutators genuinely absent from the type.
- **Mechanical derivation**: `ReadonlyTreeNode` computed *from* `TreeNode`
  (one marker dispatch), with a parity type-test so a future marker cannot
  drift the two surfaces.
- **Accumulated-type preservation**: the readonly type is parameterized over
  the builder's accumulated `$` type so `.derived()` computeds survive
  exposure (fixes F1).
- **No silent fall-through**: the generic overload takes
  `config?: DefineStoreConfig & { expose?: never }` — misuse is a compile
  error (fixes F2).
- **Dev-mode runtime guard**: a development-only Proxy on the readonly token's
  `$` that throws a coded `[ST####]` error on write attempts, tree-shaken in
  prod — fulfilling the codebase's stated "typed consumers get compile errors,
  untyped consumers get runtime guards" posture.
- README claims rewritten to the now-true statement (fixes F3).

### P3. Error model at Signal Forms parity + unified async validation

- Structured bridge errors `{ kind, message, params }` with `kind` strings
  verified against what `@angular/forms/signals` natively emits (not guessed).
- `validators.when()` forwards the inner validator's kind; `withKind()`
  exported for custom validators.
- **Async validation unified**: marker `asyncValidators` are bridged into the
  FieldTree's `validateAsync` so `tree.$.form.valid()` and `fieldTree.valid()`
  cannot disagree. The branch-12 README warning ("not unified — pick one
  system") documents a defect; this fixes it.

### P4. Loader surface completeness

`loadOrThrow()` stays; add `refreshOrThrow()` for symmetry (predictable API
shape for agent consumers). Both documented in llms.txt, llms-full.txt,
SKILL.md, cookbook, and the version→API table.

### P5. One vocabulary, 100% applied

Both existing terms lose: "cache-aware" implies a multi-key cache that doesn't
exist; "single-scope freshness-managed" is unusable (the branch itself produced
"scoped single-scope freshness-managed form"). Adopt **"self-loading"** as the
capability name — already established organically in the docs — with the
freshness semantics stated precisely once per surface ("retains only the
current scope — switching A → B → A refetches A"). Applied everywhere: code
comments, all docs, llms files, SKILL.md, demo routes/navigation/pages, RFC
forward-notes (historical text preserved via revision notes, per repo
convention).

### P6. Docs as verified artifacts

- Version-support claims generated/checked from `peerDependencies`
  (doc-validation step) so they cannot drift.
- **Public-API coverage check**: a validation script diffing
  `@signaltree/core`'s public exports against llms-full.txt — mechanical
  enforcement of "AI-discoverability is the primary gap surface."
- Release hygiene: coherent commits, CHANGELOG, **12.0.0** with a migration
  note for the error-`kind` change (breaking for consumers matching
  `kind === 'signalTree'`).

## 2. Options considered and rejected

(Abbreviated — full catalog in the audit conversation, 2026-07-23.)

- **Predicate-only consolidation, keep 13 walkers** (branch 12's shape):
  treats the guard, not the duplicated traversal logic that produced the bug
  class twice in two minors.
- **Bash grep enforcement**: proven false negatives; syntax-level proxy for a
  behavioral contract.
- **Type-only readonly with markers passed through** (branch 12): overclaims;
  readonly-in-name-only for any store with markers.
- **Drop readonly entirely, rely on Ops-service pattern**: defensible, but the
  DI-token ergonomics are exactly what agent consumers reach for; a *true*
  readonly surface earns its keep.
- **"Pick one async validation system" doc warning**: documents the defect
  instead of fixing it.
- **Keep "cache-aware"**: inaccurate (the honesty problem the rename was
  chasing). **Complete "single-scope freshness-managed"**: unusable term.
- **11.6.0 minor**: the optimal error-`kind` and readonly shapes are breaking;
  a major does them right instead of contorting to additive.

## 3. Adversarial review — verdicts

Six independent adversarial reviews ran against §1 (2026-07-23), each armed
with the rejected options and instructed to refute the plan against real code.
Attacks were checked by execution where possible (the enforcement script was
run and its failure mode reproduced; the readonly type derivations were
compile-tested; Angular's `@angular/forms/signals` `.d.ts` was read directly).
Verdicts:

### V-P1 (walker): unification REFUTED; enforcement + conformance SURVIVE amended

- The "~13 loops" are **three algorithm families plus foreign structures**:
  only ~8 sites are tree-driven visitors; the rest are O(depth) path-cursors,
  dual-structure lockstep zips (diff/patch), or walks over non-SignalTree
  structures (Angular FieldTree, trie, parsed JSON). The tree-driven eight
  diverge on every axis a shared walker would "own": stop-at-signal vs
  descend-into-signal vs call-to-unwrap vs must-never-call (`pathExists` has a
  documented prior bug from unwrapping); skip-keys `{_,set,update}` are
  required in three walkers and actively wrong in `interceptLeafSignals`.
  A unified `walkTree` would be a for-loop with seven config knobs. The bug
  class that motivated P1 lived in the **guard**, not the loop — and the
  shared predicate already fixes the guard.
- **Branch 12's consolidation is itself unfinished**: four raw dual-`typeof`
  guards remain (`materialize-markers.ts:224`, `intercept-leaf-signals.ts:49,
  :68`, `update-engine.ts:417`) — two are the predicate's body inlined — and
  `intercept-leaf-signals.ts` is a **14th walker** the branch missed. The
  RFC's "13 sites consolidated" context claim was wrong.
- **The bash script is not weak — it is inert.** Reproduced by execution: a
  `set -o pipefail` + while-loop exit-status bug makes the detection pipeline
  report failure whenever the *last* `typeof`-object hit in a file is
  non-violating, so the script exits 0 with all four live violations present.
  It has likely never flagged anything. Delete regardless.
- The ESLint dual-`typeof` AST rule SURVIVES (four live violations to catch on
  day one; per-package flat configs already exist). The "ban ad-hoc recursion"
  half is dropped — recursion over parsed JSON/snapshots is AST-identical to
  recursion over accessor trees; not statically expressible.
- The conformance suite SURVIVES, amended to a **fixture family (~3)** —
  materialized accessor tree (markers + NodeAccessors at depth, cycles,
  built-in leaves), pre-materialization config tree, deep diff/patch pair —
  because the subsystems walk different node universes. Both 11.5.x fix
  commits blame flat-fixture specs; this attacks the actual failure mode with
  zero rewrite risk.

### V-P2 (readonly): Proxy REFUTED; scope cut to the compile-verified core

- **Dev-mode Proxy: REFUTED.** One token means the throwing Proxy forecloses
  the repo's own documented write pattern (README: pair readonly reads with an
  Ops service) — writes hard-throw in dev and silently pass in prod, the worst
  possible divergence. Proxy invariants trip on non-configurable properties
  (`Object.defineProperty` attachments in `entity-loader.ts:525-541`;
  `signal-tree.ts:460-464`), proxied node identity diverges from raw identity
  for every WeakSet/WeakMap consumer, and it puts a get-trap on the hottest
  read path of a performance-pitched library.
- **"Mechanical derivation, one dispatch": overclaimed.** Compile-tested: a
  derived readonly mapped type *is* achievable (call-signature and
  NodeAccessor inference work), but it is a **second** dispatch with
  fail-silent drift — `CallableWritableSignal` and `Signal` both structurally
  extend `NodeAccessor`, so a future marker missing its row degrades silently,
  not loudly. Parity needs a maintained fixture either way.
- **The §1 sketches were written without checking the surfaces they mirror**:
  `ReadonlyFormSignal` named `values`/`pristine` (don't exist on
  `FormSignal`); "predicates only" `ReadonlyStatusSignal` strips the readable
  `error` value; the proposed reader set leaks writes through `byId` (returns
  deep-writable `EntityNode`). Truthful per-marker views require
  `Pick`-over-a-`const`-reader-allowlist (fail-safe drift) and a re-signed
  `byId` — or don't ship.
- **SURVIVES (compile-verified): the accumulated-type fix (F1)** — readonly
  parameterized over the builder's `TAccum` preserves `.derived()` computeds
  and correctly narrows `linked()` to `Signal`.
- `expose?: never` WEAKENED: fixes F2 but hard-blocks facade factories that
  could legitimately be exposed readonly. An `asReadonly(tree)` helper /
  exported `ReadonlyStore` type kills F2 **structurally** (no overload cliff
  exists at all).
- Feature-exists-at-all WEAKENED, not refuted: zero demand signal (the feature
  is hours old), but the repo's own NgRx-SignalStore comparison lists
  "read-only-by-default exports" as a reason to pick NgRx — a named parity
  gap. And having shipped the type on branch 12, fix-or-delete is forced: a
  readonly that silently passes mutators is the audit's worst bug category.

### V-P3 (validation): async unification REFUTED; real parity is branded errors

- **"Cannot disagree": structurally unachievable.** Signal Forms `valid()` is
  pending-aware; the form marker has no pending state (`valid()` is a pure
  computed over errors) — a disagreement window exists during every in-flight
  async validation regardless of bridging. Piping marker `asyncValidators`
  into `validateAsync` populates the FieldTree's error store while the
  marker's `errors()` never sees them (worse than today); syncing back
  requires writing a signal during lazy materialization — the exact NG0600
  hazard class `form.ts` documents avoiding and 11.5.2/11.5.3 just fixed.
  `submit()` would double-fire server validators. The branch-12 README
  warning ("pick one authority") is the **correct design**; amendment: harden
  it with a dev-mode warning when `markerSignalForm` bridges a marker that has
  `asyncValidators` configured.
- **`{ kind, message, params }`: REFUTED in shape.** Angular's error model has
  no `params` field; constraint values are class-specific props on **branded**
  error classes. Plain objects with matching kind strings lie to the type
  system (`getError('min')` narrows to a `.min` that doesn't exist at
  runtime; `instanceof NgValidationError` is false). Real parity: the bridge
  emits Angular's exported error factories (`requiredError`, `minError`,
  `patternError`, …) for built-ins — which needs constraint values tagged on
  validator closures (`validatorParams`), the legitimate kernel of the
  `params` idea, relocated to factory inputs.
- Kind-string verification is **already true on branch 12** (checked against
  `@angular/forms` `.d.ts`: `required`/`email`/`minLength`/… match exactly) —
  §1 sold existing behavior as future work.
- SURVIVE: `when()` kind forwarding; `withKind` export (amended: wrap, don't
  mutate, the passed closure).

### V-P4 (loader): `refreshOrThrow` REFUTED

Failed loads never become fresh (`lastLoadedAt` is set only on success), so
retry-after-error is already `loadOrThrow()`; `refresh()`'s only distinct job
is force-reloading *fresh* data, and the mirror is fake anyway (`refresh()`
with no params on a never-loaded scoped collection has no throw semantics).
RFC 0001 forbids pre-demand surface; TanStack (the deliberate vocabulary
donor) has no `refetchOrThrow` for agents to expect. Ship `loadOrThrow`
alone; put the `await refresh(); check error()` recipe in the cookbook.

### V-P5 (vocabulary): "self-loading"-as-sole-term REFUTED; consistency goal survives

"Cache-aware" is not inaccurate — a `staleTime`+`swr` freshness guard **is** a
cache policy over one entry, and `swr` is literally RFC-5861 HTTP-cache
terminology. The config keys (`staleTime`, `swr`, `invalidateTag`, `tags`) are
TanStack's exact vocabulary — what LLMs key on; renaming prose away from cache
while the API stays cache creates prose↔API dissonance for the primary
audience. "Self-loading" names a different axis (fetches itself) than
"cache-aware" (decides whether to fetch) — the codebase already uses them
orthogonally in single sentences. **Winner: "cache-aware (single-scope)"** +
the already-written A→B→A clarifier, applied 100% (37 "cache-aware" lines
incl. 15 in the demo app, 28 "single-scope freshness-managed" lines to kill);
"self-loading" stays as the auto-load descriptor. Demo route *titles* only —
no URL/deep-link breakage.

### V-P6 (docs): export-coverage diff REFUTED; check-only survives; gate wiring is load-bearing

- Core exports **123 symbols; llms-full.txt names 27** — and the missing 96
  are overwhelmingly enhancer plumbing, guard functions, and exports
  `index.ts` itself labels internal (~5-8% gate precision). A raw coverage
  diff either bloats the curated doc with hallucination targets (contra RFC
  0001) or needs a ~90-entry allowlist that rots. **Replacement:** (a) a
  **reverse diff** — every backtick-quoted symbol llms-full.txt teaches must
  exist in the built `dist` d.ts (catches phantom/removed APIs, the real
  hallucination vector; precedent: `scripts/lint-skills.mjs`); (b) a
  **~25-symbol golden API list** checked against *both* `index.ts` and
  llms-full.txt (catches "shipped a capability, never taught it" — which is
  live today, see §4 S1).
- Version claims: **generation REFUTED, check survives.** Three claim sites
  carry semantics not derivable from peerDependencies (the Angular-22-only
  `/signals` subpath; the 20.3 `connect()` boundary; toolchain claims). A
  verify-size-claims-style check would fire **today**:
  `docs/skills/using-signaltree/reference/install.md` still says "Angular 20
  or 21" on branch 12 — a file whose own header claims it is "derived from
  peerDependencies."
- **Gate-rot is proven in-repo, twice**: `validate:doc-snippets` has validated
  nothing for three months (zero `// @check` adoption); `validate:size-claims`
  has been an orphan npm script for eight. Gates survive here only as blocking
  numbered sections of `pre-publish-validation.sh`. All new gates wire there;
  the two orphans get wired or deleted. Plus the one real hygiene gate §1
  missed: `release.sh` must refuse to publish when `CHANGELOG.md` lacks a
  heading for `$NEW_VERSION`.

### V-MAJOR (12.0.0): REFUTED → 11.6.0

The breaking payload's blast radius is ~zero: the `kind: 'signalTree'`
contract shipped in 11.5.0 on 2026-07-22 — public for under two days; every
other §1 item is greenfield (readonly machinery, `loadOrThrow` are unpublished)
or internal. Additive shapes exist for the error change (bridge option,
default flip later). Meanwhile the repo has shipped **seven majors in seven
months** against a positioning ("first-class AI consumer") where each major
invalidates agent training priors and grows the version→API table. The major
pays full perception cost to protect nobody.

### V-STRATEGY (whole plan): three omissions worth more than most of §1

- **S1 — the Signal Forms story is invisible where it matters.**
  `markerSignalForm` / `signalFormBridge` appear **zero times** in llms.txt,
  llms-full.txt, or SKILL.md; llms-full.txt still describes ng-forms as
  FormGroup-only and its version table stops at 11.4.0. An agent grounding in
  these files concludes SignalTree has no Signal Forms integration — the
  intersection of audit threat #3 and the known Signal Forms gap, and the
  highest leverage-per-line item available. (§1's P6-as-specified, scoped to
  *core* exports, would have stayed green forever while this persisted.)
- **S2 — measure the thing the audit actually defined.** The M3 adversarial
  fresh-agent test (audit success metric: first-attempt agent success) has
  never been run; nothing in §1 measures agent success. Run it against the
  post-plan doc surfaces; it also validates or kills the golden-list metric.
  The classic-NgRx migration skill's pending validation round rides along.
- **S3 — claims currency.** llms.txt argues against NgRx "as of v20.1" while
  the benchmarks pin `@ngrx/signals` 21.1.1. Threat #2 is "claims must hold
  vs CURRENT NgRx SignalStore." Stamp the comparator version and re-verify per
  release (same gate family as P6).
- Scorecard of §1 against the audit threats: P1 defends the credibility floor
  (the inert-walker class burned four releases); P3's kernel is real product
  work; P2 is a forced fix-or-delete with genuine NgRx-parity value at its
  core; P4 was surface bloat; P5/P6 are hygiene. What §1 lacked was exactly
  S1-S3 — omitted not because they were harder (they're mostly easier) but
  because the branch-12 commit set the frame.

## 4. Plan of record (post-review)

Target: **11.6.0**. Ordered by dependency.

1. **Walker hardening (P1′):** promote `isTraversableNode` to a type guard;
   finish predicate adoption at the four missed sites + the 14th walker
   (`intercept-leaf-signals.ts`); walker-conformance **fixture family** (~3
   fixtures) asserted per subsystem; ESLint dual-`typeof` AST rule; delete
   `verify-no-adhoc-walkers.sh` (proven inert). No `walkTree` unification.
   Optional follow-up RFC: a `resolvePath(root, segments, {unwrapSignals})`
   helper for the five path-walks — deliberately separate.
2. **Readonly, truthful and minimal (P2′):** keep type-only narrowing;
   parameterize over `TAccum` (F1 — compile-verified); ship `asReadonly(tree)`
   + exported `ReadonlyStore` type as the primary surface (F2 dies
   structurally); keep `expose: 'readonly'` as sugar over it only if the
   overload stays honest; per-marker reader views only via
   `Pick`-over-`const`-allowlist with a re-signed `byId`, else document the
   marker carve-out truthfully; **no Proxy**; fix the root-README overclaim.
3. **Signal Forms parity (P3′):** bridge emits Angular's branded error
   factories for built-in validators (via `validatorParams` on closures);
   `when()` forwards inner kind; export `withKind` (wrapping, not mutating);
   **keep single-authority async** + dev-mode warning when a bridged marker
   has `asyncValidators`. Error-shape change ships behind a bridge option
   (additive), default flip in the next major.
4. **Loader (P4′):** `loadOrThrow` only; cookbook recipe for
   refresh-with-error-check; all five doc surfaces + version table.
5. **Vocabulary (P5′):** "cache-aware (single-scope)" + A→B→A clarifier,
   100% applied; kill "single-scope freshness-managed" (28 lines); sweep the
   demo app (15 lines); "self-loading" retained as the orthogonal auto-load
   descriptor.
6. **Verified docs (P6′):** reverse-diff gate (taught symbols must exist in
   built d.ts); ~25-symbol golden API list checked against both `index.ts`
   and llms-full.txt; version-claims **check** (not generation) covering
   install.md and the canonical claim sites; CHANGELOG-entry gate in
   `release.sh`; all wired as blocking sections of
   `pre-publish-validation.sh`; wire-or-delete the two orphan validators.
   **Addendum (2026-07-23, measured):** the "loader machinery only pulled in
   when `load` is used" claim is **false** — plain `entityMap()` ships the
   full ~5.9 KB gzip loader (static `attachLoader` import). Claim correction +
   a loader case in `verify-tree-shaking.js` land here; the structural fix
   (injected `loader()` capability, `security()`-precedent) is
   **[RFC 0005](0005-entity-loader-composition.md)** — options analysis
   drafted, pending its own adversarial review per §5 rule 1.
7. **Naming coherence pass (S0 — must precede S1).** Found post-review:
   `markerSignalForm` is the only `marker`-prefixed export in the codebase —
   it matches none of the established families (markers = plain nouns,
   `create*` factories, `*Bridge` bridges, `to*` conversions) — and the
   `/signals` subpath ships **two names for one concept** (`signalFormBridge`
   and `markerSignalForm` both produce a `FieldTree` from SignalTree state,
   with unrelated naming shapes). Recommended: unify under **`signalForm()`**
   (overloads: a `form()` marker, or `(tree, rootPath, subtree)` for the
   schema-based form), with `signalFormBridge`/`markerSignalForm` as
   deprecated aliases for one minor. Blast radius today: one demo page —
   near-free now, entrenched forever once S1 teaches the old name. Extend the
   pass: sweep all packages for other convention orphans before any new name
   reaches an AI-facing doc (this is audit Cluster-A — name divergence —
   being reintroduced one feature per release; the six-lens review missed it
   because naming coherence wasn't a lens).
8. **S1:** the Signal Forms story (under its post-S0 names) into llms.txt,
   llms-full.txt, SKILL.md; version table brought current through 11.6.0.
9. **S3:** comparator-version stamp + claims-currency check for the NgRx
   comparison surfaces.
10. **S2:** run the M3 fresh-agent test against the finished doc surfaces;
   classic-NgRx migration skill validation round. Findings feed the next
   cycle.

Branch 12's commit is salvaged where it overlaps (predicate call-sites,
validator tagging, `loadOrThrow`, doc corrections, the A→B→A clarifier) and
superseded everywhere §3 refuted it.

## 5. Root cause and process ratchet (binding for this and future releases)

The defects didn't come from one mistake — the same failure repeated at every
layer: **single-pass work at high velocity, protected by safety nets that were
never tested for their ability to fail.**

Evidence, one per layer:
- *Cadence:* seven majors in seven months; 11.3.0 corrected same-day; branch
  12 authored overnight after 11.5.3 shipped (six workstreams, one commit,
  "init").
- *Tests:* the worst shipped bugs were silently-inert features passing a
  flat-fixture suite for multiple releases (batching, enterprise diff/patch,
  `updateOptimized`).
- *Gates:* the script written to prevent the walker bug class was itself inert
  since creation; two doc validators rotted into no-ops (3 and 8 months);
  `release.sh` can skip everything; no CI runs validation.
- *Docs:* claims asserted, never derived — "Angular 17+" vs peerDeps 20–22;
  install.md "derived from peerDependencies" and drifted anyway; the flagship
  Signal Forms bridge absent from every AI-facing doc.
- *Review:* this RFC's own §1 — written in one confident pass — was ~50%
  refuted by adversarial review (§3). That refutation rate is what every
  unreviewed session has been shipping at.
- *Measurement:* the audit's actual acceptance metric (M3 fresh-agent
  first-attempt success) has never been run.

There is no 100% guarantee and this document refuses to promise one — that
promise is how the inert script got written. The commitment is a **ratchet**:

1. **No same-day shipping.** Design → adversarial review → implement →
   adversarial review → cooling period → publish. No step self-certifies.
2. **Every gate has a negative test** — a fixture proving it can fail. An
   untested gate is presumed inert (empirically, in this repo, it was).
3. **One blocking path, in CI.** Gates exist only as blocking sections of
   `pre-publish-validation.sh`, run on every PR. Skip paths removed or loudly
   logged. Orphan validators wired or deleted.
4. **Silent-inert is the priority defect class** — deep-fixture conformance
   (§4.1) guards it structurally.
5. **Docs are falsifiable** — claims-vs-code checks (§4.6, §4.9) turn drift
   red instead of letting it rot.
6. **One-way doors get a gate** (§4.7 S0): no new public name or API reaches
   an AI-facing doc without the convention check.
7. **M3 is the release acceptance test** (§4.10): "right" is measured from
   outside — a fresh agent succeeding on first attempt — not asserted from
   inside.
8. **No redemption-release rush.** 11.5.3 has no data-loss emergency in the
   open defect list; the next release is the first to pass the full ratchet,
   however long that takes.

## 6. Step-1 execution record (2026-07-23)

§4 step 1 implemented on branch `12` and passed its post-implementation
adversarial review (§5 rule 1). Verification: build+test+lint green across
core/enterprise/schema/ng-forms, uncached.

Delivered beyond the §4 spec (found during execution):
- The ESLint AST rule caught **two additional guard sites** no prior pass
  found (serialization's zip-walker variant; lazy-tree's entity duck-type) —
  six sites fixed total, plus the 14th walker.
- The conformance suite caught a **shipped silent-inert bug on its first
  run**: DiffEngine recursed into built-in leaves (Date/Map/Set) as empty
  objects. First fix was itself caught incomplete by the review (Date-only;
  `isEqual`'s JSON.stringify fallback saw every Map/Set as `{}`, so
  `updateOptimized` reported `changed: true` while dropping the write) —
  root-caused in `update-engine.ts` `isEqual` with Map/Set regression tests.
- Dead duplicate engines deleted (`core/src/lib/performance/` — unreferenced
  fork of the enterprise engines, a divergence hazard).
- `lint:all` extended to `events`/`realtime` (the gate was narrower than the
  script it replaced); rule's `utils.ts` exemption tightened to the one
  intended file; selector's known esquery limitation documented in-config.
- Perf smoke bounds in `path-index.spec.ts` made load-tolerant (500/250 ms)
  with in-code rationale — a wall-clock assert was flaking the task graph.

Deferred, tracked: a destroy-path test for the entity loader (the
`takeUntilDestroyed` removal is analytically redundant — hook-registration
order — but the destroy path has zero coverage in either direction); the
review also confirmed a pre-existing latent: a caller-held `load()` promise
never resolves after destroy. Both belong to the step-3 loader work.

Step-3 review note: `when()`-wrapped built-ins now bridge their real kind
(`'required'` etc.) instead of `'signalTree'` in DEFAULT mode — sanctioned
by §4 step 3; needs an explicit 11.6.0 changelog line at release.

### S0 execution note (2026-07-23): orphan-sweep findings beyond the bridge rename

Renamed this pass: `markerSignalForm`/`signalFormBridge` → unified
`signalForm()` (deprecated warned aliases; demo/docs updated). Flagged for
future decision, NOT renamed (each needs its own deprecation plan):
1. **`createFormTree` cross-package collision** — exported by BOTH
   `@signaltree/ng-forms` (form-tree factory) and `@signaltree/guardrails`
   (preset tree). Worst orphan found; same name, different things.
2. **ng-forms root exports bare validator names** (`required`, `email`,
   `min`, `compose`, `debounce`, …) while core namespaces the same concept
   under `validators.*` — two vocabularies; bare `compose`/`debounce` are
   collision-prone.
3. **`createRealtimeEnhancer`** sits in the `create*` factory family while
   every other enhancer is a plain noun (`schemas`, `guardrails`,
   `enterprise`, `batching`).
4. Core lower-priority: `enable*` vs legacy `with*` vs plain-noun enhancers
   (three shapes, one concept); `derivedFrom` vs `externalDerived` (both
   index-public).

## 7. M3 acceptance-test result (2026-07-23 — first run in project history)

Protocol: fresh agent grounded ONLY in llms.txt/llms-full.txt; five
representative tasks; first-attempt code compiled and unit-tested exactly as
written; strict scoring. Result: **3/5 PASS, 1 PARTIAL (one mechanical fix),
1 FAIL — 60% first-attempt success** vs the audit's ~0% baseline and >80%
target.

What passed with zero fixes: scoped cache-aware entityMap store (incl.
per-scope freshness semantics), loadOrThrow guard with error handling,
invalidateTag push-invalidation — the surfaces that got the full doc
treatment. What failed/partialed: the two surfaces shipped LAST —
asReadonly (docs were name-only, one version-table row) and the
form<T> Record-constraint gotcha. Lesson for §5: doc debt concentrates in
whatever shipped most recently; M3 catches it before release, which is
exactly its job. One genuine library type gap found: ReadonlyView's marker
rows dropped derived state merged into marker nodes (fix + typing-spec case
in the M3 follow-up pass). Over-teaching check: zero claims failed
verification. Ranked fixes applied in the follow-up commit; M3 re-run
recommended after (target: 5/5 on this task set).

### M3 run 2 (2026-07-23, post-fix, HEAD 1571588b): **80% strict first-attempt**

4 PASS + 1 PARTIAL (up from 60%). Both run-1 misses converted with zero
fixes — the taught facts did the work (the asReadonly section +
ReadonlyExtras library fix for T4; the type-vs-interface gotcha for T3).
One honest regression located a further library type gap:
`SignalTreeBuilder` omitted `registerCleanup`/`destroyed`, which exist at
runtime and which the docs correctly teach — fixed same-day in
builder-types.ts (also retires the step-2 review's "destroyed typed on
faith" NIT). Every other taught claim held under strict verification.

## 8. Placement audit (2026-07-23, post-plan) — next-cycle queue

Full mechanism-placement audit (core vs marker vs enhancer vs injected
feature vs subpath vs package) found the taxonomy consistently applied;
everything not listed below is explicitly RIGHT where it is (incl. all six
exported markers, the five core enhancers, security/lazy as injected
features, edit-session//storage as subpaths, and every package boundary).
`linked()` vs `derived()` reviewed separately: stays split, mirroring
Angular's own computed/linkedSignal vocabulary (consolidation = config flag
changing return type — the F2 cliff pattern).

Queued for the cycle after 11.6.0 (deliberately NOT added to the frozen
release):
1. **Delete `externalDerived` from the barrel** — deprecated alias whose
   JSDoc promised removal in v8, still public at 11.x.
2. **`@signaltree/core/authoring` subpath** for the ~15 enhancer-author
   plumbing exports (withWriteContext, getPathNotifier, ENHANCER_META,
   registerMarkerProcessor, the three zero-consumer create*Signal
   factories, optionally the *_READERS consts). Two internal import sites
   (schema, guardrails); deprecated root re-exports one minor. Payoff: a
   barrel teachable end-to-end (M3 guessability).
3. **`effects()` — finish or deprecate.** The one core enhancer not earning
   its keep, with a REAL BUG found: calls angularEffect() with no injector
   handling → NG0203 outside injection contexts (the archived v6 version
   had the option); monkey-patches destroy instead of registerCleanup; no
   tree-shake gate entry; absent from llms.txt while README steers to
   native effect(). Either fix all four or deprecate with guidance updates
   (dev-proxy.ts advertises it).
4. **Guardrails "dead by default" root cause**: the package's conditional
   exports map the `"default"` condition to noop.js — bundlers setting
   neither development nor production get the noop even in dev. The
   site-audit finding was real and this is why. Needs its own fix + test.
5. **Persistence decision-table doc**: four surfaces (stored(), 
   persistence(), /storage adapters, entityMap persist) with no routing
   guidance — a doc, not a relocation.
6. Housekeeping: delete the enhancers/entities/ tombstone (throws
   "removed in v7"); split serialization.ts so /storage doesn't enter via
   the 1335-line enhancer module; one-line scope disclaimer on
   @signaltree/events (6.2k LOC, zero core imports — standalone product
   under the scope, agents will assume tree integration that doesn't
   exist).

### §8 execution close-out (2026-07-23)

Queue executed (owner-directed). Biggest find: the nx-rollup basename
collision silently prevented THREE packages' main barrels from ever
building (realtime, ng-forms, guardrails) — per-package fabrication plugins
shipped stale stubs instead. Root-fixed in the shared rollup config.
Remaining queued (found during review): an export-PARITY gate for built
barrels (the resolution-only smoke let stubs pass — same §5 rule-2 lesson);
guardrails pre-existing defects (console reporting dead, mode:'throw'
swallowed, plain-object trees change-blind via PathNotifier); dev-proxy is
unreferenced dead code.

### §5 override record (2026-07-23)

Owner explicitly overrode the §5 rule-1 cooling period for the 11.6.0
release ("Override §5 and publish now", asked and answered): all other
ratchet steps (adversarial reviews at design and implementation time,
negative-tested gates, M3 acceptance at 80%) were completed; the cooling
window alone was waived by owner decision.

### Post-release external audit intake (2026-07-23, v11.6.0)

Independent post-publish audit confirmed the major fixes; new items:
FIXED same-day — CHANGELOG "(unreleased)" label, llms version-table rows,
README effects() row lacking deprecation marker, persisted-scope GC guidance
(persistence-guide). QUEUED for the release pipeline — tarball-consumer
install/import test as a pre-publish gate, and an RC-phase option in
release.sh. Re-affirmed as recorded decisions (not reopened): async
single-authority, entityMap unified shape (RFC 0005), single-scope cache
(RFC 0003 §5).

### v12.0.0 external-audit intake (2026-07-24)

Verified against the repo — auditor accurate on all checkable claims.
FIXED same-day: the `nativeErrors` default-flip promise miss (11.6.0 said
"flips next major"; v12 kept `false`) — now explicitly postponed to v13 at
every promise site (JSDoc, llms-full, changelog correction note).
CONFIRMED-OPEN, queued (release-pipeline hardening): `skip-tests` bypasses
the full suite; `publish:all` runs the lighter `prepublish`; the tag-push
release.yml reruns no gates — the strongest fix is publish-from-CI gated on
a protected check of the exact tagged commit. Re-affirmed deferrals:
multi-scope LRU + persisted-scope GC (RFC 0003 §5; GC guidance shipped in
the persistence guide, built-in policy rides with LRU).
