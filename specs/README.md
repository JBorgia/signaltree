# SignalTree Audit — specs/

Working specs for the **2026-04 SignalTree audit** cycle. Populated during Phase 1 (Architecture) of the Versus methodology.

This is **not** SignalTree's own technical spec — it is the spec for the *audit project itself*: what it covers, how it runs, what it deliberately doesn't do, and the external references the audit grounds its claims in.

## Layout

| Folder | Holds |
|---|---|
| `technical/` | External references the audit grounds findings in (Angular Signals API, NgRx SignalStore API, current benchmarking methodology references, TypeScript recursive-type literature). |
| `examples/` | The scaffold-and-build comparison feature — nested entity editor (invoice + line items). One folder per implementation (SignalTree, NgRx SignalStore). |
| `models/` | Data models the comparison uses (the invoice schema). One source of truth so both implementations work from identical types. |
| `design/` | Audit's own decomposition — workstream modules, interfaces, assumptions, finding-flow architecture. |
| `negative-scope/` | What the audit deliberately does NOT cover (e.g. Akita/NGXS/Elf direct comparison; zoneless/SSR deep-dive; @signaltree/shared deep audit). |

## Audit metadata

| Key | Value |
|---|---|
| Audit cycle | 2026-04 |
| SignalTree version under audit | 9.2.1 (note: `@signaltree/shared` lags at 9.0.1 — flagged) |
| Angular version anchor | 20.x (set during Phase 1 specs/technical population) |
| NgRx SignalStore version anchor | (set during Phase 1 specs/technical population) |
| Delivery target | Complete product audit, RFC-style, T3 Full RFC scope (3–4 weeks) with drop-to-T2 stop-rule at end of week 3 |
| Primary audience | AI coding agents (Cursor/Claude/Copilot) — central question: "why does an agent reach for NgRx instead of SignalTree?" |

## Phase 0 outcome (recorded in `.versus/state.json`)

Phase 0 closed at **91/100** after 2 iterations. Decisions D1–D7 capture: delivery target, domain threats prioritized, problem 5W1H, element tiering, audit method, RFC structure + severity scale, and exit criteria + feasibility tier.
