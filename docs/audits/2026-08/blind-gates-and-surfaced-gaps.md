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

Re-checked and confirmed during this pass:

- **deepEqual loop + constructor gate** — `packages/shared/src/lib/deep-equal.ts`
  (~215-224), with cycle guard depth 64; the constructor-gate bypass is guarded
  by the leaf write path per `e42823cc`.
- **ST2029 checked at record time** with an `entries × width` budget
  (`time-travel.ts` ~186-191, 429-460; `HISTORY_RETAINED_POINTER_BUDGET = 500_000`,
  `RETENTION_CHECK_INTERVAL = 16`).
- **ST2026 rate-based, 2-second window**, `PREDICATE_CHURN_THRESHOLD = 12`
  (`entity-signal.ts` ~147-220) — `e216c8c9` correctly narrowed it from raw
  count to rate.
- **guardrails reference-oracle hybrid** (`guardrails.ts` ~571-577, aggregate
  5000 budget, freeze option).
- **`needsBuild` is now actually read** (`verify-gates.mjs:579-599`) and
  `buildOnceIfNeeded` runs before any `dist/`-reading gate; `bdbc7e2d` + the
  `npm run build` fix (`8338e9a4`) close the stale-artifact hole the brief
  described.
- **33/33 gates pass** on a clean normal run (re-ran with no args: all green,
  tree clean, branch ahead of origin/main).
- **The Angular gap** stands: no committed tool exercises TestBed /
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
   bloat into measurement. Update the harness comment at `verify-gates.mjs:56-62`
   that currently argues the wrong direction for this gate. **(this session's
   regression; highest value)**
2. **Fix `lint:budget` self-test** — restore a non-exported mutation (produces a
   `no-unused-vars` **error**, immune to baseline slack), or tighten the
   baseline with `--update` so the 1-warning mutation trips it. **(pre-existing)**
3. **Fix the `numeric-claims:self` harness bookkeeping** — either give the gate
   a real mutation/provenBy chain or set its `unproven` message; stop crediting
   `numeric-claims` as proven by a gate the harness never runs.
4. **Fix `scenario-definitions.ts`** — remove/relabel `shallowMemoization`,
   `lightweightMemoization`, `OptimizedUpdateEngine` (+16.7% claim), and the
   `middleware`/`full-stack` categories so demo labels match what runs.
5. **Regenerate or correct `artifacts/perf-summary.json`** against the current
   package set (blocking currency issue per AGENTS.md).
6. **Retire the enterprise claims** in `BENCHMARK_ANALYSIS.md` (and the +16.7%
   quote in 6.1) now that the mechanism they measure is gone.
7. **Correct `frequency-weighting-system.md`** — either find the real
   implementation to quote or label the doc as describing a planned/unlanded
   design; do not present unverifiable "research" multipliers as live facts.
8. **Consider the §9 brief caveats as live items**, unchanged by this pass:
   reference-oracle tested only against the mock tree, constructor-gate safety
   argued mainly for leaf writes, ST2026's timing assertions (2s window) are
   test-fragile per `b254edc1`'s own "flaky timing assertion" fix.
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
