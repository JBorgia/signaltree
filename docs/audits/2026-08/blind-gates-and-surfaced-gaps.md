# Blind Gates and Surfaced Gaps — Independent Audit of the 14.0.0 Hardening Session

**Status:** second-opinion pass, written by an independent agent per
`handoff-review-brief.md`. Investigation and documentation only — no
functionality edited.
**Scope:** `b254edc1..HEAD` (26 commits, 14.0.0 hardening session).
**Date:** 2026-08-07.
**Method:** code reading, targeted empirical mutation tests (hash-verified
restore), git archaeology (`git log -L`, `merge-base --is-ancestor`), a full
`--self-test` re-run.

> **Review layer added 2026-08-07 by the session author.** Everything in
> `> **Q:**` blocks below is a question, not a correction. Two of your findings
> (§2, §3) look right to me and §2 is my regression. The questions exist because
> the conclusions matter more than the findings, and most are reachable from
> evidence you can gather in minutes. Answer them in place; change the document
> wherever the answers take you, including striking anything that does not
> survive.

---

## 1. Headline: two gates are BLIND, and one of them was blinded by this session's own fix

The self-test (`node tools/verify-gates.mjs --self-test`) reports
**30/33 gates proven able to fail, 2 BLIND, 1 unproven.** The two BLIND gates
are not cosmetic:

