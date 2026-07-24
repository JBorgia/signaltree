# RFC 0006 — Spike: `status()` composite predicates, tree-shaking, and the core-vs-userland line

**Status:** Spike / decision-pending
**Date:** 2026-07-24
**Prompted by:** the `status().idle()` addition (a0faff76) — before shipping it in 12.1.0, decide whether composite predicates belong in core at all, whether they bloat, and whether the custom-marker extension path is where any of this should live instead.

## 0. The questions

1. Composite predicates (`idle`, maybe `settled`) — include them, or nothing?
2. How much is tree-shakeable? (If unused code shakes out, "keeping it" is cheap.)
3. Bloat, or within ethos?
4. Teams can author their own markers/enhancers — should any of this (or existing code) live *there* instead of shipping in core?
5. Does what we have belong where it is?

## 1. Tree-shaking — measured (esbuild, min+gzip, dist @ 12.0.0)

| Bundle | gzip |
|---|---|
| `signalTree` only | 5,534 B |
| `signalTree` + `status()` | 6,270 B |
| `signalTree` + `status()`, never reading `idle` | 6,279 B (noise-identical) |

Two facts fall out:

- **`status()` is fully tree-shaken when unused** — a bundle that never calls it pays **0 B** (the self-registering-marker architecture; confirmed across the marker family in RFC 0005 §4). The ~736 B is paid *only* by apps that use status.
- **Individual predicates are NOT sub-shakeable within `status()`** — the predicates are getters on one returned object literal, so using `status()` at all pulls every getter (`idle` included) regardless of whether you read it. But each is one tiny `computed` closure: `idle` added ~0 measurable bytes; `settled` would add a handful, all inside the already-736 B status cost.

**So "bloat" is the wrong lens.** The cost is marker-gated (zero for non-users) and sub-byte for users. The real axis isn't bytes — it's **API surface and ecosystem consistency**.

## 2. The core-vs-userland line (Q4/Q5 — the important one)

Teams *can* author markers via the public `registerMarkerProcessor` path (`@signaltree/core/authoring`, documented in `docs/guides/custom-markers-enhancers.md`). So *anything* could technically be userland — which means the line must be principled, not incidental. The test, from RFC 0001 (minimize-surface) + the placement audit (RFC 0004 §8):

> **Core ships the primitives that are (a) universal — nearly every app needs them — AND (b) materially better for being standard/agent-guessable. Niche, opinionated, or app-specific state shapes go userland via custom markers.**

Applying it:

- **`status()` itself → core.** The 4-state async lifecycle is universal; standardization is the whole point (agent-guessability). Not a candidate for userland.
- **`idle` / `settled` composites → core, as a CLOSED set.** "Should I (re)fetch?" and "is it settled?" are questions *every* async app asks. A userland `idle` would be invisible to a fresh AI agent and reinvented (differently-named) per app — the exact ecosystem fragmentation the v11/v12 work fought. Being standard is the value; that value only exists in core.
- **App-specific composites → NOT core, and NOT new config.** The flexibility a config surface (`status({ predicates })`) would offer *already exists two ways*: (a) `.derived()` / a `computed` over the fixed predicates for a bespoke composite; (b) a full custom marker if the app wants different *states*. Adding a predicate-config surface would duplicate what the extension mechanisms already provide — itself an anti-ethos move (two ways to do one thing) — while fragmenting agent-guessability. **Reject app-configured predicates.**

**Does existing code fail this test?** This spike surfaced no new relocation. The taxonomy was audited sound in RFC 0004 §8; the only "should this exist in core" cases were already identified there (`effects()` — deprecated; guardrails-as-package — owner fold-vs-keep decision). `status()` and its predicates sit correctly in core.

One doc-drift note found while spiking: `docs/guides/custom-markers-enhancers.md:109` still imports `registerMarkerProcessor` from `@signaltree/core`, but it moved to `@signaltree/core/authoring` in v12 — the taught import no longer resolves. Fix regardless of the predicate decision.

## 3. How many composites? (Q1)

The size of the closed set is the one genuine open call, and RFC 0001's pre-demand discipline bears on it:

- **`idle` has proven demand** — the `notLoaded()`-gated-guard-never-retries-after-error footgun caused real bugs and drove the author feedback. Ship it.
- **`settled` (`loaded || hasError`) is plausibly universal** (spinner-off logic; hand-written today) but has **no demonstrated demand** from the audits yet. Adding it now is mild speculation.

Two honest positions:
- **Disciplined (idle only):** ship the one with proven demand; add `settled` when demand shows. Smallest surface; RFC 0001-consistent.
- **Closed-set (idle + settled):** decide the universal composite set *as a set* so we stop adding predicates one footgun at a time (the drip that breeds inconsistency). Both are trivially cheap (§1).

## 4. Recommendation

- **Keep `status()` fixed and standard.** No app-configured predicates, no configurable state machine — the flexibility need is already met by `.derived()` (composites) and custom markers (different states), both of which are the documented extension path.
- **Composites live in core as a closed set.** Lean: **`idle` now** (proven demand), **`settled` deferred** until demand — but shipping the pair is defensible and equally cheap; owner's call on set size.
- **Everything is correctly placed.** No relocation to userland warranted; the custom-marker path is the right home for anything *beyond* the universal set, and that's what it's for.
- Fix the stale `registerMarkerProcessor` import in the custom-markers guide.

## 5. Decision (2026-07-24)

Owner chose the **closed set: `idle` + `settled`** (decide the universal
composites as a set, not drip-fed one footgun at a time). Shipped in 12.1.0:
both as fixed derived predicates, added to `STATUS_READERS` + the readonly
typing fixture, spec'd (incl. the deliberate `idle`∩`settled` overlap in the
Error state — an errored request is both *done* and *retryable*). NO
app-configured predicates and NO configurable state machine — bespoke
composites compose via `.derived()`, different state shapes via a custom
marker (`registerMarkerProcessor`, `@signaltree/core/authoring`). Placement
confirmed correct; no core→userland relocation warranted. Stale
`registerMarkerProcessor` import in the custom-markers guide fixed.
