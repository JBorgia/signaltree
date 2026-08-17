# SignalTree 15.0 — session handoff

Checkpoint **`7b3b3947`** on `history/gate1-frontier-cutover`. Nothing pushed
(~150 commits ahead of origin, deliberately).

`RELEASE-1.0.md` is the controller and is current.

---

## LAST SESSION — slice 1 CLOSED, plus an unplanned grammar fix

```
9f0d1464  characterize SignalTree<T>; prove SignalTreeBase adds nothing
6a515699  delete SignalTreeBase (breaking)
d7bb9c5d  ledger
cd49e9a0  matrix made semantic, not decomposition-specific (review)
48fa63a6  refute "bind is the only mismatch"
243dd5fb  SignalTree<T> loses the false root state surface (breaking)
215568cb  SignalTreeBuilder.bind aligned with its runtime NodeAccessor
c9a6fafb  ledger
```

`SignalTreeBase` is gone. core 207 -> 206. Write-up in `RELEASE-1.0.md`
§ "Slice 1".

**The durable artifact is not the deletion.**
`packages/core/src/lib/signal-tree-type-matrix.typing.spec.ts` is permanent and
is the third GATE B dimension. Keep it green; extend it when the type changes.
It exists because the API inventory structurally cannot see a type-shape change
to a symbol that keeps its name — and it immediately proved that by catching a
defect no other gate could.

**What it caught.** `SignalTree<T>` was `ISignalTree<T> & TreeNode<T>`, typing
the state keys on the tree root. The runtime root has none: `Object.keys(tree)`
is `[]` and `tree.count` is `undefined`, while `tree.$` carries them. The public
type was encoding a DIFFERENT API GRAMMAR from the runtime and typechecking
access to properties that do not exist. `api-inventory --check` was clean
throughout both fixes.

```
FROZEN   state is addressed through `$`, and only through `$`
         tree.$.count()   supported
         tree.count       @ts-expect-error in matrix A1
```

Two mismatches, opposite directions — do not collapse them:

```
root-state   SignalTree<T>       OVER-promised   fixed 243dd5fb
bind         SignalTreeBuilder   UNDER-promised  fixed 215568cb
```

Section C of the matrix is now a POSITIVE assertion — a real `signalTree(...)`
value assigned to `SignalTree<RootState>`, no `@ts-expect-error`.

---

## START HERE — item #3, built-ins -> `Enhancer<Methods>`

Slice 2 is CLOSED. `composeEnhancers` is deleted; see `RELEASE-1.0.md` §
"Slice 2" for the decision, the correction, and the routing.

```
1.  Pick ONE built-in. Do not sweep.
2.  State the property + falsifier BEFORE editing.
3.  Migrate its public contract to Enhancer<Methods>.
4.  Run the ladder; REGENERATE the api baseline and diff the JSON.
5.  Commit that ONE enhancer.
6.  Repeat, or STOP before item #4 (realization overload).
```

### Item #3 also owns a defect slice 2 found

`requires` resolves against TWO namespaces:

```
resolveEnhancerOrder   edge only when a.provides.has(req)   -> CAPABILITY
.with() guard          appliedEnhancers.has(req)            -> NAME
```

so a requirement is satisfiable only when an enhancer is BOTH named `x` AND
declares `provides: ['x']`. Both natural spellings throw.

`packages/core/src/lib/planned-enhancer-dependencies.spec.ts` records this as
**CURRENT BEHAVIOUR, NOT FROZEN SEMANTICS** and carries a DO-NOT-FREEZE banner.
If those rows go red because you made the namespace coherent, **update the
tests — do not restore the bug.** The fail-closed guarantee in the same file IS
durable and should survive.

### Sizing

The `batching` spike is signature + `import type` + one boundary cast, body
untouched — a CANDIDATE shape proven on ONE enhancer, to be characterized per
enhancer rather than assumed batching-shaped. 8 of 9 enhancer bodies do
something a generic combiner cannot express, so expect variation.

### Commit sequencing constraint