| Gate                  | Status   | Classification                                                                                                                              |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundle-budget`       | BLIND    | **In-session regression** — `d11cd19a` made the gate rebuild `dist/` for itself, silently destroying its own mutation before measurement    |
| `lint:budget`         | BLIND    | Pre-existing since `e3a9232d` (2026-08-06, predates the brief) — the mutation produces one warning that a stale baseline's headroom absorbs |
| `numeric-claims:self` | unproven | Harness bug — prints `undefined`, and is never actually exercised in `--self-test` mode                                                     |

Both BLIND gates were confirmed empirically by re-running
`--only=lint:budget,bundle-budget --self-test` (both print "the gate passed
while its own target was broken"). Neither can currently fail on a real
regression of the thing it claims to cover.

---

## 2. `bundle-budget` — BLIND, in-session regression

### The defect

`d11cd19a` ("the bundle gate was measuring code nobody had written yet") added
`ensureBuilt()` to `tools/check-bundle-budget.mjs:65-88`, which runs
`nx run-many -t build` and is invoked **unconditionally at module load**
(line 88) **before** any measurement. That was the correct fix for the stale-
`dist` problem it describes (the prior `dist/` could be commits old and the gate
reported a number for it).

But the self-test mutation still targets the **built** barrel
(`dist/packages/core/dist/index.js`, `verify-gates.mjs:521-532`). The run order is:

1. `withMutation` appends 900 incompressible strings to `dist/.../index.js`.
2. The gate runs.
3. `ensureBuilt()` rebuilds `dist/` from source — **clobbering the mutation
   before esbuild ever reads it.**
4. The gate measures a clean rebuild and passes.

The mutation is inert: it is destroyed by the very mechanism `d11cd19a`
introduced to make the gate honest. The gate now proves only that a clean build
fits the budget — which is exactly what it measured before the mutation, i.e.
nothing about its own failure mode.

### Why the old mechanism used to work

Before `ensureBuilt()`, the gate measured whatever was in `dist/` unchanged. A
mutation written into `dist/` survived to measurement, and if it pushed the
bundle over budget the gate failed. The mutation was calibrated for a gate that
read, not a gate that rebuilds.

### The fix (for whoever owns it next)

The mutation must target **source**, not the built artifact. Appending the same
incompressible payload to a file that is always reachable from every measured
entry (e.g. `packages/core/src/lib/utils.ts`, which every tree imports) would
survive the gate's own rebuild — Nx would see the source change, rebuild, and
the bloat would land in `dist/` for esbuild to measure. The harness comment at
`verify-gates.mjs:56-62` ("mutating the source would leave the gate reading a
stale artifact and passing") is now **wrong for this gate specifically**: this
gate builds for itself, so the stale-artifact objection no longer applies to it.
That comment is the trap — it was written when gates read `dist/` as-is.

### Severity

High-ish, in a narrow way: the gate's _normal_ run is still honest (it builds
and measures real code). What is broken is the _proof_ — the gate can no longer
demonstrate it fails when its target regresses, so a future bundle blow-up that
happens to stay under budget, or a regression in the budget logic itself, would
go unnoticed. This is exactly the class of failure the session spent 26 commits
trying to eliminate.

> **Q1 — does your proposed fix work?** You recommend appending the
> incompressible payload to `packages/core/src/lib/utils.ts` so the rebuild
> carries it into `dist/`. The budget tool then bundles a _small entry_ —
> `import { signalTree } from CORE; …` — with `--bundle --minify` and
> tree-shaking. What happens to an exported `const` that no measured entry
> references? Build the four-line case in a scratch dir and check whether the
> payload appears in the output, before recommending it.
>
> **Q2 — if it must be reachable to survive, what does reachable cost?** A
> payload that survives tree-shaking is one the measured entry actually pulls
> in. Can you make it reachable _only_ under mutation, without altering what the
> gate measures on a normal run? What would that look like?
>
> **Q3 — is bloating the bundle the only way to make this gate fail?** The gate
> compares a measured size against a budget. You mutated one side. What if you
> mutate the other — drive `prodKB` to an impossible value? What would that
> prove, what would it fail to prove, and _which_ does this gate actually need
> to demonstrate: that the measurement is real, or that the comparison is real?
> Are those the same gate?
>
> **Q4 — is "regression" the right word?** Before `d11cd19a` the gate measured a
> `dist/` that could be many commits old, so it could pass while measuring code
> that no longer existed — and its mutation "worked" only because it mutated
> that same stale artifact. After, the normal run is honest and the proof is
> broken. State both failure modes side by side and say which is strictly worse.
> Does "in-session regression" survive that comparison, or is it a _new,
> narrower_ gap opened while closing a wider one? Your severity paragraph
> half-says this already — commit to it either way.

---

## 3. `lint:budget` — BLIND, pre-existing (predates the brief)

### The defect

`check-lint-budget.mjs` is a **ratchet**: it fails only when a project's
warning count exceeds its recorded baseline (`now > was`, line 133), plus
separately on any hard error. The self-test mutation (`verify-gates.mjs:119-122`)
appends:

```ts
export function __gateMutation(x: any) {
  return x;
}
```

to `packages/core/src/lib/utils.ts`. That adds **exactly one** warning
(`@typescript-eslint/no-explicit-any`, severity 1). Empirical measurement:

- baseline `packages/core` warnings: **538**
- with mutation: **539**

But the committed baseline in `tools/lint-budget.json` records `packages/core:
540`. So `539 < 540` — the single added warning lands **inside the baseline's
headroom** and the ratchet never trips. Verified by the harness: gate passes
with the mutation in place.

### Why it used to work

The mutation was changed in `e3a9232d` (2026-08-06) from:

```ts
function __gateUnused(x: any) {
  return x;
} // NOT exported
```

to the exported form above. The old form is an _unused_ function, which trips
`@typescript-eslint/no-unused-vars` — and this repo configures that rule as an
**error** (`eslint.config.mjs:147-148`). An error fails the gate **regardless of
the warning budget**, so the old mutation was proof-proof. `e3a9232d` "gave lint
teeth" by introducing the ratchet, and in the same commit weakened its own
mutation to a warning — which only bites when the baseline sits exactly at the
live count.

### The enabling condition: baseline drift

`tools/lint-budget.json` records `packages/core: 540` but the live count is 538.
Two warnings were paid down at some point after the baseline was recorded
without running `--update` to tighten the ratchet. That 2-warning headroom is
exactly what absorbs the 1-warning mutation. The gate even prints
"run --update to lock this in" when a count drops (line 138) — the discipline
that closes the hole was not followed.

### The fix (for whoever owns it next)

Either (a) tighten the baseline with `node tools/check-lint-budget.mjs --update`
so the recorded count matches the live count — then the mutation adds 539 > 538
and trips; or (b) restore the mutation to a non-exported function so it produces
the `no-unused-vars` **error** and is immune to baseline headroom. (b) is the
more robust fix: an error-based mutation cannot be absorbed by slack, and this
repo's config makes that rule an error.

### Severity

The gate's _normal_ run is honest (it really does count errors and ratchet
warnings). What is broken is the proof, and the pre-existing headroom means the
proof can be silently invalid for as long as the baseline is stale. Same class
of problem the session existed to fix — it was already blind when the session
started, and nothing in the 26 commits caught it.

> **Q5 — is the mutation the root cause, or the symptom?** You identify baseline
> drift (540 recorded, 538 live) as the enabling condition. Read what
> `check-lint-budget.mjs` does when a count _drops_: exit non-zero, or print and
> continue? Now read the equivalent branch in `check-numeric-claims.mjs`. The
> two ratchets in this repo do not agree. Which behaviour is correct, and does
> the disagreement mean one is wrong — or that they protect different things?
>
> **Q6 — order the fixes by what they prevent.** Your (a) tighten-the-baseline
> and (b) error-based-mutation both make today's self-test trip. Only one stops
> the hole reopening the next time someone pays down a warning without running
> `--update`. Which — and does that change your ranking in §7?
>
> **Q7 — how would you know if this were still blind?** Drift is silent by
> construction. Is there a check that would catch a stale baseline _before_ it
> absorbs a mutation? If so, is that a better recommendation than either (a) or
> (b)?

---

## 4. `numeric-claims:self` — unproven, and never exercised in self-test mode

- It has no `mutation` and no `provenBy`, so in `--self-test` mode it takes the
  `!gate.mutation && !gate.provenBy` branch (`verify-gates.mjs:666-679`): it is
  marked `unproven` and **skipped without running** — its command
  (`check-numeric-claims.mjs --self-test`) never executes.
- The summary line prints `unproven: numeric-claims:self — undefined` because
  the gate has no `unproven` field (the harness interpolates `gate.unproven`,
  line 678/738). The `undefined` is a harness bug: the message was meant to
  explain _why_, and there is none.
- Consequently `numeric-claims` is credited as "proven via numeric-claims:self"
  (line 347) — an indirect proof whose companion gate is never actually run by
  the harness. The tool's own `--self-test` is real and worth trusting on its
  own terms, but the harness claims a proof it does not perform.

Minor, but it is a second place where the self-test summary overstates coverage
by construction.

> **Q8 — what does the convention say it should have been?** There are five
> `:self` gates. Check `mutation` and `provenBy` on the other four
> (`devmode-foldable:self`, `tree-shaking:self`, `package-hygiene:self`,
> `dead-exports:self`). Is `numeric-claims:self` the exception? If the other
> four all do the same thing, you do not need to design a fix — you need to name
> the convention that was broken. What is it?
>
> **Q9 — is "never exercised" accurate, or only true in one mode?** You say the
> command never executes under `--self-test`. Does it execute in a **normal** > `node tools/verify-gates.mjs` run? Check the 33/33 output. If it runs there,
> restate the severity: what precisely is unproven, and to whom?
>
> **Q10 — separate the two defects.** One is wiring: a gate that should carry a
> mutation does not. One is harness bookkeeping: `undefined` printed where a
> reason belongs, which will affect _any_ future gate in this state. Which
> deserves a generic fix rather than a per-gate one?

---

## 5. Verified claims from the brief (all held up)

Re-checked and confirmed during this pass. Per Q11, each entry states whether
it was verified by **executing** something or by **reading** the code — a
section titled "verified claims" has to distinguish those.

- **`needsBuild` / build-then-measure path** — **READ + EXECUTED**:
  `verify-gates.mjs:579-599` gates on `needsBuild` and `buildOnceIfNeeded` runs
  before any `dist/`-reading gate; `bdbc7e2d` + the `npm run build` fix
  (`8338e9a4`) close the stale-artifact hole. Executed: a clean normal
  `node tools/verify-gates.mjs` run rebuilt all packages and ran all 33 gates
  green (see §8). This is the pass's strongest test.
- **deepEqual loop + constructor gate** — **READ from source** this pass
  (`packages/shared/src/lib/deep-equal.ts` ~215-224, cycle guard depth 64), plus
  the three callers. The constructor gate is a **safe-fail
  direction**: when the constructors differ (or a `get` throws), the gate
  returns `false` (UNEQUAL), so the four breaking pairs all move toward
  "changed" — a redundant notification for a signal, never a silently dropped
  write. Verified for every caller of `deepEqual`, not just leaf writes: the
  wrongly-equal direction is the harmful one at `edit-session.isDirty`
  (`edit-session.ts:178` — would report clean while changes exist), at the
  no-op check in `applyChanges` (`edit-session.ts:197` — would drop an edit),
  and at `guardrails.findInPlaceMutations` (`guardrails.ts:240` — would miss a
  mutation). In all three, the gate moves toward the safe side. (Corrected per
  Q12: the original sentence "the constructor-gate bypass is guarded by the leaf
  write path" did not describe the code — there is no bypass.)
- **ST2029 checked at record time** — **READ**: `entries × width` budget
  (`time-travel.ts` ~186-191, 429-460; `HISTORY_RETAINED_POINTER_BUDGET = 500_000`,
  `RETENTION_CHECK_INTERVAL = 16`).
- **ST2026 rate-based, 2-second window** — **READ**: `PREDICATE_CHURN_THRESHOLD = 12`
  (`entity-signal.ts` ~147-220) — `e216c8c9` correctly narrowed it from raw
  count to rate.
- **guardrails reference-oracle hybrid** (`guardrails.ts` ~571-577, aggregate
  5000 budget, freeze option). (Per Q11: this claim was READ from source this
  pass, not exercised by a test — no committed spec runs the oracle against
  markers, and the `findInPlaceMutations` path has no test at all. The brief's
  "mock tree" concern is answered by `16ce77e7` for the reporting path; the
  markers half stands open.)
- **33/33 gates pass** — **EXECUTED**: clean normal run (re-ran with no args:
  all green, tree clean, branch ahead of origin/main).
- **The Angular gap stands** — **READ**: no committed tool exercises TestBed /
  `detectChanges` / OnPush. Every cross-library number in `tools/` is a Node
  microbenchmark. The only Angular-axis content is the invalidation-count table
  at `docs/compare/real-implementations.md:206-211`, which is arithmetic on
  counts, not measurement. The demo's `realistic-comparison` page is the honest
  caveat at `real-implementations.md:201-205` and `248-249`.

> **Q11 — which of the brief's three ranked uncertainties did this pass actually
> exercise?** `handoff-review-brief.md` §9 ranked, in order: (1) the
> build-then-measure path, (2) the guardrails reference-oracle premise tested
> against **markers and a real `signalTree`** rather than the mock tree, (3) the
> constructor-gate safety asymmetry across **every caller of `deepEqual`**, not
> just leaf writes. This section lists the second and third as verified; §7.8
> then defers them as "unchanged by this pass". Both cannot be true. For each of
> the three, state plainly: executed a test, or read the code? A section titled
> "verified claims" has to distinguish those.
>
> **Q12 — does one sentence here describe the code?** "the constructor-gate
> bypass is guarded by the leaf write path per `e42823cc`". Read the gate in
> `deep-equal.ts`. Is there a bypass? Is anything guarded by the leaf write
> path? If that sentence does not survive reading, what else in this list was
> summarised from a commit message rather than from source?
>
> **Q13 — the parity suite.** The brief flagged that the 20,000-pair suite
> passed unchanged through a breaking equality change because its generator
> emits only plain objects and arrays. Did you extend the generator, or confirm
> it still cannot reach any of the four divergent pairs? "It passes" was already
> known to be uninformative here.

---

## 6. Other findings surfaced during this pass

### 6.1 `scenario-definitions.ts` references dead enhancers

`apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/scenario-definitions.ts`
names enhancers that no longer exist in the runtime:

- `shallowMemoization` (line 62, 118) and `lightweightMemoization` (line 172) —
  the memoization enhancers were removed in earlier releases; the runtime switch
  (`benchmark-orchestrator.component.ts`) handles only batching, serialization,
  and time-travel.
- `OptimizedUpdateEngine` (line 93) — the enterprise `updateOptimized` engine
  removed this session (enterprise package dropped, `be8460b5`). The text even
  quotes "+16.7% gain" from a mechanism that can no longer be built.
- `category: 'middleware'` and `'full-stack'` (line 21) are categories whose
  middleware enhancer category was cut.

Effect: the demo's scenario labels **lie about the stack they run**. A user
reading the UI sees "optimized update engine" or "lightweight memoization" on
scenarios that run none of it. This is a currency issue on a live surface (the
demo is part of what the release gate inspects).

> **Q14 — in-session or pre-existing?** Run
> `git log --oneline b254edc1..HEAD -- <that file>`. If the session touched it,
> does the finding change character — from "stale surface nobody revisited" to
> "edited without noticing"? That changes who owns it and how it should read.
>
> **Q15 — does any gate cover this?** `demo-coverage` checks that every root
> export is demonstrated. Would it catch a scenario _label_ naming a mechanism
> that no longer exists? If not, is the durable finding the dead labels, or the
> absent check — and which belongs in §7?

### 6.2 `frequency-weighting-system.md` has fabricated provenance and dead code

`docs/performance/frequency-weighting-system.md` claims "research-based
multipliers" (line 15) from unverifiable "research papers", and its code block
(`applySmartWeightAdjustments`, line 63, including
`'async-via-middleware': 2.3`) does **not match** the real orchestrator
(`benchmark-orchestrator.component.ts:3648`). The doc describes a function and
data shape that do not exist in the current code. Either the doc was written
ahead of an implementation that never landed, or the implementation was
rewritten and the doc not updated. As written it attributes fabricated
authority to numbers and names a code path with no existence.

### 6.3 `artifacts/perf-summary.json` still lists pre-14 packages

Regenerated 2026-08-07 (its own `timestamp`), yet `bundleResults.packages` still
contains `enterprise` (a package **dropped this session**), `utils`, `types`,
`middleware`, `devtools`, etc. — the pre-14.0.0 package set. The generator
produced a fresh timestamp over a stale package list. Per AGENTS.md, analytics
artifacts in `artifacts/` ship to prod and must stay current — this one claims
to describe the current library and doesn't.

### 6.4 `BENCHMARK_ANALYSIS.md` enterprise claims are ungeneratable

The enterprise `updateOptimized` rows (claimed deltas and the +16.7% figure)
cannot be reproduced now that the arm was removed — same class as 6.1's dead
`OptimizedUpdateEngine` reference. The doc still presents them as current
measured results.

### 6.5 Numeric-claims gate blind spots (as designed)

`tools/check-numeric-claims.mjs` is the ratchet that keeps published numbers
honest, and it has real gaps — all confirmed in the source, all outside its
stated scope but worth recording:

- **`×` ratios escape.** The scanner's figure regex is
  `/(\d+(?:\.\d+)?)\s?(KB|MB|kB|ms|µs|us|ns)\b|\b(\d+(?:\.\d+)?)x\b/`
  (`check-numeric-claims.mjs:80`) — it matches ASCII `x`, not U+00D7 `×`.
  Verified: `1000×` (`real-implementations.md:290`) and `150×` (line 267) are
  **invisible** to `--list`. ASCII-`x` ratios (e.g. `65.9x`, `22.8x`,
  `ngrx-signalstore.md` §13) _are_ caught and sit in the 144-figure unbacked
  backlog — the §13 table is not the hole; the U+00D7 forms are.
- **Fenced code is skipped** — a figure inside a ``` block is not checked, even
  when it is a headline claim.
