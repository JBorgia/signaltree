# Audit Measurement Protocol (Phase 3 cross-cutting fix)

Resolves Phase 2 critical findings **C2** (M2 bundle-size methodology) and **C5** (M4 bench protocol), plus the systemic Scientific-lens concentration. Applies to M2 (scaffold-and-build), M4 (benchmark gap-fix), and M5 (RFC synthesis citations).

## 1. Bundle-size measurement (M2)

| Setting | Value |
|---|---|
| Build mode | Production (`ng build --configuration production`) |
| Compilation | AOT, Ivy |
| Tree-shaking | Enabled (default) |
| Source maps | Off |
| Compression | Both gzip and brotli reported |
| Output | `dist/<app>/main.<hash>.js` size, before and after compression |
| Reporting unit | Bytes (raw + gzipped + brotli) |

Both implementations build with **identical** Angular CLI version, identical tsconfig, identical optimizer settings. Any deviation is documented as evidence in the finding row.

Expected output structure:

```json
{
  "implementation": "signaltree" | "ngrx-signal-store",
  "raw_bytes": 0,
  "gzip_bytes": 0,
  "brotli_bytes": 0,
  "angular_cli_version": "X.Y.Z",
  "node_version": "X.Y.Z",
  "build_command": "ng build ...",
  "captured_at": "2026-MM-DD"
}
```

## 2. Runtime benchmark methodology (M4)

| Required field | Value |
|---|---|
| Hardware | CPU model, RAM, OS, OS version, kernel |
| Node version | Locked, recorded |
| Angular version | Locked, recorded |
| Library version | SignalTree 9.2.1; NgRx SignalStore version pinned |
| Repetitions | ≥10 per measurement |
| Warmup runs | 3 (discarded) |
| Statistical summary | Median + p90 (not mean — protect against outliers) |
| Output format | JSON, machine-readable |
| Random seed | Fixed where applicable |

### 2.1 Optimal-config declaration (resolves C6)

Each library declares its "optimal config" as a JSON object alongside the bench code:

```json
{
  "implementation": "signaltree",
  "optimal_config": {
    "callable_syntax_enabled": true,
    "enterprise_diff_updates": true,
    "guardrails_disabled_in_perf_runs": true
  },
  "rationale": "callable-syntax is the documented production path; diff-based updates are the headline perf claim."
}
```

The second-pair-of-eyes reviewer (see `second-pair-of-eyes.md`) confirms each side's config matches the library's official perf recommendations. Any mismatch becomes a finding in the audit itself.

### 2.2 Bench reproducibility check (resolves M4-Assumptions 🟡)

M4's first sub-task before any new measurement: clone repo on a clean machine, run existing benchmarks, verify output matches what's in current docs. If existing benchmarks don't reproduce, that itself is a P0 finding and gets logged before M4 proceeds.

## 3. Prior-art citation rules (M5)

Every redesign in the top-3 RFC redesigns must cite at least one prior-art reference for the API shape it borrows from. Acceptable prior-art sources:

- Pinia (Vue) — store composition patterns
- Solid stores — fine-grained reactivity
- Zustand — slice composition
- Effector — domains and effects
- Jotai — atom composition
- NgRx SignalStore itself (where SignalTree should converge)
- Academic literature on reactive state systems

Citation format in RFC: link or `<author>, <year>, <title>`. Pseudocode-only references (no runnable example) are not acceptable prior art.

## 4. DX-notes schema (M2)

Replaces ad-hoc "DX notes" with a structured schema:

```json
{
  "implementation": "signaltree" | "ngrx-signal-store",
  "feature": "invoice_editor_v1",
  "time_to_first_compiling_invoice_minutes": 0,
  "ts_errors_hit_count": 0,
  "ts_errors_hit_examples": ["..."],
  "retries_to_get_typing_right": 0,
  "workarounds_applied": ["..."],
  "subjective_1to5": 0,
  "subjective_rationale": "..."
}
```

DX claims in findings.json must cite a row from this schema, not free prose.

## 5. Statistical confidence reporting

For any perf claim that goes into findings.json:

- Numbers are reported as `median (p90)` — not `mean`
- Sample size is reported (≥10)
- A claim of the form "X% smaller" or "X% faster" requires both medians to be reported with their p90s. If the p90 of the slower implementation overlaps the median of the faster one, the claim is downgraded from definitive to directional and the wording reflects that.

## 6. Out-of-scope for this protocol

Memory profiling and CPU profiling are **not** required for this audit cycle. They appear in the Phase 0 negative scope deliberately — the maintainer can elect a follow-up cycle for memory/CPU work after the RFC ships. If a finding discovers a memory regression incidentally, file it as P3 with `proposed_action = "evaluate in follow-up cycle"`.