```
ONE enhancer per commit. Do NOT couple item #3 to:
  - item #4 (realization .with() overload)
  - item #5 (variadic .with(...))

Variadic .with() is BLOCKED on #3 finishing, not the other way round.
```

---

## THE LESSON THIS CHAPTER PAID FOR TWICE

```
A green representative example does not prove equivalence of two API paths.
Test the PROTOCOL BOUNDARIES where their implementations differ.
```

Instance 1 — `SignalTree<T>`: the annotation matrix and the constructor
characterization were BOTH green while they disagreed with each other. Fixed by
adding a positive JOIN assertion between the two representations.

Instance 2 — `composeEnhancers`: "runtime equivalent" was claimed from a
representative fold over ordinary enhancers. It was refuted at two protocol
boundaries — `plannedSignalTree` dependency validation (composed is fail-OPEN
where separate is fail-CLOSED) and identity-replacing enhancers.

Corollary that keeps earning its place: **neutralize the first reported cause
and re-measure.** A compiler diagnostic names the FIRST blocker and is silent
about anything behind it.

---

## TRAPS CONFIRMED LAST SESSION — these cost real time

```
- `api-inventory --check` output does NOT prove the absence of metadata drift.
  It prints symbol-set changes then says "SURFACE CHANGED", and stays SILENT
  about metadata drift on RETAINED symbols even though that also fails the
  comparison. To confirm an intended delta: regenerate the baseline and
  `git diff tools/api-baseline.json`. Reading --check output is not enough.

- `nx test core` SWALLOWS the vitest reporter. A failing run prints only
  "Running target test for project core failed" — no test name, at any
  --output-style, --verbose included. Use `npx vitest run` from packages/core
  instead; it reports normally. The `ngModule null` failure applies to the repo
  ROOT, not the package directory.

- Build success = exit 0 AND fresh artifact exists AND the artifact has the
  property under test. Core's real declarations are at
  dist/packages/core/src/**/*.d.ts — dist/packages/core/dist/index.d.ts is a
  29-byte re-export line and greps of it prove nothing.

- Assert a POSITIVE success condition. Absence of an error string is not
  evidence. (Rule 0b step 4 — still the most-skipped step.)
```

Known-noise baselines, both re-confirmed at `6a515699`:

```
core suite            1720 passed / 20 skipped / 1 todo, 142 files
                      via `npx vitest run --root packages/core`

nx test core          alternates pass/fail under load; Nx flags it flaky.
                      Timing specs, documented in Phase 5. Not a blocker.

demo:build:production 4 pre-existing diagnostics —
                      FormHistoryApi.clearHistory (html:600),
                      FormHistoryApi.history (html:625, html:627),
                      TS4114 missing `override` on SignalTreeRollbackError
                      (types.ts:628, reached from component.ts:94)
```

Compare diagnostic IDENTITY, not counts.

---

## Ladder

```bash
npx tsc -p packages/core/tsconfig.typecheck.json --noEmit
npx nx build core --skip-nx-cache --output-style=static
npx vitest run --root packages/core
npx nx lint core --skip-nx-cache --output-style=static
node tools/check-declaration-closure.mjs
node tools/check-declaration-closure-fixtures.mjs
node tools/api-inventory.mjs --check
npx nx run-many -t build --all --skip-nx-cache --output-style=static
npx nx run-many -t test --all --skip-nx-cache --output-style=static   # <- ADDED

# RED until the schema divergence is resolved. Baseline by identity:
#   schema:test  25 failed / 15 passed   diverges from v14.1.1 (tag is GREEN)
#   demo:test     4 failed / 177 passed  all SchemaDemoComponent, same defect
#   core:test    documented flaky timing specs
#
# Building a package is NOT evidence its runtime passes. That gap hid 25 red
# tests for ~150 commits.
#
# Runner mismatch: ng-forms and demo run on JEST. `vitest run --root` reports
# "no tests" / "27 failed" for them — artifacts. Ask the Nx target.
```

---

## GATE B STATUS BY DIMENSION