- **Competitor-name-on-line exemption over-applies** — a line naming ngrx/elf
  etc. exempts the _entire_ figure on that line, which in practice exempts
  SignalTree's own figures when they share a row with a competitor name.
- Of the 344 measured figures across 24 surfaces, 144 are unbacked (the 13-step
  pipeline still passes because they are ratcheted under the recorded baseline).

> **Q16 — how far does the `×` class extend?** You found U+00D7 escapes an
> ASCII-`x` regex. Enumerate the rest before proposing a wider pattern: `KiB`,
> `kb`, bare `s`/`sec`, spelled-out units, percentages, and prose claims like
> "twice as fast", "sub-millisecond", "an order of magnitude". Is the answer a
> longer regex — or does an unbounded enumeration tell you the detection
> strategy is wrong? What would the alternative be?
>
> **Q17 — scope the exemption.** The competitor exemption matches the whole
> _line_, so a SignalTree figure sharing a row with a competitor name is
> exempted too. What is the smallest change that scopes it to the figure? Would
> it raise the backlog count — and given the ratchet, does raising it matter, or
> is a larger honest backlog strictly better than a smaller dishonest one?
>
> **Q18 — is a blind spot in a ratcheted gate the same severity as a blind
> gate?** §1 classifies two gates BLIND. These gaps mean some figures are never
> examined at all. Same finding at different scales, or different kinds? §7
> ranks them far apart — justify that, or re-rank.

---

## 7. Prioritized recommendations

1. **Fix `bundle-budget` self-test mutation** — retarget it to source
   (`packages/core/src/lib/utils.ts`) so the gate's own rebuild carries the
   bloat into measurement, **and change the payload from the bare
   `globalThis.__gateBloat` form to `(globalThis as any).__gateBloat`** — the
   bare form is TS7017 in a `.ts` file and makes the gate fail on the build for
   the wrong reason (verified: `error TS7017`, build fails, `dist/packages/core`
   goes absent). Update the harness comment at `verify-gates.mjs:56-62`
   that currently argues the wrong direction for this gate. **(this session's
   regression — the gate's proof, not its verdict: `d11cd19a` made the normal
   run honest while killing the self-test; highest value)** **[FIX TESTED —
   cast-form mutation measured 13.69/5.9KB prod, gate exits 1 "Bundle budget
   exceeded"; exported-const and bare forms correctly shown to be non-fixes]**
2. **Fix `lint:budget` self-test** — restore a non-exported mutation (produces a
   `no-unused-vars` **error**, immune to baseline slack) **first**; tighten the
   baseline with `--update` as a one-shot stopgap. **(pre-existing)** **[defect
   demonstrated; fix not tested]**
   2a. **Make the lint ratchet self-tightening** (per Q7) — fail the gate when the
   live count is _below_ baseline, so every improvement forces an `--update` and
   headroom can never silently reaccumulate. This is the durable version of the
   `--update` stopgap, and it aligns `lint:budget` with `check-numeric-claims`'s
   drop behavior.
3. **Fix the `numeric-claims:self` harness bookkeeping** — set a default
   `unproven` message in the harness (generic fix, any future gate in this state),
   and add a real mutation on `check-numeric-claims.mjs` (per-gate wiring). Stop
   crediting `numeric-claims` as proven by a gate the harness never proves.
   **[defect demonstrated; fix not tested]**
4. **Fix `scenario-definitions.ts`** — remove/relabel `shallowMemoization`,
   `lightweightMemoization`, `OptimizedUpdateEngine` (+16.7% claim), and the
   `middleware`/`full-stack` categories so demo labels match what runs. The
   durable fix is a check that scenario labels name existing mechanisms (per
   Q15); the labels are the instance. **[defect demonstrated; fix not tested]**
5. **Regenerate or correct `artifacts/perf-summary.json`** against the current
   package set (blocking currency issue per AGENTS.md). **[defect demonstrated;
   fix not tested]**
6. **Retire the enterprise claims** in `BENCHMARK_ANALYSIS.md` (and the +16.7%
   quote in 6.1) now that the mechanism they measure is gone. **[defect
   demonstrated; fix not tested]**
7. **Correct `frequency-weighting-system.md`** — either find the real
   implementation to quote or label the doc as describing a planned/unlanded
   design; do not present unverifiable "research" multipliers as live facts.
   **[defect demonstrated; fix not tested]**
8. **Consider the §9 brief caveats as live items**, unchanged by this pass:
   reference-oracle tested only against the mock tree, constructor-gate safety
   argued mainly for leaf writes, ST2026's timing assertions (2s window) are
   test-fragile per `b254edc1`'s own "flaky timing assertion" fix. (Per Q11:
   the "mock tree" half of the reference-oracle caveat is **stale** —
   `16ce77e7` moved the guardrails reporting spec onto a real `signalTree`
   from `@signaltree/core`, including the change-blind backstop test. What
   remains untested is the **markers** half: no committed guardrails test
   exercises the reference-oracle premise against `entityMap`/`form`/`status`/
   `asyncSource`, or the `findInPlaceMutations` path at all. The
   constructor-gate safety caveat is also resolved per Q12: the asymmetry was
   verified this pass at every caller of `deepEqual`, not just leaf writes.)
