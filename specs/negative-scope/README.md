# Negative Scope — what the 2026-04 audit deliberately does NOT do

Locked at Phase 1. Anti-scope-creep enforcement: per Versus methodology, Phase 2–3 may not extend scope beyond what's recorded here without an explicit `record_decision()` and operator approval.

## Out of scope (hard)

| # | Item | Rationale |
|---|---|---|
| N1 | Direct head-to-head comparisons against Akita, NGXS, Elf | Frees ~3–5 days; NgRx SignalStore is the only comparator that matters for "why does an agent reach for NgRx?" framing. Other libs may be mentioned only when they shipped a feature SignalTree should consider. |
| N2 | Deep audit of `@signaltree/shared` | Internal-only. Flag the v9.0.1 vs v9.2.1 version drift (1 finding). Don't audit its API surface unless Tier-1/2 audits surface a leak from `shared` into public types. |
| N3 | Code refactors / PRs against SignalTree | This cycle produces findings + proposals only. Implementation belongs to a follow-up Versus cycle scoped to the top-3 RFC redesigns the maintainer accepts. |

## In scope but LIGHT (sanity-check only)

| # | Item | Depth |
|---|---|---|
| L1 | Zoneless / SSR / hydration | Confirm SignalTree doesn't error in zoneless mode. No deep audit of `transferState`, hydration, or SSR streaming compatibility. |

## Anti-scope-creep rule

If during Phase 5 (audit execution) a finding emerges that pulls toward an out-of-scope area, the resolution is:

1. **File the finding** as a P3 in `findings.json` with `proposed_action = "evaluate in follow-up cycle"`.
2. **Do not deepen** the audit into the out-of-scope area.
3. If the finding seems P0/P1 but lives in negative scope, surface it to the maintainer separately and let them decide whether to amend Phase 0/1 scope (which restarts Phase 0 partially).