```
Export inventory                GREEN as measurement infrastructure
Type-contract characterization  GREEN for completed high-risk cases;
                                SignalTree<T> now covered by the type matrix
Declaration closure             GREEN / CLOSED at 899c7a8a
Packed external consumer        GREEN

Gate B overall                  NOT YET FROZEN
Reason: the API reduction queue still changes public surface and types.
```

"Declaration closure GREEN" does not mean Gate B is finished.

---

## FROZEN — decided on measurement; reopen only on a deterministic counterexample

| area | status |
| --- | --- |
| Declaration closure | GREEN. Reopen only on a **packed-consumer counterexample**. |
| `stripInternal` model | Cause established; two source presentations; no third mechanism. |
| `Enhancer<TAdded>` neutral contract | FROZEN (`8e294c4c`). |
| `TimeTravelMethods` receiver-derived state | FROZEN (`b266457d`). |
| `SignalTreeBase` | **DELETED (`6a515699`).** Settled. |
| `SignalTree<T>` | **KEEP — the sole canonical consumer type.** Deleting it was considered and rejected: local code infers, but a library needs a nameable type for `function inspect(tree: SignalTree<AppState>)`. |
| `SignalTree<T>` root grammar | **FROZEN (`243dd5fb`).** State through `$` only. Root property copying REJECTED — it would create `tree.count()` beside `tree.$.count()`. |
| `SignalTreeBuilder.bind` | Returns `NodeAccessor<TSource>` (`215568cb`), matching runtime and `ISignalTree`. |
| annotation ↔ constructor | GREEN. `const t: SignalTree<S> = signalTree(...)` compiles; asserted positively in matrix section C. |
| `batching` migration feasibility | **PROVEN FOR BATCHING ONLY.** |
| variadic `.with()` contravariance blocker | EXISTS until built-ins migrate. |
| third `.with()` overload | DO NOT ADD. |
| `createEnhancer` name | Stays. No second lifecycle justified `defineEnhancer`. |
| `EnhancerHost` | Stays private. |
| Return-additions authoring | REJECTED on runtime evidence (8/9 enhancer bodies do things a generic combiner cannot express). |
| `isDev` / `createFormSignal` / `HydrateMode` | All KEEP, on recorded historical intent. Repaired. |
| `guardrails/noop` production behaviour | Intentional and documented. No correctness defect demonstrated. |
| `state` on `SignalTree<T>` | Does NOT exist — it is a `SignalTreeBuilder` member. Negative control in the matrix. |

### Rule 0d — the contract most at risk in THIS queue

`RELEASE-1.0.md` Rule 0d freezes the branch-node contract. Read it before slice
3 or 6. Summary:

```
NodeAccessor<T>   what a SignalTree branch IS
Signal<T>         one way a framework can OBSERVE it
```

A plain object branch (`tree.$.user`) keeps all three call forms — read,
partial/deep merge, functional update — and stays structurally navigable. Do not
add `.set()`/`.update()` to `NodeAccessor`, do not make branches pass
`isSignal()`, and if an Angular API needs a real `Signal<T>` supply it via an
explicit read-only adapter/view.

**These are now MECHANICALLY pinned** in
`signal-tree-type-matrix.typing.spec.ts` §4 — the three call forms at depth,
structural navigability, `branch is not CallableWritableSignal`, and a
`@ts-expect-error` on `branch.set()`. A change to these semantics now fails
`tsc`, not just review. Any such change remains a breaking architectural
decision requiring an explicit counterexample.

**Do not:** widen barrel exports to fix a declaration problem (tested, not
causal); disable or reconfigure `stripInternal` (works as configured); re-run the
alias-target hypothesis (refuted).

`check-declaration-closure.mjs` has two accepted approximations (bare-name
identity, incomplete export-specifier tracking). Documented and NON-BLOCKING
because the packed consumer is the stronger oracle. Do not improve them absent a
counterexample.

---

## SOURCE-OF-TRUTH PRECEDENCE

```
1. current RELEASE-1.0.md frozen decisions
2. current source / tests
3. current gate + tool output
4. historical commit messages and code comments
```