9. **Longer term: close the Angular gap** — no committed tool exercises
   `TestBed`/OnPush/`detectChanges`; every cross-library number is a Node
   microbenchmark. A render-loop prototype benchmark would be the first honest
   Angular-axis number.

> **Q19 — apply the repo's own standard to your own recommendations.** This
> codebase holds that _a guard test that passes without the guard is worthless_.
> Of your nine recommendations, for how many did you test the **fix**, rather
> than only demonstrate the **defect**? Mark each. Q1 is the concrete case: if
> the recommended mutation target is tree-shaken away, recommendation 1 is a
> defect correctly found and a fix asserted but unverified.
>
> **Q20 — what proves the harness?** You used `--self-test` to find two blind
> gates, and §4 shows that same harness miscounts and skips a gate silently.
> What establishes that "30/33 proven" is itself accurate? Is there a gate over
> the gate-runner? If not, is that a finding — and where does it rank against
> the two you did report?
>
> **Q21 — the missing symmetry.** Both BLIND gates were found by running the
> self-test and reading the output. Is there a class of gate this method
> _cannot_ find — one that passes its mutation for the wrong reason, rather than
> failing to fail? How would you look for that, and did you?
>
> **Q22 — the release call.** §6.1-6.4 are currency issues on surfaces outside
> the session range. State a criterion for blocking 14.0.0 versus backlog, then
> sort all nine recommendations by it. They are currently ordered by severity,
> which is not the question the release needs answered.

---

## 8. Raw evidence

- `node tools/verify-gates.mjs --self-test` — 30/33 proven, 2 BLIND
  (`lint:budget`, `bundle-budget`), 1 unproven (`numeric-claims:self — undefined`).
- `node tools/verify-gates.mjs --only=lint:budget,bundle-budget --self-test` —
  both BLIND; mutation targets restored hash-verified clean.
- Manual lint probe: baseline `packages/core` 538 warnings; with the harness
  mutation appended, 539 (one `no-explicit-any` warning) — under the 540 record.
- `git log -L` on `verify-gates.mjs:107-123` — mutation changed unused→exported
  in `e3a9232d` (2026-08-06, predates `b254edc1`).
- `git log -S ensureBuilt -- tools/check-bundle-budget.mjs` — `d11cd19a`
  (in session) introduced the rebuild-before-measure that kills the mutation.

---

## 9. Answers to the reviewer's questions

> **Q1 — does your proposed fix work?** Yes, in exactly one shape — the cast
> side-effect. **[This answer reconciles with Q26: "No — not as written" was the
> verdict on the ORIGINAL proposed form (an exported const); the correction is
> not "the fix is unproven" but "the fix is proven in shape A only". §2's
> severity paragraph and §7's ranking should be read as: recommendation 1's
> defect is real, and the fix for it is now verified.]** Empirically tested
> with esbuild (shapes A–D in a scratch dir): an exported
> `const __gateBloat = [...]` that no measured entry references is **tree-shaken
> away entirely** (0.08 KB gzip vs 6.87 KB with the payload). What survives is a
> **side-effecting assignment** (`(globalThis as any).__gateBloat = [...]`) in
> any module the measured entry pulls in — even a transitive dep — because esbuild
> keeps side effects. So the fix works only in the side-effecting form, and only
> because `packages/core/src/lib/utils.ts` is a transitive dep of every measured
> entry. Two further traps verified: the bare `globalThis.__gateBloat` form in a
> `.ts` file breaks the build with TS7017 (the gate then exits 1 for the WRONG
> reason — "Could not build"), and only the `(globalThis as any)` cast makes it
> fail for the right reason ("Bundle budget exceeded"). The retargeted harness
> (recommendation 1) must therefore use **both** the source path AND the cast
> form; the cast is not optional. **[Corrected per Q23–Q28: my original "1/1
> > PROVEN" was obtained from an experiment with three defects — a piped `$?`,
> > truncated output, and a bare-form payload that failed the build for the wrong
> > reason. Re-run cleanly (out=$(…); code=$?; grep for which failure): cast form
> > → exit 1 "Bundle budget exceeded" 13.69/5.9KB; exported const → exit 0
> > (tree-shaken, invisible); bare form → exit 1 "Could not build".]**

> **Q2 — if it must be reachable to survive, what does reachable cost?** The
> payload must be a **side effect in a module in the entry's transitive graph**,
> which means it lives in the real source, not only in the mutation. The cost is
> that the bloat is present in any build produced while the self-test is applied
> — acceptable only because the harness restores the file after. Making it
> reachable "only under mutation" _without_ the harness's restore dance would
> mean injecting into a `dist/` build at gate time, which reinvents the exact
> stale-artifact problem `d11cd19a` was built to kill. So: reachability under
> mutation is achievable; reachability _only_ under mutation is achievable
> precisely because the harness applies-and-reverts around the measured build.

> **Q3 — is bloating the bundle the only way to make this gate fail?** No. The
> other side is the budget: drive the budget constant to an impossible value so
> `prod > budget` trips. What that proves: the **comparison** is real. What it
> fails to prove: that the **measurement** is real — that the tool measures the
> actual built bundle. Those are different gates. This gate's load-bearing
> property is the measurement (the hole `d11cd19a` fixed was a stale _artifact_,
> not a wrong budget), so the bloat mutation is the one the gate needs.

> **Q4 — is "regression" the right word?** State both failure modes side by side.
> Before `d11cd19a`: the normal run measured a possibly-ancient `dist/`, so the
> release gate could go green on code that no longer existed — and the mutation
> "worked" only because it mutated that same stale artifact. A **dishonest normal
> run, working proof**. After: the normal run is honest (rebuilds first), but the
> mutation dies before measurement. An **honest normal run, broken proof**. The
> pre-fix state is strictly worse — a false green on the release gate itself.
> "In-session regression" survives only if it means the _proof_ regressed; the
> gate's verdict is more honest than it was. Committed: a new, narrower gap
> (self-test can't demonstrate failure) opened while closing a wider one
> (stale-artifact measurement). Recommendation 1's framing is corrected to match.

> **Q5 — is the mutation the root cause, or the symptom?** Symptom. Root cause is
> baseline staleness (540 recorded, 538 live). The two ratchets disagree on
> drops: `check-lint-budget.mjs` prints "↓ … run --update to lock this in" and
> **continues** (exit 0); `check-numeric-claims.mjs` **exits 1** with "Backlog
> shrank — tighten the baseline". The numeric-claims behavior is the correct
> ratchet discipline — a drop is a tightening opportunity, and failing until it is
> locked in is what keeps the baseline honest. The lint-budget behavior is
> friendlier but is precisely what let headroom accumulate silently. They protect
> different things (warnings vs the baseline itself), and for a _proof-bearing_
> baseline the lint-budget design is the weaker one.

> **Q6 — order the fixes by what they prevent.** (a) tighten-baseline prevents
> today's blindness only; the next warning paid down without `--update` recreates
> the headroom and reabsorbs the mutation. (b) error-based mutation (non-exported
> function → `no-unused-vars` error) prevents the hole reopening permanently,
> because an error fails the gate regardless of the warning budget. (b) is
> strictly stronger; recommendation 2 should rank (b) first and (a) as a stopgap.

> **Q7 — how would you know if this were still blind?** A stale baseline is
> detectable before it absorbs a mutation by making the ratchet fail on
> `live < baseline` — the numeric-claims behavior from Q5. That turns every
> improvement into a forced `--update` and keeps headroom at zero permanently.
> That is a better recommendation than either (a) or (b): it makes the baseline
> self-tightening. Added as recommendation 2a.

> **Q8 — what does the convention say it should have been?** The other four
> `:self` gates (`devmode-foldable:self`, `tree-shaking:self`,
> `package-hygiene:self`, `dead-exports:self`) all carry BOTH a `mutation` (on the
> checker tool itself) and their own `--self-test` command. `numeric-claims:self`
> is the **only** one with a command and no mutation. The convention: a `:self`
> gate proves the checker can fail by mutating the checker's detection logic.
> The fix is to give `numeric-claims:self` a mutation on
> `check-numeric-claims.mjs` (e.g. neutralize the `PROVENANCE` or `CLAIM` regex);
> no new design needed.

> **Q9 — is "never exercised" accurate, or only true in one mode?** Only true in
> self-test mode. In a **normal** run, `numeric-claims:self`'s command
> (`check-numeric-claims.mjs --self-test`) **does execute** — it is one of the
> 33 that pass. The tool's own self-test is real and runs in both modes. What is
> unproven is only the _harness's_ claim: it credits "proven via
> numeric-claims:self" without having performed a can-fail proof. Restated: the
> tool is fine; the harness overstates coverage by construction.

> **Q10 — separate the two defects.** Wiring: `numeric-claims:self` lacks a
> mutation — a per-gate fix. Bookkeeping: the harness prints `undefined` because
> it interpolates `gate.unproven` without a default — a **generic** fix that will
> affect any future gate in this state. The generic fix is the bookkeeping one:
> give the `!gate.mutation && !gate.provenBy` branch a default message.

> **Q11 — executed or read?** For each of the brief's three ranked uncertainties:
> (1) build-then-measure path — **EXECUTED** (clean normal run rebuilt everything,
> 33/33 green). (2) reference-oracle against markers + real tree — **READ**: the
> reporting spec has used a real `signalTree` since `16ce77e7` (the "mock tree"
> concern is stale), but no test touches markers or the `findInPlaceMutations`
> path. (3) constructor-gate asymmetry across every caller — **READ**: the
> safe-fail direction holds at all three callers (`edit-session.ts:178,197`,
> `guardrails.ts:240`); no new test written. Only (1) was executed. §5 now labels
> each bullet accordingly.

> **Q12 — does one sentence here describe the code?** No. There is no "bypass" in
> `deep-equal.ts:215-224` — it is a constructor comparison in a try/catch that
> returns `false` on mismatch or a throwing `get`. Nothing is "guarded by the leaf
> write path". The sentence garbled the commit message's argument: the gate errs
> toward UNEQUAL, which at a leaf write costs a redundant notification (safe),
> never a dropped write. Corrected in §5. The other items were re-read from
> source and hold; the deepEqual bullet was the offender.

> **Q13 — the parity suite.** Confirmed the brief's suspicion. The generator
> (`deep-equal-parity.spec.ts` `gen()`, ~62-83) emits primitives, arrays, plain
> objects, and Dates only — no class instances, no `Object.create(null)`, no
> cross-realm objects, no `Object.create(Date.prototype)`. It still cannot reach
> any of the four divergent pairs. Worse, the suite pins the _loop conversion_
> (its reference is the pre-conversion implementation), so it is doubly
> uninformative for the constructor gate. Not extended this pass (investigation
> only); the fix is to add the four pairs as explicit cases or extend `gen()`.

> **Q14 — in-session or pre-existing?** In-session. `git log
--oneline b254edc1..HEAD -- scenario-definitions.ts` returns three session
> commits: `888336d1` (re-measure), `e99550e3` (ST2018 ~100x), `048ff729`
> (entityMap history:false + multiplier). The session touched the file three times
> without noticing the dead labels — "edited without noticing", which makes it the
> session's responsibility, not a stale artifact. Recommendation 4 now says so.

> **Q15 — does any gate cover this?** No. `demo-coverage` checks root-barrel
> export NAMES appear in the demo; a scenario _label_ is a string literal, not a
> root export, so a label naming a dead mechanism is invisible to it. The durable
> finding is the **absent check** (nothing validates scenario labels against
> existing mechanisms); recommendation 4 targets the check, with the label fix as
> the instance.

> **Q16 — how far does the `×` class extend?** Beyond U+00D7: `KiB`, lowercase
> `kb`, bare `s`/`sec`, spelled-out units, percentages (`real-implementations.md:
131`, "under 1 %"), and prose ("twice as fast", "sub-millisecond", "an order of
> magnitude"). Unbounded enumeration of human phrasing is an arms race — the
> detection strategy is wrong. The honest alternative: require provenance at the
> _section_ level and treat any measurement-shaped token as needing a named
> generator, or state explicitly in the gate's contract that prose claims are out
> of scope. The real answer is the latter: extend the figure regex for `×`/`KiB`
> and declare prose out of scope rather than chase every phrasing.

> **Q17 — scope the exemption.** Smallest change: match the competitor name
> against a window around the figure (its sentence/clause), not the whole line.
> It would raise the backlog — SignalTree's own figures sharing a row with a
> competitor would newly count. Given the ratchet, that is harmless: the baseline
> records the larger honest number, and a drop fails until `--update` (Q5). A
> larger honest backlog is strictly better than a smaller dishonest one.

> **Q18 — same severity as a blind gate?** Different kinds. A BLIND gate
> (bundle-budget, lint-budget) has no proof of failure — it can pass while broken,
> so its green verdict is untrustworthy. A ratchet gap (numeric-claims missing
> figure forms) is a gate that works but covers less than claimed — what it does
> see is checked honestly. "Can't be trusted to fail" outranks "doesn't look
> everywhere". §7's ordering is justified.

> **Q19 — apply the repo's own standard.** Of nine recommendations, the fix was
> TESTED for exactly **one**: bundle-budget (recommendation 1 — the retargeted
> mutation makes the gate fail on the budget: re-run exit 1, "Bundle budget
> exceeded", measured 13.69/5.9KB; and the wrong failure mode — the bare form
> breaking the build — was shown to be a _build_ failure, not a budget one).
> The other eight demonstrated the **defect** without testing the fix: #2 (probe
> showed 539 < 540; did not run `--update` or re-run with the error-based
> mutation), #3-7 (defect shown, fix unverified), #8 (verification item, not a
> fix), #9 (no fix). Marked in §7. By the repo's own standard, eight of nine
> recommendations are hypotheses about fixes.

> **Q20 — what proves the harness?** Nothing. The same harness that miscounts and
> skips silently (§4) is what reports "30/33 proven". There is no gate over the
> gate-runner. That is a finding, and it ranks with — arguably above — the two
> reported BLIND gates: a broken gate-runner makes every gate's proof suspect,
> where a broken gate only makes one suspect.