If an older source comment conflicts with the ledger, **do not silently follow the
comment** — characterize the conflict first. Several stale `@internal` comments in
this repo asserted the opposite of a deliberate public decision.

Corollary confirmed last session: the `6e7bf16a` "Measured public surface" table
in `RELEASE-1.0.md` is STALE (core 209 vs a real 207 before slice 1). It is
labelled with its commit and kept as history. `tools/api-baseline.json` is the
live figure.

---

## FORWARD QUEUE

```
1. SignalTreeBase         DELETE            DONE (6a515699)
1b. SignalTree grammar    FIXED             DONE (243dd5fb, 215568cb)
2. composeEnhancers       DELETE            DONE (6c3d73a8, corrected d09525d6)
3. built-ins              -> Enhancer<Methods>   <- you are here
                          (also owns the `requires` namespace defect)
4. realization overload   DELETE
5. variadic .with(...)    prove + land      BLOCKED on 3
6. SignalTree/ISignalTree final matrix
7. ISignalTree            internalize BEHIND SignalTree<T>   BLOCKED on 3
                          (SignalTree<T> is the public name and STAYS;
                           only its representation becomes private)
```

**5 and 7 are blocked on 3.** Variadic `.with()` cannot accept the built-ins
until their public contracts are neutral, and `ISignalTree` stays public until
then because `guardrails`/`realtime`/`schema`/`ng-forms` declare enhancers with
it.

Slice 6 should EXTEND `signal-tree-type-matrix.typing.spec.ts` rather than start
a new file — its eight dimensions are already the shape that matrix wants.

Per-enhancer sizing from the `batching` spike is signature + `import type` + one
boundary cast, body untouched — a **candidate** shape proven on one enhancer, to
be characterized per enhancer.

---

## FAILURE-AVOIDANCE CONSTRAINTS

```
- preserve listed pre-existing dirt; stage own hunks only
- never use git stash as a convenience around a dirty workspace
- lint tools/ separately when modifying tools/
- build success = exit 0 AND expected fresh artifact exists
- flaky-once test != clean; rerun and record both outcomes
- same TS error-code counts != same diagnostics; compare identity
- no push / publish / tag / merge / history rewrite
- no Claude attribution lines in commit messages
```

Pre-existing dirt, unchanged and re-verified at `d7bb9c5d`: `.gitignore`,
`AGENTS.md`, `TODO.md`, `eslint.config.mjs`,
`packages/ng-forms/src/signals/greenfield-branch-model.spec.ts`, plus untracked
`.claude/`, `CLAUDE.md`, `HANDOFF.md`. For `eslint.config.mjs`, stage only your
hunk via `git hash-object` + `git update-index --cacheinfo`.

Rules 0 / 0b / 0c in `RELEASE-1.0.md` are the measurement discipline. 0b step 4 is
the one that kept being skipped: require a positive success condition, never the
mere absence of a failure string.

---

## HISTORICAL — why the gates exist, not work to perform

Four symbols shipped declarations referencing types the emitted `.d.ts` did not
declare, while builds, tests, and the export inventory were all green. That is
why Gate B measures three independent properties. **Evidence, not backlog.**

---

## OPEN ITEMS (real, not this slice)

- `api-inventory` blind spot: compares symbol sets and metadata, so a type-shape
  change to an existing symbol is invisible. Targeted contract tests cover this
  for 1.0 — `SignalTree<T>` is now one of them; generalized fingerprinting is
  explicitly not a 1.0 requirement.
- Post-Gate-B queue in `RELEASE-1.0.md`: `FORM_MARKER` ownership, un-publishing
  `guardrails/./noop` as a public subpath, the global-authority audit
  (`flushAllStoredSignals`, `clearStoragePrefix`, `invalidateTag`), the
  deletion-first utility audit, `EnhancerMeta` readonly/literal polish.
- Ledger item **NEEDS RECONCILIATION**: "guardrails dead in prod" must either name
  a narrower failing invariant or be retired with evidence. Do not silently
  convert it to "false".
- Phase 5 now carries a second half: make `nx test core` name its failing test.
  The flaky timing specs cannot be diagnosed through the documented command.