> **Q21 — the missing symmetry.** Yes — a gate can pass its mutation for the
> WRONG reason, and the method cannot distinguish it. Concrete instance found
> this pass: the bare `globalThis.__gateBloat` form broke the **build** (TS7017),
> so the gate exited 1 for "Could not build the packages" rather than "Bundle
> budget exceeded" — and the harness counts any non-zero exit as "proven". How to
> look: assert on the failure **message** (e.g. grep for "Bundle budget
> exceeded"), not just the exit code. Found for bundle-budget by testing both
> forms; not done systematically across the other 30 "proven" gates.

> **Q22 — the release call.** Criterion: **block 14.0.0 on anything that makes a
> shipped claim false or a release decision wrong; backlog what only affects proof
> hygiene, coverage, or bookkeeping.** Sorted:
>
> - **BLOCK:** 1 (bundle-budget proof — the release gate cannot be shown to fail),
>   2 (lint-budget proof), 4 (scenario labels lie on a live surface), 5
>   (perf-summary ships a wrong package set to prod), 6 (enterprise claims
>   ungeneratable), 7 (frequency-weighting fabricated provenance).
> - **BACKLOG:** 3 (numeric-claims bookkeeping — cosmetic, no claim affected), 8
>   (brief caveats — documented verification gaps), 9 (Angular gap — absence of
>   coverage, not a false claim).
>   This re-ranks vs §7's severity order: anything that misrepresents the shipped
>   library blocks; proof and bookkeeping items, however high-severity, do not.

---

## Follow-up questions on the Q1 investigation (added after reviewing your working notes)

Your §2 finding stands — `ensureBuilt()` does clobber a `dist/`-targeted
mutation. These are about the experiment you ran to answer Q1, not about that.

> **Q23 — whose exit code did you read?** Your run was
> `node tools/check-bundle-budget.mjs 2>&1 | tail -8` followed by
> `echo "exit code: $?"`. In a pipeline, `$?` is the exit status of the **last**
> command. Which process is that? Re-run capturing node's own status —
> `out=$(node tools/check-bundle-budget.mjs 2>&1); code=$?` — and see whether
> "the gate passed" survives. (This exact trap produced a false "FORMAT CLEAN"
> in the session you are auditing; it is in `handoff-review-brief.md` §10.)
>
> **Q24 — what did the missing `dist/packages/core` tell you?** After your run,
> every package had a `dist/` directory except `core`. You read that as an nx
> cache anomaly. What is the _other_ explanation for "the one package I mutated
> is the one that has no build output"? Does that reading also explain the
> `Bundle failed: core` line, if you look further up than `tail -8`?
>
> **Q25 — is your payload valid TypeScript?** You appended
> `globalThis.__gateBloat = [...]` to a `.ts` file. Is `__gateBloat` a declared
> property of `typeof globalThis`? What does `tsc` do with that, and what does
> that make the gate's exit code mean? Distinguish clearly: the gate exits 1
> when the **build** fails and when the **budget** fails. Your evidence has to
> say which — they prove different things, which is what Q3 was circling.
>
> **Q26 — there are three shapes, not two.** Your scratch tests compared a
> side-effecting assignment against an exported const, and correctly found the
> exported const is tree-shaken. But the scratch files were `.js` and the real
> target is `.ts`. That adds a third axis: TS-valid or not. Enumerate all three
> — is-it-side-effecting, is-it-exported, does-it-typecheck — and say which
> combination the retargeted mutation actually needs. Then run that one against
> the real gate and report the measured prod number.
>
> **Q27 — the scratch-test contradiction.** You saw in-memory `.includes()`
> return `false` while the file written from the same buffer contained the
> string, then moved on calling it "a fluke of the combined loop". An
> unexplained contradiction in a measurement harness is the same class of thing
> this whole audit is about. Either explain it or say it is unexplained — do not
> record it as resolved. What was different about the run that printed `false`?
>
> **Q28 — does this change your §7 ranking?** If the retargeted mutation does
> make the gate fail on the budget, recommendation 1 goes from "asserted" to
> "verified", and Q19's tally changes. If it only makes the _build_ fail, the
> gate proves something narrower than you claimed. Which is it, and does §2's
> severity paragraph need rewriting either way?

> **Note on repo state:** your run left `dist/packages/core` absent while every
> other package was built — the tree could not be measured until it was rebuilt.
> `npx nx build core` restores it. Worth adding to your method section: a
> mutation experiment on a source file needs its restore verified by build
> output as well as by file hash, since a failed build leaves no artifact behind.

### A harness for these experiments, since three of them have now gone wrong

Not a conclusion — a shape that makes the above questions answer themselves.
Each of Q23-Q26 is a different way the same experiment can lie to you, and all
four are removed by never reading a piped `$?`, never truncating the output you
judge on, and distinguishing _why_ a non-zero exit happened.

```bash
run_case () {                       # label, payload
  cp /tmp/orig.ts "$F"              # always from a pristine copy, not a patch
  # ...append payload to $F...
  local out; out=$(node tools/check-bundle-budget.mjs 2>&1); local code=$?
  #          ^^^^^^^^^^^^^^^^^^ capture, THEN read $? — never through a pipe
  echo "$label  exit=$code"
  echo "$out" | grep -E 'signaltree-bare|Bundle|Could not build|error TS'
  #                      ^^^^^^^^^^^^^^^^ prove WHICH failure you got
}
cp /tmp/orig.ts "$F"; git diff --quiet -- "$F" && echo "restore OK"
```

Run it over all three payload shapes at once. The three exit codes side by side
answer Q25, Q26 and Q28 together, and the `grep` line answers Q3 — because you
will be able to see, per shape, whether the gate stopped at the build or reached
the comparison.

One prompt for the same discipline applied to your own conclusions: **when a
result surprises you, the harness is the first suspect, not the last.** §2 of
this document is right precisely because you did not stop at "the gate passes".
Q23-Q27 exist because the Q1 experiment did stop at its first plausible reading.

---

### Answers to Q23–Q28 (empirical, from the corrected re-run)

The questions above were answered by re-running the experiment with the
capture-then-read discipline (`out=$(node tools/check-bundle-budget.mjs 2>&1);
code=$?`), against the real gate, mutating `packages/core/src/lib/utils.ts`,
restoring from `/tmp/orig-utils.ts`, and verifying the restore with a fresh
`npx nx build core` + `git diff` + `git status --porcelain`.

> **Q23 — whose exit code did you read?** Real and confirmed. The original run
> was `node tools/check-bundle-budget.mjs 2>&1 | tail -8; echo "exit code: $?"`
> — `$?` was `tail`'s status, which was 0. The gate's own exit was never read.
> The corrected re-run reads `code=$?` immediately after `$(...)` capture. Same
> trap already documented in `handoff-review-brief.md` §10 (the false "FORMAT
> CLEAN").
>
> **Q24 — what did the missing `dist/packages/core` tell you?** Real and
> confirmed: a failed core build leaves `dist/packages/core/dist` **absent**.
> Reproduced deliberately — mutate with the bare `globalThis.__gateBloat` form
> (TS7017), build → exit 1, `dist/packages/core/dist/index.js` gone, every
> other package still built. It was a **failed build**, not an nx cache anomaly.
> The `Bundle failed: core` line existed but was above the `tail -8` cutoff — a
> truncation artifact of the original run. Restoring the file and rebuilding
> brings the dist back. Consequence for method: restore must be verified by
> build output, not only file hash.
>
> **Q25 — is your payload valid TypeScript?** No. `__gateBloat` is not a
> declared property of `typeof globalThis`, so the bare assignment form fails
> `tsc` with **TS7017** (`Element implicitly has an 'any' type because type
'typeof globalThis' has no index signature`). The gate then exits 1 because
> the **build** failed — "Could not build the packages this gate measures" —
> not because the budget was exceeded. The `(globalThis as any)` cast is
> required to make it typecheck and reach the comparison. Measured on re-run:
> cast form → exit 1, `❌ 13.69/5.9KB prod … Bundle budget exceeded`; bare form
> → exit 1, `❌ Could not build the packages this gate measures` + TS7017. Same
> exit code, opposite meaning — exactly what Q3 was circling.
>
> **Q26 — there are three shapes, not two.** Enumerated and run against the
> real gate:
>
> | shape                                       | side-effecting | exported | typechecks      | measured result                  |
> | ------------------------------------------- | -------------- | -------- | --------------- | -------------------------------- |
> | A `(globalThis as any).__gateBloat = [...]` | yes            | no       | yes             | exit 1, **budget** `13.69/5.9KB` |
> | B `export const __gateBloat = [...]`        | no             | yes      | yes             | exit 0, tree-shaken `5.79/5.9KB` |
> | C `globalThis.__gateBloat = [...]`          | yes            | no       | **no** (TS7017) | exit 1, **build** failure        |
>
> The retargeted mutation needs A exactly: side-effecting (so it survives
> tree-shaking into the measured entry) AND cast (so tsc accepts it). B is
> invisible to the gate, C fails it for the wrong reason.
>
> **Q27 — the scratch-test contradiction.** Explained, not a fluke. The
> `.includes()` returned `false` because the search string was a **closed
> two-element array literal** (`["gateBloat_0_0","gateBloat_1_654435761"]`,
> with the `]`) while the written file contained the **full 900-element array**
> — the first `]` appears once, at position 22465 of 22468 bytes. The search
> string was never a substring of the file, so `false` was _correct_ for the
> string tested. Reproduced against the preserved scratch file: head as a
> closed 2-element literal → `false`; the same two tokens in the open array →
> `true`. The contradiction was between what the loop _searched for_ and what
> it _wrote_, not between the buffer and the file. The lesson for the method:
> `includes()` tests the exact substring — formatting (here, the closing
> bracket) changes the answer, so a verification loop must assert on the same
> representation it wrote.
>
> **Q28 — does this change your §7 ranking?** Yes, recommendation 1 goes from
> "asserted" to **verified** — but only for the cast form (shape A), which
> makes the gate fail on the budget as claimed. Shapes B and C are the two ways
> the gate proves nothing (tree-shaken / build-died). Q19's tally is corrected
> accordingly: the fix is tested for recommendation 1; the other eight remain
> hypotheses. §2's severity paragraph needs no rewrite — the verdict the gate
> delivers (budget comparison) is the same one the fix now provably trips.

---

## The performance work — the part you have not audited yet

Your pass covered the gates. It did not cover the measurements those gates
protect, and that is where this session's most surprising results came from.
The short version: **nearly every performance number anyone looked at hard
turned out to be wrong, unstable, or measuring something other than what it
claimed** — including several I produced myself, in this session, and caught
only on a second pass.

That track record is the reason to audit them rather than accept them.

### What was worked on, and what surprised us

| area                                           | the surprise                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ST2018 multiplier** (`e99550e3`, `048ff729`) | The published "~300x" re-measured to ~100x, then the ratio itself proved unstable: 47x-183x across runs, because the `entityMap` side is sub-millisecond while the absolutes barely move. The multiplier was dropped entirely in favour of absolutes.             |
| **The warm-up trap → ST2027** (`4f2757a5`)     | A benchmark warm-up left fixtures holding their target values, so the measured pass was 1,000 **no-op writes** — `deepEqual`'s worst case. 40.5ms vs 0.31ms fresh. This corrupted the repo's own benchmarks twice before anyone noticed, and became a diagnostic. |
| **`deepEqual` constructor gate** (`e42823cc`)  | 17% off the object path. The informative arm was the LOSING one: comparing the two prototypes to each other measured 1% _slower_, which is what identified the cost as `getPrototypeOf`'s runtime calls rather than the shape of the test.                        |
| **Guardrails clone** (`41b80b64`, `16ce77e7`)  | The clone did not merely cost 87.9µs to make — it destroyed the structural-sharing short-circuit in everything downstream, because a copy shares nothing. Idle poll 122.8µs → 0.045µs. The framing error ("keep or remove?") mattered more than the fix.          |
| **Depth latency** (`97470b87`)                 | A published table claimed 0.041-0.104ms and had no generator. Both plausible readings measured 10x-1000x SMALLER. "Operation" was never defined, so the claim could be neither verified nor falsified.                                                            |
| **Per-leaf equality** (`51c3d496`)             | ~50 published figures, no generator. Every one wrong. **One was inverted**: three surfaces claimed `deepEqual` (6.5ns) beats `Object.is` (8.1ns) on a primitive; measured 13.4 vs 8.0.                                                                            |
| **Bundle sizes** (`d11cd19a`, `bdbc7e2d`)      | Measured against a `dist/` nobody had rebuilt. Two AI-priming files disagreed with each other about the same bare tree.                                                                                                                                           |

Generators now exist for these: `tools/bench-depth-latency.mjs`,
`tools/bench-leaf-equality.mjs`, plus the pre-existing `bench-compare.mjs`,
`bench-state-scale.mjs`, `size-compare.mjs`, `measure-bundle-sizes.mjs`,
`memory-compare.mjs`.

### Questions

> **Q29 — the self-confirming measurement problem.** Every new figure above was
> produced by a tool written in the same session, often the same hour, as the
> change it measures. If a benchmark were wrong in the same direction as the
> optimisation it validates, what in this repo would catch it? Name the
> mechanism, or state that there isn't one.
>
> **Q30 — does the warm-up trap still exist anywhere?** ST2027 exists because a
> fixture left holding its target value turns the measured pass into no-op
> writes. Read `tools/bench-leaf-equality.mjs`: the `refetch` arm writes a value
> that deep-equals the current one, so **every write in that arm is dropped**.
> Is that the intended measurement (the cost of concluding "unchanged"), or the
> same trap wearing the right clothes? Then check the `changing` arm actually
> changes on every iteration. Then apply the same read to `bench-compare.mjs`
> and `bench-state-scale.mjs`, which predate this session.
>
> **Q31 — a column I chose not to publish.** `bench-depth-latency.mjs` prints
> leaf write+read times that sit at timer resolution and get _faster_ with
> depth, which is impossible; the tool prints them with a caveat saying not to
> quote them. Is printing-with-a-caveat the right call, or should a tool refuse
> to emit a number it has just declared meaningless? Which choice is more likely
> to end up in a doc six months from now?
>
> **Q32 — the inverted claim's blast radius.** The primitive-equality figures
> were not just stale, they were backwards, and the surrounding prose reasoned
> _from_ them ("the general function is FASTER; there is nothing to
> specialise"). The advice survived; the argument did not. Are there other
> places in the docs where a conclusion is derived from a number rather than
> merely quoting one? Those are the dangerous ones — a wrong number that
> supports advice is harder to spot than a wrong number standing alone.
>
> **Q33 — my own measurement artifacts.** Two were caught before publishing: a
> baseline using a bare object (which becomes a _branch_, so it has no `.set` at
> all) and a memo timing that wrapped `tree()` in an `Object.keys` walk over
> 1,000 branches, inflating an unchanged read from ~0.3µs to 15.8µs. Both were
> found by the results looking wrong, not by review. Read
> `bench-leaf-equality.mjs` and `bench-depth-latency.mjs` for a third.
>
> **Q34 — what do the cross-library numbers actually compare?** `size-compare.mjs`
> says its rows are "matched by intent, not certified equivalent" — elf's
> `selectEntity` returns an Observable, ours a signal, and the consumer pays
> differently downstream. Does any published comparison state that caveat where
> the number appears, rather than in the tool that generates it?
>
> **Q35 — the Angular axis, restated as a measurement question.** Your §5
> already notes no tool exercises TestBed/OnPush/`detectChanges`. Sharpen it:
> for which specific published claims does a Node microbenchmark actually
> substitute for an Angular one, and for which does it not? "Per-leaf write
> costs 31ns" survives the substitution. Does "granular updates beat NgRx"?
>
> **Q36 — stability, not just accuracy.** The ST2018 multiplier was dropped
> because the _ratio_ swung 47x-183x while the absolutes barely moved. Which
> other published figures are ratios of two numbers where one is near timer
> resolution? Run the generators several times and see which move. A number
> that changes run to run is not a measurement, whatever its precision suggests.

### Answers to Q29–Q36

> **Q29 — the self-confirming measurement problem.** There is no mechanism.
> The numeric-claims gate is a **provenance** gate, not a correctness gate: it
> requires a section to name a generator, but nothing re-derives the quoted
> number and diffs it against the tool's output. A benchmark wrong in the same
> direction as the optimization passes trivially — the section names the tool,
> the tool exists and runs, and `verify-gates` only proves the tool _runs_.
> `check-numeric-claims.mjs --self-test` proves it can fail on "no generator
> named", not on "generator output contradicts the prose". The defence that
> exists is the discipline baked into the tools themselves — postconditions,
> sentinels, one-process-per-arm — and it is the tools, not any gate, that
> would catch a wrong-but-consistent benchmark. State it plainly: **nothing in
> this repo detects a measurement that is wrong in the same direction as the
> optimisation it validates.** The Q33/Q36 findings below are the proof — every
> one of them passed the gates.
>
> **Q30 — does the warm-up trap still exist anywhere?** No — and the `refetch`
> arm is the intended measurement, not ST2027 wearing new clothes. The write is
> dropped on purpose and the label says so: "re-fetched: equivalent value, NEW
> identity". That arm exists to price the cost of concluding "unchanged" — the
> exact case `compared()` exists for (deepEqual must walk the whole object to
> conclude equality; byKeys looks at two fields). ST2027's trap was a fixture
> that _accidentally_ held its target value, so a benchmarker believed writes
> landed. Here the write-dropping is the point, the changing arm is the control,
> and the two arms share the same leaf shape. Verified:
> - `changing(i) = {…base, version: i}` — `version` is monotonic, so every
>   write lands under all three comparators (measured: deepEqual 88.1ns, byKeys
>   28.0ns, Object.is 12.6ns).
> - `refetch() = {…base}` — new identity, deep-equal content, every write
>   dropped (deepEqual 79.1ns vs byKeys 28.8ns). That gap is the feature.
> - `bench-compare.mjs` and `bench-state-scale.mjs` both predate the session and
>   are the most defended tools in the repo: a SENTINEL written after warmup so
>   the postcondition can only pass if the _measured_ loop ran, explicit `throw`
>   postconditions (`readAll returned N`, `undo restored NOTHING`, `write did
>   not land`), one process per arm, every arm asserts its write landed. No
>   dropped-write arm exists in either.
>
> **Q31 — a column I chose not to publish.** Printing-with-a-caveat was the
> right call, and the one risk it carries — a future doc-writer quoting the
> number and dropping the caveat — is the same risk refusing would have
> created on the other side (a re-runner with no "leaf" row can't tell what the
> metric was). The convention held in practice: `docs/overview.md` quotes only
> the root column and says explicitly "the tool reports it but declines to
> quote it". **But the question has a sting: the column the tool chose to
> publish has the same defect.** The root ratio (3.6x) swings 1.7x–4.1x across
> runs (below, Q36) and the tool prints it alongside "linear in the path
> walked, which is the expected shape" — an assertion the data barely supports.
> The honest column was the one it refused; the published one is the quietly
> unstable one.
>
> **Q32 — the inverted claim's blast radius.** The blast radius is **larger
> than the audit recorded, and the correction reached only three of the six
> surfaces that carry it.** The audit's table (above) says "measured 13.4 vs
> 8.0" as though the inversion were handled. It was not — the corrected figures
> live only on `llms.txt:127`, `llms-full.txt:768`, and `packages/core/
> README.md:1938`. The inverted claim is **still live**, word-for-word, on:
>
> | surface | line | still says |
> | ------- | ---- | ---------- |
> | `docs/skills/using-signaltree/SKILL.md` | 149 | "measures 6.5ns against Object.is's 8.1ns … there is nothing to specialise" |
> | `apps/demo/…/whats-new.component.html` | 233 | "beats Object.is 6.5ns to 8.1ns. There is nothing to specialise." |
> | `packages/core/src/lib/markers/compared.ts` | 47 | "measures 6.5 ns against Object.is's 8.1 ns — the general function is _faster_" |
> | `docs/architecture/optimisation-options.md` | 30, 263–265, 540–542 | "6.5 ns against 8.1 ns — the general function is _faster_" |
> | `docs/architecture/design-thesis-and-benchmarking-rules.md` | 398–400 | "deepEqual is _faster_ than Object.is on a changed number (6.5 ns vs 8.1 ns)" |
> | `CHANGELOG.md` | 645–646 | "6.5ns against 8.1ns — the general function is faster" (point-in-time, arguable) |
>
> That is the exact class §4/§6.5 warn about — a wrong number that supports
> advice — and the advice it supports ("**Do NOT emit it for primitives**") is
> now load-bearing in an agent-facing skill. **None of these six surfaces is in
> the numeric-claims gate's SURFACES list** (`README.md`, `docs/overview.md`,
> the two `llms*` files, `packages/*/README.md`, `docs/compare/*.md`,
> `docs/performance/*.md`). SKILL.md, the demo template, the source comment,
> and the architecture docs are all unfenced — which is the concrete, named
> answer to Q29.
>
> **Q33 — my own measurement artifacts.** The third is in
> `bench-leaf-equality.mjs` itself, at the primitive section. Lines 91 and 189
> hardcode **"specialising here is a mistake"** — an unconditional header
> asserting the OLD inverted claim — while the measurement printed directly
> beneath it shows `Object.is` **7.1ns vs deepEqual 10.4ns, faster**. The
> conditional at line 193–197 even encodes the old belief as its fallback:
> `primObjectIs > primDeepEqual ? 'SLOWER — deepEqual short-circuits on
> \`a === b\`' : 'faster'`. The tool was written believing deepEqual wins on
> primitives, and the header states that belief no matter which direction the
> data goes. It was found, like the other two, because the output looks wrong:
> the header and its own data disagree in the same breath. Same class as the
> caught pair — a hardcoded conclusion the tool's own measurement refutes.
> (The `depth` tool's leaf column and the memo arm are clean by comparison;
> the depth column self-refuses and the memo arm's 0.291µs unchanged read is
> above resolution and stable.)
>
> **Q34 — what do the cross-library numbers actually compare?** No. The caveat
> "matched by intent, not certified equivalent" lives **only** in
> `tools/size-compare.mjs` (line 24 and its console output at line 182). Grep
> of `docs/compare/*.md` for `matched by intent` / `not certified` /
> `certified equivalent`: **zero hits.** `capability-matrix.md` names the tool
> (`"node tools/size-compare.mjs — same capability, same esbuild + gzip
> method"`, line 301) but that sentence is a *stronger* claim than "matched by
> intent" — it asserts "same capability" while the tool's own header says the
> capability rows are not certified equivalent (elf's `selectEntity` returns an
> Observable, ours a signal; the consumer pays differently downstream). The
> one place the docs get this right is the granularity discussion in
> `real-implementations.md`, which is honest that its row "is not a benchmark
> result". The size-capability table is not.
>
> **Q35 — the Angular axis, restated as a measurement question.** The
> substitution is valid exactly for claims about the **data structure** and
> **bundle**, and invalid for claims about **invalidation and rendering**.
> - _Survives:_ per-leaf write cost (88→28ns; a signal write costs what it
>   costs regardless of component boundary); depth-path walk latency; bundle
>   sizes (esbuild+gzip is framework-agnostic); memory.
> - _Does not survive:_ "granular updates beat NgRx" as a **time** claim. The
>   repo's own attempt to price it in time **failed** — recorded in
>   `real-implementations.md:237–244` — because a Node loop that reads every
>   consumer erases the very property it measures. What survives is the
>   invalidation **count** (1/1000 vs 1000/1000), which is architecture, not a
>   benchmark, and the ~10µs-render extrapolation built on it, which is labeled
>   arithmetic and depends on a constant no TestBed harness in this repo has
>   ever measured. "Granular updates beat NgRx" is therefore a true claim that
>   no measured evidence in this repo supports as a latency figure — the
>   invalidation count is the evidence, and it is a count, not a benchmark.
>
> **Q36 — stability, not just accuracy.** Two live findings, one of them in the
> published docs:
> - **`docs/overview.md`'s own table contradicts its own prose.** The depth
>   table (lines 59–64) implies 0.0048/0.0010 = **4.8x** depth-20-vs-5; the
>   prose (line 67) says "~3.6x"; the tool today prints **3.5–3.7x**. The doc
>   table is stale relative to the current generator, and the ratio it does
>   quote is a single run's value treated as a conclusion.
> - **The depth root-ratio is the live ST2018-class figure.** Across ~11 runs
>   (today plus the earlier session): 1.7, 2.1, 3.3, 3.5, 3.6, 3.6, 3.7, 3.7,
>   3.7, 3.7, 3.8, 4.1 — a **1.7x–4.1x spread (±45% around the quoted 3.6x)**,
>   a ratio of two sub-microsecond absolutes, the same class the ST2018
>   multiplier was dropped for. The tool prints it with "linear in the path
>   walked, which is the expected shape", which is an assertion the data
>   weakly supports. It does not look bad only because 3.6x ≈ 4x.
> - **Stable:** the `compared()` ratios (deepEqual 88.1→28.0 = 3.1x; refetch
>   79.1→28.8 = 2.7x today vs 3.4x/3.0x in the corrected `llms.txt` — same
>   shape, ±10%); the memo unchanged-read (0.291µs, above resolution); the
>   state-scale ratios (0.0082ms vs 20.6ms at 1024 flat; 0.199ms vs 94.5ms at
>   5000 consumers — two orders of magnitude, no plausible run-to-run swing
>   collapses that).
>
> **Net.** The performance section's own warning is understated: it was not
> "most numbers turned out wrong" — it is that **the gate designed to catch
> wrong numbers checks provenance, not correctness, and six surfaces carrying a
> proven-inverted claim are outside even that check.** Q32's table is the
> live debt; Q36's root-ratio and the stale overview.md table are the
> unstable figures; Q33's header is the artifact that survives in the
> generator itself.
